import {
  Component,
  input,
  effect,
  signal,
  ElementRef,
  viewChild,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TechnicalAnalysisService } from '../../../core/services/technical-analysis.service';
import { PriceCandle, TechnicalIndicator } from '../../../core/models';
import {
  createChart,
  IChartApi,
  CandlestickData,
  LineData,
  HistogramData,
  ColorType,
  CrosshairMode,
  Time,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
} from 'lightweight-charts';

@Component({
  selector: 'app-price-chart',
  standalone: true,
  imports: [CommonModule, MatProgressSpinnerModule],
  template: `
    <div class="chart-wrapper">
      @if (loading()) {
        <div class="chart-loading">
          <mat-spinner diameter="32"></mat-spinner>
          <span>Loading chart data...</span>
        </div>
      }
      @if (noData() && !loading()) {
        <div class="chart-no-data">
          <span>No price data available yet. Run "Fetch Price Data" from Admin to populate.</span>
        </div>
      }
      <div #chartContainer class="chart-container" [style.height.px]="height()"></div>
      @if (candles().length > 0) {
        <div class="chart-legend">
          <span class="legend-item sma20">SMA 20</span>
          <span class="legend-item sma50">SMA 50</span>
          <span class="legend-item sma200">SMA 200</span>
        </div>
        <div #macdContainer class="macd-container"></div>
      }
    </div>
  `,
  styles: [`
    .chart-wrapper {
      position: relative;
      width: 100%;
    }
    .chart-container {
      width: 100%;
      border-radius: 8px;
      overflow: hidden;
    }
    .macd-container {
      width: 100%;
      height: 120px;
      margin-top: 4px;
      border-radius: 8px;
      overflow: hidden;
    }
    .chart-loading, .chart-no-data {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 40px;
      color: rgba(255,255,255,0.5);
      font-size: 14px;
    }
    .chart-legend {
      display: flex;
      gap: 16px;
      padding: 8px 4px;
    }
    .legend-item {
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .legend-item::before {
      content: '';
      display: inline-block;
      width: 16px;
      height: 2px;
      border-radius: 1px;
    }
    .sma20::before { background: #ff9800; }
    .sma50::before { background: #2196f3; }
    .sma200::before { background: #e040fb; }
    .sma20 { color: #ff9800; }
    .sma50 { color: #2196f3; }
    .sma200 { color: #e040fb; }
  `]
})
export class PriceChartComponent implements OnDestroy {
  pairId = input.required<string>();
  height = input(400);

  chartContainer = viewChild<ElementRef>('chartContainer');
  macdContainer = viewChild<ElementRef>('macdContainer');

  candles = signal<PriceCandle[]>([]);
  indicators = signal<TechnicalIndicator[]>([]);
  loading = signal(false);
  noData = signal(false);

  private chart: IChartApi | null = null;
  private macdChart: IChartApi | null = null;

  constructor(private taService: TechnicalAnalysisService) {
    effect(() => {
      const id = this.pairId();
      if (id) this.loadData(id);
    });
  }

