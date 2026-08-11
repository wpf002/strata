"""
Supabase health check — see bin/check-supabase for usage.

Every check prints PASS / FAIL / SKIP and a one-line reason. Checks that depend
on an earlier failure are skipped rather than cascading confusing errors. Exits
non-zero if anything failed, so it works in a pre-flight or CI step.

Secrets are never printed — keys are shown as a short fingerprint only.
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import json
import re
import socket
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB_ENV = ROOT / "web" / ".env.local"
BACKEND_ENV = ROOT / "backend" / ".env"

GREEN, RED, YELLOW, DIM, RESET = "\033[32m", "\033[31m", "\033[33m", "\033[2m", "\033[0m"

failures = 0
skips = 0


def _emit(tag: str, color: str, name: str, detail: str) -> None:
    print(f"{color}{tag:4}{RESET} {name}" + (f"  {DIM}{detail}{RESET}" if detail else ""))


def ok(name: str, detail: str = "") -> bool:
    _emit("PASS", GREEN, name, detail)
    return True


def bad(name: str, detail: str = "") -> bool:
    global failures
    failures += 1
    _emit("FAIL", RED, name, detail)
    return False


def skip(name: str, detail: str = "") -> bool:
    global skips
    skips += 1
    _emit("SKIP", YELLOW, name, detail)
    return False


def read_env(path: Path) -> dict[str, str]:
    """Minimal .env reader — KEY=value, ignores comments and blanks."""
    if not path.exists():
        return {}
    out: dict[str, str] = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def fingerprint(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()[:8]


def ref_from_url(url: str) -> str | None:
    m = re.match(r"https://([a-z0-9]+)\.supabase\.co/?$", url.rstrip("/") + "")
    return m.group(1) if m else None


def resolves(host: str) -> bool:
    try:
        socket.getaddrinfo(host, 443)
        return True
    except socket.gaierror:
        return False


def main() -> int:
    print(f"\n{DIM}Strata → Supabase health check{RESET}\n")

    # ── 1. env files ──────────────────────────────────────────────────────────
    web = read_env(WEB_ENV)
    api = read_env(BACKEND_ENV)

    if not web:
        bad("web/.env.local", "missing or empty")
    if not api:
        bad("backend/.env", "missing or empty")

    web_url = web.get("VITE_SUPABASE_URL", "")
    anon = web.get("VITE_SUPABASE_ANON_KEY", "")
    api_url = api.get("SUPABASE_URL", "")
    jwt_secret = api.get("SUPABASE_JWT_SECRET", "")
    db_url = api.get("DATABASE_URL", "")

    for label, val in [
        ("VITE_SUPABASE_URL", web_url),
        ("VITE_SUPABASE_ANON_KEY", anon),
        ("SUPABASE_URL", api_url),
        ("SUPABASE_JWT_SECRET", jwt_secret),
        ("DATABASE_URL", db_url),
    ]:
        if not val or val.startswith("<"):
            bad(f"{label} set", "missing or still a placeholder")
        else:
            ok(f"{label} set", fingerprint(val) if "KEY" in label or "SECRET" in label or "PASSWORD" in label.upper() else "")

    # ── 2. refs agree ─────────────────────────────────────────────────────────
    web_ref = ref_from_url(web_url) if web_url else None
    api_ref = ref_from_url(api_url) if api_url else None
    ref = web_ref or api_ref

    if not ref:
        bad("project ref parseable", f"couldn't read a ref out of {web_url or api_url or '(nothing)'}")
    elif web_ref and api_ref and web_ref != api_ref:
        bad("web and backend agree on project", f"web={web_ref} backend={api_ref}")
    else:
        ok("web and backend agree on project", ref)

    # ── 3. anon key shape ─────────────────────────────────────────────────────
    if not anon or not ref:
        skip("anon key valid", "no key or no ref")
    else:
        try:
            header_b64, payload_b64, sig = anon.split(".")
            pad = lambda s: s + "=" * (-len(s) % 4)  # noqa: E731
            claims = json.loads(base64.urlsafe_b64decode(pad(payload_b64)))
        except Exception as exc:
            claims = None
            bad("anon key is a JWT", str(exc)[:60])

        if claims:
            if claims.get("ref") != ref:
                bad("anon key matches project", f"key ref={claims.get('ref')} url ref={ref}")
            elif claims.get("role") != "anon":
                bad("anon key role", f"role={claims.get('role')}, expected anon")
            elif claims.get("exp", 0) < time.time():
                bad("anon key not expired", "expired")
            else:
                exp = time.strftime("%Y-%m-%d", time.gmtime(claims["exp"]))
                ok("anon key matches project", f"role=anon, expires {exp}")

            if not jwt_secret or jwt_secret.startswith("<"):
                skip("anon key signature", "no SUPABASE_JWT_SECRET to check against")
            else:
                expect = base64.urlsafe_b64encode(
                    hmac.new(jwt_secret.encode(), f"{header_b64}.{payload_b64}".encode(), hashlib.sha256).digest()
                ).rstrip(b"=").decode()
                if hmac.compare_digest(expect, sig):
                    ok("anon key signature", "verifies against SUPABASE_JWT_SECRET")
                else:
                    bad("anon key signature", "does NOT match SUPABASE_JWT_SECRET — one of them is stale")

    # ── 4. DNS ────────────────────────────────────────────────────────────────
    api_host = f"{ref}.supabase.co" if ref else None
    db_host_m = re.search(r"@([^:/?]+)", db_url)
    db_host = db_host_m.group(1) if db_host_m else None

    dns_ok = True
    for label, host in [("API host resolves", api_host), ("DB host resolves", db_host)]:
        if not host:
            skip(label, "no host to check")
            dns_ok = False
        elif resolves(host):
            ok(label, host)
        else:
            dns_ok = False
            bad(label, f"{host} → NXDOMAIN. Project deleted, paused, or the ref is wrong.")

    # ── 5/6. HTTP endpoints ───────────────────────────────────────────────────
    if not dns_ok or not api_host:
        skip("GoTrue /auth/v1/health", "host does not resolve")
        skip("PostgREST /rest/v1/", "host does not resolve")
    else:
        try:
            import httpx

            headers = {"apikey": anon}
            with httpx.Client(timeout=10.0) as client:
                # GoTrue rejects health without an apikey, so send one.
                r = client.get(f"https://{api_host}/auth/v1/health", headers=headers)
                if r.status_code == 200:
                    ok("GoTrue /auth/v1/health", r.json().get("version", ""))
                else:
                    bad("GoTrue /auth/v1/health", f"HTTP {r.status_code}")

                # `/rest/v1/` (the root schema doc) is service_role-only by design,
                # so probe a real table instead. Anything that isn't 401 means the
                # anon key was accepted — a 403 would just be RLS doing its job.
                r = client.get(f"https://{api_host}/rest/v1/users?select=id&limit=1", headers=headers)
                if r.status_code == 401:
                    bad("PostgREST anon key accepted", f"HTTP 401 — {r.json().get('message', '')}")
                elif r.status_code < 500:
                    ok("PostgREST anon key accepted", f"HTTP {r.status_code} on public.users")
                else:
                    bad("PostgREST anon key accepted", f"HTTP {r.status_code}")
        except Exception as exc:
            bad("Supabase HTTP endpoints", f"{type(exc).__name__}: {str(exc)[:80]}")

    # ── 7. Postgres ───────────────────────────────────────────────────────────
    if not db_url or not dns_ok:
        skip("Postgres connect", "no DATABASE_URL or host does not resolve")
    else:
        async def probe() -> tuple[bool, str]:
            import asyncpg

            dsn = db_url.replace("postgresql+asyncpg://", "postgresql://").split("?")[0]
            try:
                conn = await asyncio.wait_for(asyncpg.connect(dsn), 15)
                try:
                    await conn.fetchval("select 1")
                    tables = await conn.fetchval(
                        "select count(*) from information_schema.tables where table_schema = 'public'"
                    )
                    return True, f"{tables} tables in public"
                finally:
                    await conn.close()
            except Exception as exc:
                return False, f"{type(exc).__name__}: {str(exc)[:80]}"

        good, detail = asyncio.run(probe())
        ok("Postgres connect", detail) if good else bad("Postgres connect", detail)

    # ── 8. migrations ─────────────────────────────────────────────────────────
    if not dns_ok:
        skip("alembic at head", "database unreachable")
    else:
        try:
            cur = subprocess.run(
                [str(ROOT / "backend/.venv/bin/alembic"), "current"],
                cwd=ROOT / "backend", capture_output=True, text=True, timeout=60,
            )
            if cur.returncode != 0:
                bad("alembic at head", cur.stderr.strip().splitlines()[-1][:80] if cur.stderr.strip() else "alembic failed")
            elif "(head)" in cur.stdout:
                ok("alembic at head", cur.stdout.strip().splitlines()[-1][:60])
            else:
                bad("alembic at head", "behind — run: cd backend && alembic upgrade head")
        except Exception as exc:
            bad("alembic at head", f"{type(exc).__name__}: {str(exc)[:60]}")

    # ── summary ───────────────────────────────────────────────────────────────
    print()
    if failures:
        print(f"{RED}{failures} check(s) failed{RESET}" + (f", {skips} skipped" if skips else ""))
        if not dns_ok:
            print(
                f"\n{DIM}The project host doesn't resolve, which means the project isn't there.\n"
                f"Create one at supabase.com/dashboard, then update:\n"
                f"  web/.env.local   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY\n"
                f"  backend/.env     SUPABASE_URL, SUPABASE_JWT_SECRET, DATABASE_URL\n"
                f"and run: cd backend && alembic upgrade head{RESET}"
            )
        return 1

    print(f"{GREEN}All checks passed — Supabase is live and wired correctly.{RESET}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
