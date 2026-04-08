'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Save, Check, Plus, X, ChevronRight, ChevronDown, Pencil } from 'lucide-react'
import * as Icons from 'lucide-react'
import type { Database } from '@/lib/supabase/types'
import { SCOPE_CATALOG } from '@/lib/scope/catalog'
import { Button } from '@/components/ui/button'

type Lead = Database['public']['Tables']['leads']['Row']

type Props = {
  lead: Lead
  onUpdate: (updated: Lead) => void
}

type SectionKey = 'brief' | 'overview' | 'scope' | 'adminNotes'

const SECTIONS: { key: SectionKey; label: string; sublabel?: string }[] = [
  { key: 'brief', label: 'Brief' },
  { key: 'overview', label: 'Overview' },
  { key: 'scope', label: 'Scope' },
  { key: 'adminNotes', label: 'Admin Notes', sublabel: 'Internal only' },
]

export default function LeadEditor({ lead, onUpdate }: Props) {
  const [saving, setSaving] = useState(false)
  const [showSaved, setShowSaved] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedDismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Local form state
  const meta = (lead.metadata ?? {}) as Record<string, unknown>
  const [projectName, setProjectName] = useState((meta.projectName as string) ?? '')
  const [brief, setBrief] = useState(lead.brief ?? '')
  const [projectOverview, setProjectOverview] = useState((meta.projectOverview as string) ?? '')
  const [adminNotes, setAdminNotes] = useState(lead.admin_notes ?? '')
  const [prd, setPrd] = useState(lead.prd ?? '')
  const [techArch, setTechArch] = useState(lead.technical_architecture ?? '')
  const [timeline, setTimeline] = useState(lead.timeline ?? '')
  const [scope, setScope] = useState<string[]>((lead.scope ?? []) as string[])
  const [expandedScope, setExpandedScope] = useState<Set<string>>(new Set())
  const scopeSummaries = (meta.scopeSummaries ?? {}) as Record<string, string>

  // Desktop: vertical tab selection
  const [activeSection, setActiveSection] = useState<SectionKey>('brief')

  // Mobile: accordion — which section is expanded (null = all collapsed)
  const [mobileOpenSection, setMobileOpenSection] = useState<SectionKey | null>('brief')

  // Track if there are unsaved changes
  const [hasChanges, setHasChanges] = useState(false)

  // Reset form when lead changes
  useEffect(() => {
    const m = (lead.metadata ?? {}) as Record<string, unknown>
    setProjectName((m.projectName as string) ?? '')
    setBrief(lead.brief ?? '')
    setProjectOverview((m.projectOverview as string) ?? '')
    setAdminNotes(lead.admin_notes ?? '')
    setPrd(lead.prd ?? '')
    setTechArch(lead.technical_architecture ?? '')
    setTimeline(lead.timeline ?? '')
    setScope((lead.scope ?? []) as string[])
    setIsEditing(false)
    setHasChanges(false)
  }, [lead.id])

  const saveChanges = useCallback(async (updates: Record<string, unknown>) => {
    setSaving(true)
    const res = await fetch(`/api/admin/leads/${lead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (res.ok) {
      const updated = await res.json()
      onUpdate(updated)
      setShowSaved(true)
      setHasChanges(false)
      if (savedDismissTimer.current) clearTimeout(savedDismissTimer.current)
      savedDismissTimer.current = setTimeout(() => setShowSaved(false), 2000)
    }
    setSaving(false)
  }, [lead.id, onUpdate])

  // Save all current field values at once
  function handleSaveAll() {
    saveChanges({
      brief,
      admin_notes: adminNotes,
      prd,
      technical_architecture: techArch,
      timeline,
      scope,
      metadata: { ...meta, projectName, projectOverview },
    })
    setIsEditing(false)
  }

  function handleCancel() {
    // Reset to lead values
    const m = (lead.metadata ?? {}) as Record<string, unknown>
    setProjectName((m.projectName as string) ?? '')
    setBrief(lead.brief ?? '')
    setProjectOverview((m.projectOverview as string) ?? '')
    setAdminNotes(lead.admin_notes ?? '')
    setPrd(lead.prd ?? '')
    setTechArch(lead.technical_architecture ?? '')
    setTimeline(lead.timeline ?? '')
    setScope((lead.scope ?? []) as string[])
    setIsEditing(false)
    setHasChanges(false)
  }

  function handleFieldChange(field: string, value: string) {
    setHasChanges(true)
    switch (field) {
      case 'brief': setBrief(value); break
      case 'admin_notes': setAdminNotes(value); break
      case 'prd': setPrd(value); break
      case 'technical_architecture': setTechArch(value); break
      case 'timeline': setTimeline(value); break
      case 'projectName': setProjectName(value); break
      case 'projectOverview': setProjectOverview(value); break
    }
  }

  function handleToggleScope(scopeId: string) {
    const updated = scope.includes(scopeId)
      ? scope.filter((m) => m !== scopeId)
      : [...scope, scopeId]
    setScope(updated)
    setHasChanges(true)
  }

  function toggleScopeExpand(scopeId: string) {
    setExpandedScope(prev => {
      const next = new Set(prev)
      if (next.has(scopeId)) next.delete(scopeId)
      else next.add(scopeId)
      return next
    })
  }

  // Get display value for read-only mode
  function getDisplayValue(key: SectionKey): string {
    switch (key) {
      case 'brief': return brief
      case 'overview': return projectOverview
      case 'adminNotes': return adminNotes
      default: return ''
    }
  }

  // Section content renderer
  function renderSectionContent(key: SectionKey) {
    if (key === 'scope') {
      return <ScopeContent scope={scope} scopeSummaries={scopeSummaries} expandedScope={expandedScope} onToggleScope={handleToggleScope} onToggleExpand={toggleScopeExpand} isEditing={isEditing} />
    }

    const value = getDisplayValue(key)

    // Read-only mode
    if (!isEditing) {
      if (!value) {
        return <p className="text-base md:text-sm text-muted-foreground/40 italic">No content yet</p>
      }
      return (
        <p className="whitespace-pre-wrap leading-relaxed text-foreground text-base md:text-sm">
          {value}
        </p>
      )
    }

    // Edit mode
    const baseClass = 'w-full resize-y bg-muted/20 dark:bg-muted/10 rounded-lg p-3 outline-none border border-border/60 focus:border-purple-400 dark:focus:border-purple-500/40 transition-colors placeholder:text-muted-foreground/40 text-foreground'

    switch (key) {
      case 'brief':
        return <textarea value={brief} onChange={(e) => handleFieldChange('brief', e.target.value)} className={`${baseClass} min-h-[120px] text-base md:text-sm leading-relaxed`} placeholder="2-4 sentence summary" />
      case 'overview':
        return <textarea value={projectOverview} onChange={(e) => handleFieldChange('projectOverview', e.target.value)} className={`${baseClass} min-h-[160px] text-base md:text-sm leading-relaxed`} placeholder="Detailed project description" />
      case 'adminNotes':
        return <textarea value={adminNotes} onChange={(e) => handleFieldChange('admin_notes', e.target.value)} className={`${baseClass} min-h-[120px] text-base md:text-sm leading-relaxed bg-amber-50/50 dark:bg-amber-500/5`} placeholder="Internal notes, not visible to client" />
    }
  }

  const activeSectionDef = SECTIONS.find(s => s.key === activeSection)!

  return (
    <div>
      {/* ─── Section header: LEAD DETAILS ─── */}
      <div className="flex items-center justify-between px-6 md:px-8 py-3 border-b border-border/40">
        <div className="flex items-center gap-3">
          <p className="text-xs md:text-[11px] uppercase tracking-widest font-medium text-muted-foreground/70">Lead Details</p>
          {/* Save status */}
          <div className="text-xs h-5 flex items-center">
            {saving && (
              <span className="flex items-center gap-1 text-muted-foreground animate-pulse">
                <Save className="w-3 h-3" /> Saving
              </span>
            )}
            {!saving && showSaved && (
              <span className="flex items-center gap-1 text-emerald-500 animate-in fade-in duration-200">
                <Check className="w-3 h-3" /> Saved
              </span>
            )}
          </div>
        </div>
        {/* Edit / Save / Cancel buttons */}
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancel}
                className="text-xs cursor-pointer h-7"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSaveAll}
                disabled={saving || !hasChanges}
                className="text-xs cursor-pointer h-7 bg-purple-500 hover:bg-purple-600 text-black"
              >
                {saving ? 'Saving...' : 'Save changes'}
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(true)}
              className="text-xs cursor-pointer h-7 gap-1.5"
            >
              <Pencil className="w-3 h-3" />
              Edit
            </Button>
          )}
        </div>
      </div>

      {/* ─── Desktop: Vertical tabs layout ─── */}
      <div className="hidden md:flex min-h-[400px]">
        {/* Tab list — left side */}
        <div className="w-44 shrink-0 border-r border-border/40">
          {SECTIONS.map((section, index) => {
            const isActive = activeSection === section.key
            return (
              <div key={section.key}>
                {index > 0 && (
                  <div className="mx-3 h-px bg-border/30" />
                )}
                <button
                  type="button"
                  onClick={() => setActiveSection(section.key)}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors cursor-pointer border-l-2 ${
                    isActive
                      ? 'text-foreground font-medium bg-purple-950/80 dark:bg-purple-500/5 border-l-purple-500'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 border-l-transparent'
                  }`}
                >
                  {section.label}
                  {section.sublabel && (
                    <span className="block text-[10px] text-amber-500/70 mt-0.5">{section.sublabel}</span>
                  )}
                </button>
              </div>
            )
          })}
        </div>

        {/* Content — right side */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          <div className="px-6 py-4">
            {renderSectionContent(activeSection)}
          </div>
        </div>
      </div>

      {/* ─── Mobile: Accordion layout ─── */}
      <div className="md:hidden">
        {SECTIONS.map((section, index) => {
          const isOpen = mobileOpenSection === section.key
          return (
            <div key={section.key}>
              {index > 0 && (
                <div className="mx-4 h-px bg-border/30" />
              )}
              {/* Accordion header */}
              <button
                type="button"
                onClick={() => setMobileOpenSection(isOpen ? null : section.key)}
                className={`w-full flex items-center justify-between px-5 py-3.5 text-base transition-colors cursor-pointer ${
                  isOpen
                    ? 'text-foreground font-medium bg-purple-950/80 dark:bg-purple-500/5'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                <span className="flex items-center gap-2">
                  {section.label}
                  {section.sublabel && (
                    <span className="text-xs text-amber-500/70">{section.sublabel}</span>
                  )}
                </span>
                {isOpen
                  ? <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />
                  : <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
                }
              </button>
              {/* Accordion content */}
              <div
                className="grid transition-[grid-template-rows] duration-200 ease-in-out"
                style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
              >
                <div className="overflow-hidden">
                  <div className="px-5 py-4 border-t border-border/20">
                    {renderSectionContent(section.key)}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Scope content ───
function ScopeContent({
  scope,
  scopeSummaries,
  expandedScope,
  onToggleScope,
  onToggleExpand,
  isEditing,
}: {
  scope: string[]
  scopeSummaries: Record<string, string>
  expandedScope: Set<string>
  onToggleScope: (id: string) => void
  onToggleExpand: (id: string) => void
  isEditing: boolean
}) {
  return (
    <div className="space-y-2">
      {/* Selected scope items */}
      {scope.map((scopeId) => {
        const mod = SCOPE_CATALOG.find((m) => m.id === scopeId)
        if (!mod) return null
        const IconComponent = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[mod.icon] ?? Icons.Box
        const summary = scopeSummaries[scopeId]
        const isOpen = expandedScope.has(scopeId)

        return (
          <div
            key={scopeId}
            className={`rounded-xl border overflow-hidden transition-all ${
              isOpen
                ? 'border-purple-800 dark:border-purple-500/20 bg-purple-950/30 dark:bg-purple-500/5'
                : 'border-border/60 bg-muted/20 dark:bg-muted/10'
            }`}
          >
            <div
              className={`flex items-center gap-2.5 p-3 group ${summary ? 'cursor-pointer' : ''}`}
              onClick={() => { if (summary) onToggleExpand(scopeId) }}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                isOpen
                  ? 'bg-purple-900 dark:bg-purple-500/15'
                  : 'bg-muted/60 dark:bg-muted/30'
              }`}>
                <IconComponent className={`w-4 h-4 transition-colors ${
                  isOpen
                    ? 'text-purple-600 dark:text-purple-400'
                    : 'text-muted-foreground'
                }`} />
              </div>
              <span className="text-base md:text-sm font-medium text-foreground flex-1 truncate">{mod.name}</span>
              {isEditing && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onToggleScope(scopeId) }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-muted-foreground hover:text-destructive cursor-pointer"
                  title="Remove scope item"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              {summary && (
                <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} />
              )}
            </div>
            {summary && (
              <div
                className="grid transition-[grid-template-rows] duration-300 ease-in-out"
                style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
              >
                <div className="overflow-hidden">
                  <div className="px-3 pb-3">
                    <div className="h-px bg-purple-800/50 dark:bg-purple-500/10 mb-2" />
                    <p className="text-sm md:text-xs text-muted-foreground leading-relaxed">{summary}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Available scope items to add — only in edit mode */}
      {isEditing && SCOPE_CATALOG.filter((m) => !scope.includes(m.id)).length > 0 && (
        <div className="pt-2">
          <p className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground/50 mb-2">Add scope</p>
          <div className="space-y-1.5">
            {SCOPE_CATALOG.filter((m) => !scope.includes(m.id)).map((mod) => {
              const IconComponent = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[mod.icon] ?? Icons.Box
              return (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => onToggleScope(mod.id)}
                  className="w-full flex items-center gap-2.5 p-2.5 rounded-xl border border-dashed border-muted-foreground/15 opacity-50 hover:opacity-100 hover:border-foreground/20 hover:bg-muted/30 transition-all cursor-pointer text-left"
                >
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-muted/50">
                    <IconComponent className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                  <span className="text-base md:text-sm text-muted-foreground">{mod.name}</span>
                  <Plus className="w-3.5 h-3.5 text-muted-foreground/50 ml-auto" />
                </button>
              )
            })}
          </div>
        </div>
      )}

      {scope.length === 0 && !isEditing && (
        <p className="text-base md:text-sm text-muted-foreground/40 italic">No scope selected</p>
      )}
    </div>
  )
}
