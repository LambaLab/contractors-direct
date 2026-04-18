'use client'

import { useMemo, useState } from 'react'
import { Ruler, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  EstimatorForm,
  EstimatorProjectInputs,
} from '@/components/admin/estimator/EstimatorForm'
import { EstimatorSummary } from '@/components/admin/estimator/EstimatorSummary'
import { RateCardReference } from '@/components/admin/estimator/RateCardReference'
import { calculateEstimate, defaultEstimatorInputs } from '@/lib/estimator/calculate'
import { EstimatorUnitProvider, useEstimatorUnit } from '@/lib/estimator/units'

export default function BudgetEstimatorPage() {
  return (
    <EstimatorUnitProvider>
      <BudgetEstimatorPageBody />
    </EstimatorUnitProvider>
  )
}

function UnitToggle() {
  const { unit, setUnit } = useEstimatorUnit()
  const next = unit === 'sqft' ? 'sqm' : 'sqft'
  return (
    <button
      type="button"
      onClick={() => setUnit(next)}
      title={`Switch to ${next === 'sqft' ? 'square feet' : 'square metres'}`}
      aria-label="Toggle area unit"
      className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-white/10 bg-white/[0.03] text-xs font-mono uppercase tracking-wider text-foreground/80 hover:text-foreground hover:bg-white/[0.06] transition-colors cursor-pointer"
    >
      <Ruler className="w-3.5 h-3.5 opacity-70" />
      <span className={unit === 'sqft' ? 'text-primary' : 'text-muted-foreground/70'}>
        sqft
      </span>
      <span className="text-muted-foreground/40">/</span>
      <span className={unit === 'sqm' ? 'text-primary' : 'text-muted-foreground/70'}>
        sqm
      </span>
    </button>
  )
}

function BudgetEstimatorPageBody() {
  const [inputs, setInputs] = useState(defaultEstimatorInputs)
  const [tab, setTab] = useState<'estimator' | 'rates'>('estimator')
  const breakdown = useMemo(() => calculateEstimate(inputs), [inputs])

  return (
    <div className="flex flex-col h-full">
      {/* Top bar: tabs + unit toggle + reset */}
      <div className="shrink-0 flex items-center justify-between gap-3 px-6 py-3 border-b bg-background">
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'estimator' | 'rates')}>
          <TabsList>
            <TabsTrigger value="estimator">Estimator</TabsTrigger>
            <TabsTrigger value="rates">Rate Cards</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <UnitToggle />
          {tab === 'estimator' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setInputs(defaultEstimatorInputs())}
              className="text-xs cursor-pointer gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </Button>
          )}
        </div>
      </div>

      {tab === 'estimator' ? (
        <div className="flex-1 min-h-0 flex flex-col">
          {/* Project Inputs: full width, always visible */}
          <div className="shrink-0 bg-[#1a1a1a]/95 backdrop-blur-md border-b border-white/10 px-6 py-4">
            <EstimatorProjectInputs inputs={inputs} onChange={setInputs} />
          </div>

          {/* Body: left form scrolls, right summary stays fixed on desktop */}
          <div className="flex-1 min-h-0 flex flex-col xl:flex-row">
            {/* Left: form column, scrolls */}
            <div className="flex-1 min-h-0 overflow-auto">
              <div className="px-6 py-6 space-y-4">
                <EstimatorForm inputs={inputs} onChange={setInputs} />
                {/* Mobile only: summary stacks below form */}
                <div className="xl:hidden">
                  <EstimatorSummary inputs={inputs} breakdown={breakdown} />
                </div>
              </div>
            </div>

            {/* Right: summary, fixed on desktop */}
            <aside className="hidden xl:block shrink-0 xl:w-[420px] border-l border-white/5 overflow-auto">
              <div className="px-6 py-6">
                <EstimatorSummary inputs={inputs} breakdown={breakdown} />
              </div>
            </aside>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto">
          <div className="p-6">
            <RateCardReference />
          </div>
        </div>
      )}
    </div>
  )
}
