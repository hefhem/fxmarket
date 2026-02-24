import { Component, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatTableModule } from '@angular/material/table';
import { EventsService } from '../../core/services/events.service';
import { CurrencyPairService } from '../../core/services/currency-pair.service';
import { AuthService } from '../../core/services/auth.service';
import { CurrencyPair, DailyTradeBias, CURRENCY_FLAGS } from '../../core/models';
import { BiasBadgeComponent } from '../../shared/components/bias-badge/bias-badge.component';
import { ConfidenceMeterComponent } from '../../shared/components/confidence-meter/confidence-meter.component';
import { PriceChartComponent } from '../../shared/components/price-chart/price-chart.component';
import { IndicatorsPanelComponent } from '../../shared/components/indicators-panel/indicators-panel.component';

@Component({
  selector: 'app-pair-analysis',
  standalone: true,
  imports: [
    CommonModule, DatePipe, RouterLink,
    MatCardModule, MatIconModule, MatButtonModule,
    MatProgressSpinnerModule, MatChipsModule, MatDividerModule,
    MatTableModule, BiasBadgeComponent, ConfidenceMeterComponent,
    PriceChartComponent, IndicatorsPanelComponent
  ],
  template: `
    <div class="pair-analysis-page">
      @if (loading()) {
        <div class="loading-container">
          <mat-spinner diameter="40"></mat-spinner>
        </div>
      } @else if (pair()) {
        <!-- Header -->
        <div class="page-header">
          <button mat-icon-button routerLink="/dashboard">
            <mat-icon>arrow_back</mat-icon>
          </button>
          <div class="pair-title">
            <span class="pair-flag">{{ getFlag(pair()!.base_currency) }}</span>
            <h1>{{ pair()!.symbol }}</h1>
            <span class="pair-name">{{ pair()!.display_name }}</span>
          </div>
        </div>

        <!-- Current Bias Card -->
        @if (currentBias()) {
          <mat-card class="current-bias-card" [class]="'border-' + currentBias()!.direction">
            <mat-card-content>
              <div class="current-bias-header">
                <h2>Today's Bias</h2>
                <app-bias-badge [direction]="currentBias()!.direction" />
              </div>
              <div class="current-bias-body">
                <div class="score-section">
                  <span class="big-score" [class]="currentBias()!.direction">
                    {{ currentBias()!.bias_score > 0 ? '+' : '' }}{{ (currentBias()!.bias_score * 100).toFixed(0) }}
                  </span>
                  <span class="score-label">Bias Score</span>
                </div>
                <div class="reasoning-section">
                  <p>{{ currentBias()!.ai_reasoning }}</p>
                  <div class="confidence-row">
                    <span>Confidence:</span>
                    <app-confidence-meter [value]="currentBias()!.confidence" />
                  </div>
                </div>
              </div>
              @if (currentBias()!.recommended_entry_timing) {
                <mat-divider></mat-divider>
                <div class="trade-timing-section">
                  <div class="timing-header">
                    <mat-icon>schedule</mat-icon>
                    <h3>Recommended Trade Timing</h3>
                    @if (currentBias()!.trade_session) {
                      <span class="session-badge" [class]="'session-' + currentBias()!.trade_session">
                        {{ formatSession(currentBias()!.trade_session!) }}
                      </span>
                    }
                  </div>
                  <p class="timing-text">{{ currentBias()!.recommended_entry_timing }}</p>
                  @if (currentBias()!.entry_start_utc && currentBias()!.entry_end_utc) {
                    <div class="local-time-row">
                      <mat-icon>public</mat-icon>
                      <span>Your time ({{ getUserTimezone() }}): <strong>{{ formatToUserTz(currentBias()!.entry_start_utc!) }} &ndash; {{ formatToUserTz(currentBias()!.entry_end_utc!) }}</strong></span>
                    </div>
                  }
                </div>
              }
            </mat-card-content>
          </mat-card>
        } @else {
          <mat-card class="no-bias-card">
            <mat-card-content>
              <mat-icon>hourglass_empty</mat-icon>
              <p>No bias data available for this pair today. Analysis runs automatically throughout the day.</p>
            </mat-card-content>
          </mat-card>
        }

        <!-- Price Chart -->
        <section class="ta-section">
          <h2>
            <mat-icon>candlestick_chart</mat-icon>
            Price Chart
          </h2>
          <mat-card>
            <mat-card-content>
              <app-price-chart [pairId]="pair()!.id" [height]="400" />
            </mat-card-content>
          </mat-card>
        </section>

        <!-- Technical Indicators -->
        <section class="ta-section">
          <h2>
            <mat-icon>analytics</mat-icon>
            Technical Indicators
          </h2>
          <mat-card>
            <mat-card-content>
              <app-indicators-panel [pairId]="pair()!.id" />
            </mat-card-content>
          </mat-card>
        </section>

        <!-- Historical Bias -->
        <section class="history-section">
          <h2>
            <mat-icon>history</mat-icon>
            Bias History (Last 30 Days)
          </h2>

          @if (biasHistory().length === 0) {
            <p class="empty-text">No historical bias data yet.</p>
          } @else {
            <!-- Simple chart visualization -->
            <mat-card class="chart-card">
              <mat-card-content>
                <div class="mini-chart">
                  @for (bias of biasHistory(); track bias.id) {
                    <div class="chart-bar-wrapper" [title]="bias.analysis_date + ': ' + (bias.bias_score > 0 ? '+' : '') + (bias.bias_score * 100).toFixed(0)">
                      <div class="chart-bar"
                           [class]="bias.direction"
                           [style.height.%]="Math.abs(bias.bias_score) * 100"
                           [style.bottom.%]="bias.bias_score >= 0 ? 50 : 50 - Math.abs(bias.bias_score) * 100">
                      </div>
                    </div>
                  }
                </div>
                <div class="chart-labels">
                  <span class="chart-label">{{ biasHistory()[0]?.analysis_date | date:'MMM d' }}</span>
                  <span class="chart-center-line">0</span>
                  <span class="chart-label">{{ biasHistory()[biasHistory().length - 1]?.analysis_date | date:'MMM d' }}</span>
                </div>
              </mat-card-content>
            </mat-card>

            <!-- History Table -->
            <mat-card>
              <mat-card-content>
                <table mat-table [dataSource]="biasHistory()" class="history-table">
                  <ng-container matColumnDef="date">
                    <th mat-header-cell *matHeaderCellDef>Date</th>
                    <td mat-cell *matCellDef="let b">{{ b.analysis_date | date:'MMM d, yyyy' }}</td>
                  </ng-container>
                  <ng-container matColumnDef="direction">
                    <th mat-header-cell *matHeaderCellDef>Direction</th>
                    <td mat-cell *matCellDef="let b">
                      <app-bias-badge [direction]="b.direction" />
                    </td>
                  </ng-container>
                  <ng-container matColumnDef="score">
                    <th mat-header-cell *matHeaderCellDef>Score</th>
                    <td mat-cell *matCellDef="let b" [class]="b.direction + '-text'">
                      {{ b.bias_score > 0 ? '+' : '' }}{{ (b.bias_score * 100).toFixed(0) }}
                    </td>
                  </ng-container>
                  <ng-container matColumnDef="confidence">
                    <th mat-header-cell *matHeaderCellDef>Confidence</th>
                    <td mat-cell *matCellDef="let b">
                      <app-confidence-meter [value]="b.confidence" />
                    </td>
                  </ng-container>
                  <ng-container matColumnDef="reasoning">
                    <th mat-header-cell *matHeaderCellDef>AI Reasoning</th>
                    <td mat-cell *matCellDef="let b" class="reasoning-cell">
                      {{ b.ai_reasoning.length > 80 ? b.ai_reasoning.substring(0, 80) + '...' : b.ai_reasoning }}
                    </td>
                  </ng-container>

                  <tr mat-header-row *matHeaderRowDef="historyColumns"></tr>
                  <tr mat-row *matRowDef="let row; columns: historyColumns;"></tr>
                </table>
              </mat-card-content>
            </mat-card>
          }
        </section>
      } @else {
        <div class="not-found">
          <mat-icon>error_outline</mat-icon>
          <h2>Pair not found</h2>
          <a mat-button routerLink="/dashboard">Back to Dashboard</a>
        </div>
      }
    </div>
  `,
  styles: [`
    .pair-analysis-page { max-width: 1000px; margin: 0 auto; }
    .loading-container { text-align: center; padding: 64px; }
    .page-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 24px;
    }
    .pair-title {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .pair-flag { font-size: 1.5rem; }
    .pair-title h1 { margin: 0; }
    .pair-name { color: rgba(255,255,255,0.5); font-size: 14px; }

    .current-bias-card {
      margin-bottom: 32px;
      border-top: 3px solid transparent;
    }
    .border-bullish { border-top-color: #4caf50; }
    .border-bearish { border-top-color: #f44336; }
    .border-neutral { border-top-color: #9e9e9e; }
    .current-bias-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .current-bias-body {
      display: flex;
      gap: 32px;
      align-items: flex-start;
    }
    .score-section { text-align: center; min-width: 100px; }
    .big-score { font-size: 3rem; font-weight: 700; }
    .big-score.bullish { color: #4caf50; }
    .big-score.bearish { color: #f44336; }
    .big-score.neutral { color: #9e9e9e; }
    .score-label { display: block; font-size: 12px; color: rgba(255,255,255,0.4); }
    .reasoning-section { flex: 1; }
    .reasoning-section p { line-height: 1.6; margin-bottom: 12px; }
    .confidence-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: rgba(255,255,255,0.5);
    }

    .trade-timing-section {
      margin-top: 16px;
      padding-top: 16px;
    }
    .timing-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }
    .timing-header mat-icon {
      color: #ff9800;
      font-size: 20px;
      width: 20px;
      height: 20px;
    }
    .timing-header h3 { margin: 0; font-size: 14px; font-weight: 600; }
    .session-badge {
      font-size: 11px;
      font-weight: 600;
      padding: 2px 10px;
      border-radius: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .session-asian { background: rgba(156,39,176,0.15); color: #ce93d8; }
    .session-london { background: rgba(33,150,243,0.15); color: #64b5f6; }
    .session-new_york { background: rgba(76,175,80,0.15); color: #81c784; }
    .session-london_ny_overlap { background: rgba(255,152,0,0.15); color: #ffb74d; }
    .timing-text {
      font-size: 13px;
      color: rgba(255,255,255,0.7);
      line-height: 1.6;
      margin: 0 0 8px;
      padding-left: 28px;
    }
    .local-time-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      background: rgba(33,150,243,0.08);
      border-radius: 6px;
      margin-left: 28px;
      font-size: 13px;
      color: rgba(255,255,255,0.7);
    }
    .local-time-row mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      color: #64b5f6;
    }
    .local-time-row strong { color: #64b5f6; }

    .no-bias-card { text-align: center; padding: 32px; margin-bottom: 32px; }
    .no-bias-card mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: rgba(255,255,255,0.2);
    }
    .no-bias-card p { color: rgba(255,255,255,0.4); }

    .ta-section {
      margin-top: 32px;
    }
    .ta-section h2 {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
    }
    .history-section { margin-top: 32px; }
    .history-section h2 {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
    }
    .empty-text { color: rgba(255,255,255,0.4); }

    .chart-card { margin-bottom: 16px; }
    .mini-chart {
      display: flex;
      align-items: center;
      height: 120px;
      gap: 2px;
      position: relative;
    }
    .mini-chart::before {
      content: '';
      position: absolute;
      left: 0;
      right: 0;
      top: 50%;
      height: 1px;
      background: rgba(255,255,255,0.1);
    }
    .chart-bar-wrapper {
      flex: 1;
      height: 100%;
      position: relative;
      cursor: pointer;
    }
    .chart-bar {
      position: absolute;
      left: 1px;
      right: 1px;
      border-radius: 2px;
      transition: height 0.3s;
    }
    .chart-bar.bullish { background: #4caf50; }
    .chart-bar.bearish { background: #f44336; }
    .chart-bar.neutral { background: #9e9e9e; }
    .chart-labels {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 4px;
    }
    .chart-label { font-size: 11px; color: rgba(255,255,255,0.3); }
    .chart-center-line { font-size: 10px; color: rgba(255,255,255,0.2); }

    .history-table { width: 100%; }
    .bullish-text { color: #4caf50; font-weight: 600; }
    .bearish-text { color: #f44336; font-weight: 600; }
    .neutral-text { color: #9e9e9e; font-weight: 600; }
    .reasoning-cell {
      font-size: 12px;
      color: rgba(255,255,255,0.5);
      max-width: 300px;
    }

    .not-found { text-align: center; padding: 64px; }
    .not-found mat-icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
      color: rgba(255,255,255,0.2);
    }

    @media (max-width: 600px) {
      .current-bias-body { flex-direction: column; }
    }
  `]
})
export class PairAnalysisComponent implements OnInit {
  pair = signal<CurrencyPair | null>(null);
  currentBias = signal<DailyTradeBias | null>(null);
  biasHistory = signal<DailyTradeBias[]>([]);
  loading = signal(true);
  Math = Math;

