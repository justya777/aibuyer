export type MetricTone = 'good' | 'warning' | 'poor' | 'neutral';

export type MetricKey =
  | 'ctr'
  | 'cpc'
  | 'clicks'
  | 'conversions'
  | 'costPerConversion'
  | 'spend'
  | 'dailyBudget';

export function formatMetricValue(metric: MetricKey, value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '-';
  if (metric === 'ctr') return `${value.toFixed(2)}%`;
  if (metric === 'cpc' || metric === 'costPerConversion' || metric === 'spend' || metric === 'dailyBudget') {
    return `$${value.toFixed(2)}`;
  }
  if (metric === 'clicks') return `${Math.round(value)}`;
  return `${Math.round(value)}`;
}

export function getMetricTone(metric: MetricKey, value: number | null | undefined): MetricTone {
  if (value == null || Number.isNaN(value)) return 'neutral';
  if (metric === 'ctr') {
    if (value >= 1.5) return 'good';
    if (value >= 0.8) return 'warning';
    return 'poor';
  }
  if (metric === 'cpc') {
    if (value <= 1.5) return 'good';
    if (value <= 3) return 'warning';
    return 'poor';
  }
  if (metric === 'costPerConversion') {
    if (value <= 10) return 'good';
    if (value <= 25) return 'warning';
    return 'poor';
  }
  if (metric === 'conversions') {
    if (value >= 10) return 'good';
    if (value >= 3) return 'warning';
    return 'poor';
  }
  return 'neutral';
}

export function metricToneClasses(tone: MetricTone): string {
  if (tone === 'good') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (tone === 'warning') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (tone === 'poor') return 'bg-rose-50 text-rose-700 border-rose-200';
  return 'bg-slate-50 text-slate-700 border-slate-200';
}
