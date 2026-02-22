import { Component, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSidenavModule, MatSidenav } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatBadgeModule } from '@angular/material/badge';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { AuthService } from '../../../core/services/auth.service';
import { OfflineIndicatorComponent } from '../offline-indicator/offline-indicator.component';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    CommonModule, RouterModule, RouterOutlet,
    MatToolbarModule, MatSidenavModule, MatListModule,
    MatIconModule, MatButtonModule, MatMenuModule, MatBadgeModule,
    OfflineIndicatorComponent
  ],
  template: `
    <mat-sidenav-container class="app-container">
      <mat-sidenav #sidenav [mode]="isMobile() ? 'over' : 'side'" [opened]="!isMobile()" class="app-sidenav">
        <div class="sidenav-header">
          <mat-icon class="logo-icon">currency_exchange</mat-icon>
          <span class="logo-text">FX Analyzer</span>
        </div>
        <mat-nav-list>
          <a mat-list-item routerLink="/dashboard" routerLinkActive="active" (click)="closeMobileSidenav()">
            <mat-icon matListItemIcon>dashboard</mat-icon>
            <span matListItemTitle>Dashboard</span>
          </a>
          <a mat-list-item routerLink="/events" routerLinkActive="active" (click)="closeMobileSidenav()">
            <mat-icon matListItemIcon>event</mat-icon>
            <span matListItemTitle>Events</span>
          </a>
          <a mat-list-item routerLink="/pair-analysis" routerLinkActive="active" (click)="closeMobileSidenav()">
            <mat-icon matListItemIcon>analytics</mat-icon>
            <span matListItemTitle>Pair Analysis</span>
          </a>
          <a mat-list-item routerLink="/watchlist" routerLinkActive="active" (click)="closeMobileSidenav()">
            <mat-icon matListItemIcon>bookmark</mat-icon>
            <span matListItemTitle>Watchlist</span>
          </a>
          <a mat-list-item routerLink="/alerts" routerLinkActive="active" (click)="closeMobileSidenav()">
            <mat-icon matListItemIcon>notifications</mat-icon>
            <span matListItemTitle>Alerts</span>
          </a>
          <a mat-list-item routerLink="/signals" routerLinkActive="active" (click)="closeMobileSidenav()">
            <mat-icon matListItemIcon>candlestick_chart</mat-icon>
            <span matListItemTitle>Trade Signals</span>
          </a>
          @if (auth.isAdmin()) {
            <mat-divider></mat-divider>
            <a mat-list-item routerLink="/admin" routerLinkActive="active" (click)="closeMobileSidenav()">
              <mat-icon matListItemIcon>admin_panel_settings</mat-icon>
              <span matListItemTitle>Admin</span>
            </a>
          }
          <mat-divider></mat-divider>
          <a mat-list-item routerLink="/user-guide" routerLinkActive="active" (click)="closeMobileSidenav()">
            <mat-icon matListItemIcon>help_outline</mat-icon>
            <span matListItemTitle>User Guide</span>
          </a>
        </mat-nav-list>
      </mat-sidenav>

      <mat-sidenav-content>
        <app-offline-indicator />
        <mat-toolbar class="app-toolbar" color="primary">
          <button mat-icon-button (click)="sidenav.toggle()" class="menu-btn">
            <mat-icon>menu</mat-icon>
          </button>
          <span class="toolbar-spacer"></span>
          <button mat-icon-button [matMenuTriggerFor]="userMenu">
            <mat-icon>account_circle</mat-icon>
          </button>
          <mat-menu #userMenu="matMenu">
            <div class="user-menu-header" mat-menu-item disabled>
              <strong>{{ auth.profile()?.full_name || auth.currentUser()?.email }}</strong>
            </div>
            <a mat-menu-item routerLink="/settings">
              <mat-icon>settings</mat-icon> Settings
            </a>
            <button mat-menu-item (click)="auth.signOut()">
              <mat-icon>logout</mat-icon> Sign Out
            </button>
          </mat-menu>
        </mat-toolbar>
        <main class="app-content">
          <router-outlet></router-outlet>
        </main>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: [`
    .app-container { height: 100vh; }
    .app-sidenav {
      width: 240px;
      background: #1a1a2e;
    }
    .sidenav-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 16px;
      color: white;
      font-size: 1.2rem;
      font-weight: 500;
    }
    .logo-icon { color: #4caf50; }
    .logo-text { color: white; }
    .app-sidenav mat-nav-list a {
      color: rgba(255, 255, 255, 0.7);
    }
    .app-sidenav mat-nav-list a.active {
      color: white;
      background: rgba(76, 175, 80, 0.2);
    }
    .app-sidenav mat-nav-list a mat-icon {
      color: rgba(255, 255, 255, 0.7);
    }
    .app-sidenav mat-nav-list a.active mat-icon {
      color: #4caf50;
    }
    .app-toolbar {
      position: sticky;
      top: 0;
      z-index: 100;
      background: #16213e;
      color: white;
    }
    .toolbar-spacer { flex: 1 1 auto; }
    .app-content { padding: 24px; }
    .user-menu-header { font-size: 14px; }
    @media (max-width: 768px) {
      .app-content { padding: 12px; }
    }
  `]
})
export class LayoutComponent {
  @ViewChild('sidenav') sidenav!: MatSidenav;
  isMobile = signal(false);

  constructor(
    public auth: AuthService,
    private breakpointObserver: BreakpointObserver
  ) {
    this.breakpointObserver.observe([Breakpoints.Handset]).subscribe(result => {
      this.isMobile.set(result.matches);
    });
  }

  closeMobileSidenav() {
    if (this.isMobile()) {
      this.sidenav.close();
    }
  }
}
