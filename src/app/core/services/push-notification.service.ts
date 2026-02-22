import { Injectable, signal, effect } from '@angular/core';
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

    // Re-check subscription state whenever the user changes (login/reload)
    effect(() => {
      const user = this.auth.currentUser();
      if (user) {
        this.checkExistingSubscription(user.id);
      } else {
        this.isSubscribed.set(false);
      }
    });
  }

  private async checkExistingSubscription(userId: string) {
    try {
      // Check the database for an active subscription for this user
      const { data, error } = await this.supabase.from('push_subscriptions')
        .select('id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .limit(1);

      if (!error && data && data.length > 0) {
        this.isSubscribed.set(true);
        return;
      }

      // Fallback: also check SwPush if service worker is active
      if (this.swPush.isEnabled) {
        const sub = await this.swPush.subscription.toPromise();
        this.isSubscribed.set(!!sub);
        return;
      }

      this.isSubscribed.set(false);
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
    try {
      const userId = this.auth.currentUser()?.id;

      // Remove all subscriptions for this user from DB
      if (userId) {
        await this.supabase.from('push_subscriptions')
          .delete()
          .eq('user_id', userId);
      }

      // Also unsubscribe from SwPush if active
      if (this.swPush.isEnabled) {
        try {
          await this.swPush.unsubscribe();
        } catch {
          // SwPush may not have an active subscription, that's fine
        }
      }

      this.isSubscribed.set(false);
      return true;
    } catch (err) {
      console.error('Push unsubscribe failed:', err);
      return false;
    }
  }
}
