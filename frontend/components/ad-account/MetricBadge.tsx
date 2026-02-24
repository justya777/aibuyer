'use client';

import type { MetricKey } from './metric-utils';
import { formatMetricValue, getMetricTone, metricToneClasses } from './metric-utils';

interface MetricBadgeProps {
  label: string;
  metric: MetricKey;
  value: number | null | undefined;
}

export default function MetricBadge({ label, metric, value }: MetricBadgeProps) {
  const tone = getMetricTone(metric, value);
  return (
    <div className={`inline-flex items-center gap-2 rounded-md border px-2 py-1 ${metricToneClasses(tone)}`}>
      <span className="text-[11px] font-medium">{label}</span>
      <span className="text-xs font-semibold">{formatMetricValue(metric, value)}</span>
    </div>
  );
}
