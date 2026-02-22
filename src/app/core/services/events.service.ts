import { Injectable, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { EconomicEvent, EventAnalysis, DailyTradeBias } from '../models';

export interface EventFilters {
  currency?: string;
  impact?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

@Injectable({ providedIn: 'root' })
export class EventsService {
  private eventsSignal = signal<EconomicEvent[]>([]);
  private biasSignal = signal<DailyTradeBias[]>([]);
  private loadingSignal = signal(false);

  readonly events = this.eventsSignal.asReadonly();
  readonly dailyBias = this.biasSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();

  constructor(private supabase: SupabaseService) {}

  async fetchEvents(filters: EventFilters = {}) {
    this.loadingSignal.set(true);

    let query = this.supabase.from('economic_events')
      .select('*')
      .order('event_datetime', { ascending: false })
      .limit(100);

    if (filters.currency) {
      query = query.eq('currency', filters.currency);
    }
    if (filters.impact) {
      query = query.eq('impact', filters.impact);
    }
    if (filters.dateFrom) {
      query = query.gte('event_datetime', filters.dateFrom);
    }
    if (filters.dateTo) {
      query = query.lte('event_datetime', filters.dateTo);
    }
    if (filters.search) {
      query = query.ilike('event_name', `%${filters.search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    this.eventsSignal.set((data ?? []) as EconomicEvent[]);
    this.loadingSignal.set(false);
    return data;
  }

  async fetchEventAnalysis(eventId: string): Promise<EventAnalysis | null> {
    const { data, error } = await this.supabase.from('event_analyses')
      .select('*')
      .eq('event_id', eventId)
      .single();
    if (error) return null;
    return data as EventAnalysis;
  }

  async fetchDailyBias(date?: string) {
    const targetDate = date ?? new Date().toISOString().split('T')[0];

    const { data, error } = await this.supabase.from('daily_trade_bias')
      .select('*, currency_pairs(symbol, display_name)')
      .eq('analysis_date', targetDate)
      .order('confidence', { ascending: false });

    if (error) throw error;
    this.biasSignal.set((data ?? []) as DailyTradeBias[]);
    return data;
  }

  async fetchBiasHistory(pairId: string, days: number = 30) {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    const { data, error } = await this.supabase.from('daily_trade_bias')
      .select('*')
      .eq('pair_id', pairId)
      .gte('analysis_date', fromDate.toISOString().split('T')[0])
      .order('analysis_date', { ascending: true });

    if (error) throw error;
    return (data ?? []) as DailyTradeBias[];
  }

  subscribeToBiasUpdates(callback: (bias: DailyTradeBias) => void) {
    const channel = this.supabase.channel('daily-bias-changes')
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'daily_trade_bias' },
        (payload: any) => callback(payload.new as DailyTradeBias)
      )
      .subscribe();

    return channel;
  }
}
