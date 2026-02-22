import { Component, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { SupabaseService } from '../../core/services/supabase.service';

interface UserInfo {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
  roles: string[];
}

interface SystemLog {
  id: string;
  level: string;
  source: string;
  message: string;
  created_at: string;
}

interface SystemStats {
  totalUsers: number;
  totalEvents: number;
  totalAnalyses: number;
  totalBias: number;
}

interface SourceHealth {
  source: string;
  lastSuccess: string | null;
  lastError: string | null;
  recentErrors: number;
  recentSuccesses: number;
  status: 'healthy' | 'degraded' | 'down';
}

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [
    CommonModule, DatePipe,
    MatCardModule, MatTabsModule, MatTableModule, MatIconModule,
    MatButtonModule, MatProgressSpinnerModule, MatChipsModule,
    MatSelectModule, MatSnackBarModule
  ],
  template: `
    <div class="admin-page">
      <h1>Admin Panel</h1>

      <!-- System Stats -->
      <div class="stats-grid">
        <mat-card class="stat-card">
          <mat-card-content>
            <mat-icon>people</mat-icon>
            <div class="stat-value">{{ stats().totalUsers }}</div>
            <div class="stat-label">Users</div>
          </mat-card-content>
        </mat-card>
        <mat-card class="stat-card">
          <mat-card-content>
            <mat-icon>event</mat-icon>
            <div class="stat-value">{{ stats().totalEvents }}</div>
            <div class="stat-label">Events</div>
          </mat-card-content>
        </mat-card>
        <mat-card class="stat-card">
          <mat-card-content>
            <mat-icon>psychology</mat-icon>
            <div class="stat-value">{{ stats().totalAnalyses }}</div>
            <div class="stat-label">Analyses</div>
          </mat-card-content>
        </mat-card>
        <mat-card class="stat-card">
          <mat-card-content>
            <mat-icon>auto_graph</mat-icon>
            <div class="stat-value">{{ stats().totalBias }}</div>
            <div class="stat-label">Bias Records</div>
          </mat-card-content>
        </mat-card>
      </div>

      <mat-tab-group>
        <!-- User Management -->
        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon>people</mat-icon>&nbsp;Users
          </ng-template>
          <div class="tab-content">
            @if (usersLoading()) {
              <div class="loading"><mat-spinner diameter="32"></mat-spinner></div>
            } @else {
              <table mat-table [dataSource]="users()" class="users-table">
                <ng-container matColumnDef="email">
                  <th mat-header-cell *matHeaderCellDef>Email</th>
                  <td mat-cell *matCellDef="let u">{{ u.email }}</td>
                </ng-container>
                <ng-container matColumnDef="full_name">
                  <th mat-header-cell *matHeaderCellDef>Name</th>
                  <td mat-cell *matCellDef="let u">{{ u.full_name || '-' }}</td>
                </ng-container>
                <ng-container matColumnDef="roles">
                  <th mat-header-cell *matHeaderCellDef>Roles</th>
                  <td mat-cell *matCellDef="let u">
                    @for (role of u.roles; track role) {
                      <span class="role-chip" [class]="'role-' + role">{{ role }}</span>
                    }
                  </td>
                </ng-container>
                <ng-container matColumnDef="created_at">
                  <th mat-header-cell *matHeaderCellDef>Joined</th>
                  <td mat-cell *matCellDef="let u">{{ u.created_at | date:'mediumDate' }}</td>
                </ng-container>
                <ng-container matColumnDef="actions">
                  <th mat-header-cell *matHeaderCellDef>Actions</th>
                  <td mat-cell *matCellDef="let u">
                    @if (!u.roles.includes('admin')) {
                      <button mat-button (click)="promoteToAdmin(u.id)" color="primary">
                        Make Admin
                      </button>
                    }
                  </td>
                </ng-container>

                <tr mat-header-row *matHeaderRowDef="userColumns"></tr>
                <tr mat-row *matRowDef="let row; columns: userColumns;"></tr>
              </table>
            }
          </div>
        </mat-tab>

        <!-- System Health -->
        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon>monitor_heart</mat-icon>&nbsp;Health
          </ng-template>
          <div class="tab-content">
            @if (healthLoading()) {
              <div class="loading"><mat-spinner diameter="32"></mat-spinner></div>
            } @else {
              <div class="health-grid">
                @for (src of sourceHealth(); track src.source) {
                  <mat-card class="health-card" [class]="'health-' + src.status">
                    <mat-card-content>
                      <div class="health-header">
                        <span class="health-source">{{ src.source | uppercase }}</span>
                        <span class="health-status">{{ src.status }}</span>
                      </div>
                      <div class="health-stats">
                        <div class="health-stat">
                          <span class="stat-num success">{{ src.recentSuccesses }}</span>
                          <span class="stat-desc">successes (24h)</span>
                        </div>
                        <div class="health-stat">
                          <span class="stat-num error">{{ src.recentErrors }}</span>
                          <span class="stat-desc">errors (24h)</span>
                        </div>
                      </div>
                      @if (src.lastSuccess) {
                        <div class="health-time">Last success: {{ src.lastSuccess | date:'short' }}</div>
                      }
                      @if (src.lastError) {
                        <div class="health-time error">Last error: {{ src.lastError | date:'short' }}</div>
                      }
                    </mat-card-content>
                  </mat-card>
                }
              </div>
              <div class="events-24h">
                <mat-icon>event_available</mat-icon>
                <span>Events fetched in last 24h: <strong>{{ events24h() }}</strong></span>
              </div>
            }
          </div>
        </mat-tab>

        <!-- System Logs -->
        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon>list_alt</mat-icon>&nbsp;System Logs
          </ng-template>
          <div class="tab-content">
            @if (logsLoading()) {
              <div class="loading"><mat-spinner diameter="32"></mat-spinner></div>
            } @else if (logs().length === 0) {
              <p class="empty-text">No system logs</p>
            } @else {
              <div class="logs-container">
                @for (log of logs(); track log.id) {
                  <div class="log-entry" [class]="'log-' + log.level">
                    <span class="log-level">{{ log.level | uppercase }}</span>
                    <span class="log-source">{{ log.source }}</span>
                    <span class="log-message">{{ log.message }}</span>
                    <span class="log-time">{{ log.created_at | date:'short' }}</span>
                  </div>
                }
              </div>
            }
          </div>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
  styles: [`
    .admin-page { max-width: 1100px; margin: 0 auto; }
    h1 { margin: 0 0 24px; }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .stat-card { text-align: center; }
    .stat-card mat-icon {
      font-size: 28px; width: 28px; height: 28px;
      color: rgba(255,255,255,0.4);
      margin-bottom: 8px;
    }
    .stat-value { font-size: 2rem; font-weight: 700; }
    .stat-label { font-size: 12px; color: rgba(255,255,255,0.4); text-transform: uppercase; }
    .tab-content { padding: 16px 0; }
    .loading { text-align: center; padding: 32px; }
    .users-table { width: 100%; }
    .role-chip {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      margin-right: 4px;
    }
    .role-admin { background: rgba(244,67,54,0.15); color: #f44336; }
    .role-user { background: rgba(76,175,80,0.15); color: #4caf50; }
    .empty-text { text-align: center; color: rgba(255,255,255,0.4); padding: 32px; }
    .logs-container {
      max-height: 500px;
      overflow-y: auto;
    }
    .log-entry {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 12px;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      font-size: 13px;
    }
    .log-level {
      font-weight: 700;
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 3px;
      min-width: 40px;
      text-align: center;
    }
    .log-info .log-level { background: rgba(33,150,243,0.15); color: #2196f3; }
    .log-warn .log-level { background: rgba(255,152,0,0.15); color: #ff9800; }
    .log-error .log-level { background: rgba(244,67,54,0.15); color: #f44336; }
    .log-source { color: rgba(255,255,255,0.5); min-width: 120px; }
    .log-message { flex: 1; }
    .log-time { color: rgba(255,255,255,0.3); font-size: 11px; white-space: nowrap; }
    .userColumns { width: 100%; }
    .health-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 16px;
      margin-bottom: 16px;
    }
    .health-card { border-left: 3px solid transparent; }
    .health-healthy { border-left-color: #4caf50; }
    .health-degraded { border-left-color: #ff9800; }
    .health-down { border-left-color: #f44336; }
    .health-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .health-source { font-weight: 700; font-size: 14px; }
    .health-status {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      padding: 2px 8px;
      border-radius: 4px;
    }
    .health-healthy .health-status { background: rgba(76,175,80,0.15); color: #4caf50; }
    .health-degraded .health-status { background: rgba(255,152,0,0.15); color: #ff9800; }
    .health-down .health-status { background: rgba(244,67,54,0.15); color: #f44336; }
    .health-stats { display: flex; gap: 16px; margin-bottom: 8px; }
    .health-stat { display: flex; flex-direction: column; }
    .stat-num { font-size: 1.4rem; font-weight: 700; }
    .stat-num.success { color: #4caf50; }
    .stat-num.error { color: #f44336; }
    .stat-desc { font-size: 10px; color: rgba(255,255,255,0.4); }
    .health-time { font-size: 11px; color: rgba(255,255,255,0.4); }
    .health-time.error { color: rgba(244,67,54,0.5); }
    .events-24h {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      background: rgba(255,255,255,0.03);
      border-radius: 8px;
      font-size: 14px;
    }
    .events-24h mat-icon { color: #4caf50; }
  `]
})
export class AdminComponent implements OnInit {
  users = signal<UserInfo[]>([]);
  logs = signal<SystemLog[]>([]);
  stats = signal<SystemStats>({ totalUsers: 0, totalEvents: 0, totalAnalyses: 0, totalBias: 0 });
  sourceHealth = signal<SourceHealth[]>([]);
  events24h = signal(0);
  usersLoading = signal(true);
  logsLoading = signal(true);
  healthLoading = signal(true);

  userColumns = ['email', 'full_name', 'roles', 'created_at', 'actions'];

  constructor(
    private supabase: SupabaseService,
    private snackBar: MatSnackBar
  ) {}

  async ngOnInit() {
    await Promise.all([
      this.loadStats(),
      this.loadUsers(),
      this.loadLogs(),
      this.loadHealth()
    ]);
  }

  private async loadStats() {
    const [users, events, analyses, bias] = await Promise.all([
      this.supabase.from('profiles').select('id', { count: 'exact', head: true }),
      this.supabase.from('economic_events').select('id', { count: 'exact', head: true }),
      this.supabase.from('event_analyses').select('id', { count: 'exact', head: true }),
      this.supabase.from('daily_trade_bias').select('id', { count: 'exact', head: true })
    ]);
    this.stats.set({
      totalUsers: users.count ?? 0,
      totalEvents: events.count ?? 0,
      totalAnalyses: analyses.count ?? 0,
      totalBias: bias.count ?? 0
    });
  }

  private async loadUsers() {
    const { data: profiles } = await this.supabase.from('profiles')
      .select('id, email, full_name, created_at')
      .order('created_at', { ascending: false });

    const { data: userRoles } = await this.supabase.from('user_roles')
      .select('user_id, roles(name)');

    const roleMap = new Map<string, string[]>();
    (userRoles ?? []).forEach((ur: any) => {
      const existing = roleMap.get(ur.user_id) ?? [];
      if (ur.roles?.name) existing.push(ur.roles.name);
      roleMap.set(ur.user_id, existing);
    });

    this.users.set((profiles ?? []).map((p: any) => ({
      ...p,
      roles: roleMap.get(p.id) ?? ['user']
    })));
    this.usersLoading.set(false);
  }

  private async loadLogs() {
    const { data } = await this.supabase.from('system_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    this.logs.set((data ?? []) as SystemLog[]);
    this.logsLoading.set(false);
  }

  private async loadHealth() {
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // Get recent logs from fetch-events source
      const { data: recentLogs } = await this.supabase.from('system_logs')
        .select('level, message, created_at, metadata')
        .eq('source', 'fetch-events')
        .gte('created_at', since)
        .order('created_at', { ascending: false });

      // Count events in last 24h
      const { count } = await this.supabase.from('economic_events')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since);

      this.events24h.set(count ?? 0);

      // Parse source health from log messages
      const sources = ['finnhub', 'forexfactory', 'rss'];
      const health: SourceHealth[] = sources.map(source => {
        const logs = recentLogs ?? [];
        const successLogs = logs.filter(l => l.level === 'info' && l.message.includes(source));
        const errorLogs = logs.filter(l =>
          (l.level === 'error' || l.level === 'warn') &&
          (l.message.toLowerCase().includes(source) || l.message.toLowerCase().includes('failed'))
        );

        const lastSuccess = successLogs.length > 0 ? successLogs[0].created_at : null;
        const lastError = errorLogs.length > 0 ? errorLogs[0].created_at : null;

        let status: 'healthy' | 'degraded' | 'down' = 'healthy';
        if (successLogs.length === 0 && errorLogs.length > 0) status = 'down';
        else if (errorLogs.length > successLogs.length) status = 'degraded';

        return {
          source,
          lastSuccess,
          lastError,
          recentSuccesses: successLogs.length,
          recentErrors: errorLogs.length,
          status
        };
      });

      this.sourceHealth.set(health);
    } catch (err) {
      console.error('Failed to load health data:', err);
    } finally {
      this.healthLoading.set(false);
    }
  }

  async promoteToAdmin(userId: string) {
    const { data: adminRole } = await this.supabase.from('roles')
      .select('id')
      .eq('name', 'admin')
      .single();

    if (!adminRole) return;

    const { error } = await this.supabase.from('user_roles')
      .insert({ user_id: userId, role_id: adminRole.id });

    if (error) {
      this.snackBar.open('Failed to promote user', 'Close', { duration: 3000 });
    } else {
      this.snackBar.open('User promoted to admin', 'Close', { duration: 3000 });
      await this.loadUsers();
    }
  }
}
