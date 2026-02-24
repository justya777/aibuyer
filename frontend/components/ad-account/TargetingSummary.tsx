'use client';

interface TargetingSummaryProps {
  summary: string | null | undefined;
}

export default function TargetingSummary({ summary }: TargetingSummaryProps) {
  return <p className="text-xs text-slate-600">{summary || 'No targeting details available yet.'}</p>;
}
