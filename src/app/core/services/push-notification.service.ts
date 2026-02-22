import { Injectable, signal } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PushNotificationService {
  readonly isSubscribed = signal(false);
  readonly isSupported = signal(false);
  readonly permissionState = signal<NotificationPermission>('default');

  constructor(
    private swPush: SwPush,
    private supabase: SupabaseService,
    private auth: AuthService
  ) {
    this.isSupported.set(this.swPush.isEnabled);
    if (typeof Notification !== 'undefined') {
      this.permissionState.set(Notification.permission);
    }
    this.checkExistingSubscription();
  }

  private async checkExistingSubscription() {
    if (!this.swPush.isEnabled) return;

    try {
      const sub = await this.swPush.subscription.toPromise();
      this.isSubscribed.set(!!sub);
    } catch {
      this.isSubscribed.set(false);
    }
  }

  async subscribe(): Promise<boolean> {
    if (!this.swPush.isEnabled) return false;

    const vapidKey = (environment as any).vapidPublicKey;
    if (!vapidKey) {
      console.warn('VAPID public key not configured');
      return false;
    }

    try {
      const sub = await this.swPush.requestSubscription({ serverPublicKey: vapidKey });
      const keys = sub.toJSON().keys;

      const userId = this.auth.currentUser()?.id;
      if (!userId || !keys) return false;

      const { error } = await this.supabase.from('push_subscriptions').upsert({
        user_id: userId,
        endpoint: sub.endpoint,
        p256dh: keys['p256dh'],
        auth_key: keys['auth'],
        is_active: true
      }, { onConflict: 'user_id,endpoint' });

      if (error) throw error;

      this.isSubscribed.set(true);
      this.permissionState.set(Notification.permission);
      return true;
    } catch (err) {
      console.error('Push subscription failed:', err);
      this.permissionState.set(typeof Notification !== 'undefined' ? Notification.permission : 'denied');
      return false;
    }
  }

  async unsubscribe(): Promise<boolean> {
    if (!this.swPush.isEnabled) return false;

    try {
      const sub = await this.swPush.subscription.toPromise();
      if (!sub) return false;

      const userId = this.auth.currentUser()?.id;
      if (userId) {
        await this.supabase.from('push_subscriptions')
          .delete()
          .eq('user_id', userId)
          .eq('endpoint', sub.endpoint);
      }

      await this.swPush.unsubscribe();
      this.isSubscribed.set(false);
      return true;
    } catch (err) {
      console.error('Push unsubscribe failed:', err);
      return false;
    }
  }
}
