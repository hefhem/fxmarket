import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RealtimeChannel } from '@supabase/supabase-js';
import { EventsService } from '../../core/services/events.service';
import { CurrencyPairService } from '../../core/services/currency-pair.service';
import { DailyTradeBias, CurrencyPair, CURRENCY_FLAGS } from '../../core/models';
import { BiasBadgeComponent } from '../../shared/components/bias-badge/bias-badge.component';
import { ConfidenceMeterComponent } from '../../shared/components/confidence-meter/confidence-meter.component';
import { MarketHeatmapComponent } from '../../shared/components/market-heatmap/market-heatmap.component';
import { EventListComponent } from './event-list/event-list.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, RouterLink,
    MatCardModule, MatIconModule, MatButtonModule,
    MatProgressSpinnerModule, MatChipsModule, MatDividerModule,
    MatTooltipModule,
    BiasBadgeComponent, ConfidenceMeterComponent, MarketHeatmapComponent, EventListComponent
  ],
  template: `
    <div class="dashboard">
      <div class="dashboard-header">
        <div>
          <h1>Market Overview</h1>
          <p class="date-text">{{ today }}</p>
        </div>
        <div class="header-stats">
          @if (!loading()) {
            <div class="stat-chip bullish-chip">
              <mat-icon>trending_up</mat-icon>
              {{ bullishCount() }}
            </div>
            <div class="stat-chip neutral-chip">
              <mat-icon>trending_flat</mat-icon>
              {{ neutralCount() }}
            </div>
            <div class="stat-chip bearish-chip">
              <mat-icon>trending_down</mat-icon>
              {{ bearishCount() }}
            </div>
          }
        </div>
      </div>

      <!-- Bias Overview Cards -->
      <section class="bias-grid">
        @if (loading()) {
          <div class="loading-container">
            <mat-spinner diameter="40"></mat-spinner>
            <p>Loading market bias...</p>
          </div>
        } @else if (biasData().length === 0) {
          <!-- Show all pairs as placeholder cards -->
          @for (pair of allPairs(); track pair.id) {
            <mat-card class="bias-card bias-card-pending">
              <mat-card-content>
                <div class="bias-card-header">
                  <div class="pair-info">
                    <span class="pair-flag">{{ getCurrencyFlag(pair.base_currency) }}</span>
                    <span class="pair-symbol">{{ pair.symbol }}</span>
                  </div>
                  <span class="pending-tag">Awaiting Analysis</span>
                </div>
                <div class="bias-score">
                  <mat-icon class="pending-icon">hourglass_empty</mat-icon>
                </div>
                <p class="pair-name">{{ pair.display_name }}</p>
              </mat-card-content>
            </mat-card>
          }
        } @else {
          @for (bias of biasData(); track bias.id) {
            <mat-card class="bias-card" [class]="'bias-card-' + bias.direction"
                      [routerLink]="['/pair-analysis', bias.pair_id]"
                      [matTooltip]="'Click for detailed analysis'">
              <mat-card-content>
                <div class="bias-card-header">
                  <div class="pair-info">
                    <span class="pair-flag">{{ getPairFlag(bias.pair_id) }}</span>
                    <span class="pair-symbol">{{ getPairSymbol(bias.pair_id) }}</span>
                  </div>
                  <app-bias-badge [direction]="bias.direction" />
                </div>

                <div class="bias-score-section">
                  <div class="score-display">
                    <span class="score-value" [class]="bias.direction">
                      {{ bias.bias_score > 0 ? '+' : '' }}{{ (bias.bias_score * 100).toFixed(0) }}
                    </span>
                    <span class="score-unit">pts</span>
                  </div>
                  <div class="bias-visual">
                    <div class="bias-bar-track">
                      <div class="bias-bar-center"></div>
                      <div class="bias-bar-fill"
                           [style.width.%]="Math.abs(bias.bias_score) * 50"
                           [style.left.%]="bias.bias_score >= 0 ? 50 : 50 - Math.abs(bias.bias_score) * 50"
                           [class]="bias.direction">
                      </div>
                    </div>
                  </div>
                </div>

                <div class="confidence-row">
                  <span class="confidence-label">Confidence</span>
                  <app-confidence-meter [value]="bias.confidence" />
                </div>

                <p class="bias-reasoning">
                  {{ bias.ai_reasoning.length > 120 ? bias.ai_reasoning.substring(0, 120) + '...' : bias.ai_reasoning }}
                </p>

                <div class="card-footer">
                  <mat-icon class="ai-badge">psychology</mat-icon>
                  <span>AI Generated</span>
                </div>
              </mat-card-content>
            </mat-card>
          }
        }
      </section>

      <!-- Market Heatmap -->
      @if (!loading() && allPairs().length > 0) {
        <section class="heatmap-section">
          <app-market-heatmap [pairs]="allPairs()" [biasData]="biasData()" />
        </section>
      }

      <mat-divider></mat-divider>

      <!-- Recent Events -->
      <section class="events-section">
        <div class="section-header">
          <h2>
            <mat-icon>event</mat-icon>
            Recent Economic Events
          </h2>
          <a mat-stroked-button routerLink="/events" color="primary">
            <mat-icon>visibility</mat-icon>
            View All
          </a>
        </div>
        <app-event-list [compact]="true" />
      </section>
    </div>
  `,
  styles: [`
    .dashboard { max-width: 1280px; margin: 0 auto; }
    .dashboard-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
      flex-wrap: wrap;
      gap: 16px;
    }
    .dashboard-header h1 { margin: 0 0 4px; font-size: 1.8rem; }
    .date-text { color: rgba(255, 255, 255, 0.5); font-size: 14px; }
    .header-stats {
      display: flex;
      gap: 8px;
    }
    .stat-chip {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 600;
    }
    .stat-chip mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .bullish-chip { background: rgba(76,175,80,0.15); color: #4caf50; }
    .neutral-chip { background: rgba(158,158,158,0.15); color: #9e9e9e; }
    .bearish-chip { background: rgba(244,67,54,0.15); color: #f44336; }

    .bias-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }
    .loading-container {
      grid-column: 1 / -1;
      text-align: center;
      padding: 48px;
      color: rgba(255,255,255,0.5);
    }
    .bias-card {
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
      border-top: 3px solid transparent;
    }
    .bias-card:hover {
      transform: translateY(-3px);
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4);
    }
    .bias-card-bullish { border-top-color: #4caf50; }
    .bias-card-bearish { border-top-color: #f44336; }
    .bias-card-neutral { border-top-color: #9e9e9e; }
    .bias-card-pending { border-top-color: rgba(255,255,255,0.1); }

    .bias-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .pair-info {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .pair-flag { font-size: 1.3rem; }
    .pair-symbol { font-size: 1.1rem; font-weight: 600; }
    .pending-tag {
      font-size: 11px;
      color: rgba(255,255,255,0.3);
      padding: 2px 8px;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 4px;
    }
    .pair-name {
      text-align: center;
      color: rgba(255,255,255,0.4);
      font-size: 12px;
    }
    .pending-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
      color: rgba(255,255,255,0.15);
    }

    .bias-score-section {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 12px;
    }
    .score-display { text-align: center; min-width: 70px; }
    .score-value { font-size: 1.8rem; font-weight: 700; }
    .score-unit { font-size: 11px; color: rgba(255,255,255,0.3); display: block; }
    .score-value.bullish { color: #4caf50; }
    .score-value.bearish { color: #f44336; }
    .score-value.neutral { color: #9e9e9e; }

    .bias-visual { flex: 1; }
    .bias-bar-track {
      position: relative;
      height: 8px;
      background: rgba(255,255,255,0.05);
      border-radius: 4px;
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
      border-radius: 4px;
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

    .bias-reasoning {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.5);
      line-height: 1.5;
      margin-bottom: 12px;
    }
    .card-footer {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 10px;
      color: rgba(255,255,255,0.2);
    }
    .ai-badge { font-size: 12px; width: 12px; height: 12px; color: #7c4dff; }

    .bias-score { text-align: center; margin: 24px 0; }

    .heatmap-section { margin-bottom: 32px; }
    .events-section { margin-top: 32px; }
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .section-header h2 {
      margin: 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    @media (max-width: 600px) {
      .bias-grid { grid-template-columns: 1fr; }
      .dashboard-header { flex-direction: column; }
    }
  `]
})
export class DashboardComponent implements OnInit, OnDestroy {
  biasData = signal<DailyTradeBias[]>([]);
  allPairs = signal<CurrencyPair[]>([]);
  loading = signal(true);
  today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  Math = Math;

