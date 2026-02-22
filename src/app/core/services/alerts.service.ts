import { Injectable, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { AlertRule, Notification } from '../models';
import { RealtimeChannel } from '@supabase/supabase-js';

@Injectable({ providedIn: 'root' })
export class AlertsService {
  private alertsSignal = signal<AlertRule[]>([]);
  private notificationsSignal = signal<Notification[]>([]);
  private unreadCountSignal = signal(0);
  private notificationChannel?: RealtimeChannel;

  readonly alerts = this.alertsSignal.asReadonly();
  readonly notifications = this.notificationsSignal.asReadonly();
  readonly unreadCount = this.unreadCountSignal.asReadonly();

  constructor(
    private supabase: SupabaseService,
    private auth: AuthService
  ) {}

  async loadAlerts(): Promise<AlertRule[]> {
    const user = this.auth.currentUser();
    if (!user) return [];

    const { data, error } = await this.supabase.from('alerts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    const alerts = (data ?? []) as AlertRule[];
    this.alertsSignal.set(alerts);
    return alerts;
  }

  async createAlert(alert: Partial<AlertRule>): Promise<void> {
    const user = this.auth.currentUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await this.supabase.from('alerts')
      .insert({ ...alert, user_id: user.id });

    if (error) throw error;
    await this.loadAlerts();
  }

  async updateAlert(id: string, updates: Partial<AlertRule>): Promise<void> {
    const { error } = await this.supabase.from('alerts')
      .update(updates)
      .eq('id', id);

    if (error) throw error;
    await this.loadAlerts();
  }

  async deleteAlert(id: string): Promise<void> {
    const { error } = await this.supabase.from('alerts')
      .delete()
      .eq('id', id);

    if (error) throw error;
    this.alertsSignal.update(alerts => alerts.filter(a => a.id !== id));
  }

  async loadNotifications(): Promise<Notification[]> {
    const user = this.auth.currentUser();
    if (!user) return [];

    const { data, error } = await this.supabase.from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    const notifications = (data ?? []) as Notification[];
    this.notificationsSignal.set(notifications);
    this.unreadCountSignal.set(notifications.filter(n => !n.is_read).length);
    return notifications;
  }

  async markAsRead(id: string): Promise<void> {
    const { error } = await this.supabase.from('notifications')
      .update({ is_read: true })
      .eq('id', id);

    if (error) throw error;
    this.notificationsSignal.update(notifs =>
      notifs.map(n => n.id === id ? { ...n, is_read: true } : n)
    );
    this.unreadCountSignal.update(c => Math.max(0, c - 1));
  }

  async markAllAsRead(): Promise<void> {
    const user = this.auth.currentUser();
    if (!user) return;

    const { error } = await this.supabase.from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    if (error) throw error;
    this.notificationsSignal.update(notifs =>
      notifs.map(n => ({ ...n, is_read: true }))
    );
    this.unreadCountSignal.set(0);
  }

  subscribeToNotifications() {
    const user = this.auth.currentUser();
    if (!user) return;

    this.notificationChannel = this.supabase.channel('user-notifications')
      .on(
        'postgres_changes' as any,
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        },
        (payload: any) => {
          const notification = payload.new as Notification;
          this.notificationsSignal.update(notifs => [notification, ...notifs]);
          this.unreadCountSignal.update(c => c + 1);
        }
      )
      .subscribe();
  }

  unsubscribeFromNotifications() {
    if (this.notificationChannel) {
      this.supabase.removeChannel(this.notificationChannel);
    }
  }
}
