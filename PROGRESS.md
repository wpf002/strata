# STRATA — Progress Log

## Sprint 5 — May 2026 — Bug-fix Pass

### Bug Fixes

- **Watchlist loading** — replaced blocking `Promise.allSettled` with progressive hydration: each `/properties/{id}` lookup has a 12s timeout, results render as they arrive, and the loading state always clears. A single slow RapidAPI lookup no longer freezes the whole page.
- **Comparison modal** — RapidAPI properties now get meaningful values instead of zeros/nulls. Fair value is anchored around list price but skewed by the deal score (so `priceVsFairValue` actually reflects under/over-priced listings). `daysOnMarket` falls back to `list_date` when missing. `neighborhoodScore` is derived from zip+deal+risk so it's no longer null. The modal also renders `—` when any field is genuinely unavailable rather than `0/100` or `0d`.
- **Portfolio appreciation** — stopped auto-copying `purchase_price` into `current_value` at create. The `_to_schema` serializer now returns `appreciation`/`totalReturn` as `null` when there's no AVM data, and falls back to a time-based 3%/yr estimate when `purchase_date` is set so existing holdings show realistic numbers. UI renders `+X.X%` green / `-X.X%` red / `—` accordingly.
- **Intelligence data audit** — added small `DataSource` chips on Fair Value, Rent Estimate, FEMA flood, and Nearby Schools cards (labels like "Source: RentCast · Live", "Source: FEMA NFHL · Current", "Source: NCES"). Neighborhood Score and DOM gracefully render `—` when not available.

### UI Polish

- **Fair value ranges** stay on one line everywhere (`whitespace-nowrap` on search list, search sidebar, comparison modal, intelligence page).
- **Cash flow** on Portfolio page uses compact formatting + `whitespace-nowrap` in StatCards, the holding sidebar, and the Property Performance metric rows.
- **Market Pulse cards** redesigned: DM Serif Display city header, prominent regime badge, 2×2 metric grid (Median Price · Price Change 12mo · Inventory · Cap Rate Median) with trend arrows.
- **Copilot output** — new markdown renderer parses headings, bold/italic, bullets and numbered lists, wraps currency and percentages in JetBrains Mono, splits trailing confidence/disclaimer paragraphs into a muted footer with a divider, and increased bubble padding so prose doesn't feel cramped.
- **Demo clients seed** — `GET /clients` seeds 4 realistic clients (Marcus Johnson / BRRRR, Sarah Chen / LTR, David Reyes / Fix & Flip, Priya Patel / STR) the first time the demo user (wfoti71992@gmail.com) hits the endpoint with an empty client list. Idempotent — only fires when the table is empty for that user.

### Tests + Build

- `npx tsc -b --noEmit` → 0 errors
- `cd web && npx vitest run` → 81/81 passing
- `cd backend && pytest -q` → 107/107 passing

## Sprint 2 — April 2026

### Task 1 — Intelligence Page Live Wiring

- `GET /properties/{id}/valuation` → Valuation tab (fair value range, confidence, comp set, methodology breakdown)
- `GET /properties/{id}/risk` → Risk tab (composite score, dimension scores, flags)
- `GET /properties/{id}/comps` → Comparable sales table in Valuation tab
- Loading skeletons while data fetches on each tab
- 404 handling redirects to search with toast notification
- `Ask Copilot` button links to `/copilot?property={id}`

### Task 2 — Copilot Streaming (Claude API)

- `POST /copilot/chat` backend route with SSE streaming via `anthropic` SDK
- Model: `claude-sonnet-4-20250514`
- Property context injection into system prompt when `property_id` provided
- Frontend CopilotPage streams token-by-token as SSE arrives
- Property context banner when `?property=` URL param present
- "Ask Copilot" button on IntelligencePage navigates with property ID

### Task 3 — Save Search + Watchlist

- Save Search modal on SearchPage — user enters name, POST to `/saved-searches`
- Watch/unwatch toggle on each property card (gold star when watched)
- Auto-creates "My Watchlist" on first watch if none exists
- Saved searches count + watchlist count in market sidebar
- `SavedSearch.name` added to backend model and schema

### Task 4 — Map View

- React-Leaflet map with OpenStreetMap tiles (no API key)
- Custom SVG deal-score-colored pins (green ≥70, amber 50-69, red <50)
- Toggle between list and split map+list view (55/45)
- Click pin → highlight card, click card → fly to pin
- Popup on click: address, metrics, Underwrite button

### Task 5 — Portfolio Page

- Add Property modal with all required fields
- Update Actuals modal pre-filled with current data
- Empty state with CTA
- Holdings list with equity/cash-flow/recommendation badge
- Real DB CRUD via `POST/PUT/DELETE /portfolio/holdings`

### Task 6 — Email Alerts

- SendGrid HTML email template: STRATA header, property table, View link, footer
- APScheduler runs `run_saved_search_alerts` every 6 hours
- Diffs new vs notified property IDs to avoid duplicate alerts

### Task 7 — FEMA Flood Zone

- `get_flood_zone(lat, lon)` calls FEMA NFHL MapServer REST API (no key)
- Zone → risk label mapping (AE/A=High, VE=Very High, X shaded=Moderate, X=Low)
- Flood badge on Risk tab in Intelligence page

### Task 8 — School Data (NCES ArcGIS)

- `get_nearby_schools(lat, lon)` calls NCES ArcGIS (no key required)
- Returns up to 10 schools sorted by type, with charter/magnet flags
- Displayed in Overview tab

### Task 9 — Rent Estimates (RentCast)

- `get_rent_estimate()` calls RentCast AVM; fallback: sqft * 1.2
- Spread-based confidence: High/Medium/Low
- Live rent estimate shown in Overview tab

### Task 10 — RapidAPI Listings

- `_search_rapidapi()` fetches live listings from realty-in-us.p.rapidapi.com
- Full field mapping: address, price, beds, baths, sqft, year_built, coordinates
- Per-listing deal_score and risk_score computed from cap rate and property age
- Mock fallback when key absent or call fails

### Task 11 — Concurrent Enrichment

- `asyncio.gather(flood_zone, nearby_schools, rent_estimate)` on `GET /properties/{id}`
- All three enrichments run in parallel; results attached to response

---

## Sprint 3 — April 2026

### Task 1 — RapidAPI Property Detail + DB Caching

