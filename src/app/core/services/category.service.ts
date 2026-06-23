import { Injectable, inject, signal, computed } from '@angular/core';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../models/transaction.model';
import { ASSET_TYPES } from '../models/asset.model';
import { Category, DEFAULT_CATEGORY_META } from '../models/category.model';
import { StorageService } from './storage.service';

export interface StoredCategories {
  income: Category[];
  expense: Category[];
  assetTypes: string[];
}

const FALLBACK_COLORS = ['#ef4444','#f59e0b','#22c55e','#3b82f6','#8b5cf6','#ec4899','#06b6d4','#10b981'];

function buildDefaults(names: readonly string[], type: 'income' | 'expense'): Category[] {
  return names.map((name, i) => {
    const meta = DEFAULT_CATEGORY_META[name] ?? {
      icon: type === 'income' ? '💰' : '🏷️',
      color: FALLBACK_COLORS[i % FALLBACK_COLORS.length],
    };
    return {
      id: crypto.randomUUID(),
      name,
      icon: meta.icon,
      color: meta.color,
      type,
    };
  });
}

const DEFAULT_CATEGORIES: StoredCategories = {
  income:  buildDefaults(INCOME_CATEGORIES, 'income'),
  expense: buildDefaults(EXPENSE_CATEGORIES, 'expense'),
  assetTypes: [...ASSET_TYPES],
};

@Injectable({ providedIn: 'root' })
export class CategoryService {
  private readonly STORAGE_KEY = 'finans_categories';
  private storage = inject(StorageService);

  categories = signal<StoredCategories>(this.load());

  // ====== Backward compatible: string array helpers (for transaction forms) ======
  incomeNames = computed(() => this.categories().income.map(c => c.name));
  expenseNames = computed(() => this.categories().expense.map(c => c.name));

  // Returns the metadata for a given category (icon/color for charts + lists)
  metaFor(name: string, type: 'income' | 'expense'): { icon: string; color: string } {
    const list = type === 'income' ? this.categories().income : this.categories().expense;
    const found = list.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (found) return { icon: found.icon, color: found.color };
    // fallback: unknown category
    const meta = DEFAULT_CATEGORY_META[name];
    if (meta) return meta;
    return { icon: type === 'income' ? '💰' : '🏷️', color: '#94a3b8' };
  }

  iconOf(name: string, type: 'income' | 'expense'): string {
    return this.metaFor(name, type).icon;
  }

  colorOf(name: string, type: 'income' | 'expense'): string {
    return this.metaFor(name, type).color;
  }

  // ====== Add ======
  addIncomeCategory(name: string, icon?: string, color?: string): boolean {
    return this.addCategory('income', name, icon, color);
  }

  addExpenseCategory(name: string, icon?: string, color?: string): boolean {
    return this.addCategory('expense', name, icon, color);
  }

  private addCategory(type: 'income' | 'expense', name: string, icon?: string, color?: string): boolean {
    const clean = name.trim();
    if (!clean) return false;
    const list = type === 'income' ? this.categories().income : this.categories().expense;
    if (list.some(c => c.name.toLowerCase() === clean.toLowerCase())) return false;

    const meta = DEFAULT_CATEGORY_META[clean];
    const finalIcon = icon ?? meta?.icon ?? (type === 'income' ? '💰' : '🏷️');
    const finalColor = color ?? meta?.color ?? FALLBACK_COLORS[list.length % FALLBACK_COLORS.length];

    const newCat: Category = {
      id: crypto.randomUUID(),
      name: clean,
      icon: finalIcon,
      color: finalColor,
      type,
    };

    this.categories.update(c => ({
      ...c,
      [type]: [...c[type], newCat],
    }));
    this.save();
    return true;
  }

  // ====== Update (change icon/color) ======
  updateCategory(type: 'income' | 'expense', id: string, changes: Partial<Omit<Category, 'id' | 'type'>>): void {
    this.categories.update(c => ({
      ...c,
      [type]: c[type].map(cat => cat.id === id ? { ...cat, ...changes } : cat),
    }));
    this.save();
  }

  // ====== Delete ======
  removeIncomeCategory(name: string): void {
    this.removeCategoryByName('income', name);
  }

  removeExpenseCategory(name: string): void {
    this.removeCategoryByName('expense', name);
  }

  private removeCategoryByName(type: 'income' | 'expense', name: string): void {
    this.categories.update(c => ({
      ...c,
      [type]: c[type].filter(cat => cat.name !== name),
    }));
    this.save();
  }

  // ====== Asset types (unchanged) ======
  addAssetType(name: string): boolean {
    const clean = name.trim();
    if (!clean) return false;
    const current = this.categories().assetTypes;
    if (current.some(t => t.toLowerCase() === clean.toLowerCase())) return false;
    this.categories.update(c => ({ ...c, assetTypes: [...c.assetTypes, clean] }));
    this.save();
    return true;
  }

  removeAssetType(name: string): void {
    this.categories.update(c => ({
      ...c,
      assetTypes: c.assetTypes.filter(t => t !== name),
    }));
    this.save();
  }

  reset(): void {
    this.categories.set({
      income: buildDefaults(INCOME_CATEGORIES, 'income'),
      expense: buildDefaults(EXPENSE_CATEGORIES, 'expense'),
      assetTypes: [...ASSET_TYPES],
    });
    this.save();
  }

  private save(): void {
    this.storage.setItemSync(this.STORAGE_KEY, JSON.stringify(this.categories()));
  }

  private load(): StoredCategories {
    try {
      const saved: any = JSON.parse(this.storage.getItemSync(this.STORAGE_KEY) ?? '{}');

      // Backward migration: convert from old string[] format to Category[]
      const migrate = (arr: any, type: 'income' | 'expense'): Category[] => {
        if (!Array.isArray(arr) || arr.length === 0) return buildDefaults(
          type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES,
          type
        );
        return arr.map((item: any, i: number) => {
          if (typeof item === 'string') {
            const meta = DEFAULT_CATEGORY_META[item] ?? {
              icon: type === 'income' ? '💰' : '🏷️',
              color: FALLBACK_COLORS[i % FALLBACK_COLORS.length],
            };
            return { id: crypto.randomUUID(), name: item, icon: meta.icon, color: meta.color, type };
          }
          return {
            id: item.id ?? crypto.randomUUID(),
            name: item.name ?? '',
            icon: item.icon ?? '🏷️',
            color: item.color ?? '#94a3b8',
            type,
          };
        });
      };

      return {
        income:  migrate(saved.income, 'income'),
        expense: migrate(saved.expense, 'expense'),
        assetTypes: Array.isArray(saved.assetTypes) && saved.assetTypes.length
          ? saved.assetTypes : [...ASSET_TYPES],
      };
    } catch {
      return {
        income: buildDefaults(INCOME_CATEGORIES, 'income'),
        expense: buildDefaults(EXPENSE_CATEGORIES, 'expense'),
        assetTypes: [...ASSET_TYPES],
      };
    }
  }
}
