import { Routes } from '@angular/router';
import { authGuard, adminGuard } from './core/guards';
import { LayoutComponent } from './shared/components/layout/layout.component';

export const routes: Routes = [
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then(m => m.AUTH_ROUTES)
  },
  {
    path: '',
    component: LayoutComponent,
    canActivate: [authGuard],
    children: [
      {
        path: 'dashboard',
        loadChildren: () => import('./features/dashboard/dashboard.routes').then(m => m.DASHBOARD_ROUTES)
      },
      {
        path: 'events',
        loadChildren: () => import('./features/events/events.routes').then(m => m.EVENTS_ROUTES)
      },
      {
        path: 'pair-analysis/:pairId',
        loadComponent: () => import('./features/pair-analysis/pair-analysis.component').then(m => m.PairAnalysisComponent)
      },
      {
        path: 'pair-analysis',
        loadComponent: () => import('./features/pair-analysis/pair-list.component').then(m => m.PairListComponent)
      },
      {
        path: 'watchlist',
        loadComponent: () => import('./features/placeholder/placeholder.component').then(m => m.PlaceholderComponent),
        data: { title: 'Watchlist', icon: 'bookmark', description: 'Track your preferred currency pairs - coming in Phase 3' }
      },
      {
        path: 'alerts',
        loadComponent: () => import('./features/placeholder/placeholder.component').then(m => m.PlaceholderComponent),
        data: { title: 'Alerts', icon: 'notifications', description: 'Set up alert rules and notifications - coming in Phase 3' }
      },
      {
        path: 'settings',
        loadComponent: () => import('./features/placeholder/placeholder.component').then(m => m.PlaceholderComponent),
        data: { title: 'Settings', icon: 'settings', description: 'Manage your profile and preferences - coming in Phase 3' }
      },
      {
        path: 'admin',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/placeholder/placeholder.component').then(m => m.PlaceholderComponent),
        data: { title: 'Admin Panel', icon: 'admin_panel_settings', description: 'User management and system status - coming in Phase 3' }
      },
      {
        path: 'user-guide',
        loadComponent: () => import('./features/placeholder/placeholder.component').then(m => m.PlaceholderComponent),
        data: { title: 'User Guide', icon: 'help_outline', description: 'Documentation and help - coming in Phase 4' }
      },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' }
    ]
  },
  { path: '**', redirectTo: '/auth/login' }
];