- `_fetch_rapidapi_property(id)` calls `/properties/v3/detail` endpoint
- Full financial model applied: cap rate, deal score, risk score, cash flow
- Result cached in `properties` table for future requests
- Graceful fallback: returns None on error, caller falls back to mock

### Task 2 — Portfolio Real DB CRUD

- Health score formula updated to match spec:
  - Up to 40 pts: positive cash flow ratio across portfolio
  - Up to 20 pts: geographic diversity (penalize >50% one state)
  - Up to 20 pts: average LTV below 75%
  - Up to 20 pts: 3+ properties
- `HoldingUpdate` schema now accepts `address`, `purchase_price`, `purchase_date`
- Delete with confirmation modal on each holding row
- Row-level Edit and Delete icon buttons (non-conflicting accessible names)

### Task 3 — Market Pulse Page (5 Markets)

- Backend `GET /market/summary` returns Dallas TX, Phoenix AZ, Nashville TN, Atlanta GA, Tampa FL
- RentCast market endpoint called per market when key is set; hardcoded baselines as fallback
- Regime logic: Hot (<2mo inventory), Balanced (2–3.5mo + >2% price growth), Cooling (3.5–5mo or negative), Buyer's Market (>5mo)
- `MarketPulsePage.tsx`: 5 cards with regime badge, metrics, expand to price+rent charts
- Charts use 12-month interpolated trends from ending values + growth rate
- "Search this market" navigates to `/` with `?q=` URL param pre-filling SearchPage

### Task 4 — Clients Page

- `clients` DB table via Alembic migration `002_clients_table.py`
- `Client` model with user_id, name, email, phone, strategy, price range, target markets, property types, notes
- Full CRUD: `GET/POST/PUT/DELETE /clients`
- `GET /clients/{id}/matches` runs property search by client criteria, returns top 5 by deal score
- `ClientsPage.tsx`: two-panel layout — client roster left, matching properties right
- Add/Edit modal with all fields; strategy badge colors per type
- "Share with Client" button copies Intelligence page link to clipboard

### Task 5 — DSCR Calculator (LenderPage)

- `LenderPage.tsx`: pure client-side DSCR calculator
- Inputs: property value, loan amount, rate, term (30yr/40yr/IO), rent, taxes, insurance, HOA
- Live LTV slider synced to loan amount
- Outputs: monthly NOI, monthly debt service, DSCR gauge with color bands
- Max loan at 1.25× DSCR and max purchase at 75% LTV displayed
- Qualification band reference table + lender benchmark table
- "Export DSCR Summary" copies formatted text to clipboard

### Task 6 — Settings Page

- Four sections: Profile, Investment Strategy, Alert Preferences, Account
- Profile: display name edit → `PUT /users/me`
- Strategy: primary strategy, target markets, price range, min deal score, min CoC sliders
- Alerts: email alert toggle, price drop alert toggle, frequency (Immediately/Daily/Weekly)
- Account: send Supabase password reset email, sign out
- Section saves independently with success feedback

### Task 7 — Email Alerts Confirmed

- APScheduler startup log: "Alert scheduler started. Next run: {time}"
- `POST /alerts/test-email` endpoint sends a test alert via SendGrid
- Returns 503 with instructions if SendGrid not configured

### Task 8 — Mobile: Wired to Live Backend

- `mobile/src/constants.ts`: API_BASE_URL defaults to `http://localhost:8080` in dev
- `mobile/src/api.ts`: USE_MOCK=false, Bearer token on every request, 401 → signOut
- `mobile/src/supabase.ts`: Supabase client with AsyncStorage session persistence
- `mobile/src/screens/LoginScreen.tsx`: email+password sign-in, inline error display
- `mobile/src/screens/SearchScreen.tsx`: full property list with pull-to-refresh
- `mobile/App.tsx`: session check on startup → LoginScreen or SearchScreen

---

## Sprint 4 — April 2026

### Task 1 — Client Activity Feed

- `client_activity` DB table via Alembic migration `003_client_activity.py`
- `ClientActivity` model: client_id, property_id, activity_type, count, last_occurred_at, activity_metadata
- `POST /clients/{id}/activity`: upsert by (client_id, property_id, activity_type), increments count
- `GET /clients/{id}/activity`: returns properties with engagement score (viewed×1 + saved×3 + shared×4 + underwritten×5)
- `ClientsPage.tsx`: Activity Feed tab on right panel shows property rows with icon badges and counts
- Roster cards show activity dot (green ≤7d, amber ≤30d, gray), "Active Xd ago", property count
- "Share with Client" copies link with `?client={id}` and fires a "shared" activity event

### Task 2 — Offer Engine

- `POST /properties/{id}/offer-analysis`: DOM/regime/price-reduction adjustments to AVM base
- Acceptance probability curve, urgency selector (low/medium/high)
- Returns offerLow, offerMid, offerHigh, recommendedOffer, acceptanceProbability, negotiationNotes
- `IntelligencePage.tsx`: "Offer Strategy" tab with offer range bar, acceptance gauge, strategy notes

### Task 3 — Closing Cost Estimator

- `POST /properties/{id}/closing-costs`: itemized buyer/lender/govt costs with state-specific transfer tax
- Attorney-required states (NY, MA, SC, GA, WV) included
- `UnderwritePage.tsx`: collapsible Closing Costs section with type badges and ±15% range note

### Task 4 — Investment Memo PDF

- `POST /copilot/generate-memo`: fetches property, calls Claude with structured JSON prompt
- Returns: title, executiveSummary, propertyOverview, marketContext, financialAnalysis, riskAssessment, recommendation, disclaimer
- `CopilotPage.tsx`: "Generate Investment Memo" button in property context banner
- Memo panel: expandable sections, Copy to Clipboard, Print/PDF via `window.print()`

### Task 5 — Strategy Modes (BRRRR / Flip / STR)

- `POST /underwriting/brrrr`: totalProjectCost, refiLoanAmount, cashLeftInDeal, equityCaptured, postRefiCashFlow, postRefiDscr, brrrrReturnOnEquity, arvConfidence
- `POST /underwriting/flip`: totalCost, grossProfit, netProfit, returnOnCost, annualizedReturn, breakEvenArv
- `POST /underwriting/str`: revenue low/mid/high, STR cap rates, strVsLtrPremium, occupancyBreakEven
- `UnderwritePage.tsx`: BRRRR/Flip/STR panels with sliders render when strategy is selected; Metric cards update live

