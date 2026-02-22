import { Component, OnInit, input, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { EventsService, EventFilters } from '../../../core/services/events.service';
import { EconomicEvent } from '../../../core/models';
import { ImpactBadgeComponent } from '../../../shared/components/impact-badge/impact-badge.component';
import { EventDetailDialogComponent } from '../event-detail/event-detail-dialog.component';

@Component({
  selector: 'app-event-list',
  standalone: true,
  imports: [
    CommonModule, FormsModule, DatePipe,
    MatTableModule, MatFormFieldModule, MatSelectModule,
    MatInputModule, MatIconModule, MatButtonModule,
    MatProgressSpinnerModule, MatChipsModule, MatDialogModule,
    MatTooltipModule, ImpactBadgeComponent
  ],
  template: `
    @if (!compact()) {
      <div class="filters">
        <mat-form-field appearance="outline" class="filter-field">
          <mat-label>Currency</mat-label>
          <mat-select [(value)]="selectedCurrency" (selectionChange)="applyFilters()">
            <mat-option value="">All</mat-option>
            @for (currency of currencies; track currency) {
              <mat-option [value]="currency">{{ currency }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="filter-field">
          <mat-label>Impact</mat-label>
          <mat-select [(value)]="selectedImpact" (selectionChange)="applyFilters()">
            <mat-option value="">All</mat-option>
            <mat-option value="high">High</mat-option>
            <mat-option value="medium">Medium</mat-option>
            <mat-option value="low">Low</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="filter-field search-field">
          <mat-label>Search</mat-label>
          <input matInput [(ngModel)]="searchText" (input)="applyFilters()" placeholder="Search events...">
          <mat-icon matSuffix>search</mat-icon>
        </mat-form-field>
      </div>
    }

    @if (loading()) {
      <div class="loading-container">
        <mat-spinner diameter="32"></mat-spinner>
      </div>
    } @else if (events().length === 0) {
      <div class="empty-state">
        <mat-icon>event_busy</mat-icon>
        <p>No economic events found</p>
      </div>
    } @else {
      <div class="events-table-container">
        <table mat-table [dataSource]="events()" class="events-table">
          <ng-container matColumnDef="datetime">
            <th mat-header-cell *matHeaderCellDef>Date/Time</th>
            <td mat-cell *matCellDef="let event">
              {{ event.event_datetime | date:'MMM d, HH:mm' }}
            </td>
          </ng-container>

          <ng-container matColumnDef="currency">
            <th mat-header-cell *matHeaderCellDef>Currency</th>
            <td mat-cell *matCellDef="let event">
              <span class="currency-tag">{{ event.currency }}</span>
            </td>
          </ng-container>

          <ng-container matColumnDef="event_name">
            <th mat-header-cell *matHeaderCellDef>Event</th>
            <td mat-cell *matCellDef="let event">{{ event.event_name }}</td>
          </ng-container>

          <ng-container matColumnDef="impact">
            <th mat-header-cell *matHeaderCellDef>Impact</th>
            <td mat-cell *matCellDef="let event">
              <app-impact-badge [impact]="event.impact" />
            </td>
          </ng-container>

          <ng-container matColumnDef="actual">
            <th mat-header-cell *matHeaderCellDef>Actual</th>
            <td mat-cell *matCellDef="let event"
                [class.positive-value]="isPositiveSurprise(event)"
                [class.negative-value]="isNegativeSurprise(event)">
              {{ event.actual || '-' }}
            </td>
          </ng-container>

          <ng-container matColumnDef="forecast">
            <th mat-header-cell *matHeaderCellDef>Forecast</th>
            <td mat-cell *matCellDef="let event">{{ event.forecast || '-' }}</td>
          </ng-container>

          <ng-container matColumnDef="previous">
            <th mat-header-cell *matHeaderCellDef>Previous</th>
            <td mat-cell *matCellDef="let event">{{ event.previous || '-' }}</td>
          </ng-container>

          <ng-container matColumnDef="analysis">
            <th mat-header-cell *matHeaderCellDef>AI</th>
            <td mat-cell *matCellDef="let event">
              <mat-icon class="ai-icon" matTooltip="Click to view AI analysis">psychology</mat-icon>
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="displayedColumns()"></tr>
          <tr mat-row *matRowDef="let row; columns: displayedColumns();"
              class="event-row" (click)="openEventDetail(row)"></tr>
        </table>
      </div>
    }
  `,
  styles: [`
    .filters {
      display: flex;
      gap: 16px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    .filter-field { min-width: 140px; }
    .search-field { flex: 1; min-width: 200px; }
    .loading-container { text-align: center; padding: 32px; }
    .empty-state {
      text-align: center;
      padding: 48px;
      color: rgba(255, 255, 255, 0.4);
    }
    .empty-state mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
    }
    .events-table-container { overflow-x: auto; }
    .events-table { width: 100%; }
    .currency-tag {
      padding: 2px 8px;
      background: rgba(76, 175, 80, 0.15);
      color: #4caf50;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
    }
    .event-row { cursor: pointer; }
    .event-row:hover { background: rgba(255, 255, 255, 0.05); }
    .positive-value { color: #4caf50; font-weight: 600; }
    .negative-value { color: #f44336; font-weight: 600; }
    .ai-icon { color: #7c4dff; font-size: 18px; }
  `]
})
export class EventListComponent implements OnInit {
  compact = input(false);

  events = signal<EconomicEvent[]>([]);
  loading = signal(true);

  currencies = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD'];
  selectedCurrency = '';
  selectedImpact = '';
  searchText = '';

  displayedColumns = signal<string[]>([]);

  constructor(
    private eventsService: EventsService,
    private dialog: MatDialog
  ) {}

  ngOnInit() {
    if (this.compact()) {
      this.displayedColumns.set(['datetime', 'currency', 'event_name', 'impact']);
    } else {
      this.displayedColumns.set(['datetime', 'currency', 'event_name', 'impact', 'actual', 'forecast', 'previous', 'analysis']);
    }
    this.applyFilters();
  }

  async applyFilters() {
    this.loading.set(true);
    try {
      const filters: EventFilters = {};
      if (this.compact()) filters.limit = 10;
      if (this.selectedCurrency) filters.currency = this.selectedCurrency;
      if (this.selectedImpact) filters.impact = this.selectedImpact;
      if (this.searchText) filters.search = this.searchText;

      const data = await this.eventsService.fetchEvents(filters);
      this.events.set((data ?? []) as EconomicEvent[]);
    } catch (err) {
      console.error('Failed to load events:', err);
    } finally {
      this.loading.set(false);
    }
  }

  openEventDetail(event: EconomicEvent) {
    this.dialog.open(EventDetailDialogComponent, {
      data: event,
      width: '600px',
      maxWidth: '95vw',
      panelClass: 'event-detail-dialog'
    });
  }

  isPositiveSurprise(event: EconomicEvent): boolean {
    if (!event.actual || !event.forecast) return false;
    return parseFloat(event.actual) > parseFloat(event.forecast);
  }

  isNegativeSurprise(event: EconomicEvent): boolean {
    if (!event.actual || !event.forecast) return false;
    return parseFloat(event.actual) < parseFloat(event.forecast);
  }
}
