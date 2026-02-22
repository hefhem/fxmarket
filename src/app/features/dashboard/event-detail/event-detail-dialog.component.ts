import { Component, Inject, signal, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { EconomicEvent, EventAnalysis } from '../../../core/models';
import { EventsService } from '../../../core/services/events.service';
import { BiasBadgeComponent } from '../../../shared/components/bias-badge/bias-badge.component';
import { ConfidenceMeterComponent } from '../../../shared/components/confidence-meter/confidence-meter.component';
import { ImpactBadgeComponent } from '../../../shared/components/impact-badge/impact-badge.component';

@Component({
  selector: 'app-event-detail-dialog',
  standalone: true,
  imports: [
    CommonModule, DatePipe, MatDialogModule, MatButtonModule,
    MatIconModule, MatChipsModule, MatProgressSpinnerModule,
    MatDividerModule, BiasBadgeComponent, ConfidenceMeterComponent,
    ImpactBadgeComponent
  ],
  template: `
    <h2 mat-dialog-title>
      <div class="dialog-title-row">
        <span>{{ event.event_name }}</span>
        <button mat-icon-button mat-dialog-close>
          <mat-icon>close</mat-icon>
        </button>
      </div>
    </h2>
    <mat-dialog-content>
      <!-- Event Info -->
      <div class="event-info-grid">
        <div class="info-item">
          <span class="info-label">Date/Time</span>
          <span class="info-value">{{ event.event_datetime | date:'medium' }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Currency</span>
          <span class="currency-tag">{{ event.currency }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Country</span>
          <span class="info-value">{{ event.country }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Impact</span>
          <app-impact-badge [impact]="event.impact" />
        </div>
        <div class="info-item">
          <span class="info-label">Source</span>
          <span class="source-tag">{{ event.source }}</span>
        </div>
      </div>

      <!-- Actual / Forecast / Previous -->
      <div class="data-row">
        <div class="data-item">
          <span class="data-label">Actual</span>
          <span class="data-value" [class.positive]="isPositiveSurprise()" [class.negative]="isNegativeSurprise()">
            {{ event.actual || 'Pending' }}
          </span>
        </div>
        <div class="data-item">
          <span class="data-label">Forecast</span>
          <span class="data-value">{{ event.forecast || 'N/A' }}</span>
        </div>
        <div class="data-item">
          <span class="data-label">Previous</span>
          <span class="data-value">{{ event.previous || 'N/A' }}</span>
        </div>
      </div>

      <mat-divider></mat-divider>

      <!-- AI Analysis Section -->
      <div class="analysis-section">
        <h3>
          <mat-icon>psychology</mat-icon>
          AI Analysis
        </h3>

        @if (analysisLoading()) {
          <div class="loading-container">
            <mat-spinner diameter="28"></mat-spinner>
            <span>Loading analysis...</span>
          </div>
        } @else if (analysis()) {
          <div class="analysis-content">
            <div class="analysis-header">
              <app-bias-badge [direction]="analysis()!.sentiment" />
              <div class="confidence-section">
                <span class="confidence-label">Confidence</span>
                <app-confidence-meter [value]="analysis()!.confidence" />
              </div>
            </div>

            <div class="reasoning-box">
              <p>{{ analysis()!.reasoning }}</p>
            </div>

            @if (analysis()!.affected_pairs.length > 0) {
              <div class="affected-pairs">
                <span class="pairs-label">Affected Pairs:</span>
                <mat-chip-set>
                  @for (pair of analysis()!.affected_pairs; track pair) {
                    <mat-chip class="pair-chip">{{ pair }}</mat-chip>
                  }
                </mat-chip-set>
              </div>
            }

            <div class="model-info">
              <mat-icon>smart_toy</mat-icon>
              <span>Analyzed by {{ analysis()!.model_used }}</span>
            </div>
          </div>
        } @else {
          <div class="no-analysis">
            <mat-icon>hourglass_empty</mat-icon>
            <p>This event has not been analyzed yet. Analysis runs automatically every few hours.</p>
          </div>
        }
      </div>
    </mat-dialog-content>
  `,
  styles: [`
    .dialog-title-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .event-info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 16px;
      margin-bottom: 20px;
    }
    .info-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .info-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: rgba(255,255,255,0.4);
    }
    .info-value { font-weight: 500; }
    .currency-tag {
      display: inline-block;
      padding: 2px 10px;
      background: rgba(76,175,80,0.15);
      color: #4caf50;
      border-radius: 4px;
      font-weight: 600;
      width: fit-content;
    }
    .source-tag {
      display: inline-block;
      padding: 2px 10px;
      background: rgba(33,150,243,0.15);
      color: #2196f3;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      width: fit-content;
      text-transform: capitalize;
    }
    .data-row {
      display: flex;
      gap: 32px;
      margin-bottom: 20px;
      padding: 16px;
      background: rgba(255,255,255,0.03);
      border-radius: 8px;
    }
    .data-item { text-align: center; flex: 1; }
    .data-label {
      display: block;
      font-size: 11px;
      text-transform: uppercase;
      color: rgba(255,255,255,0.4);
      margin-bottom: 4px;
    }
    .data-value { font-size: 1.2rem; font-weight: 600; }
    .data-value.positive { color: #4caf50; }
    .data-value.negative { color: #f44336; }

    .analysis-section { margin-top: 20px; }
    .analysis-section h3 {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
    }
    .analysis-section h3 mat-icon { color: #7c4dff; }
    .loading-container {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 24px;
      justify-content: center;
    }
    .analysis-content { display: flex; flex-direction: column; gap: 16px; }
    .analysis-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .confidence-section {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 160px;
    }
    .confidence-label {
      font-size: 12px;
      color: rgba(255,255,255,0.5);
    }
    .reasoning-box {
      padding: 16px;
      background: rgba(124,77,255,0.08);
      border-left: 3px solid #7c4dff;
      border-radius: 0 8px 8px 0;
    }
    .reasoning-box p { margin: 0; line-height: 1.6; }
    .affected-pairs {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .pairs-label { font-size: 12px; color: rgba(255,255,255,0.5); }
    .pair-chip { font-size: 12px; }
    .model-info {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: rgba(255,255,255,0.3);
    }
    .model-info mat-icon { font-size: 14px; width: 14px; height: 14px; }
    .no-analysis {
      text-align: center;
      padding: 24px;
      color: rgba(255,255,255,0.4);
    }
    .no-analysis mat-icon {
      font-size: 36px;
      width: 36px;
      height: 36px;
      margin-bottom: 8px;
    }
  `]
})
export class EventDetailDialogComponent implements OnInit {
  analysis = signal<EventAnalysis | null>(null);
  analysisLoading = signal(true);

  constructor(
    @Inject(MAT_DIALOG_DATA) public event: EconomicEvent,
    private dialogRef: MatDialogRef<EventDetailDialogComponent>,
    private eventsService: EventsService
  ) {}

  async ngOnInit() {
    try {
      const analysis = await this.eventsService.fetchEventAnalysis(this.event.id);
      this.analysis.set(analysis);
    } catch (err) {
      console.error('Failed to load analysis:', err);
    } finally {
      this.analysisLoading.set(false);
    }
  }

  isPositiveSurprise(): boolean {
    if (!this.event.actual || !this.event.forecast) return false;
    return parseFloat(this.event.actual) > parseFloat(this.event.forecast);
  }

  isNegativeSurprise(): boolean {
    if (!this.event.actual || !this.event.forecast) return false;
    return parseFloat(this.event.actual) < parseFloat(this.event.forecast);
  }
}
