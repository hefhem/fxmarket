import { Component, signal } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';
import { MatIconModule } from '@angular/material/icon';
import { EventListComponent } from '../dashboard/event-list/event-list.component';
import { EventCalendarComponent } from './event-calendar/event-calendar.component';

@Component({
  selector: 'app-events-page',
  standalone: true,
  imports: [MatTabsModule, MatIconModule, EventListComponent, EventCalendarComponent],
  template: `
    <div class="events-page">
      <h1>Economic Events</h1>
      <p class="subtitle">Browse and filter economic events from multiple data sources</p>

      <mat-tab-group [(selectedIndex)]="selectedTab">
        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon>list</mat-icon>&nbsp;List View
          </ng-template>
          <div class="tab-content">
            <app-event-list [compact]="false" />
          </div>
        </mat-tab>
        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon>calendar_month</mat-icon>&nbsp;Calendar View
          </ng-template>
          <div class="tab-content">
            <app-event-calendar />
          </div>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
  styles: [`
    .events-page { max-width: 1200px; margin: 0 auto; }
    h1 { margin: 0 0 4px; }
    .subtitle { color: rgba(255,255,255,0.5); margin-bottom: 24px; }
    .tab-content { padding: 16px 0; }
  `]
})
export class EventsPageComponent {
  selectedTab = 0;
}
