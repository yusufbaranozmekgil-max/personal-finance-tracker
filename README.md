# 💰 Personal Finance & Investment Tracking Application

A comprehensive personal finance platform built with Angular 17 + SCSS, featuring **IndexedDB-based offline-first** architecture. From account management to investment portfolios, financial goals to future projections — it runs entirely standalone with no backend. **All data stays on the user's device**, protected with optional AES encryption.

> **Internship Project** • 100% runs in the browser • No backend • Data stays on device

## 🌐 Live Demo

👉 **[finans-takip.vercel.app](https://finans-takip.vercel.app)** *(replace after deployment)*

---

## 🚀 Setup

```bash
git clone https://github.com/<username>/finans-takip.git
cd finans-takip
npm install
npm start
```

Open in browser: **http://localhost:4200**

On first launch, try it out with sample data using **Settings → 🧪 Load Demo Data**.

---

## 🌟 Latest Professional-Grade Updates

Architectural and functional innovations integrated today to bring the application to a commercial, professional SaaS level:

1. **💾 Migration from localStorage to IndexedDB:** Replaced blocking, 5MB-limited `localStorage` with asynchronous, high-capacity **IndexedDB** (`localforage` wrapper). Migration mechanism preserves existing browser data.
2. **🔒 Session-Based Vault (Encryption):** All sensitive data encrypted at rest using `CryptoJS` (AES-256). Password kept only in-memory; session auto-locks when tab is closed or backgrounded. Covers all data including `Account` and `Settings`.
3. **🏦 Accounts / Vaults Module:** Users can define up to 10 checking, cash, credit card, or savings accounts. Income/expense transactions are linked to specific accounts for per-account balance tracking.
4. **🔮 Financial Future Projection Simulator:** Projects financial goal completion dates and month-end budget overrun estimates based on the last 3 months' savings rate.
5. **📥 Bank Statement Import Engine:** Bulk statement import with flexible column mapping, duplicate detection, and preview table.
6. **🖨 Reporting System:** Multi-sheet Excel reports (Transactions, Portfolio, Goals, Summary) and PDF dashboard screenshot exports.
7. **📈 FIFO Portfolio Engine & Trade Tracking:** Trade history for assets, FIFO-based realized/unrealized profit/loss calculations, and hybrid page views.
8. **🌓 Theme Switcher (Dark / Light):** Dynamic theme integration using CSS Custom Properties with instant switching and preference persistence.
9. **🎨 Professional Category Customization:** 12 corporate color palettes and 48 grouped icon selectors for categories.
10. **📶 Offline Resilience (Cache Layer):** Cache layer for live rates and crypto prices. When internet disconnects, last saved data loads with timestamps instead of throwing errors.
11. **☁️ Zero-Knowledge Cloud Sync:** Integrates user's own Google Drive via OAuth2, encrypts data with AES-256 before uploading, ensuring 100% secure cross-device data transfer.
12. **📈 Portfolio Heatmap (Treemap):** Finviz/TradingView-standard heatmap with segmented control. Asset sizes represent portfolio weights, colors represent profit/loss performance with reactive shading.
13. **📊 Historical Net Worth Growth Trend:** Tracks total wealth (Cash + Portfolio) growth with reactive daily snapshots and retrospective reconstruction algorithm displayed in a line chart.
14. **⇆ Inter-Account Transfer Module:** Budget-neutral transfers between accounts with dual-directional balance updates, custom validation, and dedicated transfer listing tab.

---

## 🛠 Technology Stack

| Layer | Technology |
|-------|-----------|
| Framework | **Angular 17** (Standalone Components + Signals) |
| Styling | **SCSS** + CSS Custom Properties (light/dark theme) |
| State | **Angular Signals** (reactive services) |
| Database | **IndexedDB** (via `localforage`, ~GB capacity) |
| Encryption | **CryptoJS** (AES — local vault) |
| Charts | **Chart.js 4.5** (doughnut, bar, line) — drilldown support |
| HTTP | Angular HttpClient (Frankfurter, Binance, Twelve Data) |
| Reports | **xlsx** (Excel), **jspdf + html2canvas** (PDF) |

---

## ✨ Modules

### 📊 Dashboard
- 6 summary cards (income, expense, net balance, portfolio, net worth, this month's spending)
- **Monthly Budget Panel** — limit/spent/remaining + 3-color status + shimmer progress bar
- 4 analysis cards (top spending category, daily average + month-end estimate, highest expense/income)
- **2×2 Accordion grid (7 sections):**
  - 🔮 **Financial Future Simulator** ⭐ (AI badge)
  - 🏦 Account Balances
  - 📊 Category-Based Spending Summary
  - 📋 Recent Transactions
  - 🍩 Category Distribution (drilldown)
  - 📊 Last 6 Months Income/Expense (drilldown)
  - 💼 Portfolio Type Distribution (drilldown)
  - 📈 Historical Net Worth Trend (drilldown) ⭐

### 🔮 Financial Future Simulator
- **Automatically calculates** the last 3 months' average savings rate
- **Budget Projection:** *"At your current pace, you'll exceed the limit by $2,300 by month end"*
- **Goal Projections:** Estimated completion date for each goal
  - 🚀 *"You'll reach this goal 45 days ahead of schedule"*
  - ⚠ *"You'll be 25 days late. You need to increase your savings rate by 32%"*
  - ❌ *"You need to save $5,000/month to reach this goal"*

### 💸 Transactions
- Full CRUD + boundary validations + **🔄 Monthly Recurring** option
- **🏦 Account Selector** (each transaction is linked to an account)
- **3 Accordion Filters:** 🏷️ Categories · 📅 Date Range (This Month, Last 7/30) · 📊 Summary View
- **2 Views:** 📂 Category accordion · ☰ Flat list
- Type tabs + 4 sort options + pagination

### 🏦 Accounts (Vaults)
- 6 account types: 💵 Cash · 🏦 Bank · 💳 Credit Card · 🐖 Savings · 📈 Investment · 📋 Other
- 8 ready-made templates (Garanti, Ziraat, Yapi Kredi, Is Bankasi…)
- **Real-time balance for each account** (opening balance + related income/expenses)
- Total balance card + sectoral color coding

### ⇆ Inter-Account Transfers
- **Dual-Directional Balance Updates:** Transfers deducted from source, added to target. Does not affect global income/expense budget (neutral).
- **Dynamic Form Controls:** When transfer type is selected, category and payment method auto-lock. Source and target account selectors appear. Same-account selection is prevented.
- **Transfer Listing Tab:** Dedicated "Transfers" tab on the transactions page to view all transfers.

### 💼 Portfolio & Investment Tracking
- **Hybrid Page View:** Switch between **Holdings** and **Trade History** views via top tabs.
- **FIFO (First-In, First-Out) P&L Engine:** Matches trades chronologically, deducting from oldest purchase lots.
- **Detailed Asset Cards:** Quantity, average cost (FIFO), realized and unrealized profit/loss indicators for each asset.
- **Dynamic Buy/Sell Recording:** Add new trades directly from asset cards, delete past trades with one click.
- **3 Summary Cards:** Portfolio Value / Cost / FIFO Realized P&L.
- **Accordion Categories** (💎 Crypto · 📈 Stocks · 🪙 Gold · 💵 Foreign Currency · 📊 Funds · 🎯 Other)
- **🔴 Live Pricing:**
  - **Crypto** (Binance) — BTC, ETH, BNB, SOL, XRP, ADA, DOGE, AVAX, DOT, LINK, LTC, TRX, TON
  - **Gram Gold** (Binance PAXG / 31.1035 grams)
  - **Silver** (XAGUSDT)
  - **BIST Stocks** — via user API key (Twelve Data / Alpha Vantage / Finnhub)
- Automatic P&L calculator (displayed with FIFO, cost, and value formulas)
- **📈 Portfolio Heatmap (Treemap):** Segmented control toggle between list view and performance map. Asset sizes scale by portfolio weight, colors react to performance (green for profit, red tones for loss). Hover tooltips show net P&L, cost, and value details.

### 🎯 Goals
- Max 8 goals, 8 preset templates (Laptop, Erasmus, Emergency Fund, Vacation…)
- 4 status tabs: All / 🎯 Active / ✓ Completed / ⚠ Expired
- Shimmer progress bar + days remaining + quick deposit
- Celebration toast 🎉 upon completion

### ⚙️ Settings (Modular Cards)
- 🌓 **Theme** — Dark ↔ Light (CSS variables, instant switch)
- 💱 **Currency** — TRY/USD/EUR (auto-converts everywhere)
- 🎯 **Monthly Budget Limit**
- 📈 **Exchange Rates** — manual or **3 fallback APIs** (Frankfurter → open.er-api → exchangerate.host)
- 🔑 **BIST/Stock API** — provider selector + key input + test button
- 🔄 **Monthly Reset** — reset day + manual trigger
- 📤 **Reports** — CSV / Excel (4 sheets) / PDF (dashboard screenshot)
- 📥 **Statement / Excel Import** — bank statement import (preview + duplicate detection)
- 💾 **JSON Backup** — Export/Import (overwrites existing data)
- 🔒 **Vault (AES Encryption)** — set password, lock screen on startup
- ☁️ **Cloud Sync (Google Drive)** — Serverless data sync via OAuth2. Encrypts data with user's Vault password in-browser (Zero-Knowledge) before uploading to Google Drive.
- 💾 **Storage Status** — IndexedDB usage/quota indicator
- 🧪 **Demo Data** — 28 transactions, 13 assets, 3 accounts, 3 goals
- 🗑 **Reset All Data**

---

## 🎨 Professional Category Customization
- Per category: **icon + color + name**
- **12 financial color palettes** (saturated, corporate tones)
- **48 icons — categorized in 8 groups** (Finance, Living, Transport, Bills, Health, Education, Entertainment, Other)
- Live preview pill — updates instantly while typing/selecting
- Dashboard charts use each category's own color

---

## 🔗 Cross-Module Integration

- **Portfolio → Transactions:** "Record purchase as expense" option when adding an asset → auto-creates expense in "Investment" category
- **Goals → Transactions:** Option to deduct from balance when adding deposits
- **Drilldown Charts:** Click on donut/bar/line chart segments to navigate to filtered Transactions/Portfolio page

---

## 🔔 Smart Notifications & UX

| Component | Description |
|-----------|-------------|
| **Toast** | Top-right, 2.8s slide-in (success/error/info/warning) |
| **Confirm Dialog** | Modern modal, backdrop blur (danger/warning/info variants) |
| **Budget Banner** | Global sticky — 80% yellow, 90% orange, 100%+ red (pulse animation) |
| **Offline Banner** | Appears on top bar when internet disconnects, cache timestamped |
| **Lock Screen** | Full overlay on startup when Vault is active, shake animation on wrong password |

---

## 🔄 Monthly Auto-Reset

Check the **"🔄 Monthly Recurring"** box when adding transactions (for rent, salary, bills).
When the **reset day** set in Settings arrives on app launch:

- 🗑 **One-time transactions are permanently deleted** (regardless of date)
- 🔄 **Monthly-flagged transactions** are recreated for the current month with today's date
- Runs only once per month

---

## 💱 Currency & Live Data

All amounts are stored in **TRY** and converted via `MoneyPipe` to the selected currency. APIs:

| Service | URL | API Key | Coverage |
|---------|-----|---------|----------|
| Frankfurter | `api.frankfurter.app` | None | USD/EUR rates (ECB) |
| Binance | `api.binance.com` | None | Crypto + PAXG (gold) + XAG (silver) |
| Twelve Data | `api.twelvedata.com` | Yes (free 800/day) | BIST stocks (`.IST`) |
| Alpha Vantage | `alphavantage.co` | Yes (free 25/day) | BIST stocks |
| Finnhub | `finnhub.io` | Yes | International stocks |

On API failure: cache fallback + last update timestamp notification.

---

## 🔒 Data Security

### JSON Backup
- **Export:** All data in a single `finance-backup-YYYY-MM-DD.json` file (transactions, assets, goals, accounts, categories, settings)
- **Import:** Select file, confirm, overwrite
- Versioned format (`version: 1`)

### Bank Statement / Excel Import
- **Download template Excel** or upload your bank's statement
- **Flexible column mapping** — Date, Amount/Debit/Credit, Category, Description
- Automatic duplicate detection (date + amount + description hash)
- New categories and accounts created automatically
- **Preview modal** — status of each row (✓ OK / ⚠ Duplicate / ✕ Error)

### Vault (AES-256)
- User password → `CryptoJS.AES.encrypt(JSON.stringify(allData), password)`
- IndexedDB keys wrapped into single `finans_vault` blob
- On startup: **lock screen** → correct password → auto decrypt + reload services
- Probe validation (`__probe: "OK_FINANS_VAULT_v1"`) for wrong password detection
- Emergency reset link (with data loss warning)

---

## 💾 Storage: IndexedDB

Uses **IndexedDB** instead of `localStorage` (5MB limit, blocks UI, iOS silently deletes):

- **Wrapper:** `StorageService` (localforage-based)
- **Sync API:** `getItemSync/setItemSync` — in-memory cache keeps services immutable
- **Async API:** `getItem/setItem` — for new code
- **APP_INITIALIZER** prepares cache before boot (~50ms)
- **Auto-migration:** On first launch, migrates `finans_*` keys from `localStorage` to IndexedDB

---

## 📁 Project Structure

```
src/
├── app/
│   ├── core/
│   │   ├── constants/         # validation.constants.ts
│   │   ├── models/            # transaction, asset, goal, account, category
│   │   └── services/          # 15+ services
│   │       ├── transaction.service.ts
│   │       ├── portfolio.service.ts
│   │       ├── goal.service.ts
│   │       ├── account.service.ts
│   │       ├── category.service.ts       (rich category objects)
│   │       ├── settings.service.ts
│   │       ├── theme.service.ts
│   │       ├── toast.service.ts
│   │       ├── confirm.service.ts
│   │       ├── budget-alert.service.ts
│   │       ├── live-price.service.ts
│   │       ├── currency-rate.service.ts
│   │       ├── storage.service.ts        (IndexedDB wrapper)
│   │       ├── encryption.service.ts     (AES vault)
│   │       ├── auto-reset.service.ts
│   │       ├── data.service.ts
│   │       ├── connection.service.ts
│   │       ├── report.service.ts         (CSV/Excel/PDF)
│   │       ├── import.service.ts         (Bank statement import)
│   │       └── forecast.service.ts       (Projection simulator)
│   ├── features/
│   │   ├── dashboard/         # 7 accordion sections + 4 analysis cards
│   │   ├── transactions/      # CRUD + 3 accordion filters + 2 views
│   │   ├── portfolio/         # Accordion categories + live pricing
│   │   ├── goals/             # 4 status tabs + progress bar
│   │   ├── accounts/          # Account management
│   │   └── settings/          # 12 setting cards
│   ├── shared/
│   │   ├── components/        # toast, confirm-dialog, budget-banner,
│   │   │                      # offline-banner, lock-screen
│   │   └── pipes/             # money.pipe.ts
│   ├── app.component.*
│   ├── app.config.ts          # Router + HttpClient + APP_INITIALIZER
│   └── app.routes.ts
└── styles/
    ├── _variables.scss        # CSS custom properties (light/dark)
    └── _mixins.scss           # card, btn, input, flex
```

---

## 🛡 Validation Limits

| Field | Limit |
|-------|-------|
| Name (category/goal/asset/account) | 30 characters |
| Description | 50 characters |
| Category name | 20 characters |
| Amount | 1 trillion |
| Category count (income/expense/asset) | 20 per type |
| Account count | 10 |
| Goal count | 8 |
| Reset day | 1-28 |
| Vault password | min 4 characters |

---

## 📱 Responsive Design

- **Desktop (>900px):** 2-column grid
- **Tablet (600-900px):** Collapsed grid
- **Mobile (<600px):** Single column, full-width buttons, card-format tables

---

## 🎨 Theme

Dark / Light. CSS variables defined with `:root` + `[data-theme='light']`,
SCSS variables use `var(--...)` proxy. Component files work theme-agnostically.

```scss
$color-bg:        var(--color-bg);
$color-primary:   var(--color-primary);
// ...
```

---

## 📜 Commands

```bash
npm start          # Development server — http://localhost:4200
npm run build      # Production build (dist/finans-takip)
npm run watch      # Continuous dev mode compilation
npm test           # Jasmine + Karma tests
```

---

## 🧪 Demo Content

`Settings → 🧪 Load Demo Data`:

- **4 accounts** — Cash Wallet, Vakifbank Military Salary Account, Ziraat Bank Credit Card, OYAK Savings Account
- **30+ transactions** — Military Salary (recurring), Field Exercise Allowance, Housing Rent (recurring), Bills (recurring), Food, Transportation, Shopping, Health, Education, inter-account transfers (OYAK contributions, credit card payments)
- **3 assets** — Aselsan (Stock), Gram Gold (Gold), US Dollar (Foreign Currency)
- **3 goals** — Tactical & Camping Equipment, New Car Down Payment, Private Pension Plan
- **Budget** — $30,000/month

---

## 🏆 Professional Feature Showcase

| # | Feature | Detail |
|---|---------|--------|
| 1 | **IndexedDB Storage** | Migration from localStorage to GB-scale database |
| 2 | **AES Vault** | Local data encryption + lock screen |
| 3 | **JSON Backup** | One-click export/import |
| 4 | **Bank Statement Import** | Excel/CSV → smart column mapping + preview |
| 5 | **PDF/Excel Reports** | Dashboard screenshot + 4-sheet workbook |
| 6 | **Multi-API Live Pricing** | Binance + Twelve Data + Frankfurter + 3 fallbacks |
| 7 | **AES + IndexedDB** | At-rest encryption |
| 8 | **Drilldown Charts** | Click chart segment → navigate to filtered page |
| 9 | **Cross-Module Triggers** | Portfolio purchase → auto expense |
| 10 | **Forecast Engine** | Savings rate + budget + goal projection |
| 11 | **Recurring Engine** | Monthly recurring transactions auto-renew |
| 12 | **Theme System** | CSS Custom Properties for light/dark |
| 13 | **Offline Mode** | Cache fallback when API is down + banner |
| 14 | **Category Customization** | Icon + color + group palette |
| 15 | **Account (Vault) Management** | 6 types, real-time balance calculation |
| 16 | **Zero-Knowledge Cloud Sync** | Google Drive OAuth2 + AES encrypted sync |
| 17 | **Portfolio Heatmap** | Dynamic treemap by asset weight and performance |
| 18 | **Net Worth History** | 6-month retrospective reconstruction growth chart |
| 19 | **Inter-Account Transfers** | Neutral fund transfer flow with dual-directional balance updates and Excel/CSV integration |

---

## 🔮 Future Development

- [x] Zero-Knowledge Cloud Sync (Google Drive OAuth2)
- [ ] PWA (offline support + install)
- [ ] Multi-account / user profiles
- [ ] Web Worker for large report generation
- [x] Inter-account transfer transactions
- [ ] Stock market news (integrated RSS)
- [ ] Investment Analysis Module (Portfolio Sharpe Ratio and beta coefficient calculation)
- [ ] Automatic Open Banking Integration (PSD2 statement import)
- [ ] Web Push / Email Notifications for Budget Limit Violations
- [ ] ONNX/WebGPU-Based Local AI Portfolio Allocation Recommender

---

## 📝 License

Educational internship project — MIT.

---

## 🙏 Acknowledgments

- [Angular](https://angular.io/) — Framework
- [Chart.js](https://www.chartjs.org/) — Charts
- [localForage](https://localforage.github.io/localForage/) — IndexedDB
- [CryptoJS](https://github.com/brix/crypto-js) — AES encryption
- [SheetJS](https://sheetjs.com/) — Excel read/write
- [jsPDF](https://github.com/parallax/jsPDF) — PDF generation
- [Frankfurter](https://www.frankfurter.app/) — Exchange rate data
- [Binance Public API](https://github.com/binance/binance-spot-api-docs) — Crypto/gold
- [Twelve Data](https://twelvedata.com/) — BIST stocks
