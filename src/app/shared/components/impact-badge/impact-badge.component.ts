import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-impact-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="impact-badge" [class]="impact()">
      {{ impact() | titlecase }}
    </span>
  `,
  styles: [`
    .impact-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .high { background: rgba(244, 67, 54, 0.15); color: #f44336; }
    .medium { background: rgba(255, 152, 0, 0.15); color: #ff9800; }
    .low { background: rgba(158, 158, 158, 0.15); color: #9e9e9e; }
  `]
})
export class ImpactBadgeComponent {
  impact = input<'low' | 'medium' | 'high'>('low');
}
