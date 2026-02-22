import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-placeholder',
  standalone: true,
  imports: [MatCardModule, MatIconModule],
  template: `
    <div class="placeholder-page">
      <mat-card class="placeholder-card">
        <mat-card-content>
          <mat-icon class="placeholder-icon">{{ icon }}</mat-icon>
          <h2>{{ title }}</h2>
          <p>{{ description }}</p>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .placeholder-page {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 60vh;
    }
    .placeholder-card {
      text-align: center;
      max-width: 400px;
      padding: 48px 32px;
    }
    .placeholder-icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
      color: rgba(255,255,255,0.3);
    }
    h2 { margin-top: 16px; }
    p { color: rgba(255,255,255,0.5); }
  `]
})
export class PlaceholderComponent {
  title = '';
  icon = 'construction';
  description = '';

  constructor(private route: ActivatedRoute) {
    this.title = this.route.snapshot.data['title'] || 'Coming Soon';
    this.icon = this.route.snapshot.data['icon'] || 'construction';
    this.description = this.route.snapshot.data['description'] || 'This feature is under development.';
  }
}
