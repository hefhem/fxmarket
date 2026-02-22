import { Component } from '@angular/core';
import { EventListComponent } from '../dashboard/event-list/event-list.component';

@Component({
  selector: 'app-events-page',
  standalone: true,
  imports: [EventListComponent],
  template: `
    <div class="events-page">
      <h1>Economic Events</h1>
      <p class="subtitle">Browse and filter economic events from multiple data sources</p>
      <app-event-list [compact]="false" />
    </div>
  `,
  styles: [`
    .events-page { max-width: 1200px; margin: 0 auto; }
    h1 { margin: 0 0 4px; }
    .subtitle { color: rgba(255,255,255,0.5); margin-bottom: 24px; }
  `]
})
export class EventsPageComponent {}
