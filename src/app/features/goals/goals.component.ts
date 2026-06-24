import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GoalService } from '../../core/services/goal.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { TransactionService } from '../../core/services/transaction.service';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { ThousandSeparatorDirective } from '../../shared/directives/thousand-separator.directive';
import { Goal, GOAL_PRESETS } from '../../core/models/goal.model';
import { MAX_DESCRIPTION_LENGTH, MAX_MONEY_AMOUNT, MAX_NAME_LENGTH } from '../../core/constants/validation.constants';

@Component({
  selector: 'app-goals',
  standalone: true,
  imports: [CommonModule, FormsModule, MoneyPipe, ThousandSeparatorDirective],
  templateUrl: './goals.component.html',
  styleUrl: './goals.component.scss'
})
export class GoalsComponent {
  goalService = inject(GoalService);
  toast = inject(ToastService);
  confirmService = inject(ConfirmService);
  txService = inject(TransactionService);

  presets = GOAL_PRESETS;
  maxNameLength = MAX_NAME_LENGTH;
  maxDescriptionLength = MAX_DESCRIPTION_LENGTH;
  maxMoneyAmount = MAX_MONEY_AMOUNT;
  readonly maxGoalCount = 8;

  showForm = signal(false);
  editingId = signal<string | null>(null);

  quickAddId = signal<string | null>(null);
  quickAddValue = signal(0);

  form = this.emptyForm();

  private emptyForm() {
    return {
      name: '',
      icon: '🎯',
      targetAmount: 0,
      currentAmount: 0,
      deadline: '',
      description: '',
    };
  }

