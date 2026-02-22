import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { CurrencyPair } from '../../core/models';

@Component({
  selector: 'app-add-pair-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatListModule, MatIconModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Add Pair to Watchlist</h2>
    <mat-dialog-content>
      @if (data.pairs.length === 0) {
        <p class="empty-text">All pairs are already in your watchlist!</p>
      } @else {
        <mat-selection-list [multiple]="false">
          @for (pair of data.pairs; track pair.id) {
            <mat-list-option (click)="select(pair.id)">
              <div class="pair-option">
                <span class="flag">{{ getFlag(pair.base_currency) }}</span>
                <span class="symbol">{{ pair.symbol }}</span>
                <span class="name">{{ pair.display_name }}</span>
              </div>
            </mat-list-option>
          }
        </mat-selection-list>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .empty-text { text-align: center; color: rgba(255,255,255,0.4); padding: 24px; }
    .pair-option { display: flex; align-items: center; gap: 8px; }
    .flag { font-size: 1.2rem; }
    .symbol { font-weight: 600; }
    .name { font-size: 12px; color: rgba(255,255,255,0.5); }
  `]
})
export class AddPairDialogComponent {
  private readonly flagMap: Record<string, string> = {
    EUR: '\u{1F1EA}\u{1F1FA}', USD: '\u{1F1FA}\u{1F1F8}', GBP: '\u{1F1EC}\u{1F1E7}',
    JPY: '\u{1F1EF}\u{1F1F5}', CHF: '\u{1F1E8}\u{1F1ED}', AUD: '\u{1F1E6}\u{1F1FA}',
    CAD: '\u{1F1E8}\u{1F1E6}', NZD: '\u{1F1F3}\u{1F1FF}'
  };

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: { pairs: CurrencyPair[] },
    private dialogRef: MatDialogRef<AddPairDialogComponent>
  ) {}

  select(pairId: string) {
    this.dialogRef.close(pairId);
  }

  getFlag(currency: string): string {
    return this.flagMap[currency] ?? '';
  }
}
