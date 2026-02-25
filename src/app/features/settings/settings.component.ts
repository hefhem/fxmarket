import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { AuthService } from '../../core/services/auth.service';
import { PushNotificationService } from '../../core/services/push-notification.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { ALL_PAIRS } from '../../core/models';

interface DataSource {
  id: string;
  source_name: string;
  display_name: string;
  description: string;
  enabled: boolean;
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatChipsModule, MatDividerModule,
    MatSnackBarModule, MatProgressSpinnerModule, MatSlideToggleModule
  ],
  template: `
    <div class="settings-page">
      <h1>Settings</h1>

      <!-- Profile Section -->
      <mat-card>
        <mat-card-header>
          <mat-card-title>
            <mat-icon>person</mat-icon> Profile
          </mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <form [formGroup]="profileForm" (ngSubmit)="saveProfile()">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Full Name</mat-label>
              <input matInput formControlName="full_name">
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Email</mat-label>
              <input matInput [value]="auth.currentUser()?.email" disabled>
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Timezone</mat-label>
              <mat-select formControlName="timezone">
                @for (tz of timezones; track tz) {
                  <mat-option [value]="tz">{{ timezoneLabels[tz] || tz }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Default Pairs</mat-label>
              <mat-select formControlName="default_pairs" multiple>
                @for (pair of allPairs; track pair) {
                  <mat-option [value]="pair">{{ pair }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <button mat-raised-button color="primary" type="submit" [disabled]="saving()">
              @if (saving()) {
                <mat-spinner diameter="18"></mat-spinner>
              } @else {
                Save Profile
              }
            </button>
          </form>
        </mat-card-content>
      </mat-card>

      <mat-divider></mat-divider>

      <!-- Password Section -->
      <mat-card>
        <mat-card-header>
          <mat-card-title>
            <mat-icon>lock</mat-icon> Change Password
          </mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <form [formGroup]="passwordForm" (ngSubmit)="changePassword()">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>New Password</mat-label>
              <input matInput formControlName="password" type="password">
              @if (passwordForm.get('password')?.hasError('minlength')) {
                <mat-error>Minimum 8 characters</mat-error>
              }
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Confirm New Password</mat-label>
              <input matInput formControlName="confirmPassword" type="password">
            </mat-form-field>

            @if (passwordForm.errors?.['mismatch'] && passwordForm.get('confirmPassword')?.touched) {
              <p class="error-text">Passwords do not match</p>
            }

            <button mat-raised-button color="warn" type="submit" [disabled]="changingPassword()">
              @if (changingPassword()) {
                <mat-spinner diameter="18"></mat-spinner>
              } @else {
                Change Password
              }
            </button>
          </form>
        </mat-card-content>
      </mat-card>

      <mat-divider></mat-divider>

      <!-- Push Notifications Section -->
      <mat-card>
        <mat-card-header>
          <mat-card-title>
            <mat-icon>notifications_active</mat-icon> Push Notifications
          </mat-card-title>
        </mat-card-header>
        <mat-card-content>
          @if (!pushService.isSupported()) {
            <p class="push-status">
              <mat-icon>info</mat-icon>
              Push notifications are not supported in this browser or require a production build with service worker enabled.
            </p>
          } @else {
            <p class="push-description">
              Receive browser push notifications when strong trade signals (STRONG BUY/SELL) are detected.
            </p>
            <div class="push-toggle-row">
              <mat-slide-toggle
                [checked]="pushService.isSubscribed()"
                (change)="togglePush($event.checked)"
                [disabled]="togglingPush()"
                color="primary">
                {{ pushService.isSubscribed() ? 'Enabled' : 'Disabled' }}
              </mat-slide-toggle>
              @if (togglingPush()) {
                <mat-spinner diameter="18"></mat-spinner>
              }
            </div>
            @if (pushService.permissionState() === 'denied') {
              <p class="error-text">
                <mat-icon>block</mat-icon>
                Notifications are blocked by your browser. Please allow notifications in your browser settings.
              </p>
            }
          }
        </mat-card-content>
      </mat-card>

      <mat-divider></mat-divider>

      <!-- Email Notifications Section -->
      <mat-card>
        <mat-card-header>
          <mat-card-title>
            <mat-icon>email</mat-icon> Email Notifications
          </mat-card-title>
        </mat-card-header>
        <mat-card-content>
          @if (!smtpActive()) {
            <p class="push-status">
              <mat-icon>info</mat-icon>
              Email notifications are not yet configured by your administrator. Contact your admin to set up SMTP.
            </p>
          } @else {
            <p class="push-description">
              Receive email alerts when strong trade signals (STRONG BUY/SELL) are detected. Emails are sent to your account email address.
            </p>
            <div class="push-toggle-row">
              <mat-slide-toggle
                [checked]="emailEnabled()"
                (change)="toggleEmail($event.checked)"
                [disabled]="togglingEmail()"
                color="primary">
                {{ emailEnabled() ? 'Enabled' : 'Disabled' }}
              </mat-slide-toggle>
              @if (togglingEmail()) {
                <mat-spinner diameter="18"></mat-spinner>
              }
            </div>
          }
        </mat-card-content>
      </mat-card>

      <mat-divider></mat-divider>

      <!-- Data Sources Section -->
      <mat-card>
        <mat-card-header>
          <mat-card-title>
            <mat-icon>cloud</mat-icon> Data Sources
          </mat-card-title>
        </mat-card-header>
        <mat-card-content>
          @if (sourcesLoading()) {
            <div class="loading"><mat-spinner diameter="24"></mat-spinner></div>
          } @else {
            <p class="push-description">Data sources that power economic event fetching and analysis.</p>
            <div class="sources-list">
              @for (src of dataSources(); track src.id) {
                <div class="source-row">
                  <div class="source-icon">
                    <mat-icon>{{ getSourceIcon(src.source_name) }}</mat-icon>
                  </div>
                  <div class="source-info">
                    <div class="source-name">{{ src.display_name }}</div>
                    <div class="source-desc">{{ src.description }}</div>
                  </div>
                  <div class="source-toggle">
                    @if (auth.isAdmin()) {
                      <mat-slide-toggle
                        [checked]="src.enabled"
                        (change)="toggleSource(src, $event.checked)"
                        color="primary">
                      </mat-slide-toggle>
                    } @else {
                      <span class="source-chip" [class.enabled]="src.enabled" [class.disabled]="!src.enabled">
                        {{ src.enabled ? 'Enabled' : 'Disabled' }}
                      </span>
                    }
                  </div>
                </div>
              }
            </div>
          }
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .settings-page { max-width: 600px; margin: 0 auto; }
    h1 { margin: 0 0 24px; }
    mat-card { margin-bottom: 24px; }
    mat-card-header { margin-bottom: 16px; }
    mat-card-title {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .full-width { width: 100%; }
    mat-divider { margin: 8px 0; }
    .error-text { color: #f44336; font-size: 12px; margin-bottom: 8px; display: flex; align-items: center; gap: 4px; }
    .error-text mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .push-status {
      display: flex;
      align-items: center;
      gap: 8px;
      color: rgba(255,255,255,0.5);
      font-size: 13px;
    }
    .push-status mat-icon { font-size: 18px; width: 18px; height: 18px; color: #ff9800; }
    .push-description { color: rgba(255,255,255,0.6); font-size: 13px; margin-bottom: 16px; }
    .push-toggle-row { display: flex; align-items: center; gap: 12px; }
    .loading { text-align: center; padding: 16px; }
    .sources-list { display: flex; flex-direction: column; gap: 12px; }
    .source-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      background: rgba(255,255,255,0.03);
      border-radius: 8px;
    }
    .source-icon mat-icon { color: rgba(255,255,255,0.4); }
    .source-info { flex: 1; }
    .source-name { font-weight: 600; font-size: 14px; }
    .source-desc { font-size: 12px; color: rgba(255,255,255,0.45); margin-top: 2px; }
    .source-chip {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
    }
    .source-chip.enabled { background: rgba(76,175,80,0.15); color: #4caf50; }
    .source-chip.disabled { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.35); }
  `]
})
export class SettingsComponent implements OnInit {
  profileForm: FormGroup;
  passwordForm: FormGroup;
  saving = signal(false);
  changingPassword = signal(false);
  allPairs = ALL_PAIRS;

