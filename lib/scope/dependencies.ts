import { SCOPE_CATALOG, type ScopeItem } from './catalog'

// Dependency graph: key scope item requires all listed items
const DEPENDENCY_GRAPH: Record<string, string[]> = {
  demolition: [],
  extensions: [],
  windows_glazing: [],
  kitchen: ['plumbing', 'electrical', 'tiling'],
  appliances: [],
  master_bathroom: ['plumbing', 'tiling'],
  family_bathroom: ['plumbing', 'tiling'],
  ensuite_bathroom: ['plumbing', 'tiling'],
  powder_room: ['plumbing', 'tiling'],
  flooring: [],
  tiling: [],
  paint_walls: [],
  exterior_painting: [],
  false_ceiling: ['electrical'],
  wardrobes: [],
  joinery: [],
  electrical: [],
  plumbing: [],
  hvac: ['electrical'],
  lighting: ['electrical'],
  smart_home: ['electrical'],
  home_cinema: ['electrical'],
  balconies: [],
  garden_terrace: [],
  landscaping: [],
}

// Reverse map: which scope items depend on a given item
function buildDependentsMap(): Record<string, string[]> {
  const dependents: Record<string, string[]> = {}
  for (const [scopeId, deps] of Object.entries(DEPENDENCY_GRAPH)) {
    for (const dep of deps) {
      if (!dependents[dep]) dependents[dep] = []
      dependents[dep].push(scopeId)
    }
  }
  return dependents
}

const DEPENDENTS_MAP = buildDependentsMap()

export function getScopeDependencies(scopeId: string): string[] {
  return DEPENDENCY_GRAPH[scopeId] ?? []
}

export function validateScopeRemoval(
  scopeId: string,
  activeScopeIds: string[]
): { canRemove: boolean; blockedBy: string[] } {
  const potentialDependents = DEPENDENTS_MAP[scopeId] ?? []
  const blockedBy = potentialDependents.filter((dep) => activeScopeIds.includes(dep))
  return { canRemove: blockedBy.length === 0, blockedBy }
}

export function getScopeById(scopeId: string): ScopeItem | null {
  return SCOPE_CATALOG.find((s) => s.id === scopeId) ?? null
}

export function getRequiredScopeForSelection(scopeId: string): string[] {
  return getScopeDependencies(scopeId)
}

// Expand a scope list to include all required dependencies (recursive).
// Example: ["kitchen"] -> ["kitchen", "plumbing", "electrical", "tiling"]
export function expandWithDependencies(scopeIds: string[]): string[] {
  const result = new Set(scopeIds)
  let changed = true
  while (changed) {
    changed = false
    for (const id of Array.from(result)) {
      for (const dep of DEPENDENCY_GRAPH[id] ?? []) {
        if (!result.has(dep)) {
          result.add(dep)
          changed = true
        }
      }
    }
  }
  return Array.from(result)
}
