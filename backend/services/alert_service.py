"""
Alert service — email via SendGrid.
"""
import logging
import httpx
from ..config import get_settings

log = logging.getLogger(__name__)

_APP_URL = "https://strata.app"


async def send_saved_search_alert(
    user_email: str,
    search_name: str,
    properties: list[dict],
) -> bool:
    settings = get_settings()
    if not settings.sendgrid_api_key:
        return False

    count = len(properties)
    props_html = ""
    for p in properties[:5]:
        deal_score = p.get("deal_score", 0)
        badge_color = (
            "#22c55e" if deal_score >= 70 else
            "#f59e0b" if deal_score >= 50 else
            "#ef4444"
        )
        props_html += f"""
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #1e293b;">
            <strong style="color:#f1f5f9;font-size:14px;">{p.get('address', '')}</strong>
            <br/>
            <span style="color:#94a3b8;font-size:12px;">{p.get('city', '')}, {p.get('state', '')} {p.get('zip', '')}</span>
          </td>
          <td style="padding:12px 8px;border-bottom:1px solid #1e293b;text-align:center;">
            <span style="background:{badge_color}20;color:{badge_color};border:1px solid {badge_color}40;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;">{deal_score}</span>
          </td>
          <td style="padding:12px 8px;border-bottom:1px solid #1e293b;color:#f1f5f9;font-size:13px;">${p.get('price', 0):,}</td>
          <td style="padding:12px 8px;border-bottom:1px solid #1e293b;color:#f59e0b;font-size:13px;">{p.get('cap_rate', 0):.1f}%</td>
          <td style="padding:12px 8px;border-bottom:1px solid #1e293b;color:#22c55e;font-size:13px;">+${p.get('cash_flow', 0):,}/mo</td>
          <td style="padding:12px 8px;border-bottom:1px solid #1e293b;text-align:right;">
            <a href="{_APP_URL}/intelligence/{p.get('id', '')}" style="background:#c9a84c;color:#0f172a;padding:4px 12px;border-radius:6px;text-decoration:none;font-size:12px;font-weight:600;">View</a>
          </td>
        </tr>"""

    html_body = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#112240;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="padding:32px 40px;border-bottom:1px solid #1e293b;">
            <h1 style="margin:0;color:#c9a84c;font-size:24px;font-weight:700;letter-spacing:-0.5px;">STRATA</h1>
            <p style="margin:4px 0 0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Real Estate Intelligence</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 40px;">
            <h2 style="margin:0 0 8px;color:#f1f5f9;font-size:20px;">{count} new propert{"ies" if count != 1 else "y"} match{" " if count == 1 else ""} your saved search</h2>
            <p style="margin:0 0 24px;color:#94a3b8;font-size:14px;">Search: <strong style="color:#c9a84c;">{search_name}</strong></p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <thead>
                <tr>
                  <th style="text-align:left;color:#64748b;font-size:11px;text-transform:uppercase;padding-bottom:8px;">Property</th>
                  <th style="text-align:center;color:#64748b;font-size:11px;text-transform:uppercase;padding-bottom:8px;">Score</th>
                  <th style="color:#64748b;font-size:11px;text-transform:uppercase;padding-bottom:8px;">Price</th>
                  <th style="color:#64748b;font-size:11px;text-transform:uppercase;padding-bottom:8px;">Cap Rate</th>
                  <th style="color:#64748b;font-size:11px;text-transform:uppercase;padding-bottom:8px;">Cash Flow</th>
                  <th style="text-align:right;color:#64748b;font-size:11px;text-transform:uppercase;padding-bottom:8px;"></th>
                </tr>
              </thead>
              <tbody>{props_html}</tbody>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #1e293b;text-align:center;">
            <p style="margin:0;color:#475569;font-size:12px;">
              Manage your alerts at <a href="{_APP_URL}/settings" style="color:#c9a84c;text-decoration:none;">{_APP_URL}/settings</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""

    payload = {
        "personalizations": [{"to": [{"email": user_email}]}],
        "from": {"email": settings.sendgrid_from_email, "name": "STRATA Alerts"},
        "subject": f"STRATA: {count} new propert{'ies' if count != 1 else 'y'} match {search_name}",
        "content": [{"type": "text/html", "value": html_body}],
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                "https://api.sendgrid.com/v3/mail/send",
                json=payload,
                headers={"Authorization": f"Bearer {settings.sendgrid_api_key}"},
            )
            if resp.status_code in (200, 202):
                return True
            log.warning("SendGrid %s: %s", resp.status_code, resp.text[:400])
            return False
    except Exception as exc:
        log.warning("SendGrid request failed: %s", exc)
        return False
