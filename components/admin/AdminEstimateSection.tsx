'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Info, RefreshCw, Eye } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import FinishTierComparison from '@/components/intake/FinishTierComparison'
import { calculateEstimate } from '@/lib/estimator/calculate'
import { FINISH_LABELS, ROOM_ORDER } from '@/lib/estimator/rates'
import type { FinishLevel, RoomType } from '@/lib/estimator/types'
import type { InferenceResult } from '@/lib/estimator/intakeInference'

type InferenceResponse = {
  knownFields: {
    project_nature: string | null
    property_type: string | null
    size_sqft: number | null
    finish_level: string | null
    location: string | null
  }
  inputSources: Record<
    'project_nature' | 'property_type' | 'size_sqft' | 'finish_level' | 'location',
    'user-stated' | 'chat-scraped' | 'AI-defaulted' | 'missing'
  >
  inference: InferenceResult | null
}

type BoqResponse =
  | { exists: false }
  | {
      exists: true
      boqId: string
      grandTotalAed: number
      lineCount: number
      locked: boolean
      version: number
      updatedAt: string | null
    }

type Props = {
  leadId: string
  /** Optional callback to switch the parent tab to BOQ when admin clicks
   *  "View BOQ" inside the Full Budget card. */
  onSwitchToBoq?: () => void
}

function fmtAed(n: number | null | undefined): string {
  if (!n || !isFinite(n)) return '0'
  return Number(n).toLocaleString('en-AE', { maximumFractionDigits: 0 })
}

const ROOM_LABELS: Record<RoomType, string> = {
  bedroom: 'Bedroom',
  bathroom: 'Bathroom',
  kitchen: 'Kitchen',
  living_room: 'Living room',
  dining_room: 'Dining room',
  maid_room: 'Maid room',
  utility_laundry: 'Utility / laundry',
  corridor_entry: 'Corridor / entry',
}

const SIGNAL_LABELS: Record<string, string> = {
  kitchen: 'Kitchen',
  bathroom: 'Bathroom',
  powder: 'Powder room',
  bedroom: 'Bedroom',
  maid: 'Maid room',
  living: 'Living',
  dining: 'Dining',
  generic: 'Generic room',
}