### Task 6 — Mobile Intelligence + Portfolio Screens

- `mobile/src/screens/IntelligenceScreen.tsx`: property detail with deal score badge, key metrics grid, annual financials, score breakdown bars
- `mobile/src/screens/PortfolioScreen.tsx`: summary cards (equity, cash flow, portfolio value, avg CoC), holdings list with appreciation
- `mobile/App.tsx`: custom bottom tab bar — Search | Portfolio | Copilot placeholder
- Push token registered with backend on session start via `setupPushNotifications()`

### Task 7 — Mobile Push Alerts

- `mobile/src/services/notifications.ts`: FCM token registration via `@react-native-firebase/messaging`
- Graceful degradation when package not installed (bare RN setup)
- Token registered at `PUT /users/me/push-token` on login and on token refresh
- `backend/services/alert_service.py`: `send_push_notification()` via FCM REST API; `send_alert()` dispatches both email and push
- Migration `004_push_tokens.py`: adds push_token and push_platform columns to users table

---

---

## Sprint 5 — April 2026

### Task 1 — Branded CMA Builder

- `POST /reports/cma` → generates narrative for each section via Claude, stores in `reports` table
- `GET /reports/{id}` → public route (no auth), shareable link for clients
- `Report` model + Alembic migration `005_reports`
- `CMAModal` in `ClientsPage.tsx`: "CMA" button on each matched property, pre-fills agent profile from settings
- `ReportPage.tsx` at `/reports/:id` — renders CMA and property-brief; CMA has print CSS + "Download PDF" via `window.print()`
- "Share Link" copies `/reports/{id}` URL to clipboard

### Task 2 — Client-Facing Property Brief

- `POST /reports/property-brief` → lightweight single-property summary (valuation, rent, risk flags, neighborhood score, agent contact)
- "Send to Client" button on `IntelligencePage.tsx` (next to "Ask Copilot")
- Modal: client name + optional personal message → generate → copy shareable link
- Brief rendered at `/reports/:id` with property photo, valuation range, rent estimate, risk flags in plain English, agent contact card, "Get Full Analysis" CTA

### Task 3 — Deal Rooms

- `deal_rooms`, `deal_room_tasks`, `deal_room_messages` tables via migration `006_deal_rooms`
- Full CRUD: `GET/POST /deal-rooms`, `GET/PUT /deal-rooms/{id}`, task and message sub-routes
- Pre-populated 7-item closing checklist on room creation
- `DealRoomsPage.tsx`: left panel room list (status badge, participant count, task completion progress bar, days active), right panel with Tasks / Messages / Documents tabs
- "Deal Rooms" added to Sidebar under TEAMS section
- Task toggle (pending ↔ complete), add/delete custom tasks, threaded message feed with auto-scroll

### Task 4 — Hold / Sell / Refi Engine

- `POST /portfolio/holdings/{id}/analysis` — evaluates 7 sell/refi/hold signals from LTV, appreciation, cash flow, and market rate
- Returns recommendation, confidence, rationale, signals triggered, and type-specific financial projections
- `AnalysisPanel` in `PortfolioPage.tsx`: "Get Hold/Sell/Refi Analysis" Quick Action fetches live recommendation; shows signals checklist and relevant financials (net proceeds / cash-out / projected equity)

### Task 5 — 1031 + Tax Layer

- `POST /portfolio/holdings/{id}/tax-analysis` — depreciation (27.5yr straight-line on 80%), capital gains waterfall, LTCG tax (15%/20%), depreciation recapture (25%), state tax estimate, 1031 eligibility + deadlines, cost segregation flag
- `TaxPanel` in `PortfolioPage.tsx`: three sections — Depreciation, "If Sold Today" waterfall, 1031 Exchange with ID and exchange deadlines
- Prominent disclaimer on every tax output

### Task 6 — Mobile Copilot + Push Alerts

- `CopilotScreen.tsx`: FlatList message feed, navy user bubbles / glass assistant bubbles, streaming via `fetch` + `ReadableStream`, animated 3-dot typing indicator, 4 suggestion chip pills, property context banner, KeyboardAvoidingView
- `App.tsx`: `CopilotPlaceholder` replaced with live `CopilotScreen`; property context passed when navigating from Intelligence tab
- Firebase placeholder configs: `google-services.json` + `GoogleService-Info.plist` at mobile root with step-by-step setup instructions
- `notifications.ts` updated: explicit iOS permission request, foreground `Alert` banner handler, background message handler, token refresh wired to backend
- `POST /alerts/test-push` backend endpoint: looks up user's registered FCM token, fires test notification via FCM REST API

---

---

## Sprint 6 (Phase 4) — April 2026

### Task 1 — Public API v1

- `POST/GET /api/v1/*` family — developer-facing REST surface authenticated by `X-STRATA-API-Key` header (sha256-hashed, looked up via `backend/services/api_key_service.py`)
- `backend/routers/api_v1.py`: properties search/detail, valuation, risk, underwriting (analyze/BRRRR/flip/STR), market summary, single-market lookup, supported-markets list
- All responses wrapped in `{ data, meta: { apiVersion, timestamp, requestId } }`
- Rate limit: 1,000 calls/month per key on a rolling 30-day window; `X-RateLimit-Limit/Remaining/Reset` headers on every response; 429 with `Retry-After` when exceeded
- `backend/models/api_key.py` + `backend/schemas/api_key.py`: per-user keys store sha256 hash + 8-char prefix, monthly counter, last-used timestamp, scopes array, active flag
- Migration `008_api_keys_and_webhooks.py` creates `api_keys` + `webhooks` tables
- `backend/routers/settings.py`: `GET/POST /settings/api-keys` (create returns full key exactly once) and `DELETE /settings/api-keys/{id}` (revokes, keeps row for audit)
- `SettingsPage.tsx`: new "API Access" section — list of keys with prefix/usage/last-used, Generate New Key modal with copy-once flow + "You won't see it again" warning, revoke button per key

### Task 2 — Webhooks

