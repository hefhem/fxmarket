import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SignalsService } from '../../core/services/signals.service';
import { AuthService } from '../../core/services/auth.service';
import { ConfidenceMeterComponent } from '../../shared/components/confidence-meter/confidence-meter.component';
import { SignalType, TradeSignal } from '../../core/models';

@Component({
  selector: 'app-trade-signals',
  standalone: true,
  imports: [
    CommonModule, RouterLink,
    MatCardModule, MatIconModule, MatButtonModule,
    MatProgressSpinnerModule, MatChipsModule, MatTooltipModule,
    ConfidenceMeterComponent
  ],
  template: `
    <div class="signals-page">
      <div class="page-header">
        <div>
          <h1>Trade Signals</h1>
          <p class="subtitle">AI-generated actionable trade signals for G7 pairs</p>
        </div>
        <button mat-stroked-button (click)="refresh()" [disabled]="signalsService.loading()">
          <mat-icon>refresh</mat-icon> Refresh
        </button>
      </div>

      <!-- Signal Summary Chips -->
      @if (!signalsService.loading() && signalsService.signals().length > 0) {
        <div class="summary-chips">
          <div class="chip strong-buy-chip">
            <mat-icon>rocket_launch</mat-icon>
            <span>Strong Buy: {{ signalsService.signalCounts().strongBuy }}</span>
          </div>
          <div class="chip buy-chip">
            <mat-icon>trending_up</mat-icon>
            <span>Buy: {{ signalsService.signalCounts().buy }}</span>
          </div>
          <div class="chip hold-chip">
            <mat-icon>trending_flat</mat-icon>
            <span>Hold: {{ signalsService.signalCounts().hold }}</span>
          </div>
          <div class="chip sell-chip">
            <mat-icon>trending_down</mat-icon>
            <span>Sell: {{ signalsService.signalCounts().sell }}</span>
          </div>
          <div class="chip strong-sell-chip">
            <mat-icon>crisis_alert</mat-icon>
            <span>Strong Sell: {{ signalsService.signalCounts().strongSell }}</span>
          </div>
        </div>
      }

      <!-- Signal Cards Grid -->
      @if (signalsService.loading()) {
        <div class="loading-container">
          <mat-spinner diameter="40"></mat-spinner>
          <p>Loading trade signals...</p>
        </div>
      } @else if (signalsService.signals().length === 0) {
        <mat-card class="empty-card">
          <mat-card-content>
            <mat-icon class="empty-icon">candlestick_chart</mat-icon>
            <h3>No Signals Available</h3>
            <p>Trade signals are generated when the daily bias analysis runs. Check back after the next analysis cycle.</p>
          </mat-card-content>
        </mat-card>
      } @else {
        <div class="signals-grid">
          @for (sig of signalsService.signals(); track sig.pair_id) {
            <mat-card class="signal-card" [class]="getCardClass(sig.signal)"
                      [routerLink]="['/pair-analysis', sig.pair_id]"
                      matTooltip="Click for detailed pair analysis">
              <mat-card-content>
                <!-- Signal Badge -->
                <div class="signal-badge-row">
                  <div class="signal-badge" [class]="getSignalClass(sig.signal)">
                    <mat-icon>{{ getSignalIcon(sig.signal) }}</mat-icon>
                    <span>{{ sig.signal }}</span>
                  </div>
                </div>

                <!-- Pair Info -->
                <div class="pair-row">
                  <span class="pair-symbol">{{ sig.pair_symbol }}</span>
                  <span class="pair-name">{{ sig.display_name }}</span>
                </div>

                <!-- Score Bars -->
                <div class="scores-section">
                  <div class="score-row">
                    <span class="score-label">Fundamental</span>
                    <div class="score-bar-wrapper">
                      <div class="bias-bar-track">
                        <div class="bias-bar-center"></div>
                        <div class="bias-bar-fill"
                             [style.width.%]="getBarWidth(sig.bias_score)"
                             [style.left.%]="getBarLeft(sig.bias_score)"
                             [class]="sig.direction">
                        </div>
                      </div>
                    </div>
                    <span class="score-num" [class]="sig.direction">
                      {{ sig.bias_score > 0 ? '+' : '' }}{{ (sig.bias_score * 100).toFixed(0) }}
                    </span>
                  </div>
                  @if (sig.ta_score != null) {
                    <div class="score-row">
                      <span class="score-label">Technical</span>
                      <div class="score-bar-wrapper">
                        <div class="bias-bar-track">
                          <div class="bias-bar-center"></div>
                          <div class="bias-bar-fill"
                               [style.width.%]="getBarWidth(sig.ta_score!)"
                               [style.left.%]="getBarLeft(sig.ta_score!)"
                               [class]="sig.ta_score! > 0.1 ? 'bullish' : sig.ta_score! < -0.1 ? 'bearish' : 'neutral'">
                          </div>
                        </div>
                      </div>
                      <span class="score-num" [class]="sig.ta_score! > 0.1 ? 'bullish' : sig.ta_score! < -0.1 ? 'bearish' : 'neutral'">
                        {{ sig.ta_score! > 0 ? '+' : '' }}{{ (sig.ta_score! * 100).toFixed(0) }}
                      </span>
                    </div>
                  }
                  @if (sig.combined_score != null) {
                    <div class="score-row combined-row">
                      <span class="score-label">Combined</span>
                      <div class="score-bar-wrapper">
                        <div class="bias-bar-track">
                          <div class="bias-bar-center"></div>
                          <div class="bias-bar-fill"
                               [style.width.%]="getBarWidth(sig.combined_score!)"
                               [style.left.%]="getBarLeft(sig.combined_score!)"
                               [class]="sig.combined_score! > 0.1 ? 'bullish' : sig.combined_score! < -0.1 ? 'bearish' : 'neutral'">
                          </div>
                        </div>
                      </div>
                      <span class="score-num" [class]="sig.combined_score! > 0.1 ? 'bullish' : sig.combined_score! < -0.1 ? 'bearish' : 'neutral'">
                        {{ sig.combined_score! > 0 ? '+' : '' }}{{ (sig.combined_score! * 100).toFixed(0) }}
                      </span>
                    </div>
                  }
                </div>

                <!-- Agreement Indicator -->
                @if (sig.ta_score != null) {
                  <div class="agreement-row" [class]="getAgreementClass(sig)">
                    <mat-icon>{{ getAgreementIcon(sig) }}</mat-icon>
                    <span>{{ getAgreementText(sig) }}</span>
                  </div>
                }

                <!-- Confidence -->
                <div class="confidence-row">
                  <span class="confidence-label">Confidence</span>
                  <app-confidence-meter [value]="sig.confidence" />
                </div>

                <!-- Trade Timing -->
                @if (sig.recommended_entry_timing) {
                  <div class="timing-row">
                    <mat-icon>schedule</mat-icon>
                    <div class="timing-content">
                      <span class="timing-text">{{ sig.recommended_entry_timing }}</span>
                      @if (sig.entry_start_utc && sig.entry_end_utc) {
                        <span class="timing-local">{{ getUserTimezone() }}: <strong>{{ formatToUserTz(sig.entry_start_utc) }} &ndash; {{ formatToUserTz(sig.entry_end_utc) }}</strong></span>
                      }
                    </div>
                  </div>
                }

                <!-- Entry Levels -->
                @if (sig.open_price || sig.stop_loss || sig.take_profit) {
                  <div class="entry-levels-row">
                    @if (sig.open_price) {
                      <div class="level-chip level-open">
                        <span class="level-lbl">Open</span>
                        <span class="level-val">{{ sig.open_price.toFixed(5) }}</span>
                      </div>
                    }
                    @if (sig.stop_loss) {
                      <div class="level-chip level-sl">
                        <span class="level-lbl">SL</span>
                        <span class="level-val">{{ sig.stop_loss.toFixed(5) }}</span>
                      </div>
                    }
                    @if (sig.take_profit) {
                      <div class="level-chip level-tp">
                        <span class="level-lbl">TP</span>
                        <span class="level-val">{{ sig.take_profit.toFixed(5) }}</span>
                      </div>
                    }
                  </div>
                }

                <!-- AI Reasoning -->
                <p class="reasoning">{{ sig.ai_reasoning }}</p>

                <!-- Footer -->
                <div class="card-footer">
                  <div class="ai-tag">
                    <mat-icon>psychology</mat-icon>
                    <span>AI Generated</span>
                  </div>
                  <span class="timestamp">{{ formatTime(sig.updated_at) }}</span>
                </div>
              </mat-card-content>
            </mat-card>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .signals-page { max-width: 1280px; margin: 0 auto; }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
      flex-wrap: wrap;
      gap: 16px;
    }
    .page-header h1 { margin: 0 0 4px; font-size: 1.8rem; }
    .subtitle { color: rgba(255,255,255,0.5); font-size: 14px; margin: 0; }

    .summary-chips {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 24px;
    }
    .chip {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 600;
    }
    .chip mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .strong-buy-chip { background: rgba(0,230,118,0.15); color: #00e676; }
    .buy-chip { background: rgba(76,175,80,0.15); color: #4caf50; }
    .hold-chip { background: rgba(158,158,158,0.15); color: #9e9e9e; }
    .sell-chip { background: rgba(244,67,54,0.15); color: #f44336; }
    .strong-sell-chip { background: rgba(255,23,68,0.15); color: #ff1744; }

    .loading-container {
      text-align: center;
      padding: 48px;
      color: rgba(255,255,255,0.5);
    }
    .empty-card {
      text-align: center;
      padding: 48px 24px;
    }
    .empty-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: rgba(255,255,255,0.15);
      margin-bottom: 16px;
    }
    .empty-card h3 { margin: 0 0 8px; }
    .empty-card p { color: rgba(255,255,255,0.5); margin: 0; }

    .signals-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 16px;
    }

    .signal-card {
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
      border-left: 4px solid transparent;
    }
    .signal-card:hover {
      transform: translateY(-3px);
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4);
    }
    .signal-card-strong-buy { border-left-color: #00e676; }
    .signal-card-buy { border-left-color: #4caf50; }
    .signal-card-hold { border-left-color: #9e9e9e; }
    .signal-card-sell { border-left-color: #f44336; }
    .signal-card-strong-sell { border-left-color: #ff1744; }

    .signal-badge-row { margin-bottom: 12px; }
    .signal-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 6px;
      font-weight: 700;
      font-size: 14px;
      letter-spacing: 0.5px;
    }
    .signal-badge mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .signal-strong-buy { background: rgba(0,230,118,0.2); color: #00e676; }
    .signal-buy { background: rgba(76,175,80,0.2); color: #4caf50; }
    .signal-hold { background: rgba(158,158,158,0.2); color: #9e9e9e; }
    .signal-sell { background: rgba(244,67,54,0.2); color: #f44336; }
    .signal-strong-sell { background: rgba(255,23,68,0.2); color: #ff1744; }

    .pair-row {
      display: flex;
      align-items: baseline;
      gap: 8px;
      margin-bottom: 16px;
    }
    .pair-symbol { font-size: 1.3rem; font-weight: 600; }
    .pair-name { font-size: 12px; color: rgba(255,255,255,0.4); }

    .scores-section { margin-bottom: 12px; display: flex; flex-direction: column; gap: 6px; }
    .score-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .score-label { font-size: 11px; color: rgba(255,255,255,0.4); min-width: 76px; }
    .score-bar-wrapper { flex: 1; }
    .score-num { font-size: 13px; font-weight: 700; min-width: 32px; text-align: right; }
    .score-num.bullish { color: #4caf50; }
    .score-num.bearish { color: #f44336; }
    .score-num.neutral { color: #9e9e9e; }
    .combined-row { border-top: 1px solid rgba(255,255,255,0.06); padding-top: 6px; }
    .agreement-row {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      padding: 4px 10px;
      border-radius: 6px;
      margin-bottom: 12px;
    }
    .agreement-row mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .agreement-agree { background: rgba(76,175,80,0.1); color: #4caf50; }
    .agreement-conflict { background: rgba(255,152,0,0.1); color: #ff9800; }

    .bias-bar-track {
      position: relative;
      height: 6px;
      background: rgba(255,255,255,0.05);
      border-radius: 3px;
      overflow: hidden;
    }
    .bias-bar-center {
      position: absolute;
      left: 50%;
      top: 0;
      bottom: 0;
      width: 2px;
      background: rgba(255,255,255,0.15);
      transform: translateX(-50%);
    }
    .bias-bar-fill {
      position: absolute;
      top: 0;
      bottom: 0;
      border-radius: 3px;
      transition: width 0.5s ease, left 0.5s ease;
    }
    .bias-bar-fill.bullish { background: #4caf50; }
    .bias-bar-fill.bearish { background: #f44336; }
    .bias-bar-fill.neutral { background: #9e9e9e; }

    .confidence-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    }
    .confidence-label { font-size: 11px; color: rgba(255,255,255,0.4); min-width: 70px; }

    .timing-row {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      padding: 8px 10px;
      background: rgba(255,152,0,0.08);
      border-radius: 6px;
      margin-bottom: 12px;
    }
    .timing-row mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
      color: #ff9800;
      margin-top: 2px;
      flex-shrink: 0;
    }
    .timing-content {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .timing-text {
      font-size: 11px;
      color: rgba(255,255,255,0.6);
      line-height: 1.5;
    }
    .timing-local {
      font-size: 10px;
      color: #64b5f6;
    }

    .entry-levels-row {
      display: flex;
      gap: 6px;
      margin-bottom: 10px;
      flex-wrap: wrap;
    }
    .level-chip {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-family: 'Roboto Mono', monospace;
    }
    .level-lbl {
      font-weight: 600;
      text-transform: uppercase;
      font-size: 9px;
      letter-spacing: 0.3px;
    }
    .level-val { font-weight: 700; }
    .level-open { background: rgba(100,181,246,0.1); color: #64b5f6; }
    .level-sl { background: rgba(244,67,54,0.1); color: #f44336; }
    .level-tp { background: rgba(76,175,80,0.1); color: #4caf50; }

    .reasoning {
      font-size: 12px;
      color: rgba(255,255,255,0.5);
      line-height: 1.6;
      margin-bottom: 12px;
    }

    .card-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .ai-tag {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 10px;
      color: rgba(255,255,255,0.2);
    }
    .ai-tag mat-icon { font-size: 12px; width: 12px; height: 12px; color: #7c4dff; }
    .timestamp { font-size: 10px; color: rgba(255,255,255,0.2); }

    @media (max-width: 600px) {
      .signals-grid { grid-template-columns: 1fr; }
      .page-header { flex-direction: column; }
    }
  `]
})
export class TradeSignalsComponent implements OnInit, OnDestroy {
  constructor(public signalsService: SignalsService, private authService: AuthService) {}