  private async loadData(pairId: string) {
    this.loading.set(true);
    this.noData.set(false);
    try {
      const [candles, indicators] = await Promise.all([
        this.taService.fetchCandles(pairId, 'D', 200),
        this.taService.fetchIndicators(pairId, 200),
      ]);

      this.candles.set(candles);
      this.indicators.set(indicators);

      if (candles.length === 0) {
        this.noData.set(true);
        return;
      }

      // Wait for DOM to render
      setTimeout(() => this.renderChart(), 0);
    } catch (err) {
      console.error('Failed to load chart data:', err);
      this.noData.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  private renderChart() {
    this.destroyCharts();

    const container = this.chartContainer()?.nativeElement;
    if (!container) return;

    const candles = this.candles();
    const indicators = this.indicators();
    if (candles.length === 0) return;

    // Create main chart
    this.chart = createChart(container, {
      width: container.clientWidth,
      height: this.height(),
      layout: {
        background: { type: ColorType.Solid, color: '#1a1a2e' },
        textColor: 'rgba(255,255,255,0.5)',
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.05)' },
        horzLines: { color: 'rgba(255,255,255,0.05)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.1)',
        timeVisible: false,
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.1)',
      },
    });

    // Candlestick series
    const candleSeries = this.chart.addSeries(CandlestickSeries, {
      upColor: '#4caf50',
      downColor: '#f44336',
      borderUpColor: '#4caf50',
      borderDownColor: '#f44336',
      wickUpColor: '#4caf50',
      wickDownColor: '#f44336',
    });

    const candleData: CandlestickData[] = candles.map(c => ({
      time: c.open_time.split('T')[0] as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    candleSeries.setData(candleData);

    // Build indicator map by date
    const indicatorMap = new Map<string, TechnicalIndicator>();
    for (const ind of indicators) {
      indicatorMap.set(ind.indicator_date, ind);
    }

    // SMA overlays
    this.addLineSeries(this.chart, candles, indicatorMap, 'sma_20', '#ff9800');
    this.addLineSeries(this.chart, candles, indicatorMap, 'sma_50', '#2196f3');
    this.addLineSeries(this.chart, candles, indicatorMap, 'sma_200', '#e040fb');

    this.chart.timeScale().fitContent();

    // MACD sub-chart
    const macdEl = this.macdContainer()?.nativeElement;
    if (macdEl && indicators.length > 0) {
      this.macdChart = createChart(macdEl, {
        width: macdEl.clientWidth,
        height: 120,
        layout: {
          background: { type: ColorType.Solid, color: '#1a1a2e' },
          textColor: 'rgba(255,255,255,0.5)',
        },
        grid: {
          vertLines: { color: 'rgba(255,255,255,0.05)' },
          horzLines: { color: 'rgba(255,255,255,0.05)' },
        },
        timeScale: {
          borderColor: 'rgba(255,255,255,0.1)',
          timeVisible: false,
        },
        rightPriceScale: {
          borderColor: 'rgba(255,255,255,0.1)',
        },
      });

      // MACD histogram
      const histSeries = this.macdChart.addSeries(HistogramSeries, {
        priceLineVisible: false,
      });

      const histData: HistogramData[] = indicators
        .filter(i => i.macd_histogram !== null)
        .map(i => ({
          time: i.indicator_date as Time,
          value: i.macd_histogram!,
          color: i.macd_histogram! >= 0 ? 'rgba(76,175,80,0.6)' : 'rgba(244,67,54,0.6)',
        }));
      histSeries.setData(histData);

      // MACD line
      const macdLineSeries = this.macdChart.addSeries(LineSeries, {
        color: '#2196f3',
        lineWidth: 1,
        priceLineVisible: false,
      });
      const macdLineData: LineData[] = indicators
        .filter(i => i.macd_line !== null)
        .map(i => ({ time: i.indicator_date as Time, value: i.macd_line! }));
      macdLineSeries.setData(macdLineData);

      // Signal line
      const signalSeries = this.macdChart.addSeries(LineSeries, {
        color: '#ff9800',
        lineWidth: 1,
        priceLineVisible: false,
      });
      const signalData: LineData[] = indicators
        .filter(i => i.macd_signal !== null)
        .map(i => ({ time: i.indicator_date as Time, value: i.macd_signal! }));
      signalSeries.setData(signalData);

      this.macdChart.timeScale().fitContent();

      // Sync time scales
      this.chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (range && this.macdChart) {
          this.macdChart.timeScale().setVisibleLogicalRange(range);
        }
      });
    }

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      if (this.chart && container) {
        this.chart.applyOptions({ width: container.clientWidth });
      }
      if (this.macdChart && macdEl) {
        this.macdChart.applyOptions({ width: macdEl.clientWidth });
      }
    });
    resizeObserver.observe(container);
  }

  private addLineSeries(
    chart: IChartApi,
    candles: PriceCandle[],
    indicatorMap: Map<string, TechnicalIndicator>,
    field: 'sma_20' | 'sma_50' | 'sma_200',
    color: string,
  ) {
    const series = chart.addSeries(LineSeries, {
      color,
      lineWidth: 1,
      priceLineVisible: false,
    });

    const data: LineData[] = [];
    for (const c of candles) {
      const date = c.open_time.split('T')[0];
      const ind = indicatorMap.get(date);
      if (ind && ind[field] !== null) {
        data.push({ time: date as Time, value: ind[field]! });
      }
    }
    series.setData(data);
  }

  private destroyCharts() {
    if (this.chart) {
      this.chart.remove();
      this.chart = null;
    }
    if (this.macdChart) {
      this.macdChart.remove();
      this.macdChart = null;
    }
  }

  ngOnDestroy() {
    this.destroyCharts();
  }
}
