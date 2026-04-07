import { getConfidenceLabel } from '@/lib/pricing/engine'

type Props = {
  score: number
}

export default function ConfidenceBar({ score }: Props) {
  const label = getConfidenceLabel(score)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-[var(--ov-text-muted,#7a7a7a)]">
        <span>Estimate Accuracy</span>
        <span className="text-[var(--ov-text,#f0f0f0)] font-medium">{label} ({score}%)</span>
      </div>
      <div className="h-1.5 bg-[var(--ov-track,rgba(255,255,255,0.08))] rounded-full overflow-hidden">
        <div
          className="h-full brand-gradient-bg rounded-full transition-all duration-700"
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  )
}
