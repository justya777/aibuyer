'use client';

import type { AdAccountHierarchyAd } from '@/lib/shared-types';
import MetricBadge from './MetricBadge';

interface AdRowProps {
  ad: AdAccountHierarchyAd;
}

function statusClass(status: string): string {
  if (status === 'active') return 'bg-emerald-100 text-emerald-700';
  if (status === 'paused') return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-700';
}

export default function AdRow({ ad }: AdRowProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 transition-all hover:shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{ad.name}</p>
          <p className="mt-1 text-xs text-slate-500 truncate">
            {ad.creative.title || ad.creative.body || ad.creative.linkUrl || 'No creative preview available.'}
          </p>
        </div>
        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${statusClass(ad.status)}`}>
          {ad.status}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <MetricBadge label="CTR" metric="ctr" value={ad.performance.ctr} />
        <MetricBadge label="Clicks" metric="clicks" value={ad.performance.clicks} />
        <MetricBadge label="Conv" metric="conversions" value={ad.performance.conversions} />
        <MetricBadge label="CPA" metric="costPerConversion" value={ad.performance.costPerConversion} />
        <MetricBadge label="Spend" metric="spend" value={ad.performance.spend} />
      </div>
    </div>
  );
}
