export const GOAL_PRESETS = [
  { name: 'Buy Laptop Goal', icon: '💻' },
  { name: 'Erasmus Budget',  icon: '✈️' },
  { name: 'Emergency Fund',  icon: '🛡️' },
  { name: 'Vacation Budget', icon: '🏖️' },
  { name: 'Debt Payoff',     icon: '💳' },
  { name: 'Buy Car',         icon: '🚗' },
  { name: 'Home Savings',    icon: '🏠' },
  { name: 'Education Fund',  icon: '🎓' },
] as const;

export interface Goal {
  id: string;
  name: string;
  icon: string;
  targetAmount: number;
  currentAmount: number;
  deadline: string;
  description: string;
  createdAt: string;
}
