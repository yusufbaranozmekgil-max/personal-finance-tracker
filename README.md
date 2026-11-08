# Ring Binder

A personal finance tracker that lives entirely in your browser. Write down what comes in and goes out, follow your accounts, investments and savings goals. There is no sign-up and no server: the data stays on your device, encrypted with your password if you want.

Live: [personal-finance-tracker-chi-plum.vercel.app](https://personal-finance-tracker-chi-plum.vercel.app/)

## What it does

- **Month page.** Type a line like `12.50 lunch` or `+3200 salary`. The amount, the note and a matching category are picked out of the line. Entries sit on a ruled sheet, and the month's totals are written at the foot. A deleted entry gets struck through with a VOID mark, and you can restore it until you leave the page.
- **Budget pace.** A monthly limit shows what you have spent so far, a straight-line projection to the end of the month, and what you can still spend per day.
- **Accounts in any currency.** Totals are converted to your base currency using open exchange rates (open.er-api.com, with the ECB feed as a fallback). Transfers between accounts in different currencies record the amount that actually arrived.
- **Investments.** Buys and sells are matched first-in, first-out. Each holding shows its average cost, open gain and realised gain. Live prices are available for common crypto symbols and for gold; stock and fund prices use your own free API key.
- **Goals.** For each goal you see what it needs per month to make its deadline, and whether your average savings over the last three months keeps up.
- **Bank statements.** CSV and Excel files are read by their column names, in English, Turkish, German, French, Spanish, Italian and Dutch. You see every row before anything is added, and rows that are already in the account are skipped.
- **Backups.** You can download a backup file, restore one, or keep an encrypted copy in your own Google Drive. CSV and Excel export are also available, and printing any page gives a clean sheet.
- **Password lock.** PBKDF2-SHA256 with 600k iterations derives an AES-256-GCM key through the browser's Web Crypto. The book locks after 5 idle minutes.
- **Installable and offline.** It is a PWA with a service worker, and it works in light and dark themes.

## How it is built

| | |
|---|---|
| Framework | Angular 22, standalone components, signals, zoneless |
| State | One `Book` document in IndexedDB, written through one store (`src/app/data/book-store.ts`) |
| Domain | Pure functions in `src/app/domain`: amounts, ledger, FIFO, forecasts, statement import, backups, migration |
| Encryption | Web Crypto (`src/app/data/crypto.ts`); CryptoJS is loaded only to open vaults from version 1 |
| Spreadsheets | SheetJS 0.20.3 from the SheetJS CDN, lazy-loaded |
| Charts | Hand-drawn HTML/SVG with screen-reader tables, no chart library |
| Fonts | Barlow and Barlow Condensed, self-hosted (no request to Google) |
| Tests | Vitest unit tests for the domain and crypto; Playwright end-to-end tests in a real Chrome |

### Coming from version 1

On the first visit, data saved by the first version (IndexedDB `FinansTakip`) is converted and moved over. If that data was locked with a password, the app asks for the old password once and re-encrypts the data with Web Crypto. Backup files from version 1 can be restored too. The old copy is left untouched in the browser.

## Run it

```bash
npm install
npm start            # http://localhost:4200
npm test             # unit tests
npm run build
npm run e2e          # end-to-end tests against the production build (uses installed Chrome)
```

### Google Drive backup

This feature needs an OAuth client ID owned by whoever deploys the site:

1. In Google Cloud Console, create a project and enable the Google Drive API.
2. Create an OAuth client of type "Web application" and add the site's origin under authorised JavaScript origins.
3. Put the client ID into `src/app/config/app-config.ts`.

The app asks only for the `drive.file` scope, so it can see the one backup file it creates and nothing else. While no client ID is set, the Drive section says that Drive backup is not switched on for this site.

## Privacy

The only network requests are for exchange rates, for crypto and gold prices, for stock prices from the provider you chose (and only with your key), and for Google Drive if you use it. None of these requests contain amounts, names or notes. The response headers (`vercel.json`) set a strict Content Security Policy that lists exactly those hosts.

## License

MIT, see [LICENSE](LICENSE).
