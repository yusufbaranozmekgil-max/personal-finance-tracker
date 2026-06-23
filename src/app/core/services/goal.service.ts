import { Injectable, inject, signal, computed } from '@angular/core';
import { Goal } from '../models/goal.model';
import { StorageService } from './storage.service';

@Injectable({ providedIn: 'root' })
export class GoalService {
  private readonly STORAGE_KEY = 'finans_goals';
  private storage = inject(StorageService);

  goals = signal<Goal[]>(this.load());

  totalTarget = computed(() =>
    this.goals().reduce((sum, g) => sum + g.targetAmount, 0)
  );

  totalSaved = computed(() =>
    this.goals().reduce((sum, g) => sum + g.currentAmount, 0)
  );

  completedCount = computed(() =>
    this.goals().filter(g => g.currentAmount >= g.targetAmount).length
  );

  add(goal: Omit<Goal, 'id' | 'createdAt'>): void {
    const newItem: Goal = {
      ...goal,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.goals.update(list => [...list, newItem]);
    this.save();
  }

  update(id: string, changes: Partial<Omit<Goal, 'id' | 'createdAt'>>): void {
    this.goals.update(list =>
      list.map(g => g.id === id ? { ...g, ...changes } : g)
    );
    this.save();
  }

  remove(id: string): void {
    this.goals.update(list => list.filter(g => g.id !== id));
    this.save();
  }

  progress(g: Goal): number {
    if (g.targetAmount <= 0) return 0;
    return Math.min((g.currentAmount / g.targetAmount) * 100, 100);
  }

  daysRemaining(g: Goal): number {
    const deadline = new Date(g.deadline);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const ms = deadline.getTime() - today.getTime();
    return Math.ceil(ms / (1000 * 60 * 60 * 24));
  }

  private save(): void {
    this.storage.setItemSync(this.STORAGE_KEY, JSON.stringify(this.goals()));
  }

  private load(): Goal[] {
    try {
      return JSON.parse(this.storage.getItemSync(this.STORAGE_KEY) ?? '[]');
    } catch {
      return [];
    }
  }
}