  async ngOnInit() {
    await this.signalsService.loadSignals();
    this.signalsService.subscribeToUpdates();
  }

  ngOnDestroy() {
    this.signalsService.unsubscribeFromUpdates();
  }

  refresh() {
    this.signalsService.loadSignals();
  }

  getSignalIcon(signal: SignalType): string {
    switch (signal) {
      case 'STRONG BUY': return 'rocket_launch';
      case 'BUY': return 'trending_up';
      case 'HOLD': return 'trending_flat';
      case 'SELL': return 'trending_down';
      case 'STRONG SELL': return 'crisis_alert';
    }
  }

  getSignalClass(signal: SignalType): string {
    switch (signal) {
      case 'STRONG BUY': return 'signal-strong-buy';
      case 'BUY': return 'signal-buy';
      case 'HOLD': return 'signal-hold';
      case 'SELL': return 'signal-sell';
      case 'STRONG SELL': return 'signal-strong-sell';
    }
  }

  getCardClass(signal: SignalType): string {
    switch (signal) {
      case 'STRONG BUY': return 'signal-card-strong-buy';
      case 'BUY': return 'signal-card-buy';
      case 'HOLD': return 'signal-card-hold';
      case 'SELL': return 'signal-card-sell';
      case 'STRONG SELL': return 'signal-card-strong-sell';
    }
  }

