import { Component } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatDividerModule } from '@angular/material/divider';

@Component({
  selector: 'app-user-guide',
  standalone: true,
  imports: [MatCardModule, MatIconModule, MatExpansionModule, MatDividerModule],
  template: `
    <div class="guide-page">
      <h1>User Guide</h1>
      <p class="subtitle">Learn how to use the FX Market Analyzer platform</p>

      <!-- Overview -->
      <mat-card class="guide-section">
        <mat-card-content>
          <h2><mat-icon>info</mat-icon> Overview</h2>
          <p>
            FX Market Analyzer is a forex fundamental analysis platform that fetches economic events
            from multiple data sources, analyzes them using Claude AI, and provides trade direction
            predictions (bullish/bearish/neutral) with confidence scores for G7 major currency pairs.
          </p>
          <p>
            The platform covers: <strong>EUR/USD, GBP/USD, USD/JPY, USD/CHF, AUD/USD, USD/CAD, NZD/USD</strong>
          </p>
        </mat-card-content>
      </mat-card>

      <!-- Features -->
      <mat-accordion>
        <mat-expansion-panel>
          <mat-expansion-panel-header>
            <mat-panel-title><mat-icon>dashboard</mat-icon> Dashboard</mat-panel-title>
          </mat-expansion-panel-header>
          <p>The dashboard provides a real-time overview of the market:</p>
          <ul>
            <li><strong>Bias Cards</strong> - Each G7 pair shows its current directional bias (bullish/bearish/neutral), bias score (-100 to +100), and AI-generated reasoning.</li>
            <li><strong>Market Heatmap</strong> - Color-coded visualization of all pairs' bias strength at a glance.</li>
            <li><strong>Summary Stats</strong> - Quick count of bullish, bearish, and neutral pairs.</li>
            <li><strong>Recent Events</strong> - Latest economic events with impact levels.</li>
          </ul>
          <p>Click any bias card to navigate to the detailed pair analysis page.</p>
        </mat-expansion-panel>

        <mat-expansion-panel>
          <mat-expansion-panel-header>
            <mat-panel-title><mat-icon>event</mat-icon> Economic Events</mat-panel-title>
          </mat-expansion-panel-header>
          <p>Browse economic events from three data sources:</p>
          <ul>
            <li><strong>Finnhub</strong> - Economic calendar with actual/forecast/previous values</li>
            <li><strong>JBlanked</strong> - Aggregated data from Forex Factory, MQL5, FxStreet</li>
            <li><strong>RSS Feeds</strong> - News from Investing.com and central bank sources</li>
          </ul>
          <p><strong>Filters:</strong> Filter by currency (USD, EUR, GBP, etc.), impact level (High/Medium/Low), and search by event name.</p>
          <p><strong>Calendar View:</strong> Switch to calendar view to see events mapped by date with color-coded impact levels.</p>
          <p><strong>Event Detail:</strong> Click any event to see its AI analysis, including sentiment, confidence score, affected pairs, and reasoning.</p>
        </mat-expansion-panel>

        <mat-expansion-panel>
          <mat-expansion-panel-header>
            <mat-panel-title><mat-icon>analytics</mat-icon> Pair Analysis</mat-panel-title>
          </mat-expansion-panel-header>
          <p>Deep dive into individual currency pairs:</p>
          <ul>
            <li><strong>Current Bias</strong> - Today's AI-generated directional bias with full reasoning</li>
            <li><strong>History Chart</strong> - Visual 30-day bias history showing directional changes</li>
            <li><strong>History Table</strong> - Detailed daily records with direction, score, confidence, and AI reasoning</li>
          </ul>
        </mat-expansion-panel>

        <mat-expansion-panel>
          <mat-expansion-panel-header>
            <mat-panel-title><mat-icon>bookmark</mat-icon> Watchlist</mat-panel-title>
          </mat-expansion-panel-header>
          <p>Track your preferred currency pairs:</p>
          <ul>
            <li>Add/remove pairs from your personal watchlist</li>
            <li>Each watched pair shows its current bias, score, and confidence</li>
            <li>Quick navigation to detailed pair analysis</li>
          </ul>
        </mat-expansion-panel>

        <mat-expansion-panel>
          <mat-expansion-panel-header>
            <mat-panel-title><mat-icon>notifications</mat-icon> Alerts & Notifications</mat-panel-title>
          </mat-expansion-panel-header>
          <p>Set up custom alert rules:</p>
          <ul>
            <li><strong>Bias Change</strong> - Get notified when a pair's bias changes direction</li>
            <li><strong>High Impact Event</strong> - Alert on high-impact economic events</li>
            <li><strong>Confidence Threshold</strong> - Notify when AI confidence exceeds a threshold</li>
          </ul>
          <p>Alerts can be filtered by specific currency pair or set to monitor all pairs. Toggle alerts on/off without deleting them.</p>
        </mat-expansion-panel>

        <mat-expansion-panel>
          <mat-expansion-panel-header>
            <mat-panel-title><mat-icon>psychology</mat-icon> AI Analysis</mat-panel-title>
          </mat-expansion-panel-header>
          <p>How the AI analysis works:</p>
          <ul>
            <li><strong>Event Analysis</strong> - Each economic event is analyzed by Claude AI for its impact on currencies. Events are batched (15-20 at a time) and analyzed every 4 hours.</li>
            <li><strong>Daily Bias</strong> - Three times per day (8am, 2pm, 8pm UTC), all analyzed events are aggregated into a directional bias per pair.</li>
            <li><strong>Scoring</strong> - Bias scores range from -100 (strongly bearish) to +100 (strongly bullish). Confidence ranges from 0% to 100%.</li>
          </ul>
          <p><strong>Key factors the AI considers:</strong></p>
          <ul>
            <li>Actual vs Forecast deviations (positive surprise = bullish for currency)</li>
            <li>Event impact level weighting</li>
            <li>Cross-currency effects (e.g., bullish USD = bearish EUR/USD)</li>
            <li>Historical significance of the event type</li>
          </ul>
        </mat-expansion-panel>

        <mat-expansion-panel>
          <mat-expansion-panel-header>
            <mat-panel-title><mat-icon>cloud_off</mat-icon> Offline Mode</mat-panel-title>
          </mat-expansion-panel-header>
          <p>The app includes offline support via a service worker:</p>
          <ul>
            <li><strong>Cached Dashboard</strong> - If you lose internet connection, the app will show the last cached version of the dashboard, bias data, and events.</li>
            <li><strong>Offline Banner</strong> - A yellow banner appears at the top when you are offline, indicating that cached data is being displayed.</li>
            <li><strong>Auto Update</strong> - When a new version of the app is deployed, you'll see a notification prompting you to update.</li>
            <li><strong>Data Freshness</strong> - Bias and pair data is cached for up to 1 hour; event data for up to 4 hours. When online, fresh data is always fetched first.</li>
          </ul>
        </mat-expansion-panel>

        <mat-expansion-panel>
          <mat-expansion-panel-header>
            <mat-panel-title><mat-icon>health_and_safety</mat-icon> Data Resilience</mat-panel-title>
          </mat-expansion-panel-header>
          <p>The platform is designed to be resilient to data source failures:</p>
          <ul>
            <li><strong>Retry Logic</strong> - All data source fetches include automatic retry with exponential backoff (up to 3 attempts).</li>
            <li><strong>Fallback Endpoints</strong> - Each data source has backup URLs. If the primary endpoint fails, the system automatically tries alternatives.</li>
            <li><strong>Partial Success</strong> - If one data source fails, the system continues with events from the remaining sources.</li>
            <li><strong>Health Monitoring</strong> - Admins can view data source health in the Admin Panel's Health tab, showing success/error rates and last activity.</li>
            <li><strong>Data Retention</strong> - Events older than 90 days and logs older than 30 days are automatically cleaned up weekly.</li>
          </ul>
        </mat-expansion-panel>

        <mat-expansion-panel>
          <mat-expansion-panel-header>
            <mat-panel-title><mat-icon>settings</mat-icon> Settings</mat-panel-title>
          </mat-expansion-panel-header>
          <ul>
            <li><strong>Profile</strong> - Update your display name</li>
            <li><strong>Timezone</strong> - Set your preferred timezone for event display</li>
            <li><strong>Default Pairs</strong> - Choose which pairs to show by default</li>
            <li><strong>Password</strong> - Change your account password</li>
          </ul>
        </mat-expansion-panel>
      </mat-accordion>

      <mat-divider></mat-divider>

      <!-- Data Pipeline -->
      <mat-card class="guide-section">
        <mat-card-content>
          <h2><mat-icon>sync</mat-icon> Data Pipeline</h2>
          <p>Events are automatically fetched and analyzed on this schedule:</p>
          <ul>
            <li><strong>Every 4 hours</strong> - New economic events fetched from all sources</li>
            <li><strong>30 min after fetch</strong> - Unanalyzed events sent to Claude AI</li>
            <li><strong>3x daily (8am, 2pm, 8pm UTC)</strong> - Daily bias generated per pair</li>
            <li><strong>Weekly</strong> - Events older than 90 days cleaned up</li>
          </ul>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .guide-page { max-width: 800px; margin: 0 auto; }
    h1 { margin: 0 0 4px; }
    .subtitle { color: rgba(255,255,255,0.5); margin-bottom: 24px; }
    .guide-section { margin-bottom: 24px; }
    .guide-section h2 {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    }
    .guide-section h2 mat-icon { color: #4caf50; }
    p { line-height: 1.6; }
    ul { line-height: 1.8; }
    mat-accordion { margin-bottom: 24px; }
    mat-panel-title {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    mat-panel-title mat-icon { color: rgba(255,255,255,0.5); }
    mat-divider { margin: 24px 0; }
  `]
})
export class UserGuideComponent {}
