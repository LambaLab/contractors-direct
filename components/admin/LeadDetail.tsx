'use client'

import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, X, Maximize2, Minimize2 } from 'lucide-react'
import type { Database } from '@/lib/supabase/types'
import { SCOPE_CATALOG } from '@/lib/scope/catalog'
import { Button } from '@/components/ui/button'
import LeadEditor from './LeadEditor'
import TrackerTab from './TrackerTab'
import ChatTab from './ChatTab'
import BudgetTab from './BudgetTab'

type Lead = Database['public']['Tables']['leads']['Row']

type Props = {
  lead: Lead
  onBack: () => void
  onLeadUpdate: (updated: Lead) => void
  isMobileFullscreen?: boolean
  isExpanded?: boolean
  onToggleExpand?: () => void
  onClose?: () => void
}

type DetailTab = 'lead' | 'tracker' | 'chat'

function getStatusStyle(status: string): { bg: string; text: string; dot: string; label: string } {
  const label = status.replace(/_/g, ' ')
  switch (status) {
    case 'draft':
    case 'saved':
      return { bg: 'bg-zinc-100 dark:bg-zinc-800', text: 'text-zinc-600 dark:text-zinc-400', dot: 'bg-zinc-400', label }
    case 'pending_review':
      return { bg: 'bg-purple-950 dark:bg-purple-500/10', text: 'text-purple-700 dark:text-purple-400', dot: 'bg-purple-500', label }
    case 'approved':
      return { bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500', label }
    case 'budget_proposed':
      return { bg: 'bg-blue-50 dark:bg-blue-500/10', text: 'text-blue-700 dark:text-blue-400', dot: 'bg-blue-500', label }
    case 'accepted':
    case 'budget_accepted':
      return { bg: 'bg-violet-50 dark:bg-violet-500/10', text: 'text-violet-700 dark:text-violet-400', dot: 'bg-violet-500', label }
    default:
      return { bg: 'bg-zinc-100 dark:bg-zinc-800', text: 'text-zinc-600 dark:text-zinc-400', dot: 'bg-zinc-400', label }
  }
}

function getProjectName(lead: Lead): string {
  const meta = lead.metadata as Record<string, unknown> | null
  if (meta?.projectName && typeof meta.projectName === 'string') return meta.projectName
  return 'Untitled'
}

export default function LeadDetail({ lead, onBack, onLeadUpdate, isMobileFullscreen, isExpanded, onToggleExpand, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<DetailTab>('lead')

  const scope = (lead.scope ?? []) as string[]
  const scopeNames = scope
    .map((id) => SCOPE_CATALOG.find((m) => m.id === id)?.name ?? id)

  const status = getStatusStyle(lead.status)

  const tabs: { value: DetailTab; label: string }[] = [
    { value: 'lead', label: 'Proposal' },
    { value: 'tracker', label: 'Tracker' },
    { value: 'chat', label: 'Chat' },
  ]

  // Escape key to close expanded view or close panel
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (isExpanded && onToggleExpand) {
        onToggleExpand()
      } else if (onClose) {
        onClose()
      }
    }
  }, [isExpanded, onToggleExpand, onClose])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div className="flex flex-col h-full">
      {/* ─── Mobile fullscreen header — replaces shell header ─── */}
      {isMobileFullscreen && (
        <div className="shrink-0 bg-background border-b md:hidden">
          {/* App bar: back + title */}
          <div className="flex items-center gap-3 px-4 h-14">
            <Button variant="ghost" size="icon" onClick={onBack} className="h-10 w-10 -ml-2">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-lg font-semibold text-foreground truncate flex-1">
              {getProjectName(lead)}
            </h1>
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full uppercase tracking-wide shrink-0 ${status.bg} ${status.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
              {status.label}
            </span>
          </div>

          {/* Stats row */}
          <div className="flex flex-wrap items-center gap-3 px-4 pb-2 text-sm text-muted-foreground">
            <span>{lead.confidence_score}% confidence</span>
            {lead.price_min > 0 && (
              <span className="font-medium text-foreground">${lead.price_min.toLocaleString()}&ndash;${lead.price_max.toLocaleString()}</span>
            )}
            <span>{scope.length} scope item{scope.length !== 1 ? 's' : ''}</span>
            {lead.email && <span className="text-blue-600 dark:text-blue-400">{lead.email}</span>}
          </div>

          {/* Scope tags */}
          {scopeNames.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-4 pb-2">
              {scopeNames.map((name) => (
                <span key={name} className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded bg-purple-950 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400">
                  {name}
                </span>
              ))}
            </div>
          )}

          {/* Equal-width tabs — underline flush with border */}
          <div className="flex">
            {tabs.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`relative flex-1 py-3 text-base font-medium text-center transition-colors cursor-pointer ${
                  activeTab === tab.value
                    ? 'text-foreground'
                    : 'text-muted-foreground'
                }`}
              >
                {tab.label}
                {activeTab === tab.value && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-500 dark:bg-purple-400" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ─── Desktop header ─── */}
      <div className={`shrink-0 bg-background border-b ${isMobileFullscreen ? 'hidden md:block' : ''}`}>
        <div className={isExpanded ? 'max-w-4xl mx-auto' : ''}>
          {/* Title row */}
          <div className="px-4 md:px-6 pt-2 pb-1.5">
            <div className="flex items-center gap-3 mb-1.5">
              <Button variant="ghost" size="icon" onClick={onBack} className="md:hidden h-8 w-8">
                <ArrowLeft className="w-4 h-4" />
              </Button>

              <div className="flex-1 min-w-0 flex items-center gap-2.5">
                <h2 className="font-heading font-bold text-xl text-foreground truncate">
                  {getProjectName(lead)}
                </h2>
                <span className={`inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wide shrink-0 ${status.bg} ${status.text}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                  {status.label}
                </span>
              </div>

              {/* Action buttons: expand + close */}
              <div className="hidden md:flex items-center gap-1">
                {onToggleExpand && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onToggleExpand}
                    className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer"
                    title={isExpanded ? 'Exit fullscreen' : 'Expand fullscreen'}
                  >
                    {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                  </Button>
                )}
                {onClose && !isExpanded && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onClose}
                    className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer"
                    title="Close"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Compact stats */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span>{lead.confidence_score}% confidence</span>
              {lead.price_min > 0 && (
                <span className="font-medium text-foreground">${lead.price_min.toLocaleString()}&ndash;${lead.price_max.toLocaleString()}</span>
              )}
              <span>{scope.length} scope item{scope.length !== 1 ? 's' : ''}</span>
              {lead.email && <span className="text-blue-600 dark:text-blue-400">{lead.email}</span>}
              {scopeNames.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {scopeNames.map((name) => (
                    <span key={name} className="inline-flex items-center text-[10px] font-medium px-1.5 py-px rounded bg-purple-950 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400">
                      {name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Tabs row — desktop */}
          <div className="flex items-center gap-0 px-4 md:px-6">
            {tabs.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`relative px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
                  activeTab === tab.value
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground/70'
                }`}
              >
                {tab.label}
                {activeTab === tab.value && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-500 dark:bg-purple-400" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab content — scrolls independently, centered in expanded mode */}
      <div className="flex-1 min-h-0 flex flex-col bg-white dark:bg-background">
        <div className={`${isExpanded ? 'max-w-4xl mx-auto w-full' : ''} ${activeTab === 'chat' ? 'flex-1 min-h-0 flex flex-col' : 'overflow-y-auto flex-1'}`}>
          <div className={activeTab === 'lead' ? '' : 'hidden'}>
            <LeadEditor lead={lead} onUpdate={onLeadUpdate} />
            {/* Budget section within Proposal tab */}
            <div className="border-t">
              <BudgetTab leadId={lead.id} leadEmail={lead.email} leadSlug={lead.slug} />
            </div>
          </div>
          <div className={activeTab === 'tracker' ? '' : 'hidden'}>
            <TrackerTab leadId={lead.id} />
          </div>
          <div className={`${activeTab === 'chat' ? 'flex-1 min-h-0 flex flex-col' : 'hidden'}`}>
            <ChatTab leadId={lead.id} />
          </div>
        </div>
      </div>
    </div>
  )
}
