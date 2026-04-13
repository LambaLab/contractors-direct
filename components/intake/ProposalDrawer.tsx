'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Plus, Loader2, MoreHorizontal, Trash2, Mail, Send, Star, ChevronDown, ChevronUp } from 'lucide-react'

export type ProposalSummary = {
  id: string
  projectName: string
  confidenceScore: number
  savedAt: string | null
}

export type LeadEmail = {
  id: string
  email: string
  is_primary: boolean
  verified_at: string
}

type Props = {
  open: boolean
  onClose: () => void
  emailVerified: boolean
  currentProposalId: string
  currentAppName: string
  currentConfidence: number
  proposals: ProposalSummary[]
  loading: boolean
  onSwitchProposal: (id: string) => void
  onNewProposal: () => void
  onDeleteProposal: (id: string) => void
  onSaveEmail: () => void
  theme: 'dark' | 'light'
  leadEmails?: LeadEmail[]
  loadingEmails?: boolean
  onAddEmail?: () => void
  onRemoveEmail?: (emailId: string) => void
  onSetPrimary?: (emailId: string) => void
  onSendLink?: (emails: string[]) => void
  sendingLink?: boolean
}

function relativeDate(iso: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function ProposalDrawer({
  open,
  onClose,
  emailVerified,
  currentProposalId,
  currentAppName,
  currentConfidence,
  proposals,
  loading,
  onSwitchProposal,
  onNewProposal,
  onDeleteProposal,
  onSaveEmail,
  theme,
  leadEmails = [],
  onAddEmail,
  onRemoveEmail,
  onSetPrimary,
  onSendLink,
  sendingLink = false,
}: Props) {
  const drawerRef = useRef<HTMLDivElement>(null)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [emailSectionOpen, setEmailSectionOpen] = useState(true)
  const [confirmRemoveEmailId, setConfirmRemoveEmailId] = useState<string | null>(null)
  const [sendLinkOpen, setSendLinkOpen] = useState(false)
  const [selectedSendEmails, setSelectedSendEmails] = useState<string[]>([])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  // Prevent body scroll when open on mobile
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  // Close overflow menu on outside click
  useEffect(() => {
    if (!menuOpenId) return
    function handleClick() { setMenuOpenId(null) }
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [menuOpenId])

  // Close menu and confirmation when drawer closes
  useEffect(() => { if (!open) { setMenuOpenId(null); setConfirmDeleteId(null); setConfirmRemoveEmailId(null); setSendLinkOpen(false); setSelectedSendEmails([]) } }, [open])

  const isLight = theme === 'light'

  return (
    <>
      {/* Backdrop — mobile only */}
      <div
        className={`fixed inset-0 z-[55] bg-black/50 md:bg-black/20 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        className={`fixed top-0 left-0 h-full z-[56] flex flex-col transition-transform duration-300 ease-in-out
          w-[80%] max-w-[320px] md:w-[320px]
          ${isLight ? 'bg-[#F5F4F0] border-r border-[rgba(0,0,0,0.08)]' : 'bg-[#1a1a1a] border-r border-white/5'}
          ${open ? 'translate-x-0' : '-translate-x-full'}`}
        role="dialog"
        aria-label="Projects"
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-4 py-3 border-b flex-shrink-0 ${isLight ? 'border-[rgba(0,0,0,0.08)]' : 'border-white/5'}`}>
          <span className={`text-sm font-medium ${isLight ? 'text-[#1a1a1a]' : 'text-white'}`}>
            Your Projects
          </span>
          <button
            onClick={onClose}
            className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors cursor-pointer
              ${isLight ? 'hover:bg-black/5 text-[#727272]' : 'hover:bg-white/10 text-[#727272] hover:text-white'}`}
            aria-label="Close drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-2">
            <button
              onClick={onNewProposal}
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-colors cursor-pointer mb-1
                ${isLight ? 'text-[#727272] hover:bg-black/[0.03] hover:text-[#1a1a1a]' : 'text-[#888] hover:bg-white/5 hover:text-white'}`}
            >
              <Plus className="w-3.5 h-3.5" />
              New Project
            </button>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className={`w-5 h-5 animate-spin ${isLight ? 'text-[#727272]' : 'text-[#727272]'}`} />
              </div>
            ) : proposals.length === 0 ? (
              <div className={`text-center py-8 text-sm ${isLight ? 'text-[#727272]' : 'text-[#727272]'}`}>
                No projects yet
              </div>
            ) : (
              <ul className="space-y-1">
                {proposals.map((p) => {
                  const isActive = p.id === currentProposalId
                  // Active project uses live data from props
                  const displayName = isActive ? (currentAppName || p.projectName || 'Untitled Project') : (p.projectName || 'Untitled Project')
                  const displayConfidence = isActive ? currentConfidence : p.confidenceScore
                  return (
                    <li key={p.id} className="relative group">
                      <button
                        onClick={() => {
                          if (!isActive) onSwitchProposal(p.id)
                        }}
                        disabled={isActive}
                        className={`w-full text-left rounded-lg px-3 py-2.5 transition-colors cursor-pointer
                          ${isActive
                            ? isLight
                              ? 'bg-[rgba(0,0,0,0.04)] border-l-2 border-[#1A1A1A]'
                              : 'bg-brand-purple/10 border-l-2 border-brand-purple'
                            : isLight
                              ? 'hover:bg-black/[0.03] border-l-2 border-transparent'
                              : 'hover:bg-white/5 border-l-2 border-transparent'
                          }`}
                      >
                        <p className={`text-sm font-medium truncate pr-6 ${isLight ? 'text-[#1a1a1a]' : 'text-white'}`}>
                          {displayName}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <div className={`flex-1 h-1 rounded-full overflow-hidden ${isLight ? 'bg-black/5' : 'bg-white/10'}`}>
                            <div
                              className="h-full bg-brand-purple rounded-full transition-all"
                              style={{ width: `${Math.min(displayConfidence, 100)}%` }}
                            />
                          </div>
                          <span className={`text-[11px] tabular-nums ${isLight ? 'text-[#999]' : 'text-[#666]'}`}>
                            {displayConfidence}%
                          </span>
                          {p.savedAt && (
                            <span className={`text-[11px] ${isLight ? 'text-[#999]' : 'text-[#555]'}`}>
                              · {relativeDate(p.savedAt)}
                            </span>
                          )}
                        </div>
                      </button>
                      {!isActive && (
                        <div className="absolute right-2 top-2.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setMenuOpenId(menuOpenId === p.id ? null : p.id)
                            }}
                            className={`w-6 h-6 rounded flex items-center justify-center transition-opacity
                              ${menuOpenId === p.id ? 'opacity-100' : 'opacity-40 md:opacity-0 md:group-hover:opacity-100'}
                              ${isLight ? 'hover:bg-black/5 text-[#999]' : 'hover:bg-white/10 text-[#666]'}`}
                            aria-label="More options"
                          >
                            <MoreHorizontal className="w-3.5 h-3.5" />
                          </button>
                          {menuOpenId === p.id && (
                            <div className={`absolute right-0 top-7 z-10 rounded-lg shadow-lg py-1 min-w-[120px]
                              ${isLight ? 'bg-white border border-[rgba(0,0,0,0.08)]' : 'bg-[#2a2a2a] border border-white/10'}`}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setMenuOpenId(null)
                                  setConfirmDeleteId(p.id)
                                }}
                                className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors cursor-pointer
                                  ${isLight ? 'text-red-600 hover:bg-red-50' : 'text-red-400 hover:bg-white/5'}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}

            {/* CTA to save email — shown for unverified users */}
            {!emailVerified && (
              <div className={`rounded-lg p-4 text-center mt-3 ${isLight ? 'bg-[rgba(0,0,0,0.03)] border border-[rgba(0,0,0,0.08)]' : 'bg-brand-purple/5 border border-brand-purple/10'}`}>
                <p className={`text-xs mb-3 ${isLight ? 'text-[#1a1a1a]/70' : 'text-white/60'}`}>
                  Save your email to pick up where you left off on any device.
                </p>
                <button
                  onClick={onSaveEmail}
                  className={`w-full py-2 px-3 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                    isLight
                      ? 'bg-[#1A1A1A] text-white hover:bg-[#333]'
                      : 'bg-brand-purple text-white hover:bg-brand-purple/90'
                  }`}
                >
                  Save project for later
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Email Management Section */}
        {emailVerified && leadEmails.length > 0 && (
          <div className={`flex-shrink-0 border-t px-4 py-3 space-y-2 ${isLight ? 'border-[rgba(0,0,0,0.08)]' : 'border-white/5'}`}>
            <button
              onClick={() => setEmailSectionOpen(o => !o)}
              className={`w-full flex items-center justify-between text-xs font-medium cursor-pointer ${isLight ? 'text-[#999]' : 'text-[#666]'}`}
            >
              <span className="flex items-center gap-1.5">
                <Mail className="w-3 h-3" />
                Saved emails ({leadEmails.length})
              </span>
              {emailSectionOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            {emailSectionOpen && (
              <div className="space-y-1.5 pt-1">
                {leadEmails.map((le) => (
                  <div
                    key={le.id}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm ${isLight ? 'bg-black/[0.02]' : 'bg-white/[0.03]'}`}
                  >
                    {le.is_primary && (
                      <Star className={`w-3 h-3 flex-shrink-0 fill-current text-[#BA7517]`} />
                    )}
                    <span className={`flex-1 truncate text-xs ${isLight ? 'text-[#1a1a1a]' : 'text-white/80'}`}>
                      {le.email}
                    </span>
                    {!le.is_primary && (
                      <>
                        <button
                          onClick={() => onSetPrimary?.(le.id)}
                          className={`p-0.5 rounded transition-colors cursor-pointer ${isLight ? 'text-[#999] hover:text-[#1a1a1a] hover:bg-black/5' : 'text-[#555] hover:text-white hover:bg-white/5'}`}
                          title="Set as primary"
                        >
                          <Star className="w-3 h-3" />
                        </button>
                        {confirmRemoveEmailId === le.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => { onRemoveEmail?.(le.id); setConfirmRemoveEmailId(null) }}
                              className="text-[10px] text-red-400 hover:text-red-300 cursor-pointer"
                            >
                              Remove
                            </button>
                            <button
                              onClick={() => setConfirmRemoveEmailId(null)}
                              className={`text-[10px] cursor-pointer ${isLight ? 'text-[#999]' : 'text-[#555]'}`}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmRemoveEmailId(le.id)}
                            className={`p-0.5 rounded transition-colors cursor-pointer ${isLight ? 'text-[#ccc] hover:text-red-500' : 'text-[#444] hover:text-red-400'}`}
                            title="Remove email"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                ))}

                <div className="flex gap-1.5 pt-1">
                  <button
                    onClick={() => onAddEmail?.()}
                    className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer
                      ${isLight ? 'text-[#727272] hover:bg-black/[0.03] hover:text-[#1a1a1a] border border-[rgba(0,0,0,0.08)]' : 'text-[#888] hover:bg-white/5 hover:text-white border border-white/5'}`}
                  >
                    <Plus className="w-3 h-3" />
                    Add email
                  </button>
                  <button
                    onClick={() => setSendLinkOpen(o => !o)}
                    disabled={sendingLink}
                    className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer
                      ${isLight ? 'bg-[#1A1A1A] text-white hover:bg-[#333]' : 'bg-brand-purple text-white hover:bg-brand-purple/90'} disabled:opacity-40`}
                  >
                    <Send className="w-3 h-3" />
                    {sendingLink ? 'Sending...' : 'Send link'}
                  </button>
                </div>

                {/* Send link checkboxes */}
                {sendLinkOpen && (
                  <div className={`rounded-lg p-2.5 space-y-2 ${isLight ? 'bg-black/[0.03] border border-[rgba(0,0,0,0.08)]' : 'bg-white/[0.03] border border-white/5'}`}>
                    <p className={`text-[11px] ${isLight ? 'text-[#999]' : 'text-[#666]'}`}>Select emails to send the project link to:</p>
                    {leadEmails.map((le) => (
                      <label key={le.id} className={`flex items-center gap-2 text-xs cursor-pointer ${isLight ? 'text-[#1a1a1a]' : 'text-white/80'}`}>
                        <input
                          type="checkbox"
                          checked={selectedSendEmails.includes(le.email)}
                          onChange={(e) => {
                            setSelectedSendEmails(prev =>
                              e.target.checked ? [...prev, le.email] : prev.filter(em => em !== le.email)
                            )
                          }}
                          className="rounded border-white/20 accent-[#7F77DD]"
                        />
                        <span className="truncate">{le.email}</span>
                      </label>
                    ))}
                    <button
                      onClick={() => {
                        onSendLink?.(selectedSendEmails)
                        setSendLinkOpen(false)
                        setSelectedSendEmails([])
                      }}
                      disabled={selectedSendEmails.length === 0 || sendingLink}
                      className={`w-full py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed
                        ${isLight ? 'bg-[#1A1A1A] text-white hover:bg-[#333]' : 'bg-brand-purple text-white hover:bg-brand-purple/90'}`}
                    >
                      Send to {selectedSendEmails.length} email{selectedSendEmails.length !== 1 ? 's' : ''}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>

      {/* Delete confirmation modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4" onClick={() => setConfirmDeleteId(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className={`relative z-10 w-full max-w-[320px] rounded-xl p-5 space-y-4 shadow-xl
              ${isLight ? 'bg-white' : 'bg-[#1e1e1e] border border-white/10'}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-2">
              <h3 className={`text-base font-semibold ${isLight ? 'text-[#1a1a1a]' : 'text-white'}`}>
                Delete project?
              </h3>
              <p className={`text-sm leading-relaxed ${isLight ? 'text-[#666]' : 'text-[#999]'}`}>
                This will permanently delete this project and all its saved data. This action cannot be undone.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors cursor-pointer
                  ${isLight ? 'bg-[rgba(0,0,0,0.05)] text-[#1a1a1a] hover:bg-[rgba(0,0,0,0.08)]' : 'bg-white/10 text-white hover:bg-white/15'}`}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDeleteProposal(confirmDeleteId)
                  setConfirmDeleteId(null)
                }}
                className="flex-1 py-2 px-3 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
