import { Injectable, inject } from '@angular/core';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { TransactionService } from './transaction.service';
import { PortfolioService } from './portfolio.service';
import { GoalService } from './goal.service';
import { SettingsService } from './settings.service';
import { ToastService } from './toast.service';
import { AccountService } from './account.service';

@Injectable({ providedIn: 'root' })
export class ReportService {
  private txService = inject(TransactionService);
  private portfolioService = inject(PortfolioService);
  private goalService = inject(GoalService);
  private settingsService = inject(SettingsService);
  private toast = inject(ToastService);
  private accountService = inject(AccountService);

  // ====== CSV (simple, fast, opens in Excel) ======
  exportTransactionsCSV(): void {
    const rows = this.txService.transactions();
    if (rows.length === 0) {
      this.toast.warning('No transactions to export.');
      return;
    }

    const header = ['Date', 'Type', 'Category', 'Amount', 'Description', 'Source Account', 'Target Account', 'Payment Method', 'Monthly Recurring'];
    const escape = (v: any) => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };

    const lines = [
      header.join(','),
      ...rows.map(t => [
        t.date,
        t.type === 'income' ? 'Income' : t.type === 'expense' ? 'Expense' : 'Transfer',
        t.category,
        t.amount,
        t.description,
        this.accountService.nameOf(t.accountId),
        t.type === 'transfer' ? this.accountService.nameOf(t.transferAccountId) : '',
        t.paymentMethod,
        t.isRecurring ? 'Yes' : 'No',
      ].map(escape).join(',')),
    ];

