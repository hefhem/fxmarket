export interface Watchlist {
  id: string;
  user_id: string;
  pair_id: string;
  pair_symbol?: string;
  created_at: string;
}

export interface AlertRule {
  id: string;
  user_id: string;
  pair_id?: string;
  alert_type: 'bias_change' | 'high_impact_event' | 'confidence_threshold';
  conditions: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  alert_id?: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}