  bullishCount = computed(() => this.biasData().filter(b => b.direction === 'bullish').length);
  bearishCount = computed(() => this.biasData().filter(b => b.direction === 'bearish').length);
  neutralCount = computed(() => this.biasData().filter(b => b.direction === 'neutral').length);

  private biasChannel?: RealtimeChannel;
  private pairMap = new Map<string, CurrencyPair>();

  private readonly flagMap = CURRENCY_FLAGS;

  constructor(
    private eventsService: EventsService,
    private pairService: CurrencyPairService
  ) {}

  async ngOnInit() {
    try {
      const pairs = await this.pairService.loadPairs();
      this.allPairs.set(pairs);
      pairs.forEach(p => this.pairMap.set(p.id, p));

      const data = await this.eventsService.fetchDailyBias();
      this.biasData.set((data ?? []) as DailyTradeBias[]);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      this.loading.set(false);
    }

    this.biasChannel = this.eventsService.subscribeToBiasUpdates((bias) => {
      this.biasData.update(current => {
        const idx = current.findIndex(b => b.pair_id === bias.pair_id && b.analysis_date === bias.analysis_date);
        if (idx >= 0) {
          const updated = [...current];
          updated[idx] = bias;
          return updated;
        }
        return [bias, ...current];
      });
    });
  }

  ngOnDestroy() {
    if (this.biasChannel) {
      this.eventsService['supabase'].removeChannel(this.biasChannel);
    }
  }

  getPairSymbol(pairId: string): string {
    return this.pairMap.get(pairId)?.symbol ?? 'N/A';
  }

  getPairFlag(pairId: string): string {
    const pair = this.pairMap.get(pairId);
    return pair ? (this.flagMap[pair.base_currency] ?? '') : '';
  }

  getCurrencyFlag(currency: string): string {
    return this.flagMap[currency] ?? '';
  }
}
