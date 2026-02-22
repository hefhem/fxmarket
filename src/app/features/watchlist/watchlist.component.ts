import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { WatchlistService } from '../../core/services/watchlist.service';
import { CurrencyPairService } from '../../core/services/currency-pair.service';
import { EventsService } from '../../core/services/events.service';
import { Watchlist, CurrencyPair, DailyTradeBias, CURRENCY_FLAGS } from '../../core/models';
import { BiasBadgeComponent } from '../../shared/components/bias-badge/bias-badge.component';
import { ConfidenceMeterComponent } from '../../shared/components/confidence-meter/confidence-meter.component';
import { AddPairDialogComponent } from './add-pair-dialog.component';

interface WatchlistItem extends Watchlist {
  pair?: CurrencyPair;
  bias?: DailyTradeBias;
}

@Component({
  selector: 'app-watchlist',
  standalone: true,
  imports: [
    CommonModule, RouterLink,
    MatCardModule, MatIconModule, MatButtonModule,
    MatProgressSpinnerModule, MatChipsModule, MatSnackBarModule,
    MatDialogModule, BiasBadgeComponent, ConfidenceMeterComponent
  ],
  template: `
    <div class="watchlist-page">
      <div class="page-header">
        <div>
          <h1>My Watchlist</h1>
          <p class="subtitle">Track your preferred currency pairs</p>
        </div>
        <button mat-raised-button color="primary" (click)="openAddDialog()">
          <mat-icon>add</mat-icon>
          Add Pair
        </button>
      </div>

      @if (loading()) {
        <div class="loading"><mat-spinner diameter="40"></mat-spinner></div>
      } @else if (watchlistItems().length === 0) {
        <mat-card class="empty-card">
          <mat-card-content>
            <mat-icon class="empty-icon">bookmark_border</mat-icon>
            <h3>Your watchlist is empty</h3>
            <p>Add currency pairs to track their daily bias and events.</p>
            <button mat-raised-button color="primary" (click)="openAddDialog()">
              <mat-icon>add</mat-icon> Add Your First Pair
            </button>
          </mat-card-content>
        </mat-card>
      } @else {
        <div class="watchlist-grid">
          @for (item of watchlistItems(); track item.id) {
            <mat-card class="watch-card" [class]="item.bias ? 'border-' + item.bias.direction : ''">
              <mat-card-content>
                <div class="card-header">
                  <div class="pair-info" [routerLink]="['/pair-analysis', item.pair_id]">
                    <span class="flag">{{ getFlag(item.pair?.base_currency) }}</span>
                    <span class="symbol">{{ item.pair_symbol || item.pair?.symbol }}</span>
                  </div>
                  <button mat-icon-button (click)="removePair(item.pair_id)" class="remove-btn"
                          title="Remove from watchlist">
                    <mat-icon>close</mat-icon>
                  </button>
                </div>
                @if (item.bias) {
                  <div class="bias-row">
                    <app-bias-badge [direction]="item.bias.direction" />
                    <span class="score" [class]="item.bias.direction">
                      {{ item.bias.bias_score > 0 ? '+' : '' }}{{ (item.bias.bias_score * 100).toFixed(0) }}
                    </span>
                  </div>
                  <app-confidence-meter [value]="item.bias.confidence" />
                  <p class="reasoning">{{ item.bias.ai_reasoning | slice:0:100 }}...</p>
                } @else {
                  <p class="no-bias">No bias data yet for today</p>
                }
                <a mat-button [routerLink]="['/pair-analysis', item.pair_id]" class="detail-link">
                  View Analysis <mat-icon>arrow_forward</mat-icon>
                </a>
              </mat-card-content>
            </mat-card>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .watchlist-page { max-width: 1200px; margin: 0 auto; }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
    }
    h1 { margin: 0 0 4px; }
    .subtitle { color: rgba(255,255,255,0.5); }
    .loading { text-align: center; padding: 64px; }
    .empty-card {
      text-align: center;
      padding: 48px;
    }
    .empty-icon { font-size: 48px; width: 48px; height: 48px; color: rgba(255,255,255,0.2); }
    .empty-card h3 { margin-top: 16px; }
    .empty-card p { color: rgba(255,255,255,0.4); margin-bottom: 16px; }
    .watchlist-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 16px;
    }
    .watch-card {
      border-top: 3px solid rgba(255,255,255,0.1);
      transition: transform 0.2s;
    }
    .watch-card:hover { transform: translateY(-2px); }
    .border-bullish { border-top-color: #4caf50; }
    .border-bearish { border-top-color: #f44336; }
    .border-neutral { border-top-color: #9e9e9e; }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .pair-info {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
    }
    .pair-info:hover .symbol { color: #4caf50; }
    .flag { font-size: 1.3rem; }
    .symbol { font-size: 1.1rem; font-weight: 600; transition: color 0.2s; }
    .remove-btn { opacity: 0.4; }
    .remove-btn:hover { opacity: 1; }
    .bias-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    .score { font-size: 1.3rem; font-weight: 700; }
    .score.bullish { color: #4caf50; }
    .score.bearish { color: #f44336; }
    .score.neutral { color: #9e9e9e; }
    .reasoning {
      font-size: 12px;
      color: rgba(255,255,255,0.4);
      margin: 8px 0;
      line-height: 1.4;
    }
    .no-bias { color: rgba(255,255,255,0.3); font-size: 13px; margin: 16px 0; }
    .detail-link {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
    }
  `]
})
export class WatchlistComponent implements OnInit {
  watchlistItems = signal<WatchlistItem[]>([]);
  loading = signal(true);

