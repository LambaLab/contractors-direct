export type ProjectType =
  | 'apartment_refresh'
  | 'apartment_full_renovation'
  | 'villa_partial_renovation'
  | 'villa_full_renovation'
  | 'extension_remodelling'
  | 'villa_new_build'

export type FinishLevel = 'basic' | 'standard' | 'premium' | 'luxury'

export type Complexity =
  | 'light_refurbishment'
  | 'standard_renovation'
  | 'major_renovation'
  | 'structural_alteration'

export type RoomType =
  | 'bedroom'
  | 'bathroom'
  | 'kitchen'
  | 'living_room'
  | 'dining_room'
  | 'maid_room'
  | 'utility_laundry'
  | 'corridor_entry'

export interface EstimatorInputs {
  projectType: ProjectType
  finishLevel: FinishLevel
  complexity: Complexity
  builtUpAreaSqm: number
  extensionAreaSqm: number
  rooms: Record<RoomType, number>
  doors: number
  wardrobes: number
  acUpgrade: boolean
  acUnits: number
  glazingReplacement: boolean
  facadePainting: boolean
  /** Override the flat AUTHORITY_FEE (default 20k AED). Used by intake to
   *  scale fees down for single-room or cosmetic projects where the full
   *  permit fee is disproportionate. Defaults to AUTHORITY_FEE if undefined. */
  authorityFee?: number
  /** Override the per-sqm area-based rate for extension_remodelling
   *  projects. Used to route commercial fit-outs through their own (lower
   *  than 5,000 AED/sqm extension build) rate without adding new project
   *  types. Defaults to EXTENSION_RATE_PER_SQM if undefined. */
  areaBaseRate?: number
  /** Override the project base cost for the chosen project type. Used by
   *  intake to drop the base for paint-only or light commercial refresh
   *  scopes where the standard base is disproportionate. Defaults to the
   *  PROJECT_BASE_COSTS entry if undefined. */
  projectBaseOverride?: number
}

export interface RoomCostLine {
  type: RoomType
  qty: number
  ratePerRoom: number
  subtotal: number
}

export interface EstimatorBreakdown {
  projectBaseCost: number
  roomCosts: RoomCostLine[]
  baseRoomCosts: number
  optionalScope: {
    flooring: number
    ceilings: number
    doors: number
    wardrobes: number
    total: number
  }
  areaBasedCost: number
  coreConstructionCost: number
  finishFactor: number
  complexityFactor: number
  adjustedCoreCost: number
  directAllowances: {
    painting: number
    acHvac: number
    glazing: number
    facade: number
    total: number
  }
  pmFee: number
  authorityFee: number
  subtotalBeforeContingency: number
  contingency: number
  finalBudgetAed: number
  budgetPerSqm: number
}
