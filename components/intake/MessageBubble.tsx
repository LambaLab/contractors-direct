'use client'

import { useState, useEffect } from 'react'
import { Pencil, Check, X } from 'lucide-react'
import Image from 'next/image'
import type { ChatMessage } from '@/hooks/useIntakeChat'
import QuickReplies from './QuickReplies'
import TypingIndicator from './TypingIndicator'

type Props = {
  message: ChatMessage
  isStreaming?: boolean
  onQuickReply?: (value: string, label?: string) => void
  isLastMessage?: boolean
  onEdit?: (messageId: string, newContent: string, displayContent?: string) => void
  onStartRowEdit?: (messageId: string) => void  // For row-selection messages: show rows at bottom instead of textarea
  isBeingReEdited?: boolean                      // Visual indicator that this message's rows are active at bottom
  theme?: 'dark' | 'light'
}

function CardThumbnail({ src, alt }: { src: string; alt: string }) {
  const [errored, setErrored] = useState(false)
  if (errored) return null
  return (
    <div className="w-fit ml-auto mb-2 rounded-xl overflow-hidden border border-[var(--ov-bubble-user-border,#7367ff)]/50">
      <div className="relative w-[180px] aspect-[4/3]">
        <Image
          src={src}
          alt={alt}
          fill
          sizes="180px"
          className="object-cover"
          onError={() => setErrored(true)}
        />
      </div>
    </div>
  )
}

