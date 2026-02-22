import { Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DailyTradeBias, CurrencyPair } from '../../../core/models';

interface HeatmapCell {
  pair: CurrencyPair;
  bias: DailyTradeBias | null;
  color: string;
  textColor: string;
}

@Component({
  selector: 'app-market-heatmap',
  standalone: true,
  imports: [CommonModule, RouterLink, MatTooltipModule],
  template: `
    <div class="heatmap-container">
      <div class="heatmap-title">Market Heatmap</div>
      <div class="heatmap-grid">
        @for (cell of cells(); track cell.pair.id) {
          <div class="heatmap-cell"
               [style.background]="cell.color"
               [style.color]="cell.textColor"
               [routerLink]="['/pair-analysis', cell.pair.id]"
               [matTooltip]="getTooltip(cell)">
            <span class="cell-symbol">{{ cell.pair.symbol }}</span>
            @if (cell.bias) {
              <span class="cell-score">
                {{ cell.bias.bias_score > 0 ? '+' : '' }}{{ (cell.bias.bias_score * 100).toFixed(0) }}
              </span>
              <span class="cell-direction">{{ cell.bias.direction }}</span>
            } @else {
              <span class="cell-pending">--</span>
            }
          </div>
        }
      </div>
      <div class="heatmap-legend">
        <span class="legend-label">Bearish</span>
        <div class="legend-gradient"></div>
        <span class="legend-label">Bullish</span>
      </div>
    </div>
  `,
  styles: [`
    .heatmap-container { }
    .heatmap-title {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 12px;
      color: rgba(255,255,255,0.6);
    }
    .heatmap-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 4px;
    }
    .heatmap-cell {
      padding: 12px;
      border-radius: 8px;
      text-align: center;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .heatmap-cell:hover {
      transform: scale(1.03);
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    }
    .cell-symbol {
      display: block;
      font-weight: 700;
      font-size: 14px;
      margin-bottom: 4px;
    }
    .cell-score {
      display: block;
      font-size: 1.2rem;
      font-weight: 700;
    }
    .cell-direction {
      display: block;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
      opacity: 0.8;
    }
    .cell-pending {
      display: block;
      font-size: 1.2rem;
      opacity: 0.3;
    }
    .heatmap-legend {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 12px;
      justify-content: center;
    }
    .legend-label { font-size: 11px; color: rgba(255,255,255,0.4); }
    .legend-gradient {
      width: 120px;
      height: 8px;
      border-radius: 4px;
      background: linear-gradient(90deg, #f44336, #9e9e9e 50%, #4caf50);
    }
  `]
})
export class MarketHeatmapComponent {
  pairs = input<CurrencyPair[]>([]);
  biasData = input<DailyTradeBias[]>([]);

  cells = computed<HeatmapCell[]>(() => {
    const biasMap = new Map<string, DailyTradeBias>();
    this.biasData().forEach(b => biasMap.set(b.pair_id, b));

    return this.pairs().map(pair => {
      const bias = biasMap.get(pair.id) ?? null;
      const score = bias?.bias_score ?? 0;
      return {
        pair,
        bias,
        color: this.scoreToColor(score, !!bias),
        textColor: bias ? 'white' : 'rgba(255,255,255,0.3)'
      };
    });
  });

  private scoreToColor(score: number, hasBias: boolean): string {
    if (!hasBias) return 'rgba(255,255,255,0.03)';

    const absScore = Math.abs(score);
    const intensity = Math.min(absScore * 1.5, 1);

    if (score > 0.1) {
      return `rgba(76, 175, 80, ${0.1 + intensity * 0.4})`;
    } else if (score < -0.1) {
      return `rgba(244, 67, 54, ${0.1 + intensity * 0.4})`;
    } else {
      return `rgba(158, 158, 158, 0.1)`;
    }
  }

  getTooltip(cell: HeatmapCell): string {
    if (!cell.bias) return `${cell.pair.symbol} - Awaiting analysis`;
    const score = cell.bias.bias_score > 0 ? '+' : '';
    return `${cell.pair.symbol}: ${cell.bias.direction} (${score}${(cell.bias.bias_score * 100).toFixed(0)}) - Confidence: ${(cell.bias.confidence * 100).toFixed(0)}%`;
  }
}
