export interface Category {
  id: string;
  name: string;
  icon: string;       // Emoji
  color: string;      // HEX color code
  type: 'income' | 'expense';
}

// Predefined color palette — clean tones suitable for finance apps
export const CATEGORY_COLORS: { value: string; label: string }[] = [
  { value: '#dc2626', label: 'Red' },
  { value: '#ea580c', label: 'Orange' },
  { value: '#ca8a04', label: 'Amber' },
  { value: '#16a34a', label: 'Green' },
  { value: '#0d9488', label: 'Pine' },
  { value: '#0891b2', label: 'Turquoise' },
  { value: '#2563eb', label: 'Blue' },
  { value: '#4f46e5', label: 'Purple' },
  { value: '#7c3aed', label: 'Violet' },
  { value: '#c026d3', label: 'Magenta' },
  { value: '#64748b', label: 'Gray' },
  { value: '#475569', label: 'Anthracite' },
];

// Categorized icon palette — simplified and sector-specific
export interface IconGroup { label: string; icons: string[]; }

export const CATEGORY_ICON_GROUPS: IconGroup[] = [
  { label: 'Finance',       icons: ['💼', '💰', '💵', '💳', '🏦', '📈', '📉', '💹'] },
  { label: 'Life',          icons: ['🏠', '🛒', '🍽️', '☕', '🍔', '🛍️', '🎁', '👕'] },
  { label: 'Transportation',icons: ['🚗', '⛽', '🚌', '✈️', '🚖', '🚲'] },
  { label: 'Bills',         icons: ['⚡', '💧', '📞', '📺', '🔥', '📶'] },
  { label: 'Health',        icons: ['⚕️', '💊', '🏥', '💪'] },
  { label: 'Education',     icons: ['🎓', '📚', '✏️', '🎯'] },
  { label: 'Entertainment', icons: ['🎬', '🎮', '🎵', '🎤'] },
  { label: 'Other',         icons: ['🏷️', '📌', '🐶', '🌱'] },
];

// Flat list (for backward API compatibility)
export const CATEGORY_ICONS: string[] = CATEGORY_ICON_GROUPS.flatMap(g => g.icons);

// Default category metadata — auto-assigned icon/color when a new name is added
export const DEFAULT_CATEGORY_META: Record<string, { icon: string; color: string }> = {
  // Income categories
  'Salary':         { icon: '💼', color: '#22c55e' },
  'Scholarship':    { icon: '🎓', color: '#10b981' },
  'Bonus':          { icon: '🎁', color: '#06b6d4' },
  'Freelance':      { icon: '💻', color: '#3b82f6' },
  'Family Support': { icon: '👨‍👩‍👧', color: '#8b5cf6' },

  // Expense categories
  'Food':           { icon: '🍽️', color: '#ef4444' },
  'Transportation': { icon: '🚌', color: '#f59e0b' },
  'Bills':          { icon: '📃', color: '#eab308' },
  'Rent':           { icon: '🏠', color: '#dc2626' },
  'Education':      { icon: '📚', color: '#3b82f6' },
  'Health':         { icon: '⚕️', color: '#06b6d4' },
  'Entertainment':  { icon: '🎬', color: '#8b5cf6' },
  'Shopping':       { icon: '🛍️', color: '#ec4899' },
  'Investment':     { icon: '📈', color: '#10b981' },
  'Goal Savings':   { icon: '🎯', color: '#22c55e' },
  'Other':          { icon: '🏷️', color: '#94a3b8' },
};
