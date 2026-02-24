'use client';

import type { AdAccountHierarchyAdSet } from '@/lib/shared-types';
import MetricBadge from './MetricBadge';
import TargetingSummary from './TargetingSummary';

interface AdSetRowProps {
  adSet: AdAccountHierarchyAdSet;
}

function statusClass(status: string): string {
  if (status === 'active') return 'bg-emerald-100 text-emerald-700';
  if (status === 'paused') return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-700';
}

export default function AdSetRow({ adSet }: AdSetRowProps) {
  const budgetValue =
    typeof adSet.budget.daily === 'number'
      ? adSet.budget.daily
      : typeof adSet.budget.lifetime === 'number'
        ? adSet.budget.lifetime
        : null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 transition-all hover:shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{adSet.name}</p>
          <p className="mt-1 text-xs text-slate-500">
            {adSet.optimizationGoal || 'No optimization goal'} • {adSet.billingEvent || 'No billing event'}
          </p>
        </div>
        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${statusClass(adSet.status)}`}>
          {adSet.status}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <MetricBadge label="Spend" metric="spend" value={adSet.performance.spend} />
        <MetricBadge label="CTR" metric="ctr" value={adSet.performance.ctr} />
        <MetricBadge label="CPC" metric="cpc" value={adSet.performance.cpc} />
        <MetricBadge label="CPA" metric="costPerConversion" value={adSet.performance.costPerConversion} />
        <MetricBadge label="Conv" metric="conversions" value={adSet.performance.conversions} />
        <MetricBadge label="Budget" metric="dailyBudget" value={budgetValue} />
      </div>

      <div className="mt-3">
        <TargetingSummary summary={adSet.targetingSummary} />
      </div>
    </div>
  );
}
