'use client';

import Link from 'next/link';
import type { AdAccountHierarchyCampaign } from '@/lib/shared-types';
import MetricBadge from './MetricBadge';
import TargetingSummary from './TargetingSummary';

interface CampaignRowProps {
  campaign: AdAccountHierarchyCampaign;
  href: string;
}

function statusClass(status: string): string {
  if (status === 'active') return 'bg-emerald-100 text-emerald-700';
  if (status === 'paused') return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-700';
}

export default function CampaignRow({ campaign, href }: CampaignRowProps) {
  const budgetValue =
    typeof campaign.budget.daily === 'number'
      ? campaign.budget.daily
      : typeof campaign.budget.lifetime === 'number'
        ? campaign.budget.lifetime
        : null;

  return (
    <Link
      href={href}
      className="block rounded-lg border border-slate-200 bg-white p-4 transition-all hover:-translate-y-px hover:shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{campaign.name}</p>
          <p className="mt-1 text-xs text-slate-500">{campaign.objective || 'No objective'}</p>
        </div>
        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${statusClass(campaign.status)}`}>
          {campaign.status}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <MetricBadge label="Spend" metric="spend" value={campaign.performance.spend} />
        <MetricBadge label="CTR" metric="ctr" value={campaign.performance.ctr} />
        <MetricBadge label="CPC" metric="cpc" value={campaign.performance.cpc} />
        <MetricBadge
          label="CPA"
          metric="costPerConversion"
          value={campaign.performance.costPerConversion}
        />
        <MetricBadge label="Conv" metric="conversions" value={campaign.performance.conversions} />
        <MetricBadge label="Budget" metric="dailyBudget" value={budgetValue} />
      </div>

      <div className="mt-3">
        <TargetingSummary summary={campaign.targetingSummary} />
      </div>

      <p className="mt-2 text-[11px] text-slate-500">
        Start: {campaign.startDate ? new Date(campaign.startDate).toLocaleDateString('en-US') : '-'} • Updated:{' '}
        {new Date(campaign.updatedAt).toLocaleDateString('en-US')}
      </p>
    </Link>
  );
}
