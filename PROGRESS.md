# STRATA — Progress Log

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

## Current Test Status

- Frontend: **75 tests passing** (Vitest)
- Backend: **30 tests passing** (pytest)
- TypeScript: **0 errors** (`tsc --noEmit`)
