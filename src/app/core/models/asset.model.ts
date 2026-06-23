export type AssetType = string;

export const ASSET_TYPES: string[] = ['Crypto', 'Foreign Currency', 'Stock', 'Gold', 'Fund', 'Other'];

export const ASSET_CURRENCIES = ['TRY', 'USD', 'EUR'] as const;
export type AssetCurrency = typeof ASSET_CURRENCIES[number];

export const ASSET_PRESETS: { name: string; symbol: string; type: AssetType; currency: AssetCurrency }[] = [
  { name: 'Bitcoin', symbol: 'BTC', type: 'Crypto', currency: 'USD' },
  { name: 'Ethereum', symbol: 'ETH', type: 'Crypto', currency: 'USD' },
  { name: 'US Dollar', symbol: 'USD', type: 'Foreign Currency', currency: 'TRY' },
  { name: 'Euro', symbol: 'EUR', type: 'Foreign Currency', currency: 'TRY' },
  { name: 'Gram Gold', symbol: 'GA', type: 'Gold', currency: 'TRY' },
  { name: 'Turkish Airlines', symbol: 'THYAO', type: 'Stock', currency: 'TRY' },
  { name: 'Aselsan', symbol: 'ASELS', type: 'Stock', currency: 'TRY' },
];

export interface Trade {
  id: string;
  assetId: string;
  assetSymbol: string;
  assetName: string;
  type: 'buy' | 'sell';
  quantity: number;
  price: number; // trade price (in asset currency)
  date: string;  // YYYY-MM-DD
  realizedProfit?: number; // realized profit if type is 'sell'
}

export interface Asset {
  id: string;
  name: string;
  symbol: string;
  type: AssetType;
  quantity: number;
  purchasePrice: number;   // purchase price (in asset currency)
  unitPrice: number;       // current price (in asset currency)
  currency: AssetCurrency;
  trades?: Trade[];
  realizedProfit?: number;
}



export type StockApiProvider = 'twelvedata' | 'alphavantage' | 'finnhub';

export interface BudgetSettings {
  monthlyLimit: number;
  currency: string;
  usdRate: number;
  eurRate: number;
  resetDay: number;
  lastResetMonth: string;
  stockApiProvider: StockApiProvider;
  stockApiKey: string;
  gdriveClientId?: string;
  gdriveFileId?: string;
  gdriveLastSync?: string;
}
