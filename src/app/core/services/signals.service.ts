import { Injectable, signal, computed } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { TradeSignal, SignalType, DailyTradeBias } from '../models';
import { RealtimeChannel } from '@supabase/supabase-js';

export function deriveSignal(biasScore: number, confidence: number): SignalType {
  if (biasScore > 0.5 && confidence > 0.7) return 'STRONG BUY';
  if (biasScore > 0.2 && confidence > 0.5) return 'BUY';
  if (biasScore < -0.5 && confidence > 0.7) return 'STRONG SELL';
  if (biasScore < -0.2 && confidence > 0.5) return 'SELL';
  return 'HOLD';
}

@Injectable({ providedIn: 'root' })
export class SignalsService {
  private signalsSignal = signal<TradeSignal[]>([]);
  private loadingSignal = signal(false);
  private biasChannel?: RealtimeChannel;

  readonly signals = this.signalsSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();

  readonly strongSignals = computed(() =>
    this.signalsSignal().filter(s => s.signal === 'STRONG BUY' || s.signal === 'STRONG SELL')
  );

  readonly signalCounts = computed(() => {
    const signals = this.signalsSignal();
    return {
      strongBuy: signals.filter(s => s.signal === 'STRONG BUY').length,
      buy: signals.filter(s => s.signal === 'BUY').length,
      hold: signals.filter(s => s.signal === 'HOLD').length,
      sell: signals.filter(s => s.signal === 'SELL').length,
      strongSell: signals.filter(s => s.signal === 'STRONG SELL').length,
    };
  });

  constructor(private supabase: SupabaseService) {}

  async loadSignals(): Promise<TradeSignal[]> {
    this.loadingSignal.set(true);
    try {
      const today = new Date().toISOString().split('T')[0];

      const { data, error } = await this.supabase.from('daily_trade_bias')
        .select('*, currency_pairs(symbol, display_name)')
        .eq('analysis_date', today)
        .order('confidence', { ascending: false });

      if (error) throw error;

      const signals: TradeSignal[] = (data ?? []).map((row: any) => {
        // Use combined_score when available for signal derivation
        const effectiveScore = row.combined_score ?? row.bias_score;
        return {
          pair_id: row.pair_id,
          pair_symbol: row.currency_pairs?.symbol ?? row.pair_symbol ?? '',
          display_name: row.currency_pairs?.display_name ?? '',
          signal: deriveSignal(effectiveScore, row.confidence),
          bias_score: row.bias_score,
          confidence: row.confidence,
          direction: row.direction,
          ai_reasoning: row.ai_reasoning,
          analysis_date: row.analysis_date,
          updated_at: row.updated_at,
          ta_score: row.ta_score ?? null,
          combined_score: row.combined_score ?? null,
          recommended_entry_timing: row.recommended_entry_timing ?? null,
          trade_session: row.trade_session ?? null,
        };
      });

      this.signalsSignal.set(signals);
      return signals;
    } finally {
      this.loadingSignal.set(false);
    }
  }

  subscribeToUpdates() {
    this.biasChannel = this.supabase.channel('signal-bias-changes')
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'daily_trade_bias' },
        () => this.loadSignals()
      )
      .subscribe();
  }

  unsubscribeFromUpdates() {
    if (this.biasChannel) {
      this.supabase.removeChannel(this.biasChannel);
      this.biasChannel = undefined;
    }
  }
}
