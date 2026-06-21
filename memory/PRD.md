# FOLIO / PortfolioTracker — Investment Portfolio

## Stack
- Backend: FastAPI + Motor (MongoDB), JWT auth, bcrypt
- Frontend: React + Tailwind + Shadcn/UI + Recharts
- Prices: Binance WebSocket (crypto), CoinGecko (crypto REST), Yahoo Finance via yfinance (stocks)
- FX rates: USD / EUR / CHF via open.er-api.com

## Implemented (iter 1) — 2026-02
- JWT auth, wallets CRUD, /api/portfolio with live prices, charts, filters, USD/EUR toggle

## Implemented (iter 2)
- Transactions model (BUY/SELL) replaces direct asset entry, auto-migration from legacy
- Weighted-average-cost holdings + Realized P&L
- Per-wallet currency EUR/USD/CHF; Binance WebSocket real-time + .US fallback
- FlashingPrice component, /transactions page CRUD

## Implemented (iter 3)
- Sidebar layout (logo, nav, Carteiras list, currency toggle, user info)
- Price Alerts: backend CRUD + trigger check + browser Notifications API + sidebar badge
- Time-range chart (30min..ALL) with 15-min bucketed snapshots
- Sortable assets table
- Stock symbol auto-resolve via Yahoo Search variants (3DVELO → VELO, AIRJ, TDTH)
- 2-decimal formatting enforced everywhere
- Filter pills (Global/Crypto/Ações/per-wallet), area chart + donut with legend %

## Implemented (iter 4) — 2026-02
- **24h sparklines** per asset in dashboard table (green for positive, red for negative, ResponsiveContainer line chart with gradient)
- **Stable arrow widths** in FlashingPrice: invisible placeholder when neutral, prevents number shifting
- **Light/Dark theme toggle** with localStorage persistence, sun/moon icon in sidebar; brute-force CSS overrides for zinc utility classes
- **CSV bulk import** /api/transactions/import endpoint + dialog in /transactions page; auto-detects columns (date/type/symbol/quantity/price/fee/currency) from any broker's export

## Implemented (iter 5-12) — 2026-02 (current)
- **App rebranded "Wallet76"**
- **Cross-device sync**: All data (wallets, transactions, watchlists, alerts) is server-side per user_id (already). Added `user_prefs` collection + `GET/PUT /api/preferences` for **UI prefs sync** (language, theme, currency, privacy_hidden). `PreferencesSync` component pulls on login + pushes on local changes.
- **App lock screen + Security settings page** (`/settings`): user picks ONE mode — Standard (no lock), PIN (4-6 digits, hashed), Biometric (WebAuthn — Face ID / Touch ID / Windows Hello).
  - Backend: `user_security` collection + endpoints `GET /api/security/status`, `POST /api/security/lock-mode`, `POST /api/security/pin/setup|verify`, `DELETE /api/security/pin`, `POST /api/security/biometric/register/options|verify`, `POST /api/security/biometric/auth/options|verify`, `DELETE /api/security/biometric/{cred_id}`.
  - Frontend: `LockScreen.jsx` overlay shows after login if mode != "none"; PIN entry (4-digit dots input) or biometric auto-prompt. `Settings.jsx` page with 3 mode cards + change PIN dialog + WebAuthn navigator.credentials integration.
  - Library: `webauthn==2.8.0` (Duo Security) for proper signature verification.
- **CSV/HTML/XLSX import** for XTB/Binance/IB/Ledger
- **3 action icons per asset on Dashboard**: Sell, Delete, Chart
- **Top Movers widget on Dashboard** — top 3 up + top 3 down from your own positions
- **AssetChart page** with 11 ranges incl. 5m/15m; yfinance fallback when CoinGecko rate-limits
- **i18n (PT / FR / EN)** full coverage: Dashboard, Watchlist, Wallets, Alerts, Transactions, News, Market, Settings, sidebar, lock screen, dialogs
- **Watchlists with sub-groups** (max 20 groups, max 20 items per group). Per-item enriched data + inline price alerts.
- **News** page tabs auto-default query to avoid mismatched content
- **Market page**: Top 10 crypto + stocks gainers/losers + 7 latest crypto news + 7 latest stocks news + 5 portfolio-specific news
- **Privacy/hide-values toggle**: hides only $ totals, keeps Price/Avg Cost/P&L %/% Portfolio/24h % visible
- **Columns gear** on Dashboard + Watchlist tables (persisted independently)
- **Sidebar per-wallet PnL %** badges + **60×16 mini-sparkline 7d**
- **Wallets page**: "Abrir/Open" button (blue) + "Eliminar/Delete" button (rose) per card
- **Pie + Evolution chart tooltips** with white text on dark bg

## Implemented (iter 14) — 2026-02
- **5 languages (en, pt, fr, de, it)** with full coverage across nav, dashboard, transactions, alerts, wallets, watchlists, market, news, settings, lock screen, AND all auth screens (Register/Login/ForgotPassword/ResetPassword/VerifyEmail). 253 keys × 5 langs.
- **Resend rate-limit** — `/api/auth/resend-verification` enforces a 60s per-email cooldown via `users.last_verification_sent_at` (returns `{ok:true, cooldown:true}` if hit within window). Initial register email also seeds the cooldown so resends within 60s of registration are throttled.
- **Edit Transaction modal** on `/transactions` (pencil icon per row → Shadcn Dialog with date/quantity/price/fee/notes inputs; PATCH /api/transactions/{id}).
- **Retroactive "ALL" portfolio history** — new branch in GET `/api/history?range=all`: walks every transaction since day 1, applies BUY/SELL deltas per day, multiplies running qty by yfinance daily closes (`<sym>-USD` for crypto, raw symbol for stocks); cached 30 min per user.
- **Mongo indices** on `users.verify_token_hash` and `users.reset_token_hash` (sparse).
- **send_email failures** no longer silent — `_log_email_task_result` done-callback logs every fire-and-forget task exception.

## Backlog
- P2: VerifyEmail page already localizes errors via `t('auth.verify_default_error')` — backend detail is no longer leaked.
- P2: Run retro `ALL` history as a background job (yfinance period='max' per asset can be slow on first call for portfolios with many assets — currently cached 30 min after first hit).
- P2: IP-level throttling on `/api/auth/resend-verification` (per-email cooldown is the primary guard).
- P2: Invalidate active sessions on password reset / email change.
- P2: Dedup check on POST /api/watchlists (user_id, symbol, asset_type).
- P2: FIFO/LIFO cost basis option.
- P2: Public read-only share link.
