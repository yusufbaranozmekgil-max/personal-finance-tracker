import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TransactionService } from '../../core/services/transaction.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { CategoryService } from '../../core/services/category.service';
import { AccountService } from '../../core/services/account.service';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { Transaction, PAYMENT_METHODS, TransactionType } from '../../core/models/transaction.model';
import { CATEGORY_COLORS, CATEGORY_ICONS, CATEGORY_ICON_GROUPS } from '../../core/models/category.model';
import { MAX_DESCRIPTION_LENGTH, MAX_MONEY_AMOUNT } from '../../core/constants/validation.constants';

@Component({
  selector: 'app-transactions',
  standalone: true,
  imports: [CommonModule, FormsModule, MoneyPipe],
  templateUrl: './transactions.component.html',
  styleUrl: './transactions.component.scss'
})
export class TransactionsComponent implements OnInit {
  private route = inject(ActivatedRoute);
  txService = inject(TransactionService);
  toast = inject(ToastService);
  confirmService = inject(ConfirmService);
  categoryService = inject(CategoryService);
  accountService = inject(AccountService);

  paymentMethods = [...PAYMENT_METHODS];
  maxDescriptionLength = MAX_DESCRIPTION_LENGTH;
  maxMoneyAmount = MAX_MONEY_AMOUNT;

  showForm = signal(false);
  editingId = signal<string | null>(null);
  filterType = signal<'all' | 'income' | 'expense' | 'transfer'>('all');
  filterCategory = signal('');
  filterMonth = signal('');
  filterDateStart = signal('');
  filterDateEnd = signal('');
  filterPreset = signal<'all' | 'thisMonth' | 'last7' | 'last30' | 'custom'>('all');
  sortBy = signal<'newest' | 'oldest' | 'highest' | 'lowest'>('newest');
  currentPage = signal(1);
  readonly pageSize = 10;
  searchQuery = signal('');
  filterAccountId = signal('');

  get transferCount(): number {
    return this.txService.transactions().filter(t => t.type === 'transfer').length;
  }

  // Accordion category view
  viewMode = signal<'group' | 'list'>('group');
  expandedTxCategories = signal<Set<string>>(new Set());

  // Date filter panel open/closed
  showDateFilter = signal(false);

  toggleDateFilter(): void {
    this.showDateFilter.update(v => !v);
  }

  // Category filter panel open/closed
  showCategoryFilter = signal(false);

  toggleCategoryFilter(): void {
    this.showCategoryFilter.update(v => !v);
  }

  get categoryFilterLabel(): string {
    if (this.filterCategory()) return this.filterCategory();
    return `${this.visibleCategories.length} categories`;
  }

  get hasActiveCategoryFilter(): boolean {
    return !!this.filterCategory();
  }

  // Category-based spending summary panel open/closed
  showExpenseSummary = signal(false);

  toggleExpenseSummary(): void {
    this.showExpenseSummary.update(v => !v);
  }

  // Active date filter label (for display in header)
  get dateFilterLabel(): string {
    const preset = this.filterPreset();
    if (preset === 'thisMonth') return 'This Month';
    if (preset === 'last7') return 'Last 7 Days';
    if (preset === 'last30') return 'Last 30 Days';
    if (preset === 'custom') {
      const start = this.filterDateStart();
      const end = this.filterDateEnd();
      if (start && end) return `${start} → ${end}`;
      if (start) return `After ${start}`;
      if (end) return `Before ${end}`;
    }
    return 'All Time';
  }

  get hasActiveDateFilter(): boolean {
    return this.filterPreset() !== 'all'
      || !!this.filterDateStart()
      || !!this.filterDateEnd();
  }
  categoryPageMap = signal<Record<string, number>>({});
  readonly categoryPageSize = 10;

  // Get category page number
  getCategoryPage(name: string): number {
    return this.categoryPageMap()[name] ?? 1;
  }

  // Total pages for a specific category
  categoryTotalPages(itemCount: number): number {
    return Math.max(1, Math.ceil(itemCount / this.categoryPageSize));
  }

  // Sayfa numaralarını dizi olarak döner
  categoryPageNumbers(itemCount: number): number[] {
    return Array.from({ length: this.categoryTotalPages(itemCount) }, (_, i) => i + 1);
  }

