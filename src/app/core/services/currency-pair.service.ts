import { Injectable, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { CurrencyPair } from '../models';

@Injectable({ providedIn: 'root' })
export class CurrencyPairService {
  private pairsSignal = signal<CurrencyPair[]>([]);
  private loadedSignal = signal(false);

  readonly pairs = this.pairsSignal.asReadonly();
  readonly loaded = this.loadedSignal.asReadonly();

  constructor(private supabase: SupabaseService) {}

  async loadPairs(): Promise<CurrencyPair[]> {
    if (this.loadedSignal()) return this.pairsSignal();

    const { data, error } = await this.supabase.from('currency_pairs')
      .select('*')
      .eq('is_active', true)
      .order('symbol');

    if (error) throw error;

    const pairs = (data ?? []) as CurrencyPair[];
    this.pairsSignal.set(pairs);
    this.loadedSignal.set(true);
    return pairs;
  }

  getPairById(id: string): CurrencyPair | undefined {
    return this.pairsSignal().find(p => p.id === id);
  }

  getPairBySymbol(symbol: string): CurrencyPair | undefined {
    return this.pairsSignal().find(p => p.symbol === symbol);
  }
}
