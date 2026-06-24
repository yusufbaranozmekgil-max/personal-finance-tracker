import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { PortfolioService } from '../../core/services/portfolio.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { LivePriceService } from '../../core/services/live-price.service';
import { SettingsService } from '../../core/services/settings.service';
import { CategoryService } from '../../core/services/category.service';
import { TransactionService } from '../../core/services/transaction.service';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { ThousandSeparatorDirective } from '../../shared/directives/thousand-separator.directive';
import {
  Asset, AssetCurrency, AssetType, Trade,
  ASSET_CURRENCIES, ASSET_PRESETS
} from '../../core/models/asset.model';
import { MAX_NAME_LENGTH, maxMoneyInTRY, isValidDate } from '../../core/constants/validation.constants';

@Component({
  selector: 'app-portfolio',
  standalone: true,
  imports: [CommonModule, FormsModule, MoneyPipe, ThousandSeparatorDirective],
  templateUrl: './portfolio.component.html',
  styleUrl: './portfolio.component.scss'
})
export class PortfolioComponent implements OnInit {
  private route = inject(ActivatedRoute);
  portfolioService = inject(PortfolioService);
  toast = inject(ToastService);
  confirmService = inject(ConfirmService);
  livePriceService = inject(LivePriceService);
  settingsService = inject(SettingsService);
  categoryService = inject(CategoryService);
  txService = inject(TransactionService);

  // When adding a new asset: also record the cost as an expense
  linkAsExpense = false;

  assetCurrencies = [...ASSET_CURRENCIES];
  presets = ASSET_PRESETS;
  maxNameLength = MAX_NAME_LENGTH;
  readonly maxQuantityPrice = 1_000_000_000_000; // 1 trillion
  // Dynamic cap: 1 trillion USD converted to TRY via current exchange rate
  get maxMoneyAmount(): number {
    return maxMoneyInTRY(this.settingsService?.settings()?.usdRate ?? 32);
  }

  // Currency code → symbol mapping (so labels show ₺/$/€ instead of TRY/USD/EUR)
  currencySymbol(code: string | undefined): string {
    if (!code) return '';
    if (code === 'TRY') return '₺';
    if (code === 'USD') return '$';
    if (code === 'EUR') return '€';
    return code;
  }

  // Category icon mapping
  private readonly categoryIcons: Record<string, string> = {
    'Crypto': '💎',
    'Stock': '📈',
    'Gold': '🪙',
    'Foreign Currency': '💵',
    'Fund': '📊',
    'Other': '🎯',
    // Backward compat for Turkish names
    'Kripto': '💎',
    'Hisse': '📈',
    'Altın': '🪙',
    'Döviz': '💵',
    'Fon': '📊',
    'Diğer': '🎯',
  };

  showForm = signal(false);
  editingId = signal<string | null>(null);
  quickPriceId = signal<string | null>(null);
  quickPriceValue = signal(0);
  livePriceUpdatingId = signal<string | null>(null);
  activeTab = signal<'holdings' | 'history'>('holdings');
  holdingsView = signal<'list' | 'heatmap'>('list');
  tradeFormAssetId = signal<string | null>(null);
  tradeForm: Omit<Trade, 'id' | 'assetId' | 'assetSymbol' | 'assetName' | 'realizedProfit'> = this.emptyTradeForm();

  // Accordion — set of currently expanded categories
  expandedCategories = signal<Set<string>>(new Set());

  // Per-category pagination
  categoryPageMap = signal<Record<string, number>>({});
  readonly categoryPageSize = 10;

  // Trade History pagination
  currentHistoryPage = signal(1);
  readonly historyPageSize = 10;

  get historyTotalPages(): number {
    return Math.max(1, Math.ceil(this.portfolioService.tradeHistory().length / this.historyPageSize));
  }

  get historyPageNumbers(): number[] {
    return Array.from({ length: this.historyTotalPages }, (_, i) => i + 1);
  }

