export const MAX_NAME_LENGTH = 30;
export const MAX_DESCRIPTION_LENGTH = 50;

/**
 * Money cap in USD. All amounts in the app are stored in TRY,
 * but the validation ceiling is anchored to 1 trillion USD.
 * Equivalent TRY ceiling = MAX_MONEY_USD * usdRate (e.g. 1T USD * 32 ≈ 32T TRY).
 *
 * For runtime checks against TRY values, use `maxMoneyInTRY(settings)`.
 */
export const MAX_MONEY_USD = 1_000_000_000_000;

/** Computes the effective TRY cap based on the current USD/TRY rate. */
export function maxMoneyInTRY(usdRate: number): number {
  const rate = usdRate && usdRate > 0 ? usdRate : 32;
  return MAX_MONEY_USD * rate;
}

/**
 * Legacy alias — kept for backward compatibility with components that
 * still import MAX_MONEY_AMOUNT. Always returns the TRY-equivalent cap
 * for a 1 trillion USD limit assuming a reasonable default rate.
 *
 * Prefer `maxMoneyInTRY(settings.usdRate)` for dynamic validation.
 */
export const MAX_MONEY_AMOUNT = MAX_MONEY_USD * 32;  // ≈ 32 trillion TRY

/** Validates if a date string is a valid Gregorian date and within 1900-2099. */
export function isValidDate(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;

  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) return false;

  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  if (year < 1900 || year > 2099) return false;
  if (month < 1 || month > 12) return false;

  const daysInMonth = new Date(year, month, 0).getDate();
  if (day < 1 || day > daysInMonth) return false;

  return true;
}