  // Paginated items for category
  paginatedCategoryItems(items: Transaction[], name: string): Transaction[] {
    const page = Math.min(this.getCategoryPage(name), this.categoryTotalPages(items.length));
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

  // New category form
  showCategoryAddForm = signal<'income' | 'expense' | null>(null);
  newCategoryName = signal('');
  newCategoryIcon = signal('🏷️');
  newCategoryColor = signal('#94a3b8');

  categoryColors = CATEGORY_COLORS;
  categoryIcons = CATEGORY_ICONS;
  categoryIconGroups = CATEGORY_ICON_GROUPS;

  iconForTxCategory(name: string, type: 'income' | 'expense' = 'expense'): string {
    return this.categoryService.iconOf(name, type);
  }

  colorForTxCategory(name: string, type: 'income' | 'expense' = 'expense'): string {
    return this.categoryService.colorOf(name, type);
  }

  toggleTxCategory(name: string): void {
    this.expandedTxCategories.update(set => {
      const next = new Set(set);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  isTxCategoryExpanded(name: string): boolean {
    return this.expandedTxCategories().has(name);
  }

  expandAllTxCategories(): void {
    const names = this.groupedCategories.map(g => g.name);
    this.expandedTxCategories.set(new Set(names));
  }

  collapseAllTxCategories(): void {
    this.expandedTxCategories.set(new Set());
  }

  setViewMode(mode: 'group' | 'list'): void {
    this.viewMode.set(mode);
    this.resetPagination();
  }

  // Group filtered transactions by category
  get groupedCategories(): { name: string; type: TransactionType; items: Transaction[]; total: number }[] {
    const map = new Map<string, { type: TransactionType; items: Transaction[]; total: number }>();
    for (const tx of this.filtered()) {
      const existing = map.get(tx.category);
      if (existing) {
        existing.items.push(tx);
        existing.total += tx.amount;
      } else {
        map.set(tx.category, { type: tx.type, items: [tx], total: tx.amount });
      }
    }
    return Array.from(map.entries())
      .map(([name, info]) => ({ name, ...info }))
      .sort((a, b) => b.total - a.total);
  }

  // Add/remove category
  openCategoryAddForm(type: 'income' | 'expense'): void {
    this.showCategoryAddForm.set(type);
    this.newCategoryName.set('');
    this.newCategoryIcon.set(type === 'income' ? '💰' : '🏷️');
    this.newCategoryColor.set(type === 'income' ? '#22c55e' : '#ef4444');
  }

  cancelCategoryAdd(): void {
    this.showCategoryAddForm.set(null);
    this.newCategoryName.set('');
  }

  readonly maxCategoryCount = 20;

  saveCategoryAdd(): void {
    const type = this.showCategoryAddForm();
    if (!type) return;
    const name = this.newCategoryName().trim();
    if (!name) {
      this.toast.error('Category name cannot be empty.');
      return;
    }
    if (name.length > 20) {
      this.toast.error('Category name can be at most 20 characters.');
      return;
    }
    const currentList = type === 'income'
      ? this.categoryService.categories().income
      : this.categoryService.categories().expense;
    if (currentList.length >= this.maxCategoryCount) {
      this.toast.error(`You can add at most ${this.maxCategoryCount} ${type === 'income' ? 'income' : 'expense'} categories.`);
      return;
    }
    const icon = this.newCategoryIcon();
    const color = this.newCategoryColor();
    const added = type === 'income'
      ? this.categoryService.addIncomeCategory(name, icon, color)
      : this.categoryService.addExpenseCategory(name, icon, color);
    if (!added) {
      this.toast.warning('This category already exists.');
      return;
    }
    this.toast.success(`"${name}" category added.`);
    this.cancelCategoryAdd();
  }

  async removeCustomCategory(type: 'income' | 'expense', name: string): Promise<void> {
    const usedCount = this.txService.transactions()
      .filter(t => t.type === type && t.category === name).length;
    if (usedCount > 0) {
      this.toast.warning(`"${name}" has ${usedCount} transactions. Delete or move them to another category first.`);
      return;
    }
    const ok = await this.confirmService.ask({
      title: 'Delete Category',
      message: `"${name}" category will be deleted. Are you sure?`,
      confirmText: 'Delete',
      cancelText: 'Go Back',
      kind: 'danger',
    });
    if (ok) {
      if (type === 'income') this.categoryService.removeIncomeCategory(name);
      else this.categoryService.removeExpenseCategory(name);
      this.toast.success('Category deleted.');
    }
  }

  form = this.emptyForm();

  ngOnInit(): void {
    // Apply query parameters from dashboard chart drilldown
    this.route.queryParams.subscribe(params => {
      const type = params['type'];
      const category = params['category'];
      const startDate = params['startDate'];
      const endDate = params['endDate'];
      const accountId = params['accountId'];

      if (type === 'income' || type === 'expense' || type === 'all') {
        this.filterType.set(type);
      }
      if (category) {
        this.filterCategory.set(category);
        this.showCategoryFilter.set(true);   // open accordion section
      }
      if (startDate) {
        this.filterDateStart.set(startDate);
        this.filterPreset.set('custom');
        this.showDateFilter.set(true);
      }
      if (endDate) {
        this.filterDateEnd.set(endDate);
        this.filterPreset.set('custom');
        this.showDateFilter.set(true);
      }
      if (accountId) {
        this.filterAccountId.set(accountId);
      }
      if (type || category || startDate || endDate || accountId) {
        this.resetPagination();
      }
    });
  }

  private emptyForm() {
    return {
      type: 'expense' as 'income' | 'expense' | 'transfer',
      category: '',
      amount: 0,
      date: new Date().toISOString().slice(0, 10),
      description: '',
      paymentMethod: '',
      accountId: this.accountService.defaultAccountId(),
      transferAccountId: '',
      isRecurring: false,
    };
  }

  get categories(): string[] {
    return this.form.type === 'income'
      ? this.categoryService.incomeNames()
      : this.categoryService.expenseNames();
  }

  get allCategories(): string[] {
    const set = new Set(this.txService.transactions().map(t => t.category));
    return Array.from(set);
  }

  // Category objects to display in accordion/chip list (with icon + color)
  get visibleCategoryObjects() {
    const type = this.filterType();
    const cats = this.categoryService.categories();
    if (type === 'income') return cats.income;
    if (type === 'expense') return cats.expense;
    if (type === 'transfer') return [];
    return [...cats.income, ...cats.expense];
  }

  get visibleCategories(): string[] {
    return this.visibleCategoryObjects.map(c => c.name);
  }

  categoryCount(category: string): number {
    return this.txService.transactions()
      .filter(t => t.category === category)
      .filter(t => this.filterType() === 'all' ? true : t.type === this.filterType())
      .length;
  }

  setFilterType(type: 'all' | 'income' | 'expense' | 'transfer'): void {
    this.resetPagination();
    this.filterType.set(type);
  }

  toggleCategory(category: string): void {
    this.resetPagination();
    this.filterCategory.set(this.filterCategory() === category ? '' : category);
  }

  clearCategoryFilter(): void {
    this.resetPagination();
    this.filterCategory.set('');
  }

  setSortBy(sort: 'newest' | 'oldest' | 'highest' | 'lowest'): void {
    this.resetPagination();
    this.sortBy.set(sort);
  }

  get incomeCount(): number {
    return this.txService.transactions().filter(t => t.type === 'income').length;
  }

  get expenseCount(): number {
    return this.txService.transactions().filter(t => t.type === 'expense').length;
  }

  filtered = computed(() => {
    const start = this.filterDateStart();
    const end = this.filterDateEnd();
    const query = this.searchQuery().trim().toLowerCase();
    const accId = this.filterAccountId();

    const list = this.txService.transactions()
      .filter(t => {
        if (this.filterType() !== 'all' && t.type !== this.filterType()) return false;
        if (this.filterCategory() && t.category !== this.filterCategory()) return false;
        if (this.filterMonth() && !t.date.startsWith(this.filterMonth())) return false;
        if (start && t.date < start) return false;
        if (end && t.date > end) return false;
        if (query && !t.description?.toLowerCase().includes(query)) return false;
        if (accId && t.accountId !== accId && t.transferAccountId !== accId) return false;
        return true;
      });

    const sort = this.sortBy();
    return list.sort((a, b) => {
      switch (sort) {
        case 'newest':  return b.date.localeCompare(a.date);
        case 'oldest':  return a.date.localeCompare(b.date);
        case 'highest': return b.amount - a.amount;
        case 'lowest':  return a.amount - b.amount;
      }
    });
  });

  // User-selected summary type in 'All' mode
  summaryType = signal<'expense' | 'income'>('expense');

  // Active summary type — automatic based on filterType or user selection
  get effectiveSummaryType(): 'expense' | 'income' {
    const ft = this.filterType();
    if (ft === 'income') return 'income';
    if (ft === 'expense') return 'expense';
    return this.summaryType();
  }

  setSummaryType(type: 'expense' | 'income'): void {
    this.summaryType.set(type);
  }

  get filteredSummary(): { category: string; total: number; percent: number }[] {
    const type = this.effectiveSummaryType;
    const map = new Map<string, number>();
    this.filtered()
      .filter(t => t.type === type)
      .forEach(t => map.set(t.category, (map.get(t.category) ?? 0) + t.amount));

    const list = Array.from(map.entries())
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);
    const max = list[0]?.total ?? 1;

    return list.map(item => ({
      ...item,
      percent: (item.total / max) * 100,
    }));
  }

  get filteredSummaryTotal(): number {
    return this.filteredSummary.reduce((sum, item) => sum + item.total, 0);
  }

  get summaryTitle(): string {
    return this.effectiveSummaryType === 'income'
      ? 'Income Summary by Category'
      : 'Spending Summary by Category';
  }

  get summaryIcon(): string {
    return this.effectiveSummaryType === 'income' ? '💰' : '📊';
  }

  // Legacy names for backward compatibility
  get filteredExpenseSummary() { return this.filteredSummary; }
  get filteredExpenseTotal() { return this.filteredSummaryTotal; }

  totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filtered().length / this.pageSize))
  );

