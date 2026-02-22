import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-bias-badge',
  standalone: true,
  imports: [CommonModule, MatChipsModule, MatIconModule],
  template: `
    <span class="bias-badge" [class]="direction()">
      <mat-icon class="bias-icon">
        @switch (direction()) {
          @case ('bullish') { trending_up }
          @case ('bearish') { trending_down }
          @default { trending_flat }
        }
      </mat-icon>
      {{ direction() | titlecase }}
    </span>
  `,
  styles: [`
    .bias-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 12px;
      border-radius: 16px;
      font-size: 13px;
      font-weight: 500;
    }
    .bias-icon { font-size: 16px; width: 16px; height: 16px; }
    .bullish { background: rgba(76, 175, 80, 0.15); color: #4caf50; }
    .bearish { background: rgba(244, 67, 54, 0.15); color: #f44336; }
    .neutral { background: rgba(158, 158, 158, 0.15); color: #9e9e9e; }
  `]
})
export class BiasBadgeComponent {
  direction = input<'bullish' | 'bearish' | 'neutral'>('neutral');
}
