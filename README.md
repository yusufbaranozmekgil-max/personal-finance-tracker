# Personal Finance & Investment Tracker

An offline-first personal finance platform built from scratch with Angular 17.
Tracks income, expenses, investment portfolios (with FIFO P&L), accounts, and financial goals — entirely in the browser, with AES-encrypted local storage and zero backend.

🌐 **Live Demo:** [personal-finance-tracker-chi-plum.vercel.app](https://personal-finance-tracker-chi-plum.vercel.app/)
📁 **Source:** [github.com/yusufbaranozmekgil-max/personal-finance-tracker](https://github.com/yusufbaranozmekgil-max/personal-finance-tracker)

---

## The Problem I Wanted to Solve

I started this project because every finance app I tried demanded one of three uncomfortable things:
either I had to **upload my salary, rent, and bank balance to a stranger's cloud**, or pay a subscription,
or live with crippled free-tier limits. The two open-source alternatives I tried either ran a heavy
self-hosted backend (Postgres + Docker just to log a grocery receipt) or were stuck in 2014 jQuery UI.

The friction I actually had was simple:
- I wanted to know **where my month went** without spreadsheets.
- I wanted to **track investments** (crypto, gold, BIST stocks) in the same place as my expenses.
- I wanted **predictive insight** — "at this rate, will I overshoot the budget?" — not just historical reports.
- I wanted my data to **stay on my machine**.

So I scoped a build: a single-page app that runs entirely in the browser, stores everything locally,
and still feels like a commercial SaaS — multi-account, multi-currency, with live exchange rates,
encrypted backups, and forecasting. The full stack is Angular + IndexedDB. No server, no telemetry,
no signup. The deployment is a static bundle on Vercel.

---

## Why These Technologies

**Angular 17 with standalone components and signals.** I went with Angular over React for three reasons.
First, the project has fifteen-plus services with cross-dependencies (transactions feed forecasts,
accounts derive balances from transactions, the budget alert observes the transaction stream), and
Angular's dependency injection makes that wiring explicit rather than tribal knowledge in custom
hooks. Second, Angular 17's signal primitives gave me reactive state without the boilerplate of
NgRx or the footguns of `useEffect`. Third, the CLI's strict mode caught real bugs at compile time
that I would have found in production with a looser stack.

**IndexedDB via `localforage`.** Originally I built everything on `localStorage`. It worked, until I
realized two things: it's synchronous (blocks the UI thread on every write), and it has a hard ~5MB
ceiling that iOS and Safari can silently delete when disk is tight. For a finance app that should
survive years of records, that's a recall-tier defect. I migrated the entire storage layer to
IndexedDB through `localforage`, which gives me GB-scale capacity and a Promise-based API. The
non-obvious part: I wrote a custom `StorageService` that keeps an in-memory cache, so existing
services that expected synchronous reads (`getItemSync`) didn't need to be rewritten. The cache is
hydrated by an `APP_INITIALIZER` that blocks bootstrap until IndexedDB is ready (~50ms).

**Chart.js over D3.** I needed donut, bar, and line charts with drilldown click handlers. D3 would
have been more flexible but I'd have spent a week on tooltip and legend implementations Chart.js
gives for free. The tradeoff is harder customization later, but for this scope it was right.

**SCSS with CSS custom properties.** I wanted a light/dark theme that switches instantly without
recompiling. The standard SCSS approach (one stylesheet per theme) doesn't allow runtime switching.
My solution: every color in `_variables.scss` is now a `var(--color-bg)` reference. The actual
hex values live in `:root` and `[data-theme='light']` blocks. A `ThemeService` toggles the
`data-theme` attribute on `<html>`, and every component re-renders instantly through the cascade.
Component SCSS files reference `$color-bg` exactly as before — they don't know themes exist.

**`CryptoJS` for the local vault.** This wasn't planned. I was 80% through the build when I asked
myself: "if someone opens this on a shared laptop, can they read my salary?" The answer was yes
because `localStorage` and IndexedDB are both visible in DevTools. I added an opt-in encryption
layer where the user sets a master password, every record is encrypted with AES-256 before being
written to disk, and a lock screen appears on every page load.

---

## The Hard Problems and How I Solved Them

### Forecasting without overfitting to recent noise

The "Financial Future Simulator" predicts whether you'll hit your laptop savings goal on time and
whether you'll overshoot the monthly budget. My first version used only the current month's data —
which meant a single bonus paycheck made the forecast wildly optimistic.

The fix was a three-month rolling average of net savings (income minus expenses, weighted equally
across months that actually contain data). For budget overrun, I project the end-of-month total
using current daily-average spending × remaining days. If the user's been spending heavily for ten
days but historically does so only mid-month, the prediction will be too high — but that's the
*right* error to make. A finance app should warn you early, not reassure you that everything is fine
because the bills don't usually arrive until day twenty.

### FIFO profit/loss for the investment portfolio

For the portfolio I needed realized vs. unrealized P&L per asset across multiple buys and sells —
classic FIFO accounting. If you bought 1 BTC at $40k, then 1 BTC at $50k, then sold 1 BTC at $60k,
the realized profit is $20k (against the older lot) and your remaining cost basis is $50k.

I implemented this as a pure function on the asset's `trades[]` array. Buys push onto a queue with
remaining quantity, sells consume the queue head, and realized profit is computed against the
consumed lot's price. The result is a derived value that's always consistent with the trade history —
deleting a trade automatically recalculates everything downstream. The whole engine is one file
and ~80 lines.

### Cross-module triggers without coupling

When you record buying $10k of gold in the portfolio, that's also $10k leaving your account. Three
options here: hard-couple the portfolio service to the transaction service (rigid), event bus
(observable spaghetti), or opt-in trigger via the form (transparent).

I went with option three. The "Add Asset" form has a checkbox "Record purchase as an expense and
deduct from balance." If checked, the portfolio service emits a transaction in the "Investment"
category against the user's default account. Users see the link being created. There's no hidden
state synchronization, and removing one of the two records doesn't break the other — they're
independent. Goals have the same pattern for deposits.

### Live currency rates that survive a flaky connection

I fetch USD/EUR rates from `api.frankfurter.app` (free, no API key, ECB-sourced). Crypto and gold
come from Binance. BIST stocks need a user-supplied Twelve Data / Alpha Vantage / Finnhub key
because no free CORS-enabled BIST feed exists. The challenge was that any of these APIs can be
down, rate-limited, or blocked.

I built a three-tier fallback (Frankfurter → open.er-api.com → exchangerate.host) and cached every
successful fetch with its timestamp. If all three fail, the cached value loads and a banner appears:
"⚠ Offline — rates from 2 hours ago." The app stays functional, the user just sees stale data with
honest framing. This was probably the single highest-impact decision for perceived reliability.

### Bank statement import without a fragile parser

Users wanted to bulk-import past expenses from CSV/XLSX. The naive approach (require exact column
names) doesn't survive contact with five different banks' export formats. My solution: a column
detection function with a dictionary of synonyms. "Tarih" / "Date" / "Transaction Date" all map to
the date column; "Tutar" / "Amount" / "Borç" / "Alacak" all map to amount (with debit/credit
inferring the type). The import goes through a preview modal that shows three counts (valid /
invalid / duplicate) before any data is committed. Duplicates are detected by hashing `date + amount
+ description`. Unknown categories and accounts are auto-created during commit, not silently
discarded.

### The thousand-separator directive that broke validation

This sounds trivial. I wanted users to see `1.000.000` while typing instead of `1000000`. HTML
`<input type="number">` doesn't support thousand separators, so I switched the inputs to
`type="text"` and wrote a directive that reformats on every keystroke. Works great — except suddenly
the "max 1 trillion" check happens only on submit, and users were typing 200-digit numbers that
overflowed JavaScript's Number type into `1.111e+154`.

The fix: the directive now accepts an `[appMax]` input. On every keystroke, it parses the value,
checks against the cap, and if exceeded, **reverts to the last valid state** instead of accepting
the keystroke. The user literally cannot type past the limit. I also tied the max to the USD
exchange rate (1 trillion USD × current rate in TRY), so the cap is always meaningful regardless of
which currency the user picked.

### Recurring transactions without time-bomb bugs

Rent and salary repeat monthly. The naive approach (a cron-like background loop) doesn't work in a
SPA — there's no background, the app only runs while the user has the tab open. My solution: an
`AutoResetService` that runs once on every app boot. It checks if today is past the configured
reset day AND if it hasn't already run this month, then it (1) deletes one-time transactions older
than the reset, (2) creates copies of recurring transactions dated today. The
`settings.lastResetMonth` field guarantees it runs exactly once per month, no matter how many times
the user opens the app.

---

## Architecture Notes for the Curious

- **State**: Each domain (`TransactionService`, `PortfolioService`, `AccountService`, etc.) owns a
  signal. Derived values are `computed()` — there's no manual subscription management anywhere.
- **Routing**: Five lazy-loaded standalone routes. Total initial bundle is ~250KB gzipped.
- **Forms**: Template-driven with `[(ngModel)]`. Reactive forms would have been over-engineered for
  fields that map 1:1 to a value.
- **Testing**: 11 Jasmine specs covering the import parser (hardest logic) and the FIFO engine
  (most error-prone). Components are visually verified during development.
- **Build**: `npm run build` produces a static bundle to `dist/finans-takip/browser/`. Vercel
  rebuilds on every push to `main`. The `vercel.json` rewrites all paths to `index.html` so client-
  side routing works on direct URLs.

---

## What I Would Do Differently Next Time

- **Validation at the model layer, not the form.** Right now validation is duplicated between the
  form's `submit()` and the service. A class-based model with built-in `validate()` would
  consolidate it.
- **Component test coverage**. The services are tested, but the components only got smoke tests.
  Cypress for end-to-end would catch the kind of UX regressions I found by manual testing.
- **Sync, not just backup**. JSON export/import is good, but real cross-device sync (Google Drive
  end-to-end encrypted, which I have wired but didn't fully ship UX-wise) is the natural next step.

---

## Try It

```bash
git clone https://github.com/yusufbaranozmekgil-max/personal-finance-tracker.git
cd personal-finance-tracker
npm install
npm start
```

Open `http://localhost:4200`. Use **Settings → Load Demo Data** for an instant six-month dataset.

---

## Feature Inventory (Reference)

For the recruiter scanning quickly:

| Area | Capabilities |
|------|-------------|
| **Transactions** | CRUD, monthly recurring flag, accordion view grouped by category, flat list with sorting + pagination, three accordion filters (categories, date range, summary), drilldown from charts |
| **Portfolio** | Custom asset types, FIFO P&L engine, trade history, live prices (Binance for crypto + gold + silver, Twelve Data / Alpha Vantage / Finnhub for BIST stocks via user API key), heatmap view, multi-currency support |
| **Accounts** | Up to 10 accounts across 6 types (cash, bank, credit card, savings, investment, other), per-account balance, dedicated transfer module that's budget-neutral |
| **Goals** | Up to 8 goals, status filtering (active / completed / overdue), inline savings deposit, completion celebration |
| **Forecasting** | Monthly average savings rate, budget overrun projection, per-goal completion date estimate with "X days early / late" assessment |
| **Reports** | CSV export, 4-sheet Excel report (transactions / portfolio / goals / summary), PDF dashboard snapshot |
| **Security** | Optional AES-256 vault with master password, session-lock on tab background, lock-screen on app load |
| **Data Portability** | Full JSON backup/restore, bank statement import (XLSX/CSV) with flexible column mapping + duplicate detection |
| **UI** | Light/dark theme via CSS custom properties, responsive across desktop/tablet/mobile, accordion-heavy info architecture to manage density |
| **Storage** | IndexedDB via localforage, ~GB capacity, in-memory cache for legacy sync access, one-time migration from localStorage |

---

## Stack

Angular 17 · TypeScript · SCSS · Chart.js · CryptoJS · localforage · xlsx · jspdf + html2canvas · Vercel