  private readonly flagMap = CURRENCY_FLAGS;

  constructor(
    private watchlistService: WatchlistService,
    private pairService: CurrencyPairService,
    private eventsService: EventsService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {}

  async ngOnInit() {
    await this.loadData();
  }

  private async loadData() {
    this.loading.set(true);
    try {
      await Promise.all([
        this.pairService.loadPairs(),
        this.watchlistService.loadWatchlist(),
        this.eventsService.fetchDailyBias()
      ]);

      const biasMap = new Map<string, DailyTradeBias>();
      this.eventsService.dailyBias().forEach(b => biasMap.set(b.pair_id, b));

      const items = this.watchlistService.items().map(w => ({
        ...w,
        pair: this.pairService.getPairById(w.pair_id),
        bias: biasMap.get(w.pair_id)
      }));

      this.watchlistItems.set(items);
    } catch (err) {
      console.error('Failed to load watchlist:', err);
    } finally {
      this.loading.set(false);
    }
  }

  openAddDialog() {
    const watchedPairIds = this.watchlistService.items().map(w => w.pair_id);
    const availablePairs = this.pairService.pairs().filter(p => !watchedPairIds.includes(p.id));

    const dialogRef = this.dialog.open(AddPairDialogComponent, {
      data: { pairs: availablePairs },
      width: '400px'
    });

    dialogRef.afterClosed().subscribe(async (pairId: string | undefined) => {
      if (pairId) {
        try {
          await this.watchlistService.addPair(pairId);
          await this.loadData();
          this.snackBar.open('Pair added to watchlist', 'Close', { duration: 3000 });
        } catch (err: any) {
          this.snackBar.open(err.message || 'Failed to add pair', 'Close', { duration: 5000 });
        }
      }
    });
  }

  async removePair(pairId: string) {
    try {
      await this.watchlistService.removePair(pairId);
      this.watchlistItems.update(items => items.filter(i => i.pair_id !== pairId));
      this.snackBar.open('Pair removed from watchlist', 'Close', { duration: 3000 });
    } catch (err: any) {
      this.snackBar.open(err.message || 'Failed to remove pair', 'Close', { duration: 5000 });
    }
  }

  getFlag(currency?: string): string {
    return currency ? (this.flagMap[currency] ?? '') : '';
  }
}
