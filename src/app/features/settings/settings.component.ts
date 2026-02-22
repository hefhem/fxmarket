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
import { AuthService } from '../../core/services/auth.service';
import { G7_PAIRS } from '../../core/models';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatChipsModule, MatDividerModule,
    MatSnackBarModule, MatProgressSpinnerModule
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
                  <mat-option [value]="tz">{{ tz }}</mat-option>
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
    .error-text { color: #f44336; font-size: 12px; margin-bottom: 8px; }
  `]
})
export class SettingsComponent implements OnInit {
  profileForm: FormGroup;
  passwordForm: FormGroup;
  saving = signal(false);
  changingPassword = signal(false);
  allPairs = G7_PAIRS;

  timezones = [
    'UTC', 'America/New_York', 'America/Chicago', 'America/Denver',
    'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
    'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Singapore', 'Australia/Sydney',
    'Pacific/Auckland'
  ];

  constructor(
    public auth: AuthService,
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
    }
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
}
