import { calculateEstimate } from './calculate'
import { intakeToEstimatorInputs, type ProjectNature } from './fromIntake'
import {
  AUTHORITY_FEE,
  EXTENSION_RATE_PER_SQM,
  FINISH_ORDER,
  PROJECT_BASE_COSTS,
} from './rates'
import type {
  EstimatorBreakdown,
  EstimatorInputs,
  FinishLevel,
} from './types'

// ---- shared knowledge ---------------------------------------------------

export const VALID_NATURES: ProjectNature[] = [
  'refresh',
  'partial_renovation',
  'full_renovation',
  'extension',
  'new_build',
]

export const VALID_FINISH: FinishLevel[] = ['basic', 'standard', 'premium', 'luxury']

// Location cost factor, mirrors lib/pricing/engine.ts LOCATION_FACTORS.
const LOCATION_FACTORS: Record<string, number> = {
  dubai: 1.0,
  abu_dhabi: 0.95,
  sharjah: 0.85,
  ajman: 0.80,
  ras_al_khaimah: 0.80,
  fujairah: 0.75,
  umm_al_quwain: 0.75,
}

export function locationFactor(location: string): number {
  const lower = (location || '').toLowerCase()
  for (const [key, val] of Object.entries(LOCATION_FACTORS)) {
    if (lower.includes(key.replace(/_/g, ' ')) || lower.includes(key.replace(/_/g, ''))) {
      return val
    }
  }
  return 1.0
}

// ---- public types -------------------------------------------------------

export type SingleRoomKind =
  | 'kitchen'
  | 'bathroom'
  | 'powder'
  | 'bedroom'
  | 'maid'
  | 'living'
  | 'dining'
  | 'generic'

export type IntakeKnownFields = {
  project_nature?: string | null
  property_type?: string | null
  size_sqft?: number | null
  finish_level?: string | null
  location?: string | null
}

export type OverrideTrace = {
  applied: number
  default: number
  reason: string
}

export type InferenceSignals = {
  singleRoom?: SingleRoomKind[]
  paintOnly?: boolean
  structural?: boolean
  multiRoom?: boolean
  commercial?: boolean
}

export type InferenceResult = {
  inputs: EstimatorInputs
  breakdown: EstimatorBreakdown
  factor: number
  finalAed: number
  perSqmAed: number
  tiers: Record<FinishLevel, number>
  finishLevelUsed: FinishLevel
  locationUsed: string
  natureUsed: ProjectNature
  assumedFinish: boolean
  assumedLocation: boolean
  assumedNature: boolean
  signals: InferenceSignals
  overrides: {
    authorityFee?: OverrideTrace
    areaBaseRate?: OverrideTrace
    projectBaseOverride?: OverrideTrace
  }
}

// ---- helpers ------------------------------------------------------------

function isCommercial(propertyType: string): boolean {
  return /^(office|retail|warehouse|commercial)$/i.test(propertyType || '')
}

function inferNatureFromText(blob: string): ProjectNature | null {
  if (/new\s*build|build (a|an|the)?\s*(villa|home|house)|ground.up/.test(blob)) return 'new_build'
  if (/extension|extend|add (a|an)?\s*(room|floor)/.test(blob)) return 'extension'
  if (/full (reno|overhaul|renovation)|gut|complete reno/.test(blob)) return 'full_renovation'
  if (/light refresh|just paint|cosmetic|refresh/.test(blob)) return 'refresh'
  if (/partial|kitchen reno|bathroom reno|specific rooms/.test(blob)) return 'partial_renovation'
  return null
}

// Detection regex sources (kept as const strings so regex composition is readable)
const ROOM_VERBS =
  '(?:revamp|redo|reno|renovate|renovation|refresh|remodel|upgrade|makeover|only|update|fix(?:ing)? up|paint(?:ing)?|repaint|touch[\\s-]?up|spruce[\\s-]?up|freshen[\\s-]?up|do[\\s-]?up|overhaul)'
