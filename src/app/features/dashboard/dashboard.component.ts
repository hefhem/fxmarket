import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { RealtimeChannel } from '@supabase/supabase-js';
import { EventsService } from '../../core/services/events.service';
import { DailyTradeBias } from '../../core/models';
import { BiasBadgeComponent } from '../../shared/components/bias-badge/bias-badge.component';
import { ConfidenceMeterComponent } from '../../shared/components/confidence-meter/confidence-meter.component';
import { EventListComponent } from './event-list/event-list.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, RouterLink,
    MatCardModule, MatIconModule, MatButtonModule,
    MatProgressSpinnerModule, MatChipsModule, MatDividerModule,
    BiasBadgeComponent, ConfidenceMeterComponent, EventListComponent
  ],
  template: `
    <div class="dashboard">
      <div class="dashboard-header">
        <h1>Market Overview</h1>
        <p class="date-text">{{ today }}</p>
      </div>

      <!-- Bias Overview Cards -->
      <section class="bias-grid">
        @if (loading()) {
          <div class="loading-container">
            <mat-spinner diameter="40"></mat-spinner>
            <p>Loading market bias...</p>
          </div>
        } @else if (biasData().length === 0) {
          <mat-card class="empty-card">
            <mat-card-content>
              <mat-icon class="empty-icon">auto_graph</mat-icon>
              <h3>No bias data yet</h3>
              <p>AI analysis will appear here once economic events are processed.</p>
            </mat-card-content>
          </mat-card>
        } @else {
          @for (bias of biasData(); track bias.id) {
            <mat-card class="bias-card" [routerLink]="['/pair-analysis', bias.pair_id]">
              <mat-card-content>
                <div class="bias-card-header">
                  <span class="pair-symbol">{{ bias.pair_symbol || 'N/A' }}</span>
                  <app-bias-badge [direction]="bias.direction" />
                </div>
                <div class="bias-score">
                  <span class="score-value" [class]="bias.direction">
                    {{ bias.bias_score > 0 ? '+' : '' }}{{ (bias.bias_score * 100).toFixed(0) }}
                  </span>
                </div>
                <app-confidence-meter [value]="bias.confidence" />
                <p class="bias-reasoning">{{ bias.ai_reasoning | slice:0:100 }}...</p>
              </mat-card-content>
            </mat-card>
          }
        }
      </section>

      <mat-divider></mat-divider>

      <!-- Recent Events -->
      <section class="events-section">
        <div class="section-header">
          <h2>Recent Economic Events</h2>
          <a mat-button routerLink="/events" color="primary">View All</a>
        </div>
        <app-event-list [compact]="true" />
      </section>
    </div>
  `,
  styles: [`
    .dashboard { max-width: 1200px; margin: 0 auto; }
    .dashboard-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 24px;
    }
    .dashboard-header h1 { margin: 0; font-size: 1.8rem; }
    .date-text { color: rgba(255, 255, 255, 0.6); }
    .bias-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }
    .loading-container {
      grid-column: 1 / -1;
      text-align: center;
      padding: 48px;
    }
    .empty-card {
      grid-column: 1 / -1;
      text-align: center;
      padding: 48px;
    }
    .empty-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: rgba(255, 255, 255, 0.3);
    }
    .bias-card {
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .bias-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    }
    .bias-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .pair-symbol {
      font-size: 1.2rem;
      font-weight: 600;
    }
    .bias-score {
      text-align: center;
      margin: 16px 0;
    }
    .score-value {
      font-size: 2rem;
      font-weight: 700;
    }
    .score-value.bullish { color: #4caf50; }
    .score-value.bearish { color: #f44336; }
    .score-value.neutral { color: #9e9e9e; }
    .bias-reasoning {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.5);
      margin-top: 8px;
      line-height: 1.4;
    }
    .events-section { margin-top: 32px; }
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .section-header h2 { margin: 0; }
  `]
})
export class DashboardComponent implements OnInit, OnDestroy {
  biasData = signal<DailyTradeBias[]>([]);
  loading = signal(true);
  today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  private biasChannel?: RealtimeChannel;

  constructor(private eventsService: EventsService) {}

  async ngOnInit() {
    try {
      const data = await this.eventsService.fetchDailyBias();
      this.biasData.set((data ?? []) as DailyTradeBias[]);
    } catch (err) {
      console.error('Failed to load bias data:', err);
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
}
