import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule } from '@angular/material/tabs';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatBadgeModule } from '@angular/material/badge';
import { MatDividerModule } from '@angular/material/divider';
import { AlertsService } from '../../core/services/alerts.service';
import { CurrencyPairService } from '../../core/services/currency-pair.service';
import { AlertRule, Notification } from '../../core/models';
import { CreateAlertDialogComponent } from './create-alert-dialog.component';

@Component({
  selector: 'app-alerts',
  standalone: true,
  imports: [
    CommonModule, DatePipe,
    MatCardModule, MatTabsModule, MatIconModule, MatButtonModule,
    MatProgressSpinnerModule, MatChipsModule, MatSlideToggleModule,
    MatDialogModule, MatSnackBarModule, MatBadgeModule, MatDividerModule
  ],
  template: `
    <div class="alerts-page">
      <div class="page-header">
        <h1>Alerts & Notifications</h1>
        <button mat-raised-button color="primary" (click)="openCreateDialog()">
          <mat-icon>add_alert</mat-icon>
          Create Alert
        </button>
      </div>

      <mat-tab-group>
        <!-- Alert Rules Tab -->
        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon>tune</mat-icon>&nbsp;Alert Rules
          </ng-template>
          <div class="tab-content">
            @if (loading()) {
              <div class="loading"><mat-spinner diameter="32"></mat-spinner></div>
            } @else if (alerts().length === 0) {
              <mat-card class="empty-card">
                <mat-card-content>
                  <mat-icon>notifications_off</mat-icon>
                  <h3>No alert rules</h3>
                  <p>Create alert rules to get notified about market events.</p>
                </mat-card-content>
              </mat-card>
            } @else {
              @for (alert of alerts(); track alert.id) {
                <mat-card class="alert-card">
                  <mat-card-content>
                    <div class="alert-header">
                      <div class="alert-info">
                        <mat-icon [class]="'type-' + alert.alert_type">
                          {{ getAlertIcon(alert.alert_type) }}
                        </mat-icon>
                        <div>
                          <span class="alert-type">{{ getAlertLabel(alert.alert_type) }}</span>
                          @if (alert.pair_id) {
                            <span class="alert-pair">{{ getPairSymbol(alert.pair_id) }}</span>
                          }
                        </div>
                      </div>
                      <div class="alert-actions">
                        <mat-slide-toggle
                          [checked]="alert.is_active"
                          (change)="toggleAlert(alert.id, $event.checked)">
                        </mat-slide-toggle>
                        <button mat-icon-button (click)="deleteAlert(alert.id)" class="delete-btn">
                          <mat-icon>delete</mat-icon>
                        </button>
                      </div>
                    </div>
                    <p class="alert-conditions">{{ formatConditions(alert) }}</p>
                  </mat-card-content>
                </mat-card>
              }
            }
          </div>
        </mat-tab>

        <!-- Notifications Tab -->
        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon [matBadge]="unreadCount()" [matBadgeHidden]="unreadCount() === 0"
                      matBadgeColor="warn" matBadgeSize="small">
              notifications
            </mat-icon>
            &nbsp;Notifications
          </ng-template>
          <div class="tab-content">
            @if (notifications().length > 0) {
              <div class="notif-actions">
                <button mat-button (click)="markAllRead()" [disabled]="unreadCount() === 0">
                  <mat-icon>done_all</mat-icon> Mark all as read
                </button>
              </div>
            }

            @if (notifications().length === 0) {
              <mat-card class="empty-card">
                <mat-card-content>
                  <mat-icon>inbox</mat-icon>
                  <h3>No notifications</h3>
                  <p>Notifications from your alert rules will appear here.</p>
                </mat-card-content>
              </mat-card>
            } @else {
              @for (notif of notifications(); track notif.id) {
                <mat-card class="notif-card" [class.unread]="!notif.is_read"
                          (click)="markRead(notif.id)">
                  <mat-card-content>
                    <div class="notif-header">
                      <mat-icon [class.unread-icon]="!notif.is_read">
                        {{ notif.is_read ? 'notifications_none' : 'notifications_active' }}
                      </mat-icon>
                      <div class="notif-text">
                        <strong>{{ notif.title }}</strong>
                        <p>{{ notif.message }}</p>
                      </div>
                      <span class="notif-time">{{ notif.created_at | date:'short' }}</span>
                    </div>
                  </mat-card-content>
                </mat-card>
              }
            }
          </div>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
  styles: [`
    .alerts-page { max-width: 800px; margin: 0 auto; }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
    }
    h1 { margin: 0; }
    .tab-content { padding: 16px 0; }
    .loading { text-align: center; padding: 32px; }
    .empty-card {
      text-align: center;
      padding: 32px;
    }
    .empty-card mat-icon {
      font-size: 48px; width: 48px; height: 48px;
      color: rgba(255,255,255,0.2);
    }
    .empty-card p { color: rgba(255,255,255,0.4); }
    .alert-card { margin-bottom: 8px; }
    .alert-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .alert-info { display: flex; align-items: center; gap: 12px; }
    .type-bias_change { color: #ff9800; }
    .type-high_impact_event { color: #f44336; }
    .type-confidence_threshold { color: #2196f3; }
    .alert-type { font-weight: 600; display: block; }
    .alert-pair { font-size: 12px; color: rgba(255,255,255,0.5); }
    .alert-actions { display: flex; align-items: center; gap: 8px; }
    .delete-btn { opacity: 0.4; }
    .delete-btn:hover { opacity: 1; color: #f44336; }
    .alert-conditions {
      font-size: 12px;
      color: rgba(255,255,255,0.4);
      margin-top: 8px;
    }
    .notif-actions { margin-bottom: 8px; text-align: right; }
    .notif-card {
      margin-bottom: 4px;
      cursor: pointer;
      transition: background 0.2s;
    }
    .notif-card.unread { border-left: 3px solid #4caf50; }
    .notif-header {
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }
    .unread-icon { color: #4caf50; }
    .notif-text { flex: 1; }
    .notif-text p { margin: 4px 0 0; font-size: 13px; color: rgba(255,255,255,0.5); }
    .notif-time { font-size: 11px; color: rgba(255,255,255,0.3); white-space: nowrap; }
  `]
})
export class AlertsComponent implements OnInit, OnDestroy {
  loading = signal(true);

  get alerts() { return this.alertsService.alerts; }
  get notifications() { return this.alertsService.notifications; }
  get unreadCount() { return this.alertsService.unreadCount; }

  constructor(
    private alertsService: AlertsService,
    private pairService: CurrencyPairService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  async ngOnInit() {
    try {
      await Promise.all([
        this.pairService.loadPairs(),
        this.alertsService.loadAlerts(),
        this.alertsService.loadNotifications()
      ]);
      this.alertsService.subscribeToNotifications();
    } catch (err) {
      console.error('Failed to load alerts:', err);
    } finally {
      this.loading.set(false);
    }
  }

  ngOnDestroy() {
    this.alertsService.unsubscribeFromNotifications();
  }

  openCreateDialog() {
    const dialogRef = this.dialog.open(CreateAlertDialogComponent, {
      data: { pairs: this.pairService.pairs() },
      width: '450px'
    });

    dialogRef.afterClosed().subscribe(async (result: Partial<AlertRule> | undefined) => {
      if (result) {
        try {
          await this.alertsService.createAlert(result);
          this.snackBar.open('Alert created', 'Close', { duration: 3000 });
        } catch (err: any) {
          this.snackBar.open(err.message || 'Failed to create alert', 'Close', { duration: 5000 });
        }
      }
    });
  }

  async toggleAlert(id: string, isActive: boolean) {
    try {
      await this.alertsService.updateAlert(id, { is_active: isActive });
    } catch (err: any) {
      this.snackBar.open('Failed to update alert', 'Close', { duration: 3000 });
    }
  }

  async deleteAlert(id: string) {
    try {
      await this.alertsService.deleteAlert(id);
      this.snackBar.open('Alert deleted', 'Close', { duration: 3000 });
    } catch (err: any) {
      this.snackBar.open('Failed to delete alert', 'Close', { duration: 3000 });
    }
  }

  async markRead(id: string) {
    await this.alertsService.markAsRead(id);
  }

  async markAllRead() {
    await this.alertsService.markAllAsRead();
  }

  getPairSymbol(pairId: string): string {
    return this.pairService.getPairById(pairId)?.symbol ?? '';
  }

  getAlertIcon(type: string): string {
    switch (type) {
      case 'bias_change': return 'swap_vert';
      case 'high_impact_event': return 'priority_high';
      case 'confidence_threshold': return 'speed';
      default: return 'notifications';
    }
  }

  getAlertLabel(type: string): string {
    switch (type) {
      case 'bias_change': return 'Bias Change';
      case 'high_impact_event': return 'High Impact Event';
      case 'confidence_threshold': return 'Confidence Threshold';
      default: return type;
    }
  }

  formatConditions(alert: AlertRule): string {
    const cond = alert.conditions as Record<string, unknown>;
    const parts: string[] = [];
    if (cond['direction']) parts.push(`Direction: ${cond['direction']}`);
    if (cond['min_confidence']) parts.push(`Min confidence: ${cond['min_confidence']}`);
    if (cond['threshold']) parts.push(`Threshold: ${cond['threshold']}`);
    return parts.length > 0 ? parts.join(' | ') : 'All events';
  }
}