const ROOM_MODIFIER =
  '(?:master\\s+|guest\\s+|kids?\\s+|main\\s+|spare\\s+|downstairs\\s+|upstairs\\s+|second\\s+|small\\s+|big\\s+|new\\s+)?'
const ROOM_NOUNS =
  '(?:bedroom|bathroom|bath|kitchen|living\\s+room|lounge|family\\s+room|sitting\\s+room|dining\\s+room|powder\\s+room|maid[\'\u2019]?s?\\s+room|room|walls?)'

type Detected = {
  kitchen: boolean
  bathroom: boolean
  powderRoom: boolean
  bedroom: boolean
  maid: boolean
  living: boolean
  dining: boolean
  generic: boolean
  paintOnly: boolean
  structural: boolean
}

function detectScope(blob: string): Detected {
  const kitchen = new RegExp(
    `\\b(?:kitchen)\\s+${ROOM_VERBS}\\b|\\bjust\\s+the\\s+kitchen\\b|\\b${ROOM_VERBS}\\s+(?:the\\s+|my\\s+)?${ROOM_MODIFIER}kitchen\\b`,
  ).test(blob)
  const powderRoom = new RegExp(
    `\\bpowder\\s+room\\s+${ROOM_VERBS}\\b|\\bjust\\s+the\\s+powder\\s+room\\b|\\b${ROOM_VERBS}\\s+(?:the\\s+|my\\s+)?${ROOM_MODIFIER}powder\\s+room\\b`,
  ).test(blob)
  const bathroom =
    !powderRoom &&
    new RegExp(
      `\\b(?:bathroom|guest\\s+bath|master\\s+bath)\\s+${ROOM_VERBS}\\b|\\bjust\\s+the\\s+bathroom\\b|\\b${ROOM_VERBS}\\s+(?:the\\s+|my\\s+)?${ROOM_MODIFIER}(?:bathroom|bath)\\b`,
    ).test(blob)
  const maid = new RegExp(
    `\\b(?:maid['\u2019]?s?\\s+(?:room|quarters)|servant['\u2019]?s?\\s+room|nanny['\u2019]?s?\\s+room|helper['\u2019]?s?\\s+room)\\s+${ROOM_VERBS}\\b|\\b${ROOM_VERBS}\\s+(?:the\\s+|my\\s+)?(?:maid['\u2019]?s?\\s+(?:room|quarters)|servant['\u2019]?s?\\s+room|nanny['\u2019]?s?\\s+room|helper['\u2019]?s?\\s+room)\\b`,
  ).test(blob)
  const bedroom =
    !maid &&
    new RegExp(
      `\\b(?:bedroom|master\\s+bed|guest\\s+bed|kids?\\s+room)\\s+${ROOM_VERBS}\\b|\\bjust\\s+the\\s+bedroom\\b|\\b${ROOM_VERBS}\\s+(?:the\\s+|my\\s+)?${ROOM_MODIFIER}bedroom\\b`,
    ).test(blob)
  const living = new RegExp(
    `\\b(?:living\\s+room|lounge|family\\s+room|sitting\\s+room)\\s+${ROOM_VERBS}\\b|\\bjust\\s+the\\s+living\\s+room\\b|\\b${ROOM_VERBS}\\s+(?:the\\s+|my\\s+)?${ROOM_MODIFIER}(?:living\\s+room|lounge|family\\s+room|sitting\\s+room)\\b`,
  ).test(blob)
  const dining = new RegExp(
    `\\b(?:dining\\s+room)\\s+${ROOM_VERBS}\\b|\\bjust\\s+the\\s+dining\\s+room\\b|\\b${ROOM_VERBS}\\s+(?:the\\s+|my\\s+)?${ROOM_MODIFIER}dining\\s+room\\b`,
  ).test(blob)
  const generic =
    /\b(one room|single room|just\s+(the\s+)?room|(the\s+|my\s+)?room\s+(revamp|redo|refresh|reno|renovation|remodel|upgrade|makeover)|redo\s+(the\s+|my\s+)?room)\b/.test(
      blob,
    )

  const detected = { kitchen, bathroom, powderRoom, bedroom, maid, living, dining, generic } as Omit<
    Detected,
    'paintOnly' | 'structural'
  >

  // Multi-room "just the X and Y" mode: when "just the/my" is present, OR in
  // any other room keyword that follows. The verb-anchored regexes above only
  // catch the first room when names appear in a list.
  if (/\bjust\s+(?:the|my)\b/.test(blob)) {
    if (/\bpowder\s+room\b/.test(blob)) detected.powderRoom = true
    if (/\b(?:bathroom|guest\s+bath|master\s+bath)\b/.test(blob)) detected.bathroom = true
    if (/\bkitchen\b/.test(blob)) detected.kitchen = true
    if (
      /\b(?:maid['\u2019]?s?\s+(?:room|quarters)|servant['\u2019]?s?\s+room|nanny['\u2019]?s?\s+room|helper['\u2019]?s?\s+room)\b/.test(
        blob,
      )
    )
      detected.maid = true
    if (/\b(?:bedroom|master\s+bed|guest\s+bed|kids?\s+room)\b/.test(blob)) detected.bedroom = true
    if (/\b(?:living\s+room|lounge|family\s+room|sitting\s+room)\b/.test(blob)) detected.living = true
    if (/\bdining\s+room\b/.test(blob)) detected.dining = true
  }

  // Structural change keyword often names the room being opened up.
  if (/\bopen\s+up\s+(?:the\s+)?kitchen\b/.test(blob)) detected.kitchen = true
  if (/\bopen\s+up\s+(?:the\s+)?living\b/.test(blob)) detected.living = true
  if (/\bopen\s+up\s+(?:the\s+)?dining\b/.test(blob)) detected.dining = true

  const structural =
    /\b(knock(?:ing)?\s+down\s+(?:a\s+|the\s+)?wall|tear(?:ing)?\s+down\s+(?:a\s+|the\s+)?wall|remove\s+(?:a\s+|the\s+)?wall|open\s+up\s+(?:the\s+)?(?:kitchen|living|dining|space)|open[\s-]plan|create\s+(?:an?\s+)?open[\s-]plan)\b/.test(
      blob,
    )

  const paintOnly =
    /\b(?:just\s+(?:paint|painting|repaint)|paint(?:ing)?\s+(?:only|the\s+walls)|repaint(?:ing)?|fresh\s+coat|whole\s+(?:place|house|apartment|villa)\s+(?:paint|painting|repaint)|just\s+paint|touch[\s-]?up)\b/.test(
      blob,
    ) ||
    new RegExp(`\\bpaint(?:ing)?\\s+(?:just\\s+)?(?:the\\s+|my\\s+|one\\s+)?${ROOM_MODIFIER}${ROOM_NOUNS}\\b`).test(
      blob,
    ) ||
    new RegExp(`\\b${ROOM_MODIFIER}${ROOM_NOUNS}\\s+paint(?:ing)?\\b`).test(blob)

  return { ...detected, structural, paintOnly }
}

