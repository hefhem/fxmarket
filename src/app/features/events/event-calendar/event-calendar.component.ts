import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { SupabaseService } from '../../../core/services/supabase.service';
import { EconomicEvent } from '../../../core/models';
import { EventDetailDialogComponent } from '../../dashboard/event-detail/event-detail-dialog.component';

interface CalendarDay {
  date: Date;
  dateStr: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  events: EconomicEvent[];
}

@Component({
  selector: 'app-event-calendar',
  standalone: true,
  imports: [
    CommonModule, DatePipe,
    MatCardModule, MatIconModule, MatButtonModule,
    MatProgressSpinnerModule, MatDialogModule
  ],
  template: `
    <div class="calendar-container">
      <!-- Calendar Header -->
      <div class="calendar-header">
        <button mat-icon-button (click)="prevMonth()">
          <mat-icon>chevron_left</mat-icon>
        </button>
        <h2>{{ currentDate() | date:'MMMM yyyy' }}</h2>
        <button mat-icon-button (click)="nextMonth()">
          <mat-icon>chevron_right</mat-icon>
        </button>
        <button mat-button (click)="goToToday()">Today</button>
      </div>

      @if (loading()) {
        <div class="loading"><mat-spinner diameter="32"></mat-spinner></div>
      } @else {
        <!-- Day Labels -->
        <div class="calendar-grid day-labels">
          @for (day of weekDays; track day) {
            <div class="day-label">{{ day }}</div>
          }
        </div>

        <!-- Calendar Days -->
        <div class="calendar-grid">
          @for (day of calendarDays(); track day.dateStr) {
            <div class="calendar-day"
                 [class.other-month]="!day.isCurrentMonth"
                 [class.today]="day.isToday">
              <span class="day-number">{{ day.date.getDate() }}</span>
              <div class="day-events">
                @for (event of day.events.slice(0, 3); track event.id) {
                  <div class="event-pill" [class]="'impact-' + event.impact"
                       (click)="openEvent(event)" [title]="event.event_name">
                    <span class="event-currency">{{ event.currency }}</span>
                    <span class="event-name">{{ event.event_name | slice:0:20 }}</span>
                  </div>
                }
                @if (day.events.length > 3) {
                  <span class="more-events">+{{ day.events.length - 3 }} more</span>
                }
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .calendar-container { max-width: 100%; }
    .calendar-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
    }
    .calendar-header h2 { margin: 0; flex: 0 0 auto; min-width: 200px; text-align: center; }
    .loading { text-align: center; padding: 48px; }
    .calendar-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 1px;
      background: rgba(255,255,255,0.05);
    }
    .day-labels { background: transparent; gap: 0; margin-bottom: 1px; }
    .day-label {
      text-align: center;
      padding: 8px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      color: rgba(255,255,255,0.4);
      letter-spacing: 1px;
    }
    .calendar-day {
      background: #1a1a2e;
      min-height: 100px;
      padding: 4px;
      position: relative;
    }
    .calendar-day.other-month {
      opacity: 0.3;
    }
    .calendar-day.today {
      background: rgba(76,175,80,0.08);
      border: 1px solid rgba(76,175,80,0.3);
    }
    .day-number {
      font-size: 12px;
      font-weight: 600;
      color: rgba(255,255,255,0.6);
      display: block;
      margin-bottom: 4px;
    }
    .today .day-number { color: #4caf50; }
    .day-events { display: flex; flex-direction: column; gap: 2px; }
    .event-pill {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 2px 4px;
      border-radius: 3px;
      font-size: 10px;
      cursor: pointer;
      transition: opacity 0.2s;
      overflow: hidden;
      white-space: nowrap;
    }
    .event-pill:hover { opacity: 0.8; }
    .impact-high { background: rgba(244,67,54,0.15); color: #f44336; }
    .impact-medium { background: rgba(255,152,0,0.15); color: #ff9800; }
    .impact-low { background: rgba(158,158,158,0.1); color: rgba(255,255,255,0.4); }
    .event-currency { font-weight: 700; font-size: 9px; }
    .event-name { overflow: hidden; text-overflow: ellipsis; }
    .more-events {
      font-size: 10px;
      color: rgba(255,255,255,0.3);
      padding: 2px 4px;
    }
    @media (max-width: 768px) {
      .calendar-day { min-height: 60px; }
      .event-name { display: none; }
    }
  `]
})
export class EventCalendarComponent implements OnInit {
  currentDate = signal(new Date());
  calendarDays = signal<CalendarDay[]>([]);
  loading = signal(true);
  weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  private eventsCache = new Map<string, EconomicEvent[]>();

  constructor(
    private supabase: SupabaseService,
    private dialog: MatDialog
  ) {}

  async ngOnInit() {
    await this.loadMonth();
  }

  async loadMonth() {
    this.loading.set(true);
    const date = this.currentDate();
    const year = date.getFullYear();
    const month = date.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // Get calendar grid start/end (include days from prev/next month)
    const gridStart = new Date(firstDay);
    gridStart.setDate(gridStart.getDate() - gridStart.getDay());
    const gridEnd = new Date(lastDay);
    gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));

    // Fetch events for the visible range
    const { data } = await this.supabase.from('economic_events')
      .select('*')
      .gte('event_datetime', gridStart.toISOString())
      .lte('event_datetime', gridEnd.toISOString())
      .order('event_datetime', { ascending: true });

    const events = (data ?? []) as EconomicEvent[];
    const eventsByDate = new Map<string, EconomicEvent[]>();
    events.forEach(e => {
      const d = e.event_datetime.split('T')[0];
      if (!eventsByDate.has(d)) eventsByDate.set(d, []);
      eventsByDate.get(d)!.push(e);
    });

    const today = new Date().toISOString().split('T')[0];
    const days: CalendarDay[] = [];
    const cursor = new Date(gridStart);

    while (cursor <= gridEnd) {
      const dateStr = cursor.toISOString().split('T')[0];
      days.push({
        date: new Date(cursor),
        dateStr,
        isCurrentMonth: cursor.getMonth() === month,
        isToday: dateStr === today,
        events: eventsByDate.get(dateStr) ?? []
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    this.calendarDays.set(days);
    this.loading.set(false);
  }

  prevMonth() {
    this.currentDate.update(d => {
      const n = new Date(d);
      n.setMonth(n.getMonth() - 1);
      return n;
    });
    this.loadMonth();
  }

  nextMonth() {
    this.currentDate.update(d => {
      const n = new Date(d);
      n.setMonth(n.getMonth() + 1);
      return n;
    });
    this.loadMonth();
  }

  goToToday() {
    this.currentDate.set(new Date());
    this.loadMonth();
  }

  openEvent(event: EconomicEvent) {
    this.dialog.open(EventDetailDialogComponent, {
      data: event,
      width: '600px',
      maxWidth: '95vw'
    });
  }
}