    // Add BOM — for special characters in Excel
    const csv = '﻿' + lines.join('\n');
    this.downloadBlob(csv, `transactions-${this.dateStamp()}.csv`, 'text/csv;charset=utf-8');
    this.toast.success(`${rows.length} transactions downloaded as CSV.`);
  }

  // ====== XLSX (native Excel, multi-sheet: Transactions + Portfolio + Goals + Summary) ======
  exportFullExcel(): void {
    const txs = this.txService.transactions();
    const assets = this.portfolioService.assets();
    const goals = this.goalService.goals();
    const settings = this.settingsService.settings();

    if (txs.length === 0 && assets.length === 0 && goals.length === 0) {
      this.toast.warning('No data to export.');
      return;
    }

    const wb = XLSX.utils.book_new();
    const currencySuffix = ` (${settings.currency})`;

    // Transactions sheet
    if (txs.length) {
      const txData = txs.map(t => ({
        'Date': t.date,
        'Type': t.type === 'income' ? 'Income' : t.type === 'expense' ? 'Expense' : 'Transfer',
        'Category': t.category,
        [`Amount${currencySuffix}`]: t.amount,
        'Description': t.description,
        'Source Account': this.accountService.nameOf(t.accountId),
        'Target Account': t.type === 'transfer' ? this.accountService.nameOf(t.transferAccountId) : '',
        'Payment Method': t.paymentMethod,
        'Monthly Recurring': t.isRecurring ? 'Yes' : 'No',
      }));
      const ws = XLSX.utils.json_to_sheet(txData);
      XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
    }

    // Portfolio sheet
    if (assets.length) {
      const assetData = assets.map(a => ({
        'Name': a.name,
        'Symbol': a.symbol,
        'Type': a.type,
        'Quantity': a.quantity,
        'Purchase Price': a.purchasePrice,
        'Current Price': a.unitPrice,
        'Currency': a.currency,
        [`Total Value${currencySuffix}`]: this.portfolioService.currentValueTRY(a),
        [`Cost${currencySuffix}`]: this.portfolioService.purchaseCostTRY(a),
        [`Profit/Loss${currencySuffix}`]: this.portfolioService.profitTRY(a),
        'Profit %': Number(this.portfolioService.profitPercent(a).toFixed(2)),
      }));
      const ws = XLSX.utils.json_to_sheet(assetData);
      XLSX.utils.book_append_sheet(wb, ws, 'Portfolio');
    }

    // Goals sheet
    if (goals.length) {
      const goalData = goals.map(g => ({
        'Goal': g.name,
        'Target Amount': g.targetAmount,
        'Savings': g.currentAmount,
        'Remaining': Math.max(0, g.targetAmount - g.currentAmount),
        'Progress %': Number(this.goalService.progress(g).toFixed(1)),
        'Deadline': g.deadline,
        'Days Remaining': this.goalService.daysRemaining(g),
        'Description': g.description,
      }));
      const ws = XLSX.utils.json_to_sheet(goalData);
      XLSX.utils.book_append_sheet(wb, ws, 'Goals');
    }

    // Summary sheet
    const summary = [
      { 'Metric': `Total Income${currencySuffix}`, 'Value': this.txService.totalIncome() },
      { 'Metric': `Total Expense${currencySuffix}`, 'Value': this.txService.totalExpense() },
      { 'Metric': `Net Balance${currencySuffix}`, 'Value': this.txService.balance() },
      { 'Metric': `Portfolio Value${currencySuffix}`, 'Value': this.portfolioService.totalValue() },
      { 'Metric': `Portfolio Cost${currencySuffix}`, 'Value': this.portfolioService.totalPurchase() },
      { 'Metric': `Portfolio Profit/Loss${currencySuffix}`, 'Value': this.portfolioService.totalProfit() },
      { 'Metric': `Total Net Worth${currencySuffix}`, 'Value': this.accountService.totalBalance() + this.portfolioService.totalValue() },
      { 'Metric': `This Month's Spending${currencySuffix}`, 'Value': this.txService.currentMonthExpense() },
      { 'Metric': `Monthly Budget Limit${currencySuffix}`, 'Value': settings.monthlyLimit },
      { 'Metric': 'Active Currency', 'Value': settings.currency },
      { 'Metric': 'USD/TRY Rate', 'Value': settings.usdRate },
      { 'Metric': 'EUR/TRY Rate', 'Value': settings.eurRate },
      { 'Metric': 'Report Date', 'Value': new Date().toLocaleString('en-US') },
    ];
    const summaryWs = XLSX.utils.json_to_sheet(summary);
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

    XLSX.writeFile(wb, `financial-report-${this.dateStamp()}.xlsx`);
    this.toast.success('Excel report downloaded (Transactions, Portfolio, Goals, Summary).');
  }

  // ====== PDF (dashboard screenshot) ======
  async exportDashboardPDF(): Promise<void> {
    // First make sure we are on the dashboard page
    const dashEl = document.querySelector('.dashboard') as HTMLElement | null;
    if (!dashEl) {
      this.toast.error('Please navigate to the Dashboard page first to export a PDF.');
      return;
    }

    this.toast.info('Preparing PDF, please wait...');
    try {
      // Temporarily expand all accordion sections
      const expanded: HTMLElement[] = [];
      dashEl.querySelectorAll('.dash-section').forEach(el => {
        if (!el.classList.contains('dash-section--open')) {
          (el.querySelector('.dash-section__toggle') as HTMLElement)?.click();
          expanded.push(el as HTMLElement);
        }
      });

      // Wait for render
      await new Promise(r => setTimeout(r, 800));

      const canvas = await html2canvas(dashEl, {
        backgroundColor: '#0f172a',
        scale: 1.5,
        useCORS: true,
        logging: false,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth - 20;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      // Title
      pdf.setFontSize(16);
      pdf.setTextColor(99, 102, 241);
      pdf.text('Personal Finance Report', 10, 14);
      pdf.setFontSize(10);
      pdf.setTextColor(100, 100, 100);
      pdf.text(`Report Date: ${new Date().toLocaleString('en-US')}`, 10, 20);

      let y = 26;
      let remaining = imgHeight;
      let srcY = 0;

      // Split across pages if content doesn't fit
      while (remaining > 0) {
        const drawHeight = Math.min(remaining, pageHeight - y - 10);
        const sliceHeight = (drawHeight / imgHeight) * canvas.height;

        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = sliceHeight;
        const ctx = sliceCanvas.getContext('2d')!;
        ctx.drawImage(canvas, 0, srcY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

        pdf.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', 10, y, imgWidth, drawHeight);

        srcY += sliceHeight;
        remaining -= drawHeight;
        if (remaining > 0) {
          pdf.addPage();
          y = 10;
        }
      }

      pdf.save(`dashboard-report-${this.dateStamp()}.pdf`);
      this.toast.success('PDF report downloaded.');
    } catch (err: any) {
      console.error('PDF error:', err);
      this.toast.error(`Could not create PDF: ${err?.message ?? 'Unknown error'}`);
    }
  }

  // ====== Helpers ======
  private downloadBlob(content: string, filename: string, mime: string): void {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  private dateStamp(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
