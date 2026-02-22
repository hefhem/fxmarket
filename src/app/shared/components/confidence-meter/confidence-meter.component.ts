import { Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatProgressBarModule } from '@angular/material/progress-bar';

@Component({
  selector: 'app-confidence-meter',
  standalone: true,
  imports: [CommonModule, MatProgressBarModule],
  template: `
    <div class="confidence-meter">
      <div class="confidence-bar">
        <div class="confidence-fill" [style.width.%]="percentage()" [style.background]="barColor()"></div>
      </div>
      <span class="confidence-text" [style.color]="barColor()">{{ percentage() }}%</span>
    </div>
  `,
  styles: [`
    .confidence-meter {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .confidence-bar {
      flex: 1;
      height: 6px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 3px;
      overflow: hidden;
    }
    .confidence-fill {
      height: 100%;
      border-radius: 3px;
      transition: width 0.3s ease;
    }
    .confidence-text {
      font-size: 12px;
      font-weight: 600;
      min-width: 36px;
      text-align: right;
    }
  `]
})
export class ConfidenceMeterComponent {
  value = input(0);

  percentage = computed(() => Math.round(this.value() * 100));

  barColor = computed(() => {
    const pct = this.percentage();
    if (pct >= 70) return '#4caf50';
    if (pct >= 40) return '#ff9800';
    return '#f44336';
  });
}
