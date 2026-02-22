import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CurrencyPairService } from '../../core/services/currency-pair.service';
import { EventsService } from '../../core/services/events.service';
import { CurrencyPair, DailyTradeBias, CURRENCY_FLAGS } from '../../core/models';
import { BiasBadgeComponent } from '../../shared/components/bias-badge/bias-badge.component';
import { ConfidenceMeterComponent } from '../../shared/components/confidence-meter/confidence-meter.component';

interface PairWithBias {
  pair: CurrencyPair;
  bias: DailyTradeBias | null;
}

@Component({
  selector: 'app-pair-list',
  standalone: true,
  imports: [
    CommonModule, RouterLink, MatCardModule, MatIconModule,
    MatProgressSpinnerModule, BiasBadgeComponent, ConfidenceMeterComponent
  ],
  template: `
    <div class="pair-list-page">
      <h1>Pair Analysis</h1>
      <p class="subtitle">Select a currency pair to view detailed analysis</p>

      @if (loading()) {
        <div class="loading"><mat-spinner diameter="40"></mat-spinner></div>
      } @else {
        <div class="pairs-grid">
          @for (item of pairsWithBias(); track item.pair.id) {
            <mat-card class="pair-card" [routerLink]="['/pair-analysis', item.pair.id]"
                      [class]="item.bias ? 'border-' + item.bias.direction : ''">
              <mat-card-content>
                <div class="pair-header">
                  <span class="flag">{{ getFlag(item.pair.base_currency) }}</span>
                  <span class="symbol">{{ item.pair.symbol }}</span>
                  @if (item.bias) {
                    <app-bias-badge [direction]="item.bias.direction" />
                  }
                </div>
                <p class="pair-name">{{ item.pair.display_name }}</p>
                @if (item.bias) {
                  <div class="bias-info">
                    <span class="score" [class]="item.bias.direction">
                      {{ item.bias.bias_score > 0 ? '+' : '' }}{{ (item.bias.bias_score * 100).toFixed(0) }}
                    </span>
                    <app-confidence-meter [value]="item.bias.confidence" />
                  </div>
                } @else {
                  <p class="no-data">No analysis yet</p>
                }
              </mat-card-content>
            </mat-card>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .pair-list-page { max-width: 1200px; margin: 0 auto; }
    h1 { margin: 0 0 4px; }
    .subtitle { color: rgba(255,255,255,0.5); margin-bottom: 24px; }
    .loading { text-align: center; padding: 64px; }
    .pairs-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    }
    .pair-card {
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
      border-top: 3px solid rgba(255,255,255,0.1);
    }
    .pair-card:hover {
      transform: translateY(-3px);
      box-shadow: 0 6px 24px rgba(0,0,0,0.4);
    }
    .border-bullish { border-top-color: #4caf50; }
    .border-bearish { border-top-color: #f44336; }
    .border-neutral { border-top-color: #9e9e9e; }
    .pair-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
    }
    .flag { font-size: 1.3rem; }
    .symbol { font-size: 1.1rem; font-weight: 600; flex: 1; }
    .pair-name { font-size: 12px; color: rgba(255,255,255,0.4); margin-bottom: 12px; }
    .bias-info { display: flex; align-items: center; gap: 12px; }
    .score { font-size: 1.4rem; font-weight: 700; min-width: 50px; }
    .score.bullish { color: #4caf50; }
    .score.bearish { color: #f44336; }
    .score.neutral { color: #9e9e9e; }
    .no-data { font-size: 12px; color: rgba(255,255,255,0.3); }
  `]
})
export class PairListComponent implements OnInit {
  pairsWithBias = signal<PairWithBias[]>([]);
  loading = signal(true);

  private readonly flagMap = CURRENCY_FLAGS;

  constructor(
    private pairService: CurrencyPairService,
    private eventsService: EventsService
  ) {}

  async ngOnInit() {
    try {
      const [pairs] = await Promise.all([
        this.pairService.loadPairs(),
        this.eventsService.fetchDailyBias()
      ]);

      const biasMap = new Map<string, DailyTradeBias>();
      this.eventsService.dailyBias().forEach(b => biasMap.set(b.pair_id, b));

      this.pairsWithBias.set(pairs.map(pair => ({
        pair,
        bias: biasMap.get(pair.id) ?? null
      })));
    } catch (err) {
      console.error('Failed to load pairs:', err);
    } finally {
      this.loading.set(false);
    }
  }

  getFlag(currency: string): string {
    return this.flagMap[currency] ?? '';
  }
}
