import { Category } from './model';
import { parseAmount } from './money';

export interface QuickEntry {
  kind: 'income' | 'expense';
  amount: number;
  note: string;
  categoryId?: string;
}

/**
 * Reads a line like "42.10 groceries", "lunch 12,50" or "+3200 salary".
 * The first token that reads as an amount is the amount; a leading "+" makes it income.
 * A word that starts a category name (min. 3 letters) picks that category.
 */
export function parseQuickEntry(line: string, categories: Category[]): QuickEntry | null {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  const idx = tokens.findIndex(t => parseAmount(t.replace(/^\+/, '')) !== null);
  if (idx === -1) return null;
  const raw = tokens[idx];
  const amount = Math.abs(parseAmount(raw.replace(/^\+/, ''))!);
  if (amount === 0) return null;
  const kind = raw.startsWith('+') ? 'income' : 'expense';
  const words = tokens.filter((_, i) => i !== idx);
  const note = words.join(' ');
  const pool = categories.filter(c => c.kind === kind);
  const category = words
    .map(w => w.toLocaleLowerCase())
    .filter(w => w.length >= 3)
    .map(w => pool.find(c => c.name.toLocaleLowerCase() === w) ?? pool.find(c => c.name.toLocaleLowerCase().startsWith(w)))
    .find(Boolean);
  return { kind, amount, note, categoryId: category?.id };
}