- `webhooks` table (same migration 008): url, secret, events array (jsonb), is_active, failure_count, last_triggered_at, last_error
- `backend/services/webhook_service.py`: `deliver_webhook(user_id, event_type, payload)` fans out to matching active hooks; HMAC-SHA256 signs the raw body as `X-STRATA-Signature: sha256=…`; also emits `X-STRATA-Event` and `X-STRATA-Delivery` headers
- On non-2xx, timeout, or network error: `failure_count` increments and the hook is disabled after `MAX_FAILURES` (5) consecutive failures
- Supported events: `saved_search.match`, `portfolio.alert`, `property.price_drop`, `deal_room.task_complete`
- Management routes: `GET/POST/DELETE /settings/webhooks`, plus `POST /settings/webhooks/{id}/test` which fires a one-shot ping without incrementing failure count
- `SettingsPage.tsx`: new "Webhooks" section — list with active/failing status badge and event chips, Add Webhook modal (URL + event checkboxes + event descriptions), show-once signing secret, per-hook Test + Delete buttons, inline delivery-status message

### Task 3 — Off-Market Layer

- `backend/services/off_market_service.py`: `compute_signals(property)` detects six motivated-seller heuristics — extended listing (DOM > 90 with no reduction), multiple price reductions (≥2), absentee owner (SFR with owner address ≠ property address), assessment gap (< 65% of list), DOM outlier vs zip median, significant discount to fair value mid
- Each signal carries `type`, `label`, `severity`; aggregate `motivation_score` (0–100) sums severity weights capped at 100
- `PropertyResponse` schema extended with `motivationScore` and `offMarketSignals[]` (auto-populated by `search_properties` and `GET /properties/{id}`)
- New filter params on `GET /properties/search`: `off_market_only` (default threshold 30) and `min_motivation_score` (0–100)
- New endpoint `GET /properties/{id}/off-market-signals` for on-demand recomputation
- `SearchPage.tsx`: "Off-Market Signals" toggle in the Filters panel + "Motivation Score" sort option + amber "⚡ MOTIVATED SELLER" badge on property cards where score > 50
- `IntelligencePage.tsx` Overview tab: `OffMarketSignalsPanel` renders when signals exist — severity-colored rows, circular motivation gauge (0–100), verify-directly disclaimer

### Task 7 — National MLS Expansion Prep

- `backend/data/markets.json`: 25-market registry — 5 launch markets (Dallas, Phoenix, Nashville, Atlanta, Tampa) + 20 additional (Austin, Charlotte, Raleigh, Jacksonville, Orlando, Las Vegas, Denver, Salt Lake City, Indianapolis, Columbus, Memphis, Birmingham, Kansas City, San Antonio, Fort Worth, Oklahoma City, Tulsa, Little Rock, Greensboro, Richmond)
- `backend/services/markets_service.py`: `load_markets()`, `list_markets()`, `resolve_market(query)` — freeform resolution from `"Phoenix, AZ"` / `"phoenix-az"` / `"Phoenix AZ"` with case-insensitive city + state matching and city-only fallback
- `backend/routers/markets.py`: `GET /markets/supported` — launch markets first, alphabetical
- `SearchPage.tsx`: market selector replaces the plain search input — searchable dropdown, recent markets (localStorage, up to 5), "All Markets" nationwide option, ⭐ on launch markets
- `MarketPulsePage.tsx`: selector in the header to view any supported market; shows an informative empty state when a non-launch market has no `/market/summary` data yet

### Task 4 — Renovation Engine

- `backend/services/renovation_service.py` — cost table (per-house / per-unit / per-sqft) with 20+ state multipliers (TX 0.95, CA 1.40, NY 1.45, etc.) and condition multipliers (poor 1.20 → good 0.90)
- `compute_estimate()` returns per-line items, subtotal, 10% & 20% contingency, totals, and cost/sqft; `full_gut` selection suppresses per-item lines and prices on a per-sqft basis
- `compute_arv_uplift()` applies non-compounding max uplift by scope: cosmetic 5–8%, kitchen+baths 10–15%, structural 8–12%, full gut 20–30%
- `generate_sow()` — Claude-generated 3-paragraph contractor SOW narrative; falls back to a templated narrative when `ANTHROPIC_API_KEY` is absent
- `POST /properties/{id}/renovation-estimate` (in properties router) — validates scope items, pulls property's fair-value range from mock data when not supplied, returns line items + totals + ARV + SOW
- `UnderwritePage.tsx` — new "Renovation" strategy tab with `RenovationPanel`: 12-item scope checklist, poor/fair/average/good condition selector, 10% vs 20% contingency toggle, line items table, total band in large type, ARV band, collapsible SOW narrative, and **"Add to BRRRR Analysis" button** that pre-fills the BRRRR tab's rehab cost with the total mid-point
- `IntelligencePage.tsx` Overview — new `RenovationPotentialCard` shows a quick estimate for cosmetic + kitchen + baths with budget mid, cost/sqft, projected ARV, and a "Detailed estimate →" link to the Renovation tab

### Task 5 — LP Portfolio Report

- `backend/services/lp_report_service.py` — aggregates a user's holdings into `propertyCount`, `totalValue`, `totalEquity`, `totalDebt`, `monthlyCashFlow`, `annualCashFlow`, `totalCostBasis`, `totalAppreciation` (%), `avgLtvPct`, and state concentration
- Claude generates four narrative sections: executive summary, market context, risk overview, outlook (plus optional tax notes); falls back to a data-driven templated narrative when no API key
- `POST /portfolio/lp-report` (in portfolio router) — authenticated; 400 if the user has no holdings; 422 if `fund_name` or `reporting_period` are blank; persists result to the `reports` table with `report_type = 'lp_report'` so the shareable link works at `/reports/{id}`
- `PortfolioPage.tsx` — new "Generate LP Report" Quick Action opens `LPReportModal`: fund name, reporting period (auto-filled to current quarter), manager name, manager email, "Include Tax Notes" toggle → generates → shows shareable link + copy button + "View + Download PDF"
- `ReportPage.tsx` — new `LPReport` renderer supports `report_type = 'lp_report'`: header with fund/period/manager, executive summary, 8-tile portfolio snapshot, full holdings table (address, basis, value, appreciation, CF/mo, rec), market context, risk overview with state concentration chips, outlook, optional tax notes, disclosures; print CSS inherits from CMA path, Download PDF via `window.print()`

### Task 6 — Mobile Property Tour Mode

