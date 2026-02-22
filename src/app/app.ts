import { Component, OnInit } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { SwPush } from '@angular/service-worker';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `<router-outlet />`,
  styles: [`:host { display: block; height: 100%; }`]
})
export class App implements OnInit {
  title = 'FX Market Analyzer';

  constructor(
    private swPush: SwPush,
    private router: Router
  ) {}

  ngOnInit() {
    if (this.swPush.isEnabled) {
      this.swPush.notificationClicks.subscribe(event => {
        const url = event.notification?.data?.url;
        if (url) {
          this.router.navigateByUrl(url);
        } else {
          this.router.navigateByUrl('/signals');
        }
      });
    }
  }
}