export default function AdminEstimateSection({ leadId, onSwitchToBoq }: Props) {
  const [inferenceResp, setInferenceResp] = useState<InferenceResponse | null>(null)
  const [boqResp, setBoqResp] = useState<BoqResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewTier, setPreviewTier] = useState<FinishLevel | null>(null)
  const [showLogic, setShowLogic] = useState(false)

  async function load(opts: { silent?: boolean } = {}) {
    if (!opts.silent) setLoading(true)
    else setRefreshing(true)
    setError(null)

    try {
      const [infRes, boqRes] = await Promise.all([
        fetch(`/api/admin/leads/${leadId}/inference`),
        fetch(`/api/admin/leads/${leadId}/boq-total`),
      ])
      if (!infRes.ok) throw new Error(`Inference failed (${infRes.status})`)
      if (!boqRes.ok) throw new Error(`BOQ total failed (${boqRes.status})`)
      const inf = (await infRes.json()) as InferenceResponse
      const boq = (await boqRes.json()) as BoqResponse
      setInferenceResp(inf)
      setBoqResp(boq)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load estimate')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId])

  const inference = inferenceResp?.inference ?? null

  // The tier admin is viewing the breakdown for. Defaults to the inferred
  // finish level used in the client view, but admin can swap by tapping a
  // tier in the comparison row.
  const activeTier: FinishLevel = previewTier ?? inference?.finishLevelUsed ?? 'standard'

  // Compute the breakdown for the active tier (client always sent at the
  // inferred tier). Recompute locally to avoid an extra round-trip.
  const activeBreakdown = useMemo(() => {
    if (!inference) return null
    if (activeTier === inference.finishLevelUsed) return inference.breakdown
    return calculateEstimate({ ...inference.inputs, finishLevel: activeTier })
  }, [inference, activeTier])

  const activeFinalAed = inference ? inference.tiers[activeTier] : 0
  const activePerSqftAed =
    inference && inference.inputs.builtUpAreaSqm > 0
      ? Math.round(activeFinalAed / (inference.inputs.builtUpAreaSqm * 10.7639))
      : 0

  return (
    <div className="p-6 space-y-6">
      {/* ── Card 1: Quick Estimate (mirrors client view) ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs text-muted-foreground uppercase tracking-wider">
            Quick estimate
          </h3>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] gap-1">
              <Eye className="w-3 h-3" />
              Same view as client
            </Badge>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => load({ silent: true })}
              disabled={refreshing}
              className="h-7 px-2"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="text-xs">Recompute</span>
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-4 space-y-4">
            {loading && (
              <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin mr-2" />
                Loading estimate
              </div>
            )}

            {!loading && error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            {!loading && !error && !inference && (
              <div className="text-sm text-muted-foreground space-y-2">
                <p>
                  Not enough info to compute an estimate yet. The intake needs
                  at minimum a property type and a square-footage figure.
                </p>
                <MissingFields response={inferenceResp} />
              </div>
            )}

            {!loading && !error && inference && (
              <>
                {/* Assumption chips */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary" className="text-[11px]">
                    {FINISH_LABELS[inference.finishLevelUsed]} finish
                    {inference.assumedFinish ? ' (assumed)' : ''}
                  </Badge>
                  <Badge variant="secondary" className="text-[11px]">
                    {inference.locationUsed}
                    {inference.assumedLocation ? ' (assumed)' : ''}
                  </Badge>
                  {inference.inputs.builtUpAreaSqm > 0 && (
                    <Badge variant="secondary" className="text-[11px]">
                      {Math.round(inference.inputs.builtUpAreaSqm * 10.7639).toLocaleString()} sqft
                    </Badge>
                  )}
                  {inference.assumedNature && (
                    <Badge variant="outline" className="text-[11px] border-amber-500/40 text-amber-600 dark:text-amber-400">
                      Project nature inferred
                    </Badge>
                  )}
                </div>

                {/* Hero number */}
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[11px] font-mono tracking-widest text-primary/70">AED</span>
                    <span className="text-3xl font-bold text-foreground tracking-tight tabular-nums">
                      {fmtAed(activeFinalAed)}
                    </span>
                  </div>
                  {activePerSqftAed > 0 && (
                    <p className="text-sm text-muted-foreground mt-1">
                      AED {fmtAed(activePerSqftAed)} / sqft
                    </p>
                  )}
                </div>

                {/* Tier comparison */}
                <div>
                  <p className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-2">
                    Compare finish levels
                  </p>
                  <FinishTierComparison
                    tiers={inference.tiers}
                    active={activeTier}
                    onSelect={(t) => setPreviewTier(t)}
                    theme="admin"
                  />
                  {previewTier && previewTier !== inference.finishLevelUsed && (
                    <p className="text-[11px] text-muted-foreground mt-2">
                      Previewing <strong>{FINISH_LABELS[previewTier]}</strong>. Client sees{' '}
                      <strong>{FINISH_LABELS[inference.finishLevelUsed]}</strong>.{' '}
                      <button
                        type="button"
                        className="text-primary hover:underline cursor-pointer"
                        onClick={() => setPreviewTier(null)}
                      >
                        Reset
                      </button>
                    </p>
                  )}
                </div>

                {/* Logic & assumptions disclosure */}
                <div className="pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setShowLogic(!showLogic)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    {showLogic ? (
                      <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5" />
                    )}
                    <Info className="w-3.5 h-3.5" />
                    <span>Logic &amp; assumptions</span>
                  </button>

                  {showLogic && (
                    <div className="mt-3 space-y-4">
                      <InputsBlock response={inferenceResp!} inference={inference} />
                      <SignalsBlock inference={inference} />
                      <OverridesBlock inference={inference} />
                      <BreakdownBlock
                        inference={inference}
                        activeTier={activeTier}
                        activeBreakdown={activeBreakdown}
                        activeFinalAed={activeFinalAed}
                      />
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Card 2: Full Budget (BOQ-driven) ── */}
      <div className="space-y-3">
        <h3 className="text-xs text-muted-foreground uppercase tracking-wider">
          Full budget
          <span className="ml-2 text-muted-foreground/70 normal-case tracking-normal">
            (from BOQ line items)
          </span>
        </h3>

        <Card>
          <CardContent className="p-4">
            {loading && (
              <div className="text-sm text-muted-foreground">Loading BOQ total</div>
            )}

            {!loading && boqResp && !boqResp.exists && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  No BOQ drafted yet. Generate or edit a BOQ to see the line-item
                  budget here.
                </p>
                {onSwitchToBoq && (
                  <Button size="sm" variant="outline" onClick={onSwitchToBoq}>
                    Open BOQ tab
                  </Button>
                )}
              </div>
            )}

            {!loading && boqResp && boqResp.exists && (
              <div className="space-y-3">
                <div className="flex items-end justify-between">
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-[11px] font-mono tracking-widest text-primary/70">AED</span>
                      <span className="text-3xl font-bold text-foreground tracking-tight tabular-nums">
                        {fmtAed(boqResp.grandTotalAed)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      v{boqResp.version} &middot; {boqResp.lineCount} line item
                      {boqResp.lineCount === 1 ? '' : 's'}
                      {boqResp.locked ? ' · locked' : ''}
                    </p>
                  </div>
                  {onSwitchToBoq && (
                    <Button size="sm" variant="outline" onClick={onSwitchToBoq}>
                      View BOQ
                    </Button>
                  )}
                </div>

                {inference && activeFinalAed > 0 && boqResp.grandTotalAed > 0 && (
                  <BoqDiff
                    boqTotal={boqResp.grandTotalAed}
                    quickTotal={activeFinalAed}
                    tier={activeTier}
                  />
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ── sub-components ───────────────────────────────────────────────────────

function MissingFields({ response }: { response: InferenceResponse | null }) {
  if (!response) return null
  const missing: string[] = []
  if (!response.knownFields.property_type) missing.push('property type')
  if (!response.knownFields.size_sqft) missing.push('size (sqft)')
  if (missing.length === 0) return null
  return (
    <p className="text-xs">
      Missing: <span className="text-foreground">{missing.join(', ')}</span>
    </p>
  )
}

function InputsBlock({
  response,
  inference,
}: {
  response: InferenceResponse
  inference: InferenceResult
}) {
  const rows: { label: string; value: string; source: string }[] = [
    {
      label: 'Project nature',
      value: inference.natureUsed,
      source: response.inputSources.project_nature,
    },
    {
      label: 'Property type',
      value: response.knownFields.property_type ?? '—',
      source: response.inputSources.property_type,
    },
    {
      label: 'Size',
      value:
        response.knownFields.size_sqft && response.knownFields.size_sqft > 0
          ? `${response.knownFields.size_sqft.toLocaleString()} sqft`
          : '—',
      source: response.inputSources.size_sqft,
    },
    {
      label: 'Finish level',
      value: FINISH_LABELS[inference.finishLevelUsed],
      source: response.inputSources.finish_level,
    },
    {
      label: 'Location',
      value: inference.locationUsed,
      source: response.inputSources.location,
    },
  ]

  return (
    <div>
      <p className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground mb-2">Inputs</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-md bg-muted/40"
          >
            <span className="text-muted-foreground">{r.label}</span>
            <span className="flex items-center gap-2">
              <span className="text-foreground font-medium">{r.value}</span>
              <span
                className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
                  r.source === 'user-stated'
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : r.source === 'chat-scraped'
                    ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                    : r.source === 'AI-defaulted'
                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    : 'bg-red-500/10 text-red-600 dark:text-red-400'
                }`}
              >
                {r.source}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SignalsBlock({ inference }: { inference: InferenceResult }) {
  const s = inference.signals
  const pills: string[] = []
  if (s.singleRoom && s.singleRoom.length > 0) {
    pills.push(`Single-room: ${s.singleRoom.map((k) => SIGNAL_LABELS[k] ?? k).join(' + ')}`)
  }
  if (s.multiRoom) pills.push('Multi-room mode')
  if (s.paintOnly) pills.push('Paint-only')
  if (s.structural) pills.push('Structural change')
  if (s.commercial) pills.push('Commercial fit-out')

  return (
    <div>
      <p className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground mb-2">
        Detection signals
      </p>
      {pills.length === 0 ? (
        <p className="text-xs text-muted-foreground">No special detectors fired.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {pills.map((p) => (
            <Badge key={p} variant="outline" className="text-[11px]">
              {p}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

function OverridesBlock({ inference }: { inference: InferenceResult }) {
  const o = inference.overrides
  const rows: { field: string; applied: number; def: number; reason: string }[] = []
  if (o.authorityFee) rows.push({ field: 'Authority fee', applied: o.authorityFee.applied, def: o.authorityFee.default, reason: o.authorityFee.reason })
  if (o.areaBaseRate) rows.push({ field: 'Area base rate', applied: o.areaBaseRate.applied, def: o.areaBaseRate.default, reason: o.areaBaseRate.reason })
  if (o.projectBaseOverride) rows.push({ field: 'Project base', applied: o.projectBaseOverride.applied, def: o.projectBaseOverride.default, reason: o.projectBaseOverride.reason })

  return (
    <div>
      <p className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground mb-2">
        Active overrides
      </p>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">All defaults in use.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.field} className="text-xs px-2.5 py-1.5 rounded-md bg-muted/40">
              <div className="flex items-center justify-between">
                <span className="text-foreground font-medium">{r.field}</span>
                <span className="font-mono tabular-nums">
                  <span className="text-foreground">AED {fmtAed(r.applied)}</span>
                  <span className="text-muted-foreground ml-1.5">
                    (default {fmtAed(r.def)})
                  </span>
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">{r.reason}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function BreakdownBlock({
  inference,
  activeTier,
  activeBreakdown,
  activeFinalAed,
}: {
  inference: InferenceResult
  activeTier: FinishLevel
  activeBreakdown: ReturnType<typeof calculateEstimate> | null
  activeFinalAed: number
}) {
  if (!activeBreakdown) return null
  const b = activeBreakdown
  const inp = inference.inputs

  return (
    <div>
      <p className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground mb-2">
        Full breakdown — {FINISH_LABELS[activeTier]}
      </p>
      <div className="text-xs rounded-md border divide-y">
        {b.projectBaseCost > 0 && (
          <Row label="Project base" value={b.projectBaseCost} />
        )}

        {b.baseRoomCosts > 0 && (
          <>
            <Row label="Room costs (subtotal)" value={b.baseRoomCosts} />
            {ROOM_ORDER.map((rt) => {
              const qty = inp.rooms[rt] ?? 0
              if (qty <= 0) return null
              const line = b.roomCosts.find((r) => r.type === rt)
              return (
                <SubRow
                  key={rt}
                  label={`${ROOM_LABELS[rt]} × ${qty}`}
                  value={line?.subtotal ?? 0}
                />
              )
            })}
          </>
        )}

        {b.optionalScope.total > 0 && (
          <>
            <Row label="Optional scope" value={b.optionalScope.total} />
            {b.optionalScope.flooring > 0 && <SubRow label="Flooring" value={b.optionalScope.flooring} />}
            {b.optionalScope.ceilings > 0 && <SubRow label="Ceilings" value={b.optionalScope.ceilings} />}
            {b.optionalScope.doors > 0 && <SubRow label="Doors" value={b.optionalScope.doors} />}
            {b.optionalScope.wardrobes > 0 && <SubRow label="Wardrobes" value={b.optionalScope.wardrobes} />}
          </>
        )}

        {b.areaBasedCost > 0 && <Row label="Area-based" value={b.areaBasedCost} />}

        <Row
          label={`Adjusted core (×${b.finishFactor.toFixed(2)} finish · ×${b.complexityFactor.toFixed(2)} complexity)`}
          value={b.adjustedCoreCost}
        />

        {b.directAllowances.total > 0 && (
          <>
            <Row label="Direct allowances" value={b.directAllowances.total} />
            {b.directAllowances.painting > 0 && <SubRow label="Painting" value={b.directAllowances.painting} />}
            {b.directAllowances.acHvac > 0 && <SubRow label="AC / HVAC" value={b.directAllowances.acHvac} />}
            {b.directAllowances.glazing > 0 && <SubRow label="Glazing" value={b.directAllowances.glazing} />}
            {b.directAllowances.facade > 0 && <SubRow label="Facade" value={b.directAllowances.facade} />}
          </>
        )}

        <Row label="PM fee" value={b.pmFee} />
        <Row label="Authority fee" value={b.authorityFee} />
        <Row label="Subtotal before contingency" value={b.subtotalBeforeContingency} />
        <Row label="Contingency" value={b.contingency} />
        <Row label="Calculator final" value={b.finalBudgetAed} />
        <Row
          label={`× Location factor (${inference.factor.toFixed(2)})`}
          value={activeFinalAed}
          bold
        />
      </div>
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between px-2.5 py-1.5">
      <span className={bold ? 'text-foreground font-semibold' : 'text-foreground'}>
        {label}
      </span>
      <span className={`font-mono tabular-nums ${bold ? 'text-foreground font-semibold' : 'text-foreground'}`}>
        AED {fmtAed(value)}
      </span>
    </div>
  )
}

function SubRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between px-2.5 py-1 pl-6">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums text-muted-foreground">
        AED {fmtAed(value)}
      </span>
    </div>
  )
}

function BoqDiff({
  boqTotal,
  quickTotal,
  tier,
}: {
  boqTotal: number
  quickTotal: number
  tier: FinishLevel
}) {
  const delta = boqTotal - quickTotal
  const pct = quickTotal > 0 ? (delta / quickTotal) * 100 : 0
  const positive = delta > 0
  const color = positive ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
  return (
    <div className="text-xs px-2.5 py-1.5 rounded-md bg-muted/40">
      <span className="text-muted-foreground">vs Quick estimate ({FINISH_LABELS[tier]}): </span>
      <span className={`font-mono tabular-nums ${color}`}>
        {positive ? '+' : ''}AED {fmtAed(Math.abs(delta))} ({positive ? '+' : ''}
        {pct.toFixed(0)}%)
      </span>
    </div>
  )
}