// ---- entry point --------------------------------------------------------

export function inferEstimate(args: {
  knownFields: IntakeKnownFields
  conversationText: string
}): InferenceResult | null {
  const kf = args.knownFields
  const blob = (args.conversationText || '').toLowerCase()

  const rawNature = (kf.project_nature ?? '').toString()
  const rawProperty = (kf.property_type ?? '').toString()
  const rawSize = typeof kf.size_sqft === 'number' && kf.size_sqft > 0 ? kf.size_sqft : 0
  const rawFinish = (kf.finish_level ?? '').toString()
  const rawLocation = (kf.location ?? '').toString()

  if (!rawProperty || rawSize <= 0) return null

  // Project nature: prefer the explicit value, otherwise infer from text,
  // otherwise fall back to a safe default. We deliberately do NOT gate the
  // ballpark on nature being explicitly set.
  let nature: ProjectNature | null = (VALID_NATURES as string[]).includes(rawNature)
    ? (rawNature as ProjectNature)
    : null
  if (!nature) nature = inferNatureFromText(blob)
  const natureUsed: ProjectNature = nature ?? 'partial_renovation'
  const assumedNature = !nature

  const finish: FinishLevel = (VALID_FINISH as string[]).includes(rawFinish)
    ? (rawFinish as FinishLevel)
    : 'standard'

  const detected = detectScope(blob)
  const matchedRoomCount =
    Number(detected.kitchen) +
    Number(detected.bathroom) +
    Number(detected.powderRoom) +
    Number(detected.bedroom) +
    Number(detected.maid) +
    Number(detected.living) +
    Number(detected.dining) +
    Number(detected.generic)
  const isSingleRoom = matchedRoomCount > 0

  // For a single-room or structural scope, downgrade property type to
  // apartment so the calculator uses the lighter project base.
  const propertyForCalc =
    isSingleRoom || detected.structural ? 'apartment' : rawProperty

  const estInputs = intakeToEstimatorInputs({
    projectNature: natureUsed,
    propertyType: propertyForCalc,
    sizeSqft: rawSize,
    finishLevel: finish,
  })

  const emptyRooms = {
    bedroom: 0,
    bathroom: 0,
    kitchen: 0,
    living_room: 0,
    dining_room: 0,
    maid_room: 0,
    utility_laundry: 0,
    corridor_entry: 0,
  }
  // Typical single-room footprints in sqm.
  const ROOM_AREA_SQM = {
    kitchen: 25,
    bathroom: 12,
    powderRoom: 8,
    bedroom: 25,
    maidRoom: 10,
    living: 35,
    dining: 20,
    generic: 25,
  }

  // Structural-change-only: zero rooms, keep area for repaint scope.
  if (detected.structural && !isSingleRoom) {
    estInputs.rooms = { ...emptyRooms }
    estInputs.doors = 0
    estInputs.wardrobes = 0
    estInputs.authorityFee = 5_000
  }

  // Single-room or multi-room scope: accumulate matched rooms.
  if (isSingleRoom) {
    const rooms = { ...emptyRooms }
    let area = 0
    let doors = 0
    let wardrobes = 0

    if (detected.kitchen) {
      rooms.kitchen = 1
      area += ROOM_AREA_SQM.kitchen
      doors += 1
    }
    if (detected.bathroom) {
      rooms.bathroom = 1
      area += ROOM_AREA_SQM.bathroom
      doors += 1
    }
    if (detected.powderRoom) {
      // No room rate (no powder_room enum); project base + small painting.
      area += ROOM_AREA_SQM.powderRoom
      doors += 1
    }
    if (detected.bedroom) {
      rooms.bedroom = 1
      area += ROOM_AREA_SQM.bedroom
      doors += 1
      wardrobes += 1
    }
    if (detected.maid) {
      rooms.maid_room = 1
      area += ROOM_AREA_SQM.maidRoom
      doors += 1
    }
    if (detected.living) {
      rooms.living_room = 1
      area += ROOM_AREA_SQM.living
      doors += 1
    }
    if (detected.dining) {
      rooms.dining_room = 1
      area += ROOM_AREA_SQM.dining
      doors += 1
    }
    if (detected.generic && area === 0) {
      rooms.bedroom = 1
      area = ROOM_AREA_SQM.generic
      doors = 1
      wardrobes = 1
    }

    if (detected.paintOnly) {
      // Drop wardrobes (no joinery), authority (no permit), and zero room
      // rates so we capture prep + painting allowance only.
      estInputs.rooms = { ...emptyRooms }
      estInputs.doors = 0
      estInputs.wardrobes = 0
      estInputs.builtUpAreaSqm = area
      estInputs.authorityFee = 0
    } else {
      estInputs.rooms = rooms
      estInputs.builtUpAreaSqm = area
      estInputs.doors = doors
      estInputs.wardrobes = wardrobes
      // Single-room scope rarely needs full DM/Trakhees permit. Scale down.
      estInputs.authorityFee = matchedRoomCount >= 2 ? 10_000 : 5_000
    }
  } else if (detected.paintOnly) {
    // Whole-property paint job: strip the room stack, keep area for paint.
    estInputs.rooms = { ...emptyRooms }
    estInputs.doors = 0
    estInputs.wardrobes = 0
    estInputs.authorityFee = 0
  }

  const locationUsed = rawLocation || 'Dubai'
  const factor = locationFactor(locationUsed)

  // Compute the full breakdown at the selected finish tier...
  const selectedBreakdown = calculateEstimate(estInputs)

  // ...and the final total at every tier for the comparison row.
  const tiers: Record<FinishLevel, number> = {
    basic: 0,
    standard: 0,
    premium: 0,
    luxury: 0,
  }
  for (const tier of FINISH_ORDER) {
    const tierBreakdown = calculateEstimate({ ...estInputs, finishLevel: tier })
    tiers[tier] = Math.round(tierBreakdown.finalBudgetAed * factor)
  }

  // Build override traces for any field the inference set away from default.
  const overrides: InferenceResult['overrides'] = {}
  if (estInputs.authorityFee !== undefined) {
    let reason = 'override'
    if (detected.paintOnly) reason = 'paint-only scope (no permit needed)'
    else if (matchedRoomCount >= 2) reason = 'multi-room scope (lighter permit)'
    else if (isSingleRoom) reason = 'single-room scope (lighter permit)'
    else if (detected.structural) reason = 'structural change (single permit)'
    overrides.authorityFee = {
      applied: estInputs.authorityFee,
      default: AUTHORITY_FEE,
      reason,
    }
  }
  if (estInputs.areaBaseRate !== undefined) {
    overrides.areaBaseRate = {
      applied: estInputs.areaBaseRate,
      default: EXTENSION_RATE_PER_SQM,
      reason: 'commercial fit-out (calibrated per-sqm rate)',
    }
  }
  if (estInputs.projectBaseOverride !== undefined) {
    overrides.projectBaseOverride = {
      applied: estInputs.projectBaseOverride,
      default: PROJECT_BASE_COSTS[estInputs.projectType],
      reason:
        estInputs.projectBaseOverride === 0
          ? 'commercial refresh (no project base)'
          : 'commercial fit-out (flat base)',
    }
  }

  // Collect detection signals for the admin disclosure.
  const singleRoomList: SingleRoomKind[] = []
  if (detected.kitchen) singleRoomList.push('kitchen')
  if (detected.bathroom) singleRoomList.push('bathroom')
  if (detected.powderRoom) singleRoomList.push('powder')
  if (detected.bedroom) singleRoomList.push('bedroom')
  if (detected.maid) singleRoomList.push('maid')
  if (detected.living) singleRoomList.push('living')
  if (detected.dining) singleRoomList.push('dining')
  if (detected.generic) singleRoomList.push('generic')

  const signals: InferenceSignals = {}
  if (singleRoomList.length > 0) signals.singleRoom = singleRoomList
  if (detected.paintOnly) signals.paintOnly = true
  if (detected.structural) signals.structural = true
  if (singleRoomList.length >= 2) signals.multiRoom = true
  if (isCommercial(rawProperty)) signals.commercial = true

  const finalAed = Math.round(selectedBreakdown.finalBudgetAed * factor)
  const perSqmAed =
    estInputs.builtUpAreaSqm > 0
      ? Math.round((selectedBreakdown.finalBudgetAed * factor) / estInputs.builtUpAreaSqm)
      : 0

  return {
    inputs: estInputs,
    breakdown: selectedBreakdown,
    factor,
    finalAed,
    perSqmAed,
    tiers,
    finishLevelUsed: finish,
    locationUsed,
    natureUsed,
    assumedFinish: !rawFinish,
    assumedLocation: !rawLocation,
    assumedNature,
    signals,
    overrides,
  }
}
