import { Page, expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import CryptoJS from 'crypto-js';

async function startEmpty(page: Page, currency = 'EUR') {
  await page.goto('/');
  await page.getByLabel('Which currency do you count in?').selectOption(currency);
  await page.getByRole('button', { name: 'Start an empty book' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/\d{4}/);
}

async function write(page: Page, line: string) {
  await page.getByLabel('Amount and what it was for').fill(line);
  await page.getByRole('button', { name: 'Add' }).click();
}

test('writes entries with the quick line and totals them', async ({ page }) => {
  await startEmpty(page);
  await write(page, '12,50 groceries at the market');
  await write(page, '+2000 salary');
  const list = page.locator('ul.entries');
  await expect(list).toContainText('groceries at the market');
  await expect(list).toContainText('Groceries');
  await expect(page.locator('.sums')).toContainText('€2,000.00');
  await expect(page.locator('.sums')).toContainText('€12.50');
  await expect(page.locator('.sums .left')).toContainText('+€1,987.50');

  await write(page, 'coffee');
  await expect(page.locator('#line-help')).toContainText('Start with an amount');
});

test('a deleted entry is voided and can be restored', async ({ page }) => {
  await startEmpty(page);
  await write(page, '9 cinema');
  await page.getByRole('button', { name: 'Edit cinema' }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('.void-stamp')).toBeVisible();
  await expect(page.locator('.sums')).toContainText('€0.00');
  await page.getByRole('button', { name: 'Restore' }).click();
  await expect(page.locator('.void-stamp')).toHaveCount(0);
  await expect(page.locator('.sums')).toContainText('€9.00');
});

test('data survives a reload, and a password locks it', async ({ page }) => {
  await startEmpty(page);
  await write(page, '30 books');
  // Wait until the save has reached IndexedDB before reloading.
  await expect.poll(() => page.evaluate(() => new Promise<string>(resolve => {
    const r = indexedDB.open('ring-binder-finance');
    r.onsuccess = () => {
      const tx = r.result.transaction('kv').objectStore('kv').getAll();
      tx.onsuccess = () => { resolve(JSON.stringify(tx.result)); r.result.close(); };
    };
  }))).toContain('books');
  await page.reload();
  await expect(page.locator('ul.entries')).toContainText('books');

  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill('long enough pass');
  await page.getByLabel('Same again').fill('long enough pass');
  await page.getByRole('button', { name: 'Encrypt the book' }).click();
  await expect(page.locator('.notices')).toContainText('encrypted');

  // Nothing readable is left in storage.
  const raw = await page.evaluate(() => new Promise<string>(resolve => {
    const r = indexedDB.open('ring-binder-finance');
    r.onsuccess = () => {
      const tx = r.result.transaction('kv').objectStore('kv').getAll();
      tx.onsuccess = () => resolve(JSON.stringify(tx.result));
    };
  }));
  expect(raw).not.toContain('books');

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Locked' })).toBeVisible();
  await page.getByLabel('Password').fill('wrong one');
  await page.getByRole('button', { name: 'Open the book' }).click();
  await expect(page.getByText('That password did not open the book.')).toBeVisible();
  await page.getByLabel('Password').fill('long enough pass');
  await page.getByRole('button', { name: 'Open the book' }).click();
  // Unlocking keeps the page you were on.
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Month', exact: true }).click();
  await expect(page.locator('ul.entries')).toContainText('books');
});

test('backup file round trip', async ({ page }) => {
  await startEmpty(page, 'GBP');
  await write(page, '4.20 coffee');
  await page.getByRole('link', { name: 'Settings' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('section#backup').getByRole('button', { name: 'Download backup' }).click()]);
  const file = await download.path();

  await page.getByLabel('Type ERASE to confirm').fill('erase');
  await page.getByRole('button', { name: 'Erase this book' }).click();
  await expect(page.getByRole('heading', { name: 'Ring Binder' })).toBeVisible();

  await page.locator('#restore-file').setInputFiles(file!);
  await expect(page.locator('ul.entries')).toContainText('coffee');
  expect(JSON.parse(readFileSync(file!, 'utf8')).book.baseCurrency).toBe('GBP');
});

test('moves data from the first version, including its vault', async ({ page }) => {
  const legacy = {
    finans_transactions: JSON.stringify([{ id: 't1', type: 'expense', category: 'Food', amount: 450, date: '2026-01-10', description: 'Old groceries', paymentMethod: 'Card', accountId: 'a1' }]),
    finans_accounts: JSON.stringify([{ id: 'a1', name: 'Old bank', type: 'bank', initialBalance: 1000, currency: 'TRY', createdAt: '2025-01-01' }]),
    finans_settings: JSON.stringify({ currency: 'TRY', monthlyLimit: 0, usdRate: 40, eurRate: 44 }),
  };
  const vault = CryptoJS.AES.encrypt(JSON.stringify({ __probe: 'OK_FINANS_VAULT_v1', ...legacy }), 'old secret').toString();

  await page.goto('/');
  await page.evaluate(v => new Promise<void>(resolve => {
    const r = indexedDB.open('FinansTakip', 2);
    r.onupgradeneeded = () => r.result.createObjectStore('data');
    r.onsuccess = () => {
      const tx = r.result.transaction('data', 'readwrite');
      tx.objectStore('data').put(v, 'finans_vault');
      tx.oncomplete = () => { r.result.close(); resolve(); };
    };
  }), vault);
  // Our own database was created empty on the first visit; drop it so the move runs.
  await page.evaluate(() => new Promise(r => { const d = indexedDB.deleteDatabase('ring-binder-finance'); d.onsuccess = d.onblocked = r; }));
  await page.reload();

  await expect(page.getByText('previous version of this app is protected')).toBeVisible();
  await page.getByLabel('Password').fill('old secret');
  await page.getByRole('button', { name: 'Open the book' }).click();
  await expect(page.locator('.notices')).toContainText('moved over');
  await page.getByRole('link', { name: 'Accounts' }).click();
  await expect(page.locator('.accounts')).toContainText('Old bank');
  await expect(page.locator('.accounts')).toContainText('550');
});

test('mobile layout has no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 760 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Look around with sample data' }).click();
  for (const name of ['Month', 'Accounts', 'Investments', 'Goals', 'Settings']) {
    await page.getByRole('link', { name, exact: true }).click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, name).toBeLessThanOrEqual(0);
  }
});