- `backend/routers/tour.py` — `POST /tour/scan-address` authenticated; accepts `image_base64` (raw or data URL), validates base64, caps at ~6MB, calls Claude Sonnet 4 vision, returns `{ address, confidence }` where confidence is `high` / `low` / `not_found`
- Vision prompt constrains output: "Return ONLY the address string" or `'NOT_FOUND'` — no fabrication
- Graceful degradation: 503 when `ANTHROPIC_API_KEY` absent, 502 on Claude error, 413 on oversized input, 422 on invalid base64
- `mobile/src/api.ts` — `scanAddressFromImage(imageBase64)` client helper, re-using existing `request()` with JWT
- `mobile/src/screens/TourModeScreen.tsx` — full screen: permission request, reticle overlay, Scan button, post-capture base64 + send, auto-search STRATA for extracted address, navigate to IntelligenceScreen on match
- `react-native-vision-camera` loaded via `require()` in a try/catch so Metro can still bundle when the package isn't yet installed — when missing, the screen renders a setup panel with the 4-step install instructions
- `mobile/src/screens/SearchScreen.tsx` — new camera icon button in the search bar (top right, gold-accented), wired via `onOpenTourMode` prop
- `mobile/App.tsx` — `tourModeOpen` state + full-screen render; on successful scan, routes the returned property id into IntelligenceScreen automatically
- **Not committed in this session**: `react-native-vision-camera` npm install, pod install, and native `NSCameraUsageDescription` / `CAMERA` permission — the mobile/ directory has no `ios/` or `android/` native project folders yet, so those steps belong to whoever generates the native projects

---

### Migration chain

- `001 → 002 → 003 → 004 → 005 → 006 → 007 → 008` (008 is head, applied to Supabase). Apply locally with `cd backend && alembic upgrade head`.

---

---

## Sprint 6 Addendum — Mobile-Responsive Web

Goal: make the web app usable in a phone browser before committing to a native React Native app.

### Shell

- `web/src/components/MobileNav.tsx` — new compact top bar visible only under `md` breakpoint (768px): hamburger button, logo + page title, alerts icon. Opens a full-height slide-out drawer (~288px, 85vw max) containing the same nav sections as the desktop sidebar. Drawer auto-closes on route change, locks body scroll while open, and dims the page behind a backdrop tap-to-close.
- `Sidebar.tsx` — now `hidden md:flex`, so the desktop 220px sidebar only appears on tablet+ viewports.
- `App.tsx` — shell switches from `flex-row` (sidebar left of main) to `flex-col` on mobile so the mobile `MobileNav` top bar sits above content. Added `min-w-0` to the main column to prevent children from overflowing the viewport.

### Tier 1 — polished mobile (high-traffic pages)

- **SearchPage** — header uses `flex-wrap`; strategy tabs + view toggles reflow; market selector narrows to 176px on small screens; Filters button becomes icon-only (`aria-label="Filters"` preserved for tests); view toggle (list/map) hidden < `sm`; PropertyCard restructured: image stacks on top on mobile, metric grid is `grid-cols-3` on mobile vs `grid-cols-6` on desktop, and a new mobile-only action row with Fair Value + Underwrite + ★ watch replaces the 128px right sidebar which is `hidden md:flex`.
- **IntelligencePage** — topbar collapses to icon-only action buttons progressively (`hidden md:inline` / `hidden lg:inline`) with preserved aria-labels; breadcrumb hidden on mobile in favor of the MobileNav page title; hero image section stacks address + price vertically at `< md`; all `grid-cols-3 gap-5 + col-span-2` overview/valuation/risk layouts became `grid-cols-1 lg:grid-cols-3 + lg:col-span-2` so the right sidebar drops under the main column; `grid-cols-4` stat rows became `grid-cols-2 md:grid-cols-4`; P&L becomes single-column then two columns at `sm:`.
- **ReportPage** — LP / CMA / Property-Brief headers reflow from right-aligned metadata to stacked blocks at `< sm`; container padding reduced on mobile; snapshot grids go `grid-cols-2 md:grid-cols-4` (LP 8-tile) and `grid-cols-1 sm:grid-cols-3` (CMA 3-col); print CSS preserved.
- **LoginPage** — already mobile-first; no change needed (max-w-sm centered with px-4).

### Tier 2 — functional mobile

- **PortfolioPage** — outer layout switches to `flex-col md:flex-row`; left holdings panel becomes a top section capped at `max-h-[50vh]` with a divider instead of a side border on mobile; stat-card grids go from 3-col fixed to `grid-cols-1 sm:grid-cols-3`; chart panels collapse to single column at `< lg`.
- **MarketPulsePage** — header stacks below `sm:`, market selector grows to full-width on mobile, internal price/rent-trend 2-col grid collapses to single column at `< sm`.
- **CopilotPage** — header subtitle abbreviated on mobile; "Powered by Claude" hidden `< md`; property context banner uses `flex-wrap` with truncated address; memo button text shortens to "Memo" / "View" on mobile, View-Intelligence link hidden `< md`; suggestion chips go `grid-cols-1 sm:grid-cols-2`.
- **SettingsPage** — new mobile-only horizontal scrollable pill strip replaces the 200px desktop sidebar (`hidden md:block`); each pill shows section icon + label, active state matches existing amber accent.

### Tier 3 — basic no-horizontal-scroll (complex pages)

- **UnderwritePage** — header fully reflows: strategy tabs move to their own scrollable row on mobile, save/share/memo collapse to icon-only; 272px assumptions sidebar becomes a `max-h-[45vh]` top block with border-bottom on mobile; 5-col key metrics → `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5`; P&L + Scenarios 2-col becomes 1-col at `< lg`; Additional Metrics 4-col becomes 2-col on mobile.
- **ClientsPage**, **DealRoomsPage**, **LenderPage** — same 300px-sidebar-to-top-section pattern (`max-h-[40-45vh] border-b md:border-b-0`); headers add `gap-3` + responsive padding.
- **AlertsPage** — header padding and gap reflow.

### Tailwind breakpoints used

- `< sm` (< 640px) — phones
- `sm` (640px+) — phones landscape / small tablets
- `md` (768px+) — tablets / app shell transition point
- `lg` (1024px+) — laptops
- `xl` (1280px+) — desktops

### Test + build verification