  getBarWidth(biasScore: number): number {
    return Math.abs(biasScore) * 50;
  }

  getBarLeft(biasScore: number): number {
    return biasScore >= 0 ? 50 : 50 - Math.abs(biasScore) * 50;
  }

  formatTime(timestamp: string): string {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getAgreementClass(sig: TradeSignal): string {
    if (sig.ta_score == null) return '';
    const fundamentalDir = sig.bias_score > 0.1 ? 1 : sig.bias_score < -0.1 ? -1 : 0;
    const taDir = sig.ta_score > 0.1 ? 1 : sig.ta_score < -0.1 ? -1 : 0;
    return fundamentalDir === taDir ? 'agreement-agree' : 'agreement-conflict';
  }

  getAgreementIcon(sig: TradeSignal): string {
    if (sig.ta_score == null) return '';
    const fundamentalDir = sig.bias_score > 0.1 ? 1 : sig.bias_score < -0.1 ? -1 : 0;
    const taDir = sig.ta_score > 0.1 ? 1 : sig.ta_score < -0.1 ? -1 : 0;
    return fundamentalDir === taDir ? 'check_circle' : 'warning';
  }

  getUserTimezone(): string {
    return this.authService.profile()?.timezone || 'UTC';
  }

  formatToUserTz(utcDateStr: string): string {
    try {
      const date = new Date(utcDateStr);
      if (isNaN(date.getTime())) return utcDateStr;
      const tz = this.getUserTimezone();
      return date.toLocaleTimeString('en-US', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return utcDateStr;
    }
  }

  getAgreementText(sig: TradeSignal): string {
    if (sig.ta_score == null) return '';
    const fundamentalDir = sig.bias_score > 0.1 ? 1 : sig.bias_score < -0.1 ? -1 : 0;
    const taDir = sig.ta_score > 0.1 ? 1 : sig.ta_score < -0.1 ? -1 : 0;
    return fundamentalDir === taDir
      ? 'Fundamentals & Technicals agree'
      : 'Fundamentals & Technicals diverge';
  }
}