  pageNumbers = computed(() =>
    Array.from({ length: this.totalPages() }, (_, index) => index + 1)
  );

  paginated = computed(() => {
    const page = this.visiblePage;
    const start = (page - 1) * this.pageSize;
    return this.filtered().slice(start, start + this.pageSize);
  });

  get visiblePage(): number {
    return Math.min(this.currentPage(), this.totalPages());
  }

  get pageStart(): number {
    if (this.filtered().length === 0) return 0;
    return (this.visiblePage - 1) * this.pageSize + 1;
  }

  get pageEnd(): number {
    return Math.min(this.visiblePage * this.pageSize, this.filtered().length);
  }

  goToPage(page: number): void {
    const target = Math.min(Math.max(page, 1), this.totalPages());
    this.currentPage.set(target);
  }

  nextPage(): void {
    this.goToPage(this.visiblePage + 1);
  }

  previousPage(): void {
    this.goToPage(this.visiblePage - 1);
  }

  private resetPagination(): void {
    this.currentPage.set(1);
  }

  applyPreset(preset: 'all' | 'thisMonth' | 'last7' | 'last30' | 'custom'): void {
    this.resetPagination();
    this.filterPreset.set(preset);
    const today = new Date();
    const toISO = (d: Date) => d.toISOString().slice(0, 10);

    if (preset === 'all') {
      this.filterDateStart.set('');
      this.filterDateEnd.set('');
    } else if (preset === 'thisMonth') {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      this.filterDateStart.set(toISO(first));
      this.filterDateEnd.set(toISO(last));
    } else if (preset === 'last7') {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      this.filterDateStart.set(toISO(start));
      this.filterDateEnd.set(toISO(today));
    } else if (preset === 'last30') {
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      this.filterDateStart.set(toISO(start));
      this.filterDateEnd.set(toISO(today));
    }
  }

