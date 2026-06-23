export type AccountType = 'cash' | 'bank' | 'credit' | 'savings' | 'investment' | 'other';

export const ACCOUNT_TYPES: { value: AccountType; label: string; icon: string }[] = [
  { value: 'cash',       label: 'Cash',            icon: '💵' },
  { value: 'bank',       label: 'Bank Account',    icon: '🏦' },
  { value: 'credit',     label: 'Credit Card',     icon: '💳' },
  { value: 'savings',    label: 'Savings Account', icon: '🐖' },
  { value: 'investment', label: 'Investment Account', icon: '📈' },
  { value: 'other',      label: 'Other',           icon: '📋' },
];

export const ACCOUNT_PRESETS: { name: string; type: AccountType }[] = [
  { name: 'Cash Wallet',      type: 'cash' },
  { name: 'Salary Account',   type: 'bank' },
  { name: 'Garanti BBVA',     type: 'bank' },
  { name: 'Ziraat Bank',      type: 'bank' },
  { name: 'Is Bank',          type: 'bank' },
  { name: 'Credit Card',      type: 'credit' },
  { name: 'Vakifbank',        type: 'bank' },
  { name: 'Yapi Kredi',       type: 'bank' },
];

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  initialBalance: number;   // Opening balance (TRY)
  currency: 'TRY' | 'USD' | 'EUR';
  color?: string;           // Optional card color
  createdAt: string;
}

export const DEFAULT_ACCOUNT_ID = 'default_unassigned';