  get paginatedTradeHistory(): Trade[] {
    const items = this.portfolioService.tradeHistory();
    const page = Math.min(this.currentHistoryPage(), this.historyTotalPages);
    const start = (page - 1) * this.historyPageSize;
    return items.slice(start, start + this.historyPageSize);
  }

  setHistoryPage(page: number): void {
    const total = this.historyTotalPages;
    const safe = Math.min(Math.max(page, 1), total);
    this.currentHistoryPage.set(safe);
  }

  nextHistoryPage(): void {
    this.setHistoryPage(this.currentHistoryPage() + 1);
  }

  prevHistoryPage(): void {
    this.setHistoryPage(this.currentHistoryPage() - 1);
  }

  get historyPageStart(): number {
    const count = this.portfolioService.tradeHistory().length;
    if (count === 0) return 0;
    const page = Math.min(this.currentHistoryPage(), this.historyTotalPages);
    return (page - 1) * this.historyPageSize + 1;
  }

  get historyPageEnd(): number {
    const count = this.portfolioService.tradeHistory().length;
    const page = Math.min(this.currentHistoryPage(), this.historyTotalPages);
    return Math.min(page * this.historyPageSize, count);
  }

  getCategoryPage(name: string): number {
    return this.categoryPageMap()[name] ?? 1;
  }

  categoryTotalPages(itemCount: number): number {
    return Math.max(1, Math.ceil(itemCount / this.categoryPageSize));
  }

  categoryPageNumbers(itemCount: number): number[] {
    return Array.from({ length: this.categoryTotalPages(itemCount) }, (_, i) => i + 1);
  }

  paginatedAssets(type: string): Asset[] {
    const items = this.assetsByType(type);
    const page = Math.min(this.getCategoryPage(type), this.categoryTotalPages(items.length));
    const start = (page - 1) * this.categoryPageSize;
    return items.slice(start, start + this.categoryPageSize);
  }

  setCategoryPage(name: string, page: number, totalItems: number): void {
    const total = this.categoryTotalPages(totalItems);
    const safe = Math.min(Math.max(page, 1), total);
    this.categoryPageMap.update(m => ({ ...m, [name]: safe }));
  }

  nextCategoryPage(name: string, totalItems: number): void {
    this.setCategoryPage(name, this.getCategoryPage(name) + 1, totalItems);
  }

  prevCategoryPage(name: string, totalItems: number): void {
    this.setCategoryPage(name, this.getCategoryPage(name) - 1, totalItems);
  }

  categoryPageStart(name: string, totalItems: number): number {
    if (totalItems === 0) return 0;
    const page = Math.min(this.getCategoryPage(name), this.categoryTotalPages(totalItems));
    return (page - 1) * this.categoryPageSize + 1;
  }

  categoryPageEnd(name: string, totalItems: number): number {
    const page = Math.min(this.getCategoryPage(name), this.categoryTotalPages(totalItems));
    return Math.min(page * this.categoryPageSize, totalItems);
  }

  setView(view: 'holdings' | 'history'): void {
    this.activeTab.set(view);
  }

  // New category form
  showCategoryForm = signal(false);
  newCategoryName = signal('');

  get assetTypes(): string[] {
    return this.categoryService.categories().assetTypes;
  }

  iconFor(type: string): string {
    return this.categoryIcons[type] ?? '🏷️';
  }

