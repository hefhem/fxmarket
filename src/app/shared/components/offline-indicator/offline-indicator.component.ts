import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatIconModule } from '@angular/material/icon';
import { filter } from 'rxjs';

@Component({
  selector: 'app-offline-indicator',
  standalone: true,
  imports: [MatIconModule, MatSnackBarModule],
  template: `
    @if (isOffline()) {
      <div class="offline-banner">
        <mat-icon>cloud_off</mat-icon>
        <span>You are offline. Showing cached data.</span>
      </div>
    }
  `,
  styles: [`
    .offline-banner {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      background: rgba(255, 152, 0, 0.15);
      color: #ff9800;
      font-size: 13px;
      border-bottom: 1px solid rgba(255, 152, 0, 0.3);
    }
    .offline-banner mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
  `]
})
export class OfflineIndicatorComponent implements OnInit, OnDestroy {
  isOffline = signal(!navigator.onLine);

  private onlineHandler = () => this.isOffline.set(false);
  private offlineHandler = () => this.isOffline.set(true);

  constructor(
    private swUpdate: SwUpdate,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    window.addEventListener('online', this.onlineHandler);
    window.addEventListener('offline', this.offlineHandler);

    // Listen for app updates
    if (this.swUpdate.isEnabled) {
      this.swUpdate.versionUpdates
        .pipe(filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'))
        .subscribe(() => {
          const snackRef = this.snackBar.open(
            'A new version is available.',
            'Update',
            { duration: 10000 }
          );
          snackRef.onAction().subscribe(() => {
            window.location.reload();
          });
        });
    }
  }

  ngOnDestroy() {
    window.removeEventListener('online', this.onlineHandler);
    window.removeEventListener('offline', this.offlineHandler);
  }
}
