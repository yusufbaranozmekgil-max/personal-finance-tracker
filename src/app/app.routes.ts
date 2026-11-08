import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', title: 'This month · Ring Binder', loadComponent: () => import('./pages/month/month').then(m => m.MonthPage) },
  { path: 'accounts', title: 'Accounts · Ring Binder', loadComponent: () => import('./pages/accounts/accounts').then(m => m.AccountsPage) },
  { path: 'investments', title: 'Investments · Ring Binder', loadComponent: () => import('./pages/investments/investments').then(m => m.InvestmentsPage) },
  { path: 'goals', title: 'Goals · Ring Binder', loadComponent: () => import('./pages/goals/goals').then(m => m.GoalsPage) },
  { path: 'settings', title: 'Settings · Ring Binder', loadComponent: () => import('./pages/settings/settings').then(m => m.SettingsPage) },
  { path: '**', redirectTo: '' },
];
