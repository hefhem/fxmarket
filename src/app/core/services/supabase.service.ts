import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, AuthChangeEvent, Session, RealtimeChannel } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseAnonKey);
  }

  get client(): SupabaseClient {
    return this.supabase;
  }

  get auth() {
    return this.supabase.auth;
  }

  onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void) {
    return this.supabase.auth.onAuthStateChange(callback);
  }

  from(table: string) {
    return this.supabase.from(table);
  }

  channel(name: string): RealtimeChannel {
    return this.supabase.channel(name);
  }

  removeChannel(channel: RealtimeChannel) {
    return this.supabase.removeChannel(channel);
  }
}