- Frontend: **75 / 75 vitest pass** after fixing 2 aria-label casing regressions (`Filters` and `Run Full Analysis`)
- Backend: **102 / 102 pytest pass** (unaffected)
- TypeScript: **0 errors** (`tsc --noEmit`)
- Vite production build: clean, 1.25MB bundle / 343KB gzipped
- No new dependencies added

### Not yet done

- Bottom tab bar for primary destinations (kept hamburger-only for now to ship fast; can add later)
- Mobile-specific optimizations of the chart-heavy pages (Recharts renders OK on small screens but text sizes are desktop-tuned)
- Touch-specific interaction polish (hover states, tap highlights)
- Map view on mobile for SearchPage — currently only list view shows; map toggle hidden `< sm` because the split map+list needs a full redesign for mobile

---

## Sprint 7 — April 2026 (Phase A: Client Portal + Activity Wiring)

### Task 1 — Client Portal (Compass One equivalent)

- **Migration 011** — `client_portals` (agent_user_id, client_id, name, magic_link_token UUID, property_ids JSONB, status, timestamps) + `client_portal_activity` (portal_id, property_id, action_type, client_name/email, metadata, occurred_at)
- **Models + schemas** registered in `backend/models/__init__.py`; Pydantic camelCase responses via `CamelModel` base
- **Router** `/backend/routers/client_portals.py`:
  - `POST /client-portals` — create with auto-generated token; defaults name to `{client}'s Properties` if omitted
  - `GET /client-portals` — list active portals, includes client name + last-activity timestamp
  - `GET /client-portals/{id}` — detail with hydrated properties + activity log (last 100)
  - `POST/DELETE /client-portals/{id}/properties[/{pid}]` — add or remove a property
  - `DELETE /client-portals/{id}` — archive (soft delete; link stops working)
  - `GET /client-portals/view/{token}` — **public, no auth** — returns portal with agent profile + hydrated properties
  - `POST /client-portals/view/{token}/activity` — **public** — logs viewed/favorited/unfavorited/shared/commented; favorited/shared/viewed are dual-written into `client_activity` so they appear in the existing Clients-page feed