  toggleCategory(type: string): void {
    this.expandedCategories.update(set => {
      const next = new Set(set);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  onNodeClick(node: any): void {
    if (!node || !node.asset) return;
    this.holdingsView.set('list');
    const type = node.asset.type;
    this.expandedCategories.update(set => {
      const next = new Set(set);
      next.add(type);
      return next;
    });
    setTimeout(() => {
      const elementId = `asset-card-${node.asset.id}`;
      const element = document.getElementById(elementId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add('highlight-pulse');
        setTimeout(() => {
          element.classList.remove('highlight-pulse');
        }, 2000);
      }
    }, 120);
  }



  isExpanded(type: string): boolean {
    return this.expandedCategories().has(type);
  }

  expandAll(): void {
    const allWithAssets = this.assetTypes.filter(t => this.assetsByType(t).length > 0);
    this.expandedCategories.set(new Set(allWithAssets));
  }

  collapseAll(): void {
    this.expandedCategories.set(new Set());
  }

  toggleCategoryForm(): void {
    this.showCategoryForm.update(v => !v);
    if (!this.showCategoryForm()) this.newCategoryName.set('');
  }

  readonly maxCategoryCount = 20;

  addCategory(): void {
    const name = this.newCategoryName().trim();
    if (!name) {
      this.toast.error('Category name cannot be empty.');
      return;
    }
    if (name.length > 20) {
      this.toast.error('Category name can be at most 20 characters.');
      return;
    }
    if (this.categoryService.categories().assetTypes.length >= this.maxCategoryCount) {
      this.toast.error(`You can add at most ${this.maxCategoryCount} asset categories.`);
      return;
    }
    const added = this.categoryService.addAssetType(name);
    if (!added) {
      this.toast.warning('This category already exists.');
      return;
    }
    this.toast.success(`Category "${name}" has been added.`);
    this.newCategoryName.set('');
    this.showCategoryForm.set(false);
  }

  async removeCategory(name: string): Promise<void> {
    const count = this.assetsByType(name).length;
    if (count > 0) {
      this.toast.warning(`There are ${count} assets in the "${name}" category. Please move or delete them first.`);
      return;
    }
    const ok = await this.confirmService.ask({
      title: 'Delete Category',
      message: `The category "${name}" will be deleted. Are you sure?`,
      confirmText: 'Delete',
      cancelText: 'Go Back',
      kind: 'danger',
    });
    if (ok) {
      this.categoryService.removeAssetType(name);
      this.toast.success('Category deleted.');
    }
  }

  assetsByType(type: string): Asset[] {
    return this.portfolioService.assets().filter(a => a.type === type);
  }

  categoryTotal(type: string): number {
    return this.assetsByType(type)
      .reduce((sum, a) => sum + this.portfolioService.currentValueTRY(a), 0);
  }

  categoryProfit(type: string): number {
    return this.assetsByType(type)
      .reduce((sum, a) => sum + this.portfolioService.profitTRY(a), 0);
  }

  // Categories with assets first, empty ones last
  get displayedCategories(): string[] {
    const types = this.assetTypes;
    return [...types].sort((a, b) => {
      const aCount = this.assetsByType(a).length;
      const bCount = this.assetsByType(b).length;
      if (aCount > 0 && bCount === 0) return -1;
      if (aCount === 0 && bCount > 0) return 1;
      return 0;
    });
  }

  form: Omit<Asset, 'id'> = this.emptyForm();

  ngOnInit(): void {
    // Drilldown from dashboard portfolio chart
    this.route.queryParams.subscribe(params => {
      const type = params['type'];
      if (type && this.assetTypes.includes(type)) {
        // Keep only that category expanded
        this.expandedCategories.set(new Set([type]));
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  }

  private emptyForm(): Omit<Asset, 'id'> {
    return {
      name: '', symbol: '', type: 'Crypto',
      quantity: 0, purchasePrice: 0, unitPrice: 0, currency: 'TRY'
    };
  }

  private emptyTradeForm(): Omit<Trade, 'id' | 'assetId' | 'assetSymbol' | 'assetName' | 'realizedProfit'> {
    return {
      type: 'buy',
      quantity: 0,
      price: 0,
      date: new Date().toISOString().slice(0, 10),
    };
  }

  applyPreset(preset: typeof ASSET_PRESETS[number]): void {
    this.form.name = preset.name;
    this.form.symbol = preset.symbol;
    this.form.type = preset.type;
    this.form.currency = preset.currency;
  }

  startEdit(asset: Asset): void {
    this.editingId.set(asset.id);
    this.form = {
      name: asset.name, symbol: asset.symbol, type: asset.type,
      quantity: asset.quantity, purchasePrice: asset.purchasePrice,
      unitPrice: asset.unitPrice, currency: asset.currency,
    };
    this.showForm.set(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  toggleForm(): void {
    if (this.showForm()) {
      this.cancelForm();
    } else {
      this.editingId.set(null);
      this.form = this.emptyForm();
      this.showForm.set(true);
    }
  }

  async submit(): Promise<void> {
    const name = this.form.name.trim();
    const symbol = this.form.symbol.trim();
    const quantity = Number(this.form.quantity);
    const purchasePrice = Number(this.form.purchasePrice);
    const unitPrice = Number(this.form.unitPrice);

    if (!name || !symbol || !quantity || !unitPrice) {
      this.toast.error('Please fill in name, symbol, quantity, and current price.');
      return;
    }
    if (name.length > this.maxNameLength || symbol.length > this.maxNameLength) {
      this.toast.error('Name and symbol can be at most 30 characters.');
      return;
    }
    if (quantity <= 0 || unitPrice <= 0 || purchasePrice < 0) {
      this.toast.error('Quantity and current price must be greater than 0.');
      return;
    }
    if (quantity > this.maxQuantityPrice || unitPrice > this.maxQuantityPrice || purchasePrice > this.maxQuantityPrice) {
      this.toast.error('Values cannot exceed 1 trillion.');
      return;
    }

    const payload = { ...this.form, name, symbol, quantity, purchasePrice, unitPrice };
    const isEdit = this.editingId() !== null;
    const ok = await this.confirmService.ask({
      title: isEdit ? 'Confirm Update' : 'Confirm Asset',
      message: isEdit
        ? `Do you want to update the details for ${this.form.name}?`
        : `${this.form.name} (${this.form.quantity} ${this.form.symbol}) will be added to the portfolio. Do you confirm?`,
      confirmText: isEdit ? 'Update' : 'Add',
      cancelText: 'Go Back',
      kind: 'info',
    });
    if (!ok) {
      this.toast.info('Operation cancelled.');
      return;
    }
    const id = this.editingId();
    if (id) {
      this.portfolioService.update(id, payload);
      this.toast.success(`${payload.name} has been updated.`);
    } else {
      this.portfolioService.add(payload);
      this.toast.success(`${payload.name} has been added to the portfolio.`);

      // Cross-module integration: record as expense
      if (this.linkAsExpense) {
        const purchaseCostTRY = this.toTRY(quantity * purchasePrice, payload.currency);
        if (purchaseCostTRY > 0) {
          this.txService.add({
            type: 'expense',
            category: 'Investment',
            amount: Math.round(purchaseCostTRY * 100) / 100,
            date: new Date().toISOString().slice(0, 10),
            description: `${payload.symbol} purchase (${quantity} units)`,
            paymentMethod: 'Bank Transfer',
            isRecurring: false,
          });
          this.toast.info(`💸 ${purchaseCostTRY.toFixed(2)} ₺ has been recorded as an expense under the "Investment" category.`);
        }
      }
    }
    this.resetForm();
  }

  openTradeForm(asset: Asset, type: 'buy' | 'sell'): void {
    this.tradeFormAssetId.set(asset.id);
    this.tradeForm = {
      ...this.emptyTradeForm(),
      type,
      price: type === 'buy' ? asset.unitPrice : asset.unitPrice,
    };
  }

  cancelTradeForm(): void {
    this.tradeFormAssetId.set(null);
    this.tradeForm = this.emptyTradeForm();
  }

  submitTrade(asset: Asset): void {
    const quantity = Number(this.tradeForm.quantity);
    const price = Number(this.tradeForm.price);
    const date = this.tradeForm.date;

    if (!isValidDate(date)) {
      this.toast.error('Please enter a valid date (between 1900 and 2099).');
      return;
    }
    if (!quantity || quantity <= 0 || !price || price <= 0) {
      this.toast.error('Quantity and price must be greater than 0.');
      return;
    }
    if (quantity > this.maxQuantityPrice || price > this.maxQuantityPrice) {
      this.toast.error('Values cannot exceed 1 trillion.');
      return;
    }

    const result = this.portfolioService.addTrade(asset.id, {
      ...this.tradeForm,
      quantity,
      price,
      date,
    });

    if (!result.ok) {
      this.toast.error(result.message);
      return;
    }

    this.toast.success(result.message);
    this.cancelTradeForm();
  }

  realizedProfitTRY(asset: Asset): number {
    return this.toTRY(asset.realizedProfit ?? 0, asset.currency);
  }

  tradeProfitTRY(trade: Trade): number {
    const asset = this.portfolioService.assets().find(a => a.id === trade.assetId);
    return this.toTRY(trade.realizedProfit ?? 0, asset?.currency ?? 'TRY');
  }

  unrealizedProfitTRY(asset: Asset): number {
    return this.toTRY(this.portfolioService.calculateFIFO(asset).unrealizedProfit, asset.currency);
  }

  async removeTrade(trade: Trade): Promise<void> {
    const ok = await this.confirmService.ask({
      title: 'Delete Trade',
      message: `The ${trade.type === 'buy' ? 'buy' : 'sell'} trade for ${trade.assetSymbol} will be deleted. FIFO will be recalculated. Are you sure?`,
      confirmText: 'Delete',
      cancelText: 'Go Back',
      kind: 'danger',
    });
    if (!ok) return;

    const result = this.portfolioService.removeTrade(trade.assetId, trade.id);
    if (result.ok) this.toast.success(result.message);
    else this.toast.error(result.message);
  }

  private toTRY(amount: number, currency: AssetCurrency): number {
    const s = this.settingsService.settings();
    if (currency === 'TRY') return amount;
    if (currency === 'USD') return amount * (s.usdRate || 1);
    if (currency === 'EUR') return amount * (s.eurRate || 1);
    return amount;
  }

  async remove(id: string): Promise<void> {
    const asset = this.portfolioService.assets().find(a => a.id === id);
    const ok = await this.confirmService.ask({
      title: 'Delete Asset',
      message: `The asset "${asset?.name}" will be permanently removed from the portfolio. Are you sure?`,
      confirmText: 'Delete',
      cancelText: 'Go Back',
      kind: 'danger',
    });
    if (ok) {
      this.portfolioService.remove(id);
      this.toast.success('Asset deleted.');
    }
  }

  private resetForm(): void {
    this.form = this.emptyForm();
    this.editingId.set(null);
    this.showForm.set(false);
    this.linkAsExpense = false;
  }

  async cancelForm(): Promise<void> {
    const hasData = this.form.name || this.form.symbol || this.form.quantity || this.form.unitPrice;
    if (hasData) {
      const ok = await this.confirmService.ask({
        title: 'Discard Changes?',
        message: 'The information you entered will be lost. Do you want to continue?',
        confirmText: 'Yes, Discard',
        cancelText: 'Go Back',
        kind: 'warning',
      });
      if (!ok) return;
    }
    const wasEditing = this.editingId() !== null;
    this.resetForm();
    this.toast.info(wasEditing ? 'Edit cancelled.' : 'Form cancelled.');
  }

  get livePriceSupportedCount(): number {
    return this.portfolioService.assets()
      .filter(asset => this.livePriceService.supports(asset.symbol))
      .length;
  }

  openQuickPrice(asset: Asset): void {
    this.quickPriceId.set(asset.id);
    this.quickPriceValue.set(asset.unitPrice);
  }

  cancelQuickPrice(): void {
    this.quickPriceId.set(null);
    this.quickPriceValue.set(0);
  }

  saveQuickPrice(asset: Asset): void {
    const newPrice = Number(this.quickPriceValue());
    if (newPrice <= 0 || isNaN(newPrice)) {
      this.toast.error('Please enter a valid price.');
      return;
    }
    if (newPrice > this.maxQuantityPrice) {
      this.toast.error('Price cannot exceed 1 trillion.');
      return;
    }
    if (newPrice === asset.unitPrice) {
      this.cancelQuickPrice();
      return;
    }
    const diff = ((newPrice - asset.unitPrice) / asset.unitPrice) * 100;
    this.portfolioService.update(asset.id, { unitPrice: newPrice });
    const direction = diff >= 0 ? '↑' : '↓';
    this.toast.success(`${asset.symbol} price updated. ${direction} ${Math.abs(diff).toFixed(2)}%`);
    this.cancelQuickPrice();
  }

  async updateLivePrice(asset: Asset, showToast = true): Promise<boolean> {
    if (!this.livePriceService.supports(asset.symbol)) {
      if (showToast) {
        const cat = this.livePriceService.category(asset.symbol);
        if (cat === 'bist') {
          this.toast.warning(`No live price service available for ${asset.symbol} (BIST). Please update manually.`);
        } else {
          this.toast.warning(`Live price is not supported for ${asset.symbol}.`);
        }
      }
      return false;
    }

    this.livePriceUpdatingId.set(asset.id);
    try {
      const usdPrice = await this.livePriceService.fetchPriceUsd(asset.symbol);
      const convertedPrice = this.convertUsdPriceToAssetCurrency(usdPrice, asset.currency);
      this.portfolioService.update(asset.id, { unitPrice: convertedPrice });
      if (showToast) this.toast.success(`${asset.symbol} live price has been updated.`);
      return true;
    } catch (err: any) {
      if (showToast) this.toast.error(err?.message ?? 'Failed to fetch live price.');
      return false;
    } finally {
      this.livePriceUpdatingId.set(null);
    }
  }

  async updateAllLivePrices(): Promise<void> {
    const assets = this.portfolioService.assets()
      .filter(asset => this.livePriceService.supports(asset.symbol));

    if (!assets.length) {
      this.toast.info('No assets with live price support found (try adding crypto or gram gold).');
      return;
    }

    let updated = 0;
    for (const asset of assets) {
      const ok = await this.updateLivePrice(asset, false);
      if (ok) updated += 1;
    }

    if (updated > 0) {
      this.toast.success(`Prices updated for ${updated} asset(s).`);
    } else {
      this.toast.error('Failed to update live prices.');
    }
  }

  assetPercent(a: Asset): number {
    const total = this.portfolioService.totalValue();
    return total ? (this.portfolioService.currentValueTRY(a) / total) * 100 : 0;
  }

  heatmapNodes = computed(() => {
    const assets = this.portfolioService.assets();
    const total = this.portfolioService.totalValue();
    if (assets.length === 0 || total === 0) return [];

    // Map to node items
    const nodes = assets.map(a => {
      const val = this.portfolioService.currentValueTRY(a);
      return {
        asset: a,
        weight: (val / total) * 100,
        profitPercent: this.portfolioService.profitPercent(a),
        valueTRY: val,
      };
    });

    // Sort descending by weight
    nodes.sort((a, b) => b.weight - a.weight);

    return nodes;
  });



  private convertUsdPriceToAssetCurrency(usdPrice: number, currency: AssetCurrency): number {
    const settings = this.settingsService.settings();
    if (currency === 'TRY') return Math.round(usdPrice * settings.usdRate * 100) / 100;
    if (currency === 'EUR') return Math.round((usdPrice * settings.usdRate / settings.eurRate) * 100) / 100;
    return Math.round(usdPrice * 100) / 100;
  }
}
