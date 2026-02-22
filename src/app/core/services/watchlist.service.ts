import { Injectable, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { Watchlist } from '../models';

@Injectable({ providedIn: 'root' })
export class WatchlistService {
  private itemsSignal = signal<Watchlist[]>([]);
  private loadingSignal = signal(false);

  readonly items = this.itemsSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();

  constructor(
    private supabase: SupabaseService,
    private auth: AuthService
  ) {}

  async loadWatchlist(): Promise<Watchlist[]> {
    const user = this.auth.currentUser();
    if (!user) return [];

    this.loadingSignal.set(true);
    const { data, error } = await this.supabase.from('watchlists')
      .select('*, currency_pairs(symbol, display_name)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const items = (data ?? []).map((w: any) => ({
      ...w,
      pair_symbol: w.currency_pairs?.symbol
    })) as Watchlist[];

    this.itemsSignal.set(items);
    this.loadingSignal.set(false);
    return items;
  }

  async addPair(pairId: string): Promise<void> {
    const user = this.auth.currentUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await this.supabase.from('watchlists')
      .insert({ user_id: user.id, pair_id: pairId });

    if (error) throw error;
    await this.loadWatchlist();
  }

  async removePair(pairId: string): Promise<void> {
    const user = this.auth.currentUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await this.supabase.from('watchlists')
      .delete()
      .eq('user_id', user.id)
      .eq('pair_id', pairId);

    if (error) throw error;
    this.itemsSignal.update(items => items.filter(w => w.pair_id !== pairId));
  }

  isWatching(pairId: string): boolean {
    return this.itemsSignal().some(w => w.pair_id === pairId);
  }
}