- **Frontend public page** `/portal/:token` (outside auth gate):
  - Agent header (photo/initial, name, brokerage, contact links)
  - "Your Property Collection" grid — 2-col desktop, 1-col mobile
  - Favorite button on each card with localStorage persistence per token; favorites float to the top
  - "Get Full Analysis" CTAs deep-link to `/intelligence/:id` (hit the login page when the client isn't signed in)
  - Silent POST beacons on view / favorite / unfavorite
  - Accepts `?email=` / `?name=` for pre-attributed views
- **ClientsPage**:
  - New **Create Portal** button in the client detail header
  - Modal with portal name + searchable checklist of matching properties (first 3 preselected)
  - Success state shows shareable link + copy button — explicit copy "Send this link to {client name} — they don't need to create an account to view it."
  - New **Portals tab** listing portals for the active client:
    - Per portal: name, property count, client-last-active label
    - Expandable: View Live Portal / Copy Link / Add Properties / Archive
    - Inline add-candidate picker filters out properties already in the portal
    - Properties list with inline remove + full activity log (last 10 events with colored action dots)

### Task 6 — Remaining activity types wired

- Centralised `logActivity` in `/web/src/api/client.ts` now dual-writes to `/clients/{clientId}/activity` whenever `window.location.search` contains `?client={id}`. Added `reported` to the client activity type set + engagement weighting. Removed the now-redundant hand-rolled `fetch` calls from IntelligencePage.
- `copilot_asked` — CopilotPage fires `logActivity(propertyId, 'copilot_asked')` once per mount when `?property=` is present (ref-guarded against StrictMode double-fire).
- `saved` / unsaved — SearchPage and IntelligencePage watchlist toggles fire `logActivity(..., 'saved')` on watch and new `removeActivity` on unwatch (backed by `POST /activity/remove`, which deletes the user_property_activity row so Leads reflects current intent; client_activity rows intentionally keep their count).
- `reported` — fired from brief generation (IntelligencePage) and CMA generation (ClientsPage).

### Task 8B partial — Copilot → Client Portal handoff

- Memo panel gets a new **Send to Client** action that opens a modal:
  - "Add to Existing Portal" — select any of the agent's portals, POSTs `addPortalProperty`
  - "Create New Portal" — pick a client, optional custom name, one-click portal for this property
  - Success state shows the shareable link with copy button

### Test + build verification (Phase A)

- Backend: **85 pytest pass** (72 existing + 13 new in `test_client_portals.py` covering auth guards, CRUD happy paths, public-view 404, favorite/unfavorite mirror logic, `/activity/remove` delete + no-op)
- Frontend: **81 vitest pass**, **0 TypeScript errors** (`tsc --noEmit`)
- No new npm or pip dependencies

## Sprint 7 — Phase B (Transactions + Settings)

### Task 3 — Transaction Timeline per Client

- **Migration 012** adds `client_transactions` (agent_user_id, client_id, property_id/address, status, milestones JSONB, timestamps)
- Default milestone set seeded on create: Property identified → Offer submitted → Offer accepted → Inspection → Appraisal → Loan approved → Final walkthrough → Closed
- Routes on existing `/clients` router:
  - `POST /clients/{id}/transactions` (seeds 8-milestone checklist)
  - `GET /clients/{id}/transactions`
  - `PUT /clients/{id}/transactions/{tid}` (status + address)
  - `PATCH /clients/{id}/transactions/{tid}/milestones/{mid}` (toggle complete/pending/skipped, add notes; auto-stamps completed_date; auto-advances transaction status based on milestone checkmarks)
  - `DELETE /clients/{id}/transactions/{tid}`
- 9 new pytest covering: creation seeds 8 milestones, 404 when client belongs to another user, list sort, status/address updates, invalid status rejection, milestone toggle auto-advances status, closing the final milestone sets status to closed, milestone 404, adding notes
- **ClientsPage new Transactions tab**:
  - "New Transaction" modal — type address or pick from the client's matching properties
  - Status badge per card (Searching / Offer Made / Under Contract / Closing / Closed / Cancelled) with color coding
  - Progress bar + X of N milestone counter
  - Milestone timeline — click row to toggle complete/pending, skip-forward icon to skip, speech-bubble icon to add notes
  - "Mark Closed" / "Mark Cancelled" / "Delete" actions

### Task 10 — Settings: Agent Profile + Notifications

- **Profile completeness card** on the Agent Profile section:
  - Progress bar keyed to 6 fields: Name, Brokerage, Phone, Photo, License #, Website
  - Color graded (green ≥80%, amber ≥50%, orange below)
  - Live-updates as the agent types (previews against form state, not persisted state)
- New **Photo URL** field on agent profile (shown on client portals + branded reports)
- **Per-type notification preferences** on the Alerts section (Email | Push | Both | Off) for:
  - Saved search matches
  - Price drops on watchlist
  - Portfolio alerts (refi / sell triggers)
  - Client portal activity (new)
- Stored in `users.strategy_settings.notifications` JSONB; legacy global toggles still honored by the existing scheduler

### Test + build verification (Phase B)

- Backend: **94 pytest pass** (85 → 94; +9 transaction tests)
- Frontend: **81 vitest pass**, **0 TypeScript errors**
- No new dependencies

## Sprint 7 — Phase C (Demand Signal + Search UX)

### Task 2 — Property Demand Signal

- New `backend/services/demand_service.py` aggregates distinct users per activity type from `user_property_activity` over a 30-day window
- `GET /properties/{id}/demand` — detail: distinct views/saves/underwrites, composite score 0–100, High/Medium/Low label, price_drop_count, DOM vs market average, plain-English `note`
- `GET /properties/demand-signals?ids=p1,p2,p3` — batch summary (score + label only) for decorating search cards and powering Competition sort
- Score calibration: weighted sum of distinct interactions (views ×1, copilot ×2, saves ×3, reported ×4, underwrites ×5) divided by a 25-interaction saturation point → capped 0–100. Intentionally aggressive so early-stage data lands Low/Medium until real traction shows
- Market DOM baselines for the "vs market" label live in the service for Dallas/Phoenix/Nashville/Atlanta/Tampa/Austin
- 5 new pytest covering zero-activity, high-activity labels, distinct-user dedup (3 views from the same user = 1), and bulk shape

### Intelligence page — Market Interest card

- New card on the Overview tab right column (above Rent Estimate)
- Heat-gradient badge (red ≥70, amber ≥35, slate otherwise) with score and label
- Stats: investors analyzing (30d), underwriting runs, price reductions, DOM vs market
- Narrative `note` at the bottom — pulls from backend so copy stays consistent

### SearchPage — UX improvements

- **High Demand badge**: `🔥 HIGH DEMAND` ribbon on cards where demand_score ≥ 70 (subtle on compact cards)
- **Competition sort**: new dropdown option that sorts ascending by demand_score so low-competition deals surface first — useful for investors looking for deals others haven't noticed
- **Your Collections**: above the results:
  - When a saved search is active, shows a closable "Viewing: {name}" chip
  - When not, shows a pill row of up to 4 recent saved searches — clicking one applies its criteria
- **Property comparison**: Compare toggle on every card (up to 3). A floating pill appears bottom-center with count + "Open Comparison" button + clear (X). The modal is a side-by-side table across: address, price, deal score, risk score, cap rate, cash flow, CoC, rent estimate, neighborhood score, fair value range, vs-fair-value, DOM, **Competition score**, and per-column Underwrite button

### Test + build verification (Phase C)

- Backend: **99 pytest pass** (94 → 99; +5 demand tests)
- Frontend: **81 vitest pass**, **0 TypeScript errors**
- No new dependencies

## Sprint 7 — Phase D (National MLS + Portfolio)

### Task 4 — National MLS expansion

- Verified `backend/data/markets.json` already holds all 25 required markets (launch + secondary)
- `_search_rapidapi` in `property_service` already resolves city/state via the canonical `markets_service.resolve_market`, with a naive fallback that handles free-form queries like "Phoenix AZ" or "Nashville, TN". No code changes needed
- The mock fallback filters by city/state/zip, so searching Phoenix without a RapidAPI key correctly returns an empty set rather than fake Dallas data
- **SearchPage** now defaults the `query` to the user's first configured `targetMarkets` entry on first load when no `?q=` URL param is present — fetched once via `/users/me`, never clobbers user picks
- **MarketPulsePage** selector is now URL-synced:
  - `/market` — all markets
  - `/market?market=phoenix-az` — single market by id
  - `/market?city=Phoenix&state=AZ` — single market via city/state (agent-friendly)
  - URL updates when the user changes the selector so views are bookmarkable

### Task 9 — Portfolio improvements

- **Net Worth from Real Estate card** at the top of the detail panel:
  - Current equity · annual cash flow · estimated annual growth · 5-year wealth projection
  - Projection uses 3% appreciation compounded + flat cash flow + 2% annual paydown estimate — conservative and explicit
  - Reframes portfolio from "property management" to "wealth building"
- **Geographic Concentration tile-grid cartogram**:
  - 50 states + DC laid out in a compact 11×8 tile grid (no map library — pure SVG)
  - States colored by share of portfolio value: empty <1%, light amber 1–25%, amber 26–50%, red >50%
  - Lists top 5 states by share with colored pct
  - Red alert box names every over-concentrated state ("TX above 50% — diversify next acquisition")
  - Parses state code from the holding address string (last 2-letter uppercase token)
- **Equity Timeline per holding** (replaces the former static "Portfolio Equity Growth" chart):
  - Straight-line interpolation from purchase date to today
  - Stacked: Appreciation (emerald) + Principal Paydown (gold)
  - Appreciation = current_value − purchase_price; Paydown = (purchase_price × 75% initial loan) − current loan_balance
  - X axis: months since purchase (capped at 60 data points); Y axis: cumulative equity added

### Test + build verification (Phase D)

- Backend: **99 pytest pass** (no backend changes)
- Frontend: **81 vitest pass**, **0 TypeScript errors** (one test updated: "Portfolio Equity Growth" → "Equity Timeline")
- No new dependencies

## Sprint 7 — Phase E (Copilot prompts + history)

### Task 8A — Context-aware suggested prompts

- When a property is loaded (`?property=…`), the empty-state chips are replaced with:
  - "Is this a good deal at this price?"
  - "What's the downside on this property?"
  - "What offer should I make?"
  - "Generate an investment memo for this property"
  - "How does this compare to the Dallas market?"
- With no property context, chips focus on strategy selection and education:
  - "What are the best cash flow deals in Dallas right now?"
  - "Should I invest in Dallas or Phoenix right now?"
  - "Explain BRRRR strategy to me"
  - "What markets should I target for STR?"
  - "How do I evaluate a DSCR loan?"

### Task 8C — Conversation history

- **Migration 013** adds `copilot_conversations` (user_id, property_id, title, messages JSONB, timestamps)
- Backend `CopilotConversation` model + 4 new routes on existing `/copilot` router:
  - `POST /copilot/conversations` — upsert (creates if no id, updates if id provided). Auto-derives title from the first 80 chars of the first user message
  - `GET /copilot/conversations` — list (most recent 20) — summary shape (messageCount only, not full messages) to keep the sidebar cheap
  - `GET /copilot/conversations/{id}` — full detail with messages
  - `DELETE /copilot/conversations/{id}`
- Uses `CamelModel` so the frontend speaks camelCase consistently
- 8 new pytest covering: create (title derivation), update, 404 when not owned, list summary shape, get full, delete, auth guard
- **CopilotPage** gets a collapsible history panel (appears below the header when toggled):
  - Each row: title, message count, date, propertyId tag, delete button
  - Clicking a row restores the conversation
  - New header buttons: "New" (fresh conversation) and "History (N)" toggle
  - Auto-saves after every assistant response, debounced 1.5s so mid-turn edits don't spam the API
  - Tracks `conversationId` in component state so subsequent saves update the same row

### Test + build verification (Phase E)

- Backend: **107 pytest pass** (99 → 107; +8 conversation tests)
- Frontend: **81 vitest pass**, **0 TypeScript errors** (one test updated: CopilotPage chip assertion → context-aware copy)
- No new dependencies

## Sprint 7 — Phase F (Mobile native scaffolding)

### Task 5 — scaffold ios/ + android/

- Used `@react-native-community/cli@15.0.1` to generate a fresh 0.76.7 project
  in a throwaway directory, then copied the native dirs into `mobile/`:
  - `mobile/ios/` — full Xcode project (`StrataApp.xcodeproj`), `Podfile`,
    `AppDelegate.mm`, `Info.plist`, `LaunchScreen.storyboard`, `PrivacyInfo.xcprivacy`
  - `mobile/android/` — full Gradle project (`settings.gradle`,
    `build.gradle`, `app/build.gradle`, `AndroidManifest.xml`, `MainApplication.kt`)
- Moved placeholder Firebase configs into their canonical native paths:
  - `mobile/android/app/google-services.json`
  - `mobile/ios/StrataApp/GoogleService-Info.plist`
- Copied scaffold's `metro.config.js`, `jest.config.js`, `app.json`, `Gemfile`,
  and `.gitignore` into `mobile/`
- Updated `mobile/index.js` to register against `app.json` (not `package.json`) — matches RN 0.76 convention and the native project's registered name

### React Navigation wiring

- New deps in `mobile/package.json`:
  - `@react-navigation/native` 7.x
  - `@react-navigation/native-stack` 7.x
  - `@react-navigation/bottom-tabs` 7.x
  - `react-native-screens` + `react-native-safe-area-context`
- Rewrote `mobile/App.tsx` to replace manual tab state with `NavigationContainer`
  wrapping a bottom tab navigator. Auth flow: no session → LoginScreen; session
  → three tabs (Search, Portfolio, Copilot). Search tab has a nested native
  stack so tapping a property pushes IntelligenceScreen
- Dark theme configured in `NavigationContainer`'s `theme` prop (navy-950 bg,
  gold-500 accents, DM Sans-compatible font fallbacks)

