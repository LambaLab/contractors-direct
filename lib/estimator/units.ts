'use client'

import {
  createContext,
  createElement,
  useContext,
  useState,
  type ReactNode,
} from 'react'

export type AreaUnit = 'sqft' | 'sqm'

export const SQFT_PER_SQM = 10.7639
export const SQM_PER_SQFT = 0.092903

export function sqmToDisplay(sqm: number, unit: AreaUnit): number {
  return unit === 'sqft' ? sqm * SQFT_PER_SQM : sqm
}

export function displayToSqm(value: number, unit: AreaUnit): number {
  return unit === 'sqft' ? value * SQM_PER_SQFT : value
}

export function formatArea(sqm: number, unit: AreaUnit): string {
  const v = sqmToDisplay(sqm, unit)
  return Math.round(v).toLocaleString('en-US')
}

export function unitLabel(unit: AreaUnit): string {
  return unit === 'sqft' ? 'sqft' : 'sqm'
}

export function unitLabelLong(unit: AreaUnit): string {
  return unit === 'sqft' ? 'square feet' : 'square metres'
}

export function ratePerArea(ratePerSqm: number, unit: AreaUnit): number {
  return unit === 'sqft' ? ratePerSqm * SQM_PER_SQFT : ratePerSqm
}

export function formatRatePerArea(ratePerSqm: number, unit: AreaUnit): string {
  const v = ratePerArea(ratePerSqm, unit)
  if (v >= 100) return Math.round(v).toLocaleString('en-US')
  return v.toFixed(2)
}

const EstimatorUnitContext = createContext<{
  unit: AreaUnit
  setUnit: (u: AreaUnit) => void
}>({
  unit: 'sqft',
  setUnit: () => {},
})

const STORAGE_KEY = 'estimator_area_unit'

export function EstimatorUnitProvider({ children }: { children: ReactNode }) {
  const [unit, setUnitState] = useState<AreaUnit>(() => {
    if (typeof window === 'undefined') return 'sqft'
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY)
      if (saved === 'sqft' || saved === 'sqm') return saved
    } catch { /* ignore */ }
    return 'sqft'
  })
  const setUnit = (u: AreaUnit) => {
    setUnitState(u)
    try { window.localStorage.setItem(STORAGE_KEY, u) } catch { /* ignore */ }
  }
  return createElement(
    EstimatorUnitContext.Provider,
    { value: { unit, setUnit } },
    children,
  )
}

export function useEstimatorUnit() {
  return useContext(EstimatorUnitContext)
}