  timezones = [
    'UTC', 'Africa/Lagos', 'America/New_York', 'America/Chicago', 'America/Denver',
    'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
    'Asia/Dubai', 'Asia/Kolkata', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Singapore',
    'Australia/Sydney', 'Pacific/Auckland'
  ];

  timezoneLabels: Record<string, string> = {
    'UTC': 'UTC (GMT+0)',
    'Africa/Lagos': 'Lagos (GMT+1 / WAT)',
    'America/New_York': 'New York (GMT-5 / EST)',
    'America/Chicago': 'Chicago (GMT-6 / CST)',
    'America/Denver': 'Denver (GMT-7 / MST)',
    'America/Los_Angeles': 'Los Angeles (GMT-8 / PST)',
    'Europe/London': 'London (GMT+0 / GMT)',
    'Europe/Paris': 'Paris (GMT+1 / CET)',
    'Europe/Berlin': 'Berlin (GMT+1 / CET)',
    'Asia/Dubai': 'Dubai (GMT+4 / GST)',
    'Asia/Kolkata': 'Kolkata (GMT+5:30 / IST)',
    'Asia/Tokyo': 'Tokyo (GMT+9 / JST)',
    'Asia/Shanghai': 'Shanghai (GMT+8 / CST)',
    'Asia/Singapore': 'Singapore (GMT+8 / SGT)',
    'Australia/Sydney': 'Sydney (GMT+11 / AEDT)',
    'Pacific/Auckland': 'Auckland (GMT+13 / NZDT)',
  };