### Firebase + env config

- Added `@react-native-firebase/app` and `@react-native-firebase/messaging`
  21.x to `package.json`
- Rewrote `mobile/src/services/notifications.ts` to use direct ES imports of
  `messaging` instead of the dynamic `require` fallback
- Added `react-native-config`; `mobile/src/constants.ts` now reads
  `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `API_BASE_URL` from it with
  sensible dev fallbacks
- Created `mobile/.env.example` (committed) and `mobile/.env` (gitignored)

### Documentation — `mobile/SETUP.md`

Covers every manual step the developer needs on first checkout:
  1. `npm install`
  2. Create `.env` from `.env.example`
  3. iOS — `bundle install` + `pod install` + `run-ios`
  4. Android — `run-android`
  5. Replace placeholder Firebase credentials (console setup, app creation,
     package name + bundle identifier, Gradle plugin wiring, AppDelegate
     configuration)
  6. Android release keystore generation
  7. iOS provisioning / App Store Connect
  8. Flipping `API_BASE_URL` for TestFlight / release builds

### Test + build verification (Phase F)

- **Mobile TypeScript: 0 errors** (`cd mobile && npx tsc --noEmit` with the
  RN preset and `lib: [ESNext, DOM]`)
- Mobile `npm install` succeeds — 845 packages installed
- Web + backend unchanged from Phase E: 81 vitest, 107 pytest
- **Native builds not verified on device** — requires a simulator / connected
  device and real Firebase credentials. The build pipeline is wired and
  documented; actual `run-ios` / `run-android` is a developer step

### Known follow-ups

- Real Firebase credentials need to be pasted into the placeholder config
  files before push notifications work on device (see SETUP.md §5)
- First iOS build needs `bundle install && pod install` (standard RN)
- Android release signing keystore needs to be generated (SETUP.md §6)

## Current Test Status (end of Sprint 6 + Mobile Addendum)

- Frontend: **75 tests passing** (Vitest), **0 TypeScript errors** (`tsc --noEmit`), vite production build clean
- Backend: **102 tests passing** (pytest)
  - Tasks 1/2/3/7 suites: `test_api_v1.py`, `test_webhooks.py`, `test_off_market.py`, `test_markets.py`
  - Tasks 4/5/6 suites: `test_renovation.py`, `test_lp_report.py`, `test_tour.py`
- Live HTTP smoke-tested on Supabase DB (migration 008 applied):
  - `/markets/supported`, `/properties/{id}/off-market-signals`, `/properties/search?off_market_only=true`, `/api/v1/*` (auth + envelope + rate limit headers + monthly counter)
  - `/properties/{id}/renovation-estimate` (state multipliers verified: CA/TX = 1.47×)
  - `/portfolio/lp-report` (end-to-end with real Claude narrative)
  - `/tour/scan-address` (auth codes verified; Claude path unit-tested)
