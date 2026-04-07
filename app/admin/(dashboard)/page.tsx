'use client'

import { Suspense, useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, RefreshCw, Filter, ArrowUpDown, X, ChevronDown, Check } from 'lucide-react'
import type { Database } from '@/lib/supabase/types'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import LeadList from '@/components/admin/LeadList'
import LeadDetail from '@/components/admin/LeadDetail'

type Lead = Database['public']['Tables']['leads']['Row']
type StatusFilter = 'all' | Lead['status']
type SortKey = 'newest' | 'oldest' | 'confidence' | 'price'
type LeadType = 'build' | 'grow' | 'fund'

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending_review', label: 'Pending review' },
  { value: 'approved', label: 'Approved' },
  { value: 'budget_proposed', label: 'Budget proposed' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'budget_accepted', label: 'Budget accepted' },
]

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'confidence', label: 'Confidence' },
  { value: 'price', label: 'Price' },
]

const TYPE_TABS: { value: LeadType; label: string; count?: boolean }[] = [
  { value: 'build', label: 'Build', count: true },
  { value: 'grow', label: 'Grow' },
  { value: 'fund', label: 'Fund' },
]

export default function AdminDashboardPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-1 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      </div>
    }>
      <AdminDashboardContent />
    </Suspense>
  )
}

function AdminDashboardContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [leads, setLeads] = useState<Lead[]>([])
  // Read initial selectedId from URL query param
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('id'))
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('newest')
  const [activeTab, setActiveTab] = useState<LeadType>('build')
  const [refreshing, setRefreshing] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [mobileServiceOpen, setMobileServiceOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null)

  // Find the portal target in the header shell
  useEffect(() => {
    const el = document.getElementById('header-service-slot')
    if (el) setHeaderSlot(el)
  }, [])

  // Sync selectedId from URL when browser back/forward changes searchParams
  useEffect(() => {
    const urlId = searchParams.get('id')
    setSelectedId(urlId)
  }, [searchParams])

  // Draggable divider state
  const [listWidthPx, setListWidthPx] = useState(380)
  const isDragging = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Sync URL when selectedId changes — push so browser back works
  const handleSelect = useCallback((id: string) => {
    setSelectedId(id)
    router.push(`/admin?id=${id}`, { scroll: false })
  }, [router])

  const handleDeselect = useCallback(() => {
    setSelectedId(null)
    setIsExpanded(false)
    setExpandVisible(false)
    setExpandAnimating(false)
    router.replace('/admin', { scroll: false })
  }, [router])

  // Expand animation state
  const [expandAnimating, setExpandAnimating] = useState(false)
  const [expandVisible, setExpandVisible] = useState(false)
  const expandTimerRef = useRef<ReturnType<typeof setTimeout>>(null)

  const handleToggleExpand = useCallback(() => {
    if (expandTimerRef.current) clearTimeout(expandTimerRef.current)

    if (!isExpanded) {
      // Opening: mount overlay, then animate in
      setIsExpanded(true)
      setExpandAnimating(true)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setExpandVisible(true))
      })
      expandTimerRef.current = setTimeout(() => setExpandAnimating(false), 250)
    } else {
      // Closing: animate out, then unmount
      setExpandAnimating(true)
      setExpandVisible(false)
      expandTimerRef.current = setTimeout(() => {
        setIsExpanded(false)
        setExpandAnimating(false)
      }, 250)
    }
  }, [isExpanded])

  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'

    function onMouseMove(ev: MouseEvent) {
      if (!isDragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const x = ev.clientX - rect.left
      setListWidthPx(Math.min(600, Math.max(280, x)))
    }

    function onMouseUp() {
      isDragging.current = false
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [])

  const fetchLeads = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/proposals')
      if (res.ok) {
        const data = await res.json()
        setLeads(data)
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    async function loadData() {
      await fetchLeads()
      setLoading(false)
    }
    loadData()
    const pollInterval = setInterval(fetchLeads, 5000)
    return () => clearInterval(pollInterval)
  }, [fetchLeads])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchLeads()
    setRefreshing(false)
  }, [fetchLeads])

  const selectedLead = leads.find((p) => p.id === selectedId) ?? null

  // Mobile slide animation state — open immediately if URL has id on mount
  const [mobileSlideOpen, setMobileSlideOpen] = useState(!!searchParams.get('id'))
  const mobileLeadRef = useRef<Lead | null>(null)
  const slideTimerRef = useRef<ReturnType<typeof setTimeout>>(null)

  // Manage mobile slide lifecycle based on selectedLead
  useEffect(() => {
    if (selectedLead) {
      // Opening: store lead, trigger slide-in after paint
      mobileLeadRef.current = selectedLead
      if (slideTimerRef.current) clearTimeout(slideTimerRef.current)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setMobileSlideOpen(true))
      })
    } else if (mobileSlideOpen) {
      // Closing: slide out, then clear ref after animation
      setMobileSlideOpen(false)
      slideTimerRef.current = setTimeout(() => {
        mobileLeadRef.current = null
      }, 300)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLead?.id])

  // Keep ref in sync with latest lead data (polling updates)
  useEffect(() => {
    if (selectedLead && mobileSlideOpen) {
      mobileLeadRef.current = selectedLead
    }
  }, [selectedLead, mobileSlideOpen])

  // The lead to display in the mobile overlay (current or closing)
  const mobileDisplayLead = selectedLead ?? mobileLeadRef.current

  function handleLeadUpdate(updated: Lead) {
    setLeads((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
  }

  // Service dropdown to render into the header via portal
  function renderServiceDropdown() {
    if (!headerSlot) return null

    const triggerButton = (
      <button className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-sm font-medium hover:bg-muted/60 transition-colors cursor-pointer text-muted-foreground">
        {TYPE_TABS.find(t => t.value === activeTab)?.label}
        {activeTab === 'build' && leads.length > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-purple-400/15 text-purple-600 dark:text-purple-400">
            {leads.length}
          </span>
        )}
        <ChevronDown className="w-3 h-3 text-muted-foreground" />
      </button>
    )

    return createPortal(
      <>
        {/* Desktop: dropdown */}
        <div className="hidden md:block">
          <DropdownMenu>
            <DropdownMenuTrigger>
              {triggerButton}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[140px]">
              {TYPE_TABS.map((tab) => (
                <DropdownMenuItem
                  key={tab.value}
                  onClick={() => setActiveTab(tab.value)}
                  className="flex items-center justify-between gap-3 text-sm cursor-pointer"
                >
                  <span>{tab.label}</span>
                  <div className="flex items-center gap-2">
                    {tab.count && leads.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-muted text-muted-foreground">
                        {leads.length}
                      </span>
                    )}
                    {activeTab === tab.value && (
                      <Check className="w-3.5 h-3.5 text-purple-500" />
                    )}
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {/* Mobile: tap opens bottom sheet */}
        <div className="md:hidden" onClick={() => setMobileServiceOpen(true)}>
          {triggerButton}
        </div>
      </>,
      headerSlot
    )
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      </div>
    )
  }

  return (
    <>
      {/* Portal: service dropdown into header */}
      {renderServiceDropdown()}

      {/* --- Desktop layout --- */}
      <div ref={containerRef} className="hidden md:flex flex-1 min-h-0 overflow-hidden">
        {/* Left panel — toolbar + list */}
        <div
          className="flex flex-col min-h-0 shrink-0 border-r"
          style={{ width: selectedLead ? `${listWidthPx}px` : '100%' }}
        >
          {/* Toolbar: search + filter/sort/refresh icons */}
          <div className="shrink-0 bg-background border-b">
            <div className={`flex items-center gap-1 px-2 lg:px-3 py-1.5 ${selectedLead ? 'justify-between' : 'justify-start'}`}>
              {/* Search: expandable field */}
              {searchOpen ? (
                <div className={`relative ${selectedLead ? 'flex-1' : 'w-64'}`}>
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    ref={searchInputRef}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search leads..."
                    className="pl-9 pr-8 h-8 bg-muted/50 text-sm"
                    onBlur={() => { if (!searchQuery) setTimeout(() => setSearchOpen(false), 150) }}
                    autoFocus
                  />
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { setSearchQuery(''); setSearchOpen(false) }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <Tooltip>
                  <TooltipTrigger>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 cursor-pointer rounded-lg"
                      onClick={() => { setSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 50) }}
                    >
                      <Search className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Search</TooltipContent>
                </Tooltip>
              )}

              {/* Status filter icon */}
              <Tooltip>
                <TooltipTrigger>
                  <div>
                    <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                      <SelectTrigger className="h-8 w-8 p-0 border-0 shadow-none justify-center cursor-pointer rounded-lg hover:bg-accent [&>svg:last-child]:hidden">
                        <div className="relative">
                          <Filter className="h-4 w-4" />
                          {statusFilter !== 'all' && (
                            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-purple-500" />
                          )}
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value} className="text-xs">
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom">Filter</TooltipContent>
              </Tooltip>

              {/* Sort icon */}
              <Tooltip>
                <TooltipTrigger>
                  <div>
                    <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                      <SelectTrigger className="h-8 w-8 p-0 border-0 shadow-none justify-center cursor-pointer rounded-lg hover:bg-accent [&>svg:last-child]:hidden">
                        <ArrowUpDown className="h-4 w-4" />
                      </SelectTrigger>
                      <SelectContent>
                        {SORT_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value} className="text-xs">
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom">Sort</TooltipContent>
              </Tooltip>

              {/* Refresh */}
              <Tooltip>
                <TooltipTrigger>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 cursor-pointer rounded-lg"
                    onClick={handleRefresh}
                    disabled={refreshing}
                  >
                    <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Refresh</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Scrollable list */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <LeadList
              leads={leads}
              selectedId={selectedId}
              onSelect={handleSelect}
              searchQuery={searchQuery}
              statusFilter={statusFilter}
              sortKey={sortKey}
              isFullWidth={!selectedLead}
            />
          </div>
        </div>

        {/* Draggable divider — full height */}
        {selectedLead && (
          <div
            className="w-1 shrink-0 cursor-col-resize relative bg-border hover:bg-purple-400/50 active:bg-purple-400/70 transition-colors group -ml-px"
            onMouseDown={handleDividerMouseDown}
          >
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-6 rounded-full bg-muted-foreground/20 group-hover:bg-purple-500/60 transition-colors pointer-events-none" />
          </div>
        )}

        {/* Right panel — detail (hidden when expanded) */}
        {selectedLead && !isExpanded && (
          <div className="flex-1 min-w-0 min-h-0 flex flex-col">
            <LeadDetail
              key={selectedLead.id}
              lead={selectedLead}
              onBack={handleDeselect}
              onLeadUpdate={handleLeadUpdate}
              onClose={handleDeselect}
              onToggleExpand={handleToggleExpand}
              isExpanded={false}
            />
          </div>
        )}
      </div>

      {/* --- Desktop expanded overlay with animation --- */}
      {selectedLead && isExpanded && (
        <div
          className={`hidden md:flex fixed inset-0 z-50 bg-background flex-col transition-all duration-250 ease-out will-change-transform ${
            expandVisible
              ? 'opacity-100 scale-100'
              : 'opacity-0 scale-[0.97]'
          } ${expandAnimating ? 'pointer-events-none' : ''}`}
          style={{ transformOrigin: 'center center' }}
        >
          <LeadDetail
            key={`expanded-${selectedLead.id}`}
            lead={selectedLead}
            onBack={handleDeselect}
            onLeadUpdate={handleLeadUpdate}
            onClose={handleDeselect}
            onToggleExpand={handleToggleExpand}
            isExpanded
          />
        </div>
      )}

      {/* --- Mobile detail overlay — slides in from right --- */}
      {mobileDisplayLead && (
        <div
          className={`fixed inset-0 z-40 bg-background flex flex-col md:hidden transition-transform duration-300 ease-out will-change-transform ${
            mobileSlideOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <LeadDetail
            key={mobileDisplayLead.id}
            lead={mobileDisplayLead}
            onBack={handleDeselect}
            onLeadUpdate={handleLeadUpdate}
            isMobileFullscreen
          />
        </div>
      )}

      {/* --- Mobile list layout --- */}
      <div className="flex md:hidden flex-1 flex-col overflow-hidden">
        <div className="flex flex-col h-full overflow-hidden">
          {/* Mobile toolbar */}
          <div className="shrink-0 border-b">
            <div className="flex items-center gap-1.5 px-4 py-2 justify-start">
              {/* Search icon */}
              {searchOpen ? (
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search leads..."
                    className="pl-9 pr-8 h-10 text-base"
                    onBlur={() => { if (!searchQuery) setTimeout(() => setSearchOpen(false), 150) }}
                    autoFocus
                  />
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { setSearchQuery(''); setSearchOpen(false) }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 cursor-pointer rounded-lg"
                    onClick={() => setSearchOpen(true)}
                  >
                    <Search className="h-[18px] w-[18px]" />
                  </Button>

                  <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                    <SelectTrigger className="h-9 w-9 p-0 border-0 shadow-none justify-center cursor-pointer rounded-lg hover:bg-accent [&>svg:last-child]:hidden">
                      <div className="relative">
                        <Filter className="h-[18px] w-[18px]" />
                        {statusFilter !== 'all' && (
                          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-purple-500" />
                        )}
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value} className="text-sm">
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                    <SelectTrigger className="h-9 w-9 p-0 border-0 shadow-none justify-center cursor-pointer rounded-lg hover:bg-accent [&>svg:last-child]:hidden">
                      <ArrowUpDown className="h-[18px] w-[18px]" />
                    </SelectTrigger>
                    <SelectContent>
                      {SORT_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value} className="text-sm">
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 cursor-pointer rounded-lg"
                    onClick={handleRefresh}
                    disabled={refreshing}
                  >
                    <RefreshCw className={`h-[18px] w-[18px] ${refreshing ? 'animate-spin' : ''}`} />
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Mobile bottom sheet for service selection (triggered from header) */}
          <Sheet open={mobileServiceOpen} onOpenChange={setMobileServiceOpen}>
            <SheetContent side="bottom" className="rounded-t-2xl pb-8">
              <SheetHeader>
                <SheetTitle className="text-base font-semibold">Select Service</SheetTitle>
              </SheetHeader>
              <div className="space-y-1 px-4">
                {TYPE_TABS.map((tab) => (
                  <button
                    key={tab.value}
                    onClick={() => { setActiveTab(tab.value); setMobileServiceOpen(false) }}
                    className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl text-base transition-colors cursor-pointer ${
                      activeTab === tab.value
                        ? 'bg-purple-950/80 dark:bg-purple-500/5 text-foreground font-medium'
                        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      {tab.label}
                      {tab.count && leads.length > 0 && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          activeTab === tab.value
                            ? 'bg-purple-400/15 text-purple-600 dark:text-purple-400'
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          {leads.length}
                        </span>
                      )}
                    </span>
                    {activeTab === tab.value && (
                      <Check className="w-5 h-5 text-purple-500" />
                    )}
                  </button>
                ))}
              </div>
            </SheetContent>
          </Sheet>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <LeadList
              leads={leads}
              selectedId={selectedId}
              onSelect={handleSelect}
              searchQuery={searchQuery}
              statusFilter={statusFilter}
              sortKey={sortKey}
            />
          </div>
        </div>
      </div>
    </>
  )
}