function formatMessageTime(ts?: number): string | null {
  if (!ts) return null
  const now = Date.now()
  const diff = now - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  // Show time for older messages
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export default function MessageBubble({ message, isStreaming, onQuickReply, isLastMessage, onEdit, onStartRowEdit, isBeingReEdited, theme }: Props) {
  const isUser = message.role === 'user'
  const isAdmin = message.role === 'admin'
  const iconSrc = '/cd-logo.png'

  // User bubbles show displayContent when available (e.g. quick reply label instead of raw value)
  const rawContentRaw = isUser
    ? (message.displayContent ?? message.content)
    : message.content

  // Sanitize: the AI sometimes outputs literal \n instead of actual newlines
  // (double-escaped in JSON). Replace literal backslash-n sequences with real newlines.
  const rawContent = rawContentRaw
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')

  // Render all paragraphs — the question is now its own field, not embedded in content
  const paragraphs = rawContent.split('\n\n').filter(Boolean)
  const displayParagraphs = paragraphs

  // Don't render list QR inline — ChatPanel renders it at the bottom.
  // Safety net: treat pills with 3+ options as list (normalizeQRStyle should have
  // caught this, but defend at render level too).
  const qr = message.quickReplies
  const isCustomPickerStyle =
    qr?.style === 'cards' || qr?.style === 'sqft' || qr?.style === 'budget'
  const shouldBeList = qr && (
    qr.style === 'list' ||
    (!isCustomPickerStyle && Array.isArray(qr.options) && qr.options.length >= 3)
  )
  const isListQR = !isUser && shouldBeList && isLastMessage
  const isCustomQR = !isUser && isCustomPickerStyle && isLastMessage
  const showInlineQR = message.quickReplies && isLastMessage && onQuickReply && !isListQR && !isCustomQR

  // When a user message came from selecting a card, surface the card's image
  // alongside the label so the answer bubble shows what they actually picked.
  const selectedCardOption =
    isUser && message.sourceQuickReplies?.style === 'cards'
      ? message.sourceQuickReplies.options.find((o) => o.value === message.content)
      : undefined
  const selectedCardImage = selectedCardOption?.imageUrl

  // Edit state uses displayContent for the initial value so user sees human-readable text
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(message.displayContent ?? message.content)

  useEffect(() => {
    if (!isEditing) {
      setEditValue(message.displayContent ?? message.content)
    }
  }, [message.content, message.displayContent, isEditing])

  function handleEditSave() {
    if (!editValue.trim() || !onEdit) return
    onEdit(message.id, editValue.trim())
    setIsEditing(false)
  }

  function handleEditCancel() {
    setEditValue(message.displayContent ?? message.content)
    setIsEditing(false)
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'items-start gap-2'}`}>
      {!isUser && !isAdmin && (
        <Image
          src={iconSrc}
          alt="Contractors Direct"
          width={24}
          height={24}
          className="rounded-full flex-shrink-0 mt-1 select-none"
        />
      )}
      {isAdmin && (
        <div className="w-6 h-6 rounded-full bg-[#0082fe]/20 flex items-center justify-center flex-shrink-0 mt-1 select-none">
          <span className="text-[9px] font-bold text-[#0082fe]">A</span>
        </div>
      )}
      <div className={`space-y-3 ${isUser ? 'max-w-[85%]' : 'max-w-[80%]'}`}>
        {/* Admin label */}
        {isAdmin && (
          <span className="text-[10px] text-[#0082fe] font-medium uppercase tracking-wider">[Admin]</span>
        )}

        {/* Question context: shown above row-selection answer bubbles so the answer has clear context */}
        {isUser && message.sourceQuestion && !isEditing && (
          <p className="text-[11px] text-[var(--ov-text-muted,#727272)] text-right leading-relaxed px-1 mb-1">
            {message.sourceQuestion}
          </p>
        )}

        {/* Card thumbnail: when the user picked a card, show the card image
            above the answer bubble so the answer is visually grounded.
            The CardThumbnail component silently hides itself if the image is
            missing or fails to load, so the bubble still reads cleanly. */}
        {isUser && selectedCardImage && !isEditing && selectedCardOption && (
          <CardThumbnail
            src={selectedCardImage}
            alt={selectedCardOption.imageAlt || selectedCardOption.label}
          />
        )}

        <div className={`relative group ${isUser ? 'w-fit ml-auto' : ''}`}>
          {isEditing ? (
            <div className="space-y-2">
              <textarea
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditSave() }
                  if (e.key === 'Escape') handleEditCancel()
                }}
                className="w-full px-4 py-3 rounded-2xl text-sm leading-relaxed bg-brand-purple/20 text-[var(--ov-text,#ffffff)] border border-brand-purple/40 outline-none resize-none min-h-[60px]"
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={handleEditCancel}
                  className="flex items-center gap-1 text-xs text-[var(--ov-text-muted,#727272)] hover:text-[var(--ov-text,#ffffff)] transition-colors px-2 py-1 rounded-lg hover:bg-[var(--ov-surface-subtle,rgba(255,255,255,0.05))] cursor-pointer"
                >
                  <X className="w-3 h-3" /> Cancel
                </button>
                <button
                  onClick={handleEditSave}
                  disabled={!editValue.trim() || isStreaming}
                  className="flex items-center gap-1 text-xs text-brand-dark bg-brand-purple hover:bg-brand-purple/90 transition-colors px-2 py-1 rounded-lg disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                >
                  <Check className="w-3 h-3" /> Save
                </button>
              </div>
            </div>
          ) : (
            <div
              className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                isUser
                  ? `bg-[var(--ov-bubble-user-bg,transparent)] border border-[var(--ov-bubble-user-border,#7367ff)] text-[var(--ov-bubble-user-text,var(--ov-text,#ffffff))] font-medium rounded-br-sm ${isBeingReEdited ? 'ring-2 ring-[var(--ov-focus-ring,rgba(115,103,255,0.60))] ring-offset-2 ring-offset-[var(--ov-input-bg,#1a1a1a)]' : ''}`
                  : isAdmin
                    ? 'bg-[#0082fe]/10 border border-[#0082fe]/20 text-[var(--ov-text,#ffffff)] rounded-bl-sm'
                    : 'bg-[var(--ov-bubble-ai-bg,rgba(255,255,255,0.05))] text-[var(--ov-text,#ffffff)] border border-[var(--ov-bubble-ai-border,transparent)] rounded-bl-sm'
              }`}
            >
              {/* Loading indicator while streaming (before content arrives) */}
              {isStreaming && !rawContent ? (
                <TypingIndicator />
              ) : displayParagraphs.length > 1 ? (
                // Multi-paragraph: render each paragraph separately for readability
                <div className="space-y-2">
                  {displayParagraphs.map((para, idx) => (
                    <p key={idx}>{para}</p>
                  ))}
                </div>
              ) : (
                // Single paragraph or user message
                rawContent
              )}
            </div>
          )}

          {/* Edit button — always visible for user messages so it's discoverable
              on mobile (no hover) and obvious on desktop. Kept subtle via low
              opacity until hover. */}
          {isUser && !isEditing && (onEdit || onStartRowEdit) && (
            <button
              onClick={() => {
                if (message.sourceQuickReplies && onStartRowEdit) {
                  // Row-selection message: show the original rows at bottom for re-selection
                  onStartRowEdit(message.id)
                } else {
                  // Free-text message: open textarea edit
                  setEditValue(message.displayContent ?? message.content)
                  setIsEditing(true)
                }
              }}
              className="absolute -top-1 -left-9 w-7 h-7 rounded-full bg-[var(--ov-surface-subtle,rgba(255,255,255,0.08))] border border-[var(--ov-border,rgba(255,255,255,0.08))] hover:bg-[var(--ov-input-bg,rgba(255,255,255,0.18))] hover:border-[var(--ov-accent-border,rgba(115,103,255,0.40))] flex items-center justify-center cursor-pointer opacity-60 hover:opacity-100 transition-all"
              aria-label="Edit this answer"
              title="Edit this answer"
            >
              <Pencil className="w-3 h-3 text-[var(--ov-text-muted,#727272)]" />
            </button>
          )}
        </div>

        {/* Timestamp */}
        {message.createdAt && !isEditing && (
          <p className={`text-[10px] mt-1 px-1 select-none ${
            isUser ? 'text-right' : ''
          } ${
            theme === 'light' ? 'text-[#b0b0b0]' : 'text-[#555]'
          }`}>
            {formatMessageTime(message.createdAt)}
          </p>
        )}

        {/* Inline quick replies — pills only; list style is handled at ChatPanel bottom */}
        {showInlineQR && (
          <QuickReplies
            quickReplies={message.quickReplies!}
            onSelect={onQuickReply!}
            disabled={isStreaming}
          />
        )}
      </div>
    </div>
  )
}
