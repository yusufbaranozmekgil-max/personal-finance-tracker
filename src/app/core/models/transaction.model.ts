export type TransactionType = 'income' | 'expense' | 'transfer';

export const INCOME_CATEGORIES = [
  'Salary', 'Scholarship', 'Bonus', 'Freelance', 'Family Support', 'Other'
] as const;

export const EXPENSE_CATEGORIES = [
  'Food', 'Transportation', 'Bills', 'Rent', 'Education', 'Health', 'Entertainment', 'Shopping',
  'Investment', 'Goal Savings', 'Other'
] as const;

export const PAYMENT_METHODS = [
  'Cash', 'Bank Transfer', 'Credit Card', 'Debit Card', 'EFT', 'Other'
] as const;

export interface Transaction {
  id: string;
  type: TransactionType;
  category: string;
  amount: number;
  date: string;
  description: string;
  paymentMethod: string;
  accountId?: string;             // Which account/cash register the income/expense belongs to
  transferAccountId?: string;     // Receiving account/cash register (for Transfers)
  isRecurring?: boolean;          // Auto-repeat every month
  recurringParentId?: string;     // If this is a copy of a recurring entry, the original's ID
}
