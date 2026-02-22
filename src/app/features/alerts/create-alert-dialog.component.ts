import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSliderModule } from '@angular/material/slider';
import { CurrencyPair } from '../../core/models';

@Component({
  selector: 'app-create-alert-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule,
    MatFormFieldModule, MatSelectModule, MatInputModule,
    MatButtonModule, MatSliderModule
  ],
  template: `
    <h2 mat-dialog-title>Create Alert Rule</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Alert Type</mat-label>
        <mat-select [(value)]="alertType">
          <mat-option value="bias_change">Bias Change</mat-option>
          <mat-option value="high_impact_event">High Impact Event</mat-option>
          <mat-option value="confidence_threshold">Confidence Threshold</mat-option>
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Currency Pair (optional)</mat-label>
        <mat-select [(value)]="selectedPairId">
          <mat-option value="">All Pairs</mat-option>
          @for (pair of data.pairs; track pair.id) {
            <mat-option [value]="pair.id">{{ pair.symbol }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      @if (alertType === 'bias_change') {
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Direction</mat-label>
          <mat-select [(value)]="direction">
            <mat-option value="">Any</mat-option>
            <mat-option value="bullish">Bullish</mat-option>
            <mat-option value="bearish">Bearish</mat-option>
          </mat-select>
        </mat-form-field>
      }

      @if (alertType === 'confidence_threshold') {
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Minimum Confidence (0-100%)</mat-label>
          <input matInput type="number" [(ngModel)]="threshold" min="0" max="100" step="5">
        </mat-form-field>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-raised-button color="primary" (click)="create()">Create</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .full-width { width: 100%; }
    mat-dialog-content { min-width: 350px; }
  `]
})
export class CreateAlertDialogComponent {
  alertType = 'bias_change';
  selectedPairId = '';
  direction = '';
  threshold = 70;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: { pairs: CurrencyPair[] },
    private dialogRef: MatDialogRef<CreateAlertDialogComponent>
  ) {}

  create() {
    const conditions: Record<string, unknown> = {};
    if (this.alertType === 'bias_change' && this.direction) {
      conditions['direction'] = this.direction;
    }
    if (this.alertType === 'confidence_threshold') {
      conditions['threshold'] = this.threshold / 100;
    }

    this.dialogRef.close({
      alert_type: this.alertType,
      pair_id: this.selectedPairId || null,
      conditions,
      is_active: true
    });
  }
}
