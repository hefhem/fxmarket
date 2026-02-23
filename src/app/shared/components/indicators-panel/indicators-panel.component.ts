import { Component, input, computed, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TechnicalAnalysisService } from '../../../core/services/technical-analysis.service';
import { TechnicalIndicator, TA_SIGNAL_LABELS, TA_SIGNAL_COLORS } from '../../../core/models';

@Component({
  selector: 'app-indicators-panel',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    @if (loading()) {
      <div class="panel-loading">
        <mat-spinner diameter="24"></mat-spinner>
      </div>
    } @else if (!indicator()) {
      <div class="panel-empty">No technical indicators available yet.</div>
    } @else {
      <div class="indicators-grid">
        <!-- TA Signal Badge -->
        <div class="indicator-card signal-card">
          <div class="indicator-label">TA Signal</div>
          <div class="signal-badge" [style.background]="signalColor()">
            {{ signalLabel() }}
          </div>
          <div class="ta-score-bar">
            <div class="score-track">
              <div class="score-marker" [style.left.%]="scorePosition()"></div>
            </div>
            <div class="score-labels">
              <span>-1.0</span>
              <span>0</span>
              <span>+1.0</span>
            </div>
          </div>
          <div class="score-value" [style.color]="signalColor()">
            {{ indicator()!.ta_score > 0 ? '+' : '' }}{{ indicator()!.ta_score }}
          </div>
        </div>

        <!-- RSI -->
        <div class="indicator-card">
          <div class="indicator-label">RSI (14)</div>
          <div class="rsi-gauge">
            <div class="rsi-bar">
              <div class="rsi-fill" [style.width.%]="rsiValue()" [style.background]="rsiColor()"></div>
            </div>
            <span class="rsi-value" [style.color]="rsiColor()">{{ rsiDisplay() }}</span>
          </div>
          <div class="rsi-zone" [style.color]="rsiColor()">{{ rsiZone() }}</div>
        </div>

        <!-- MACD -->
        <div class="indicator-card">
          <div class="indicator-label">MACD (12,26,9)</div>
          <div class="macd-status">
            <mat-icon [style.color]="macdColor()">{{ macdIcon() }}</mat-icon>
            <span [style.color]="macdColor()">{{ macdStatus() }}</span>
          </div>
          <div class="macd-values">
            <span>Line: {{ formatNum(indicator()!.macd_line) }}</span>
            <span>Signal: {{ formatNum(indicator()!.macd_signal) }}</span>
          </div>
        </div>

        <!-- Moving Averages -->
        <div class="indicator-card">
          <div class="indicator-label">Moving Averages</div>
          <div class="ma-list">
            <div class="ma-row">
              <span class="ma-name" style="color: #ff9800;">SMA 20</span>
              <span>{{ formatPrice(indicator()!.sma_20) }}</span>
            </div>
            <div class="ma-row">
              <span class="ma-name" style="color: #2196f3;">SMA 50</span>
              <span>{{ formatPrice(indicator()!.sma_50) }}</span>
            </div>
            <div class="ma-row">
              <span class="ma-name" style="color: #e040fb;">SMA 200</span>
              <span>{{ formatPrice(indicator()!.sma_200) }}</span>
            </div>
          </div>
        </div>

        <!-- Support / Resistance -->
        <div class="indicator-card">
          <div class="indicator-label">Support / Resistance</div>
          <div class="sr-values">
            <div class="sr-row">
              <mat-icon style="color: #4caf50; font-size: 16px; width: 16px; height: 16px;">arrow_downward</mat-icon>
              <span class="sr-label">Support</span>
              <span class="sr-price" style="color: #4caf50;">{{ formatPrice(indicator()!.support_level) }}</span>
            </div>
            <div class="sr-row">
              <mat-icon style="color: #f44336; font-size: 16px; width: 16px; height: 16px;">arrow_upward</mat-icon>
              <span class="sr-label">Resistance</span>
              <span class="sr-price" style="color: #f44336;">{{ formatPrice(indicator()!.resistance_level) }}</span>
            </div>
          </div>
        </div>

        <!-- ATR -->
        <div class="indicator-card">
          <div class="indicator-label">ATR (14)</div>
          <div class="atr-value">{{ formatPrice(indicator()!.atr_14) }}</div>
          <div class="atr-desc">Average True Range (volatility)</div>
        </div>
      </div>
    }
  `,
  styles: [`
    .panel-loading, .panel-empty {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      color: rgba(255,255,255,0.5);
      font-size: 14px;
    }
    .indicators-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 12px;
    }
    .indicator-card {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 8px;
      padding: 12px;
    }
    .indicator-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: rgba(255,255,255,0.4);
      margin-bottom: 8px;
    }
    .signal-card {
      grid-column: span 2;
    }
    .signal-badge {
      display: inline-block;
      padding: 4px 16px;
      border-radius: 16px;
      font-size: 14px;
      font-weight: 700;
      color: white;
      margin-bottom: 8px;
    }
    .ta-score-bar {
      margin: 8px 0;
    }
    .score-track {
      position: relative;
      height: 6px;
      background: linear-gradient(to right, #f44336, #9e9e9e 50%, #4caf50);
      border-radius: 3px;
    }
    .score-marker {
      position: absolute;
      top: -3px;
      width: 12px;
      height: 12px;
      background: white;
      border-radius: 50%;
      transform: translateX(-50%);
      box-shadow: 0 1px 4px rgba(0,0,0,0.5);
    }
    .score-labels {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: rgba(255,255,255,0.3);
      margin-top: 2px;
    }
    .score-value {
      font-size: 20px;
      font-weight: 700;
    }
    .rsi-gauge {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .rsi-bar {
      flex: 1;
      height: 8px;
      background: rgba(255,255,255,0.1);
      border-radius: 4px;
      overflow: hidden;
    }
    .rsi-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.3s ease;
    }
    .rsi-value {
      font-size: 18px;
      font-weight: 700;
      min-width: 36px;
    }
    .rsi-zone {
      font-size: 12px;
      margin-top: 4px;
    }
    .macd-status {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 14px;
      font-weight: 600;
    }
    .macd-values {
      display: flex;
      gap: 12px;
      font-size: 11px;
      color: rgba(255,255,255,0.5);
      margin-top: 6px;
    }
    .ma-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .ma-row {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
    }
    .ma-name {
      font-weight: 600;
    }
    .sr-values {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .sr-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .sr-label {
      font-size: 12px;
      color: rgba(255,255,255,0.5);
      flex: 1;
    }
    .sr-price {
      font-size: 14px;
      font-weight: 600;
    }
    .atr-value {
      font-size: 20px;
      font-weight: 700;
      color: #ff9800;
    }
    .atr-desc {
      font-size: 11px;
      color: rgba(255,255,255,0.4);
      margin-top: 4px;
    }
    @media (max-width: 600px) {
      .signal-card {
        grid-column: span 1;
      }
    }
  `]
})
export class IndicatorsPanelComponent {
  pairId = input.required<string>();
  loading = signal(false);
  indicator = signal<TechnicalIndicator | null>(null);

  constructor(private taService: TechnicalAnalysisService) {
    effect(() => {
      const id = this.pairId();
      if (id) this.loadIndicator(id);
    });
  }

  private async loadIndicator(pairId: string) {
    this.loading.set(true);
    try {
      const ind = await this.taService.fetchLatestIndicator(pairId);
      this.indicator.set(ind);
    } catch {
      this.indicator.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  signalLabel = computed(() => {
    const ind = this.indicator();
    if (!ind) return '';
    return TA_SIGNAL_LABELS[ind.ta_signal] ?? ind.ta_signal.toUpperCase();
  });

  signalColor = computed(() => {
    const ind = this.indicator();
    if (!ind) return '#9e9e9e';
    return TA_SIGNAL_COLORS[ind.ta_signal] ?? '#9e9e9e';
  });

  scorePosition = computed(() => {
    const ind = this.indicator();
    if (!ind) return 50;
    return ((ind.ta_score + 1) / 2) * 100;
  });

  rsiValue = computed(() => this.indicator()?.rsi_14 ?? 50);
  rsiDisplay = computed(() => this.indicator()?.rsi_14?.toFixed(1) ?? '--');

  rsiColor = computed(() => {
    const rsi = this.indicator()?.rsi_14;
    if (rsi == null) return '#9e9e9e';
    if (rsi < 30) return '#4caf50';
    if (rsi > 70) return '#f44336';
    return '#9e9e9e';
  });

  rsiZone = computed(() => {
    const rsi = this.indicator()?.rsi_14;
    if (rsi == null) return '';
    if (rsi < 30) return 'Oversold';
    if (rsi > 70) return 'Overbought';
    return 'Neutral';
  });

  macdColor = computed(() => {
    const hist = this.indicator()?.macd_histogram;
    if (hist == null) return '#9e9e9e';
    return hist >= 0 ? '#4caf50' : '#f44336';
  });

  macdIcon = computed(() => {
    const hist = this.indicator()?.macd_histogram;
    if (hist == null) return 'remove';
    return hist >= 0 ? 'trending_up' : 'trending_down';
  });

  macdStatus = computed(() => {
    const ind = this.indicator();
    if (!ind || ind.macd_line == null || ind.macd_signal == null) return 'N/A';
    if (ind.macd_line > ind.macd_signal) return 'Bullish Cross';
    if (ind.macd_line < ind.macd_signal) return 'Bearish Cross';
    return 'Neutral';
  });

  formatNum(val: number | null): string {
    if (val == null) return '--';
    return val.toFixed(6);
  }

  formatPrice(val: number | null): string {
    if (val == null) return '--';
    return val.toFixed(val >= 100 ? 2 : 5);
  }
}
