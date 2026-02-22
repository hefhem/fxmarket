import { Injectable, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { Session, User } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { UserProfile, UserRole } from '../models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private sessionSignal = signal<Session | null>(null);
  private profileSignal = signal<UserProfile | null>(null);
  private rolesSignal = signal<UserRole[]>([]);
  private loadingSignal = signal(true);

  readonly session = this.sessionSignal.asReadonly();
  readonly profile = this.profileSignal.asReadonly();
  readonly roles = this.rolesSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();

  readonly isAuthenticated = computed(() => !!this.sessionSignal());
  readonly currentUser = computed(() => this.sessionSignal()?.user ?? null);
  readonly isAdmin = computed(() =>
    this.rolesSignal().some(r => r.role?.name === 'admin')
  );

  constructor(
    private supabase: SupabaseService,
    private router: Router
  ) {
    this.initAuth();
  }

  private async initAuth() {
    const { data: { session } } = await this.supabase.auth.getSession();
    this.sessionSignal.set(session);

    if (session?.user) {
      await this.loadProfile(session.user.id);
      await this.loadRoles(session.user.id);
    }

    this.loadingSignal.set(false);

    this.supabase.onAuthStateChange(async (event, session) => {
      this.sessionSignal.set(session);

      if (event === 'SIGNED_IN' && session?.user) {
        await this.loadProfile(session.user.id);
        await this.loadRoles(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        this.profileSignal.set(null);
        this.rolesSignal.set([]);
      }
    });
  }

  private async loadProfile(userId: string) {
    const { data } = await this.supabase.from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (data) this.profileSignal.set(data as UserProfile);
  }

  private async loadRoles(userId: string) {
    const { data } = await this.supabase.from('user_roles')
      .select('*, role:roles(*)')
      .eq('user_id', userId);
    if (data) this.rolesSignal.set(data as UserRole[]);
  }

  async signUp(email: string, password: string, fullName: string) {
    const { data, error } = await this.supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName }
      }
    });
    if (error) throw error;
    return data;
  }

  async signIn(email: string, password: string) {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password
    });
    if (error) throw error;
    return data;
  }

  async signOut() {
    const { error } = await this.supabase.auth.signOut();
    if (error) throw error;
    this.router.navigate(['/auth/login']);
  }

  async resetPassword(email: string) {
    const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`
    });
    if (error) throw error;
  }

  async updatePassword(newPassword: string) {
    const { error } = await this.supabase.auth.updateUser({
      password: newPassword
    });
    if (error) throw error;
  }

  async updateProfile(updates: Partial<UserProfile>) {
    const user = this.currentUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await this.supabase.from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single();

    if (error) throw error;
    if (data) this.profileSignal.set(data as UserProfile);
    return data;
  }
}