  onCustomDateChange(): void {
    this.resetPagination();
    this.filterPreset.set('custom');
  }

  onTypeChange(): void {
    if (this.form.type === 'transfer') {
      this.form.category = 'Transfer';
      this.form.paymentMethod = 'EFT';
    } else {
      this.form.category = '';
      this.form.paymentMethod = '';
    }
  }

  startEdit(tx: Transaction): void {
    this.editingId.set(tx.id);
    this.form = {
      type: tx.type,
      category: tx.category,
      amount: tx.amount,
      date: tx.date,
      description: tx.description,
      paymentMethod: tx.paymentMethod ?? '',
      accountId: tx.accountId ?? this.accountService.defaultAccountId(),
      transferAccountId: tx.transferAccountId ?? '',
      isRecurring: tx.isRecurring ?? false,
    };
    this.showForm.set(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  toggleForm(): void {
    if (this.showForm()) {
      this.cancel();
    } else {
      this.editingId.set(null);
      this.form = this.emptyForm();
      this.showForm.set(true);
    }
  }

  async submit(): Promise<void> {
    const amount = Number(this.form.amount);
    const description = this.form.description.trim();

    if (this.form.type === 'transfer') {
      if (!amount || !this.form.date || !this.form.transferAccountId || !this.form.accountId) {
        this.toast.error('Please fill in source account, target account, amount, and date.');
        return;
      }
      if (this.form.accountId === this.form.transferAccountId) {
        this.toast.error('Source and target accounts cannot be the same.');
        return;
      }
      this.form.category = 'Transfer';
      this.form.paymentMethod = 'EFT';
    } else {
      if (!this.form.category || !amount || !this.form.date || !this.form.paymentMethod || !this.form.accountId) {
        this.toast.error('Please fill in all required fields.');
        return;
      }
    }
    if (amount <= 0) {
      this.toast.error('Amount must be greater than 0.');
      return;
    }
    if (amount > this.maxMoneyAmount) {
      this.toast.error('Amount cannot exceed 1 trillion.');
      return;
    }
    if (description.length > this.maxDescriptionLength) {
      this.toast.error('Description can be at most 50 characters.');
      return;
    }

    const payload = { ...this.form, amount, description };
    const typeLabel = this.form.type === 'income' ? 'income' : 'expense';
    const isEdit = this.editingId() !== null;
    const ok = await this.confirmService.ask({
      title: isEdit ? 'Confirm Update' : 'Confirm Record',
      message: isEdit
        ? `Are you sure you want to update this ${typeLabel} record?`
        : `Are you sure you want to add this ${typeLabel} record of ${this.form.amount}?`,
      confirmText: isEdit ? 'Update' : 'Save',
      cancelText: 'Go Back',
      kind: 'info',
    });
    if (!ok) {
      this.toast.info(isEdit ? 'Update cancelled.' : 'Record cancelled.');
      return;
    }
    const id = this.editingId();
    if (id) {
      this.txService.update(id, payload);
      this.toast.success('Transaction updated.');
    } else {
      this.txService.add(payload);
      this.toast.success(`${typeLabel === 'income' ? 'Income' : 'Expense'} record added.`);
    }
    this.form = this.emptyForm();
    this.editingId.set(null);
    this.showForm.set(false);
  }

  async cancel(): Promise<void> {
    const hasData = this.form.category || this.form.amount || this.form.description;
    const isEdit = this.editingId() !== null;
    if (hasData) {
      const ok = await this.confirmService.ask({
        title: 'Cancel?',
        message: isEdit
          ? 'Your edits will be discarded. Do you want to continue?'
          : 'The entered data will be deleted. Do you want to continue?',
        confirmText: 'Yes, Cancel',
        cancelText: 'Go Back',
        kind: 'warning',
      });
      if (!ok) return;
    }
    this.form = this.emptyForm();
    this.editingId.set(null);
    this.showForm.set(false);
    this.toast.info(isEdit ? 'Edit cancelled.' : 'Operation cancelled.');
  }

  async remove(id: string): Promise<void> {
    const ok = await this.confirmService.ask({
      title: 'Delete Record',
      message: 'This transaction record will be permanently deleted. Are you sure?',
      confirmText: 'Delete',
      cancelText: 'Go Back',
      kind: 'danger',
    });
    if (ok) {
      this.txService.remove(id);
      this.toast.success('Transaction deleted.');
    }
  }

  clearFilters(): void {
    this.filterType.set('all');
    this.filterCategory.set('');
    this.filterMonth.set('');
    this.filterDateStart.set('');
    this.filterDateEnd.set('');
    this.filterPreset.set('all');
    this.sortBy.set('newest');
    this.searchQuery.set('');
    this.filterAccountId.set('');
    this.resetPagination();
  }

  clearAccountFilter(): void {
    this.resetPagination();
    this.filterAccountId.set('');
  }
}
