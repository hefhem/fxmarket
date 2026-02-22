import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterLink,
    MatCardModule, MatFormFieldModule, MatInputModule,
    MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatSnackBarModule
  ],
  template: `
    <div class="auth-container">
      <mat-card class="auth-card">
        <mat-card-header>
          <mat-card-title>
            <mat-icon>lock_reset</mat-icon>
            Reset Password
          </mat-card-title>
          <mat-card-subtitle>Enter your email to receive a reset link</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          @if (!emailSent()) {
            <form [formGroup]="form" (ngSubmit)="onSubmit()">
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Email</mat-label>
                <input matInput formControlName="email" type="email" placeholder="you@example.com">
                @if (form.get('email')?.hasError('required') && form.get('email')?.touched) {
                  <mat-error>Email is required</mat-error>
                }
              </mat-form-field>

              <button mat-raised-button color="primary" type="submit"
                      class="full-width submit-btn" [disabled]="loading()">
                @if (loading()) {
                  <mat-spinner diameter="20"></mat-spinner>
                } @else {
                  Send Reset Link
                }
              </button>
            </form>
          } @else {
            <div class="success-message">
              <mat-icon class="success-icon">check_circle</mat-icon>
              <p>Password reset email sent! Check your inbox.</p>
            </div>
          }
        </mat-card-content>
        <mat-card-actions align="end">
          <a mat-button routerLink="/auth/login">Back to Sign In</a>
        </mat-card-actions>
      </mat-card>
    </div>
  `,
  styles: [`
    .auth-container {
      display: flex; justify-content: center; align-items: center;
      min-height: 100vh;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
    }
    .auth-card { width: 100%; max-width: 420px; margin: 16px; }
    mat-card-header { justify-content: center; margin-bottom: 24px; }
    mat-card-title { display: flex; align-items: center; gap: 8px; font-size: 1.5rem; }
    .full-width { width: 100%; }
    .submit-btn { margin-top: 8px; height: 48px; font-size: 16px; }
    .success-message { text-align: center; padding: 24px 0; }
    .success-icon { font-size: 48px; width: 48px; height: 48px; color: #4caf50; }
    mat-card-actions { padding: 8px 16px; }
  `]
})
export class ForgotPasswordComponent {
  form: FormGroup;
  loading = signal(false);
  emailSent = signal(false);

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private snackBar: MatSnackBar
  ) {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]]
    });
  }

  async onSubmit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    try {
      await this.auth.resetPassword(this.form.value.email);
      this.emailSent.set(true);
    } catch (err: any) {
      this.snackBar.open(err.message || 'Failed to send reset email', 'Close', { duration: 5000 });
    } finally {
      this.loading.set(false);
    }
  }
}