  togglingPush = signal(false);
  smtpActive = signal(false);
  emailEnabled = signal(false);
  togglingEmail = signal(false);
  dataSources = signal<DataSource[]>([]);
  sourcesLoading = signal(true);

  constructor(
    public auth: AuthService,
    public pushService: PushNotificationService,
    private supabase: SupabaseService,
    private fb: FormBuilder,
    private snackBar: MatSnackBar
  ) {
    this.profileForm = this.fb.group({
      full_name: [''],
      timezone: ['UTC'],
      default_pairs: [['EUR/USD', 'GBP/USD', 'USD/JPY']]
    });

    this.passwordForm = this.fb.group({
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]]
    }, { validators: this.matchValidator });
  }

  private matchValidator(form: FormGroup) {
    return form.get('password')?.value === form.get('confirmPassword')?.value
      ? null : { mismatch: true };
  }

  ngOnInit() {
    const profile = this.auth.profile();
    if (profile) {
      this.profileForm.patchValue({
        full_name: profile.full_name || '',
        timezone: profile.timezone || 'UTC',
        default_pairs: profile.default_pairs || ['EUR/USD', 'GBP/USD', 'USD/JPY']
      });
      this.emailEnabled.set(!!(profile as any).email_notifications);
    }
    this.loadDataSources();
    this.loadSmtpStatus();
  }

  private async loadDataSources() {
    try {
      const { data } = await this.supabase.from('data_source_settings')
        .select('*')
        .order('display_name');
      this.dataSources.set((data ?? []) as DataSource[]);
    } catch (err) {
      console.error('Failed to load data sources:', err);
    } finally {
      this.sourcesLoading.set(false);
    }
  }

  async toggleSource(src: DataSource, enabled: boolean) {
    const { error } = await this.supabase.from('data_source_settings')
      .update({ enabled })
      .eq('id', src.id);

    if (error) {
      this.snackBar.open('Failed to update source', 'Close', { duration: 5000 });
    } else {
      src.enabled = enabled;
      this.snackBar.open(
        `${src.display_name} ${enabled ? 'enabled' : 'disabled'}`,
        'Close', { duration: 3000 }
      );
    }
  }

  getSourceIcon(name: string): string {
    const icons: Record<string, string> = {
      finnhub: 'show_chart',
      forexfactory: 'event_note',
      rss: 'rss_feed',
      alphavantage: 'trending_up',
      fred: 'account_balance'
    };
    return icons[name] || 'cloud';
  }

  async saveProfile() {
    this.saving.set(true);
    try {
      await this.auth.updateProfile(this.profileForm.value);
      this.snackBar.open('Profile updated', 'Close', { duration: 3000 });
    } catch (err: any) {
      this.snackBar.open(err.message || 'Failed to update profile', 'Close', { duration: 5000 });
    } finally {
      this.saving.set(false);
    }
  }

  async changePassword() {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    this.changingPassword.set(true);
    try {
      await this.auth.updatePassword(this.passwordForm.value.password);
      this.snackBar.open('Password changed', 'Close', { duration: 3000 });
      this.passwordForm.reset();
    } catch (err: any) {
      this.snackBar.open(err.message || 'Failed to change password', 'Close', { duration: 5000 });
    } finally {
      this.changingPassword.set(false);
    }
  }

  private async loadSmtpStatus() {
    try {
      const { data } = await this.supabase.from('smtp_settings')
        .select('is_active')
        .limit(1)
        .single();
      this.smtpActive.set(data?.is_active ?? false);
    } catch { /* SMTP table may not exist yet */ }
  }

  async toggleEmail(enabled: boolean) {
    this.togglingEmail.set(true);
    try {
      const user = this.auth.currentUser();
      if (!user) throw new Error('Not authenticated');
      const { error } = await this.supabase.from('profiles')
        .update({ email_notifications: enabled })
        .eq('id', user.id);
      if (error) throw error;
      this.emailEnabled.set(enabled);
      this.snackBar.open(
        enabled ? 'Email notifications enabled' : 'Email notifications disabled',
        'Close', { duration: 3000 }
      );
    } catch (err: any) {
      this.snackBar.open(err.message || 'Failed to update email preference', 'Close', { duration: 5000 });
    } finally {
      this.togglingEmail.set(false);
    }
  }

  async togglePush(enabled: boolean) {
    this.togglingPush.set(true);
    try {
      const success = enabled
        ? await this.pushService.subscribe()
        : await this.pushService.unsubscribe();

      if (success) {
        this.snackBar.open(
          enabled ? 'Push notifications enabled' : 'Push notifications disabled',
          'Close', { duration: 3000 }
        );
      } else {
        this.snackBar.open('Failed to update push notifications', 'Close', { duration: 5000 });
      }
    } catch (err: any) {
      this.snackBar.open(err.message || 'Failed to update push notifications', 'Close', { duration: 5000 });
    } finally {
      this.togglingPush.set(false);
    }
  }
}
