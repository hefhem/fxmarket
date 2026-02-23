import { Injectable, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { PriceCandle, TechnicalIndicator } from '../models';

@Injectable({ providedIn: 'root' })
export class TechnicalAnalysisService {
  private loadingSignal = signal(false);
  readonly loading = this.loadingSignal.asReadonly();

  constructor(private supabase: SupabaseService) {}

  async fetchCandles(pairId: string, timeframe = 'D', days = 200): Promise<PriceCandle[]> {
    this.loadingSignal.set(true);
    try {
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - days);

      const { data, error } = await this.supabase.from('price_candles')
        .select('pair_id, open_time, open, high, low, close, volume, source')
        .eq('pair_id', pairId)
        .eq('timeframe', timeframe)
        .gte('open_time', fromDate.toISOString())
        .order('open_time', { ascending: true })
        .limit(days);

      if (error) throw error;
      return (data ?? []) as PriceCandle[];
    } finally {
      this.loadingSignal.set(false);
    }
  }

  async fetchIndicators(pairId: string, days = 30): Promise<TechnicalIndicator[]> {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    const { data, error } = await this.supabase.from('technical_indicators')
      .select('*')
      .eq('pair_id', pairId)
      .gte('indicator_date', fromDate.toISOString().split('T')[0])
      .order('indicator_date', { ascending: true });

    if (error) throw error;
    return (data ?? []) as TechnicalIndicator[];
  }

  async fetchLatestIndicator(pairId: string): Promise<TechnicalIndicator | null> {
    const { data, error } = await this.supabase.from('technical_indicators')
      .select('*')
      .eq('pair_id', pairId)
      .order('indicator_date', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // No rows
      throw error;
    }
    return data as TechnicalIndicator;
  }
}