  applyPreset(p: typeof GOAL_PRESETS[number]): void {
    this.form.name = p.name;
    this.form.icon = p.icon;
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

  startEdit(goal: Goal): void {
    this.editingId.set(goal.id);
    this.form = {
      name: goal.name,
      icon: goal.icon,
      targetAmount: goal.targetAmount,
      currentAmount: goal.currentAmount,
      deadline: goal.deadline,
      description: goal.description,
    };
    this.showForm.set(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async submit(): Promise<void> {
    const name = this.form.name.trim();
    const description = this.form.description.trim();
    const targetAmount = Number(this.form.targetAmount);
    const currentAmount = Number(this.form.currentAmount);

    if (!name || !targetAmount || !this.form.deadline) {
      this.toast.error('Please enter a name, target amount, and deadline.');
      return;
    }
    if (name.length > this.maxNameLength) {
      this.toast.error('Goal name can be at most 30 characters.');
      return;
    }
    if (description.length > this.maxDescriptionLength) {
      this.toast.error('Description can be at most 50 characters.');
      return;
    }
    if (targetAmount <= 0 || currentAmount < 0) {
      this.toast.error('Target amount must be greater than 0, and current savings cannot be negative.');
      return;
    }
    if (targetAmount > this.maxMoneyAmount || currentAmount > this.maxMoneyAmount) {
      this.toast.error('Amounts can be at most 1 trillion.');
      return;
    }

    const isEdit = this.editingId() !== null;
    if (!isEdit && this.goalService.goals().length >= this.maxGoalCount) {
      this.toast.error(`You can add up to ${this.maxGoalCount} goals. Please delete an existing one before adding a new goal.`);
      return;
    }

    const payload = { ...this.form, name, description, targetAmount, currentAmount };
    const ok = await this.confirmService.ask({
      title: isEdit ? 'Update Goal' : 'Confirm Goal',
      message: isEdit
        ? `Do you want to update the goal "${this.form.name}"?`
        : `The goal "${this.form.name}" will be created. Do you confirm?`,
      confirmText: isEdit ? 'Update' : 'Create',
      cancelText: 'Go Back',
      kind: 'info',
    });
    if (!ok) {
      this.toast.info('Operation cancelled.');
      return;
    }
    const id = this.editingId();
    if (id) {
      this.goalService.update(id, payload);
      this.toast.success(`${payload.name} updated.`);
    } else {
      this.goalService.add(payload);
      this.toast.success(`${payload.name} goal created.`);
    }
    this.resetForm();
  }

  async cancel(): Promise<void> {
    const hasData = this.form.name || this.form.targetAmount || this.form.description;
    if (hasData) {
      const ok = await this.confirmService.ask({
        title: 'Cancel?',
        message: 'The information you entered will be discarded. Do you want to continue?',
        confirmText: 'Yes, Cancel',
        cancelText: 'Go Back',
        kind: 'warning',
      });
      if (!ok) return;
    }
    const wasEditing = this.editingId() !== null;
    this.resetForm();
    this.toast.info(wasEditing ? 'Editing cancelled.' : 'Form cancelled.');
  }

  private resetForm(): void {
    this.form = this.emptyForm();
    this.editingId.set(null);
    this.showForm.set(false);
  }

  async remove(goal: Goal): Promise<void> {
    const ok = await this.confirmService.ask({
      title: 'Delete Goal',
      message: `"${goal.name}" goal will be permanently deleted. Are you sure?`,
      confirmText: 'Delete',
      cancelText: 'Go Back',
      kind: 'danger',
    });
    if (ok) {
      this.goalService.remove(goal.id);
      this.toast.success('Goal deleted.');
    }
  }

  openQuickAdd(goal: Goal): void {
    this.quickAddId.set(goal.id);
    this.quickAddValue.set(0);
  }

  cancelQuickAdd(): void {
    this.quickAddId.set(null);
    this.quickAddValue.set(0);
  }

  async saveQuickAdd(goal: Goal): Promise<void> {
    const amount = Number(this.quickAddValue());
    if (!amount || isNaN(amount)) {
      this.toast.error('Please enter a valid amount.');
      return;
    }
    if (amount <= 0) {
      this.toast.error('The amount to add must be greater than 0.');
      return;
    }
    if (amount > this.maxMoneyAmount || goal.currentAmount + amount > this.maxMoneyAmount) {
      this.toast.error('Savings can be at most 1 trillion.');
      return;
    }

    // Cross-module integration: ask the user
    const linkToTx = await this.confirmService.ask({
      title: '💸 Deduct from Your Balance?',
      message: `${amount} ₺ will be added to the "${goal.name}" goal. Should this amount also be deducted from your balance and recorded as an expense under the "Goal Savings" category?`,
      confirmText: 'Yes, Deduct from Balance',
      cancelText: 'No, Only Add to Goal',
      kind: 'info',
    });

    const newAmount = goal.currentAmount + amount;
    const wasComplete = goal.currentAmount >= goal.targetAmount;
    const nowComplete = newAmount >= goal.targetAmount;

    this.goalService.update(goal.id, { currentAmount: newAmount });

    if (linkToTx) {
      this.txService.add({
        type: 'expense',
        category: 'Goal Savings',
        amount,
        date: new Date().toISOString().slice(0, 10),
        description: `Goal: ${goal.name}`,
        paymentMethod: 'Bank Transfer',
        isRecurring: false,
      });
      this.toast.info(`💸 ${amount} ₺ recorded as an expense under the "Goal Savings" category.`);
    }

    if (!wasComplete && nowComplete) {
      this.toast.success(`🎉 Congratulations! You've completed the "${goal.name}" goal!`);
    } else {
      this.toast.success(`${goal.name}: +${amount} ₺ added.`);
    }
    this.cancelQuickAdd();
  }

  isComplete(goal: Goal): boolean {
    return goal.currentAmount >= goal.targetAmount;
  }

  isOverdue(goal: Goal): boolean {
    return this.goalService.daysRemaining(goal) < 0 && !this.isComplete(goal);
  }

  remainingAmount(goal: Goal): number {
    return Math.max(0, goal.targetAmount - goal.currentAmount);
  }

  monthlyTarget(goal: Goal): number | null {
    if (this.isComplete(goal)) return null;
    const remaining = this.remainingAmount(goal);
    const days = this.goalService.daysRemaining(goal);
    if (days <= 0) return remaining;
    const months = Math.ceil(days / 30.4375);
    return remaining / Math.max(1, months);
  }

  getRemainingMonthsLabel(goal: Goal): string {
    const days = this.goalService.daysRemaining(goal);
    if (days <= 0) return '0 months';
    if (days < 30) return 'less than 1 month';
    const months = Math.ceil(days / 30.4375);
    return `${months} months`;
  }

  // Status filter
  filterStatus = signal<'all' | 'active' | 'complete' | 'overdue'>('all');

  setFilterStatus(status: 'all' | 'active' | 'complete' | 'overdue'): void {
    this.filterStatus.set(status);
  }

  // Sorted by nearest deadline
  get sortedGoals(): Goal[] {
    const status = this.filterStatus();
    return [...this.goalService.goals()]
      .filter(g => {
        if (status === 'all') return true;
        if (status === 'complete') return this.isComplete(g);
        if (status === 'overdue') return this.isOverdue(g);
        if (status === 'active') return !this.isComplete(g) && !this.isOverdue(g);
        return true;
      })
      .sort((a, b) => {
        const aComplete = this.isComplete(a) ? 1 : 0;
        const bComplete = this.isComplete(b) ? 1 : 0;
        if (aComplete !== bComplete) return aComplete - bComplete;
        return a.deadline.localeCompare(b.deadline);
      });
  }

  get activeCount(): number {
    return this.goalService.goals().filter(g => !this.isComplete(g) && !this.isOverdue(g)).length;
  }

  get completeCount(): number {
    return this.goalService.goals().filter(g => this.isComplete(g)).length;
  }

  get overdueCount(): number {
    return this.goalService.goals().filter(g => this.isOverdue(g)).length;
  }

  get minDate(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