  historyColumns = ['date', 'direction', 'score', 'confidence', 'reasoning'];

  private readonly flagMap = CURRENCY_FLAGS;

  constructor(
    private route: ActivatedRoute,
    private pairService: CurrencyPairService,
    private eventsService: EventsService,
    private authService: AuthService
  ) {}

  async ngOnInit() {
    const pairId = this.route.snapshot.paramMap.get('pairId');
    if (!pairId) {
      this.loading.set(false);
      return;
    }

    try {
      await this.pairService.loadPairs();
      const pair = this.pairService.getPairById(pairId);
      this.pair.set(pair ?? null);

      if (pair) {
        const [history] = await Promise.all([
          this.eventsService.fetchBiasHistory(pairId, 30)
        ]);
        this.biasHistory.set(history);

        // Current bias is the latest entry
        if (history.length > 0) {
          this.currentBias.set(history[history.length - 1]);
        }
      }
    } catch (err) {
      console.error('Failed to load pair analysis:', err);
    } finally {
      this.loading.set(false);
    }
  }

  getFlag(currency: string): string {
    return this.flagMap[currency] ?? '';
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
      }) + ' ' + date.toLocaleDateString('en-US', {
        timeZone: tz,
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return utcDateStr;
    }
  }

  formatSession(session: string): string {
    const labels: Record<string, string> = {
      asian: 'Asian Session',
      london: 'London Session',
      new_york: 'New York Session',
      london_ny_overlap: 'London/NY Overlap',
    };
    return labels[session] ?? session;
  }
}
