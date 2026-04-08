'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Send, UserPlus, Play, Radio, ArrowDown, Circle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

type ChatMessage = {
  id: string
  proposal_id: string
  role: 'user' | 'assistant' | 'admin'
  content: string
  metadata: unknown
  created_at: string
}

type Props = {
  leadId: string
}

export default function ChatTab({ leadId }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [adminMessage, setAdminMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [isJoined, setIsJoined] = useState(false)
  const [isLive, setIsLive] = useState(false)
  const [clientOnline, setClientOnline] = useState(false)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [newMessageCount, setNewMessageCount] = useState(0)
  const [newMessageStartId, setNewMessageStartId] = useState<string | null>(null)

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const newMessageMarkerRef = useRef<HTMLDivElement>(null)
  const supabaseRef = useRef(createClient())
  const broadcastChannelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)
  const isNearBottomRef = useRef(true)
  const prevMessageCountRef = useRef(0)

  // Check if user is scrolled near the bottom
  const checkIfNearBottom = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return true
    const threshold = 100
    return container.scrollHeight - container.scrollTop - container.clientHeight < threshold
  }, [])

  // Scroll to bottom
  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant' })
    setNewMessageCount(0)
    setNewMessageStartId(null)
  }, [])

  // Scroll to new message marker
  const scrollToNewMessages = useCallback(() => {
    if (newMessageMarkerRef.current) {
      newMessageMarkerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      scrollToBottom()
    }
    setNewMessageCount(0)
    setNewMessageStartId(null)
  }, [scrollToBottom])

  // Track scroll position
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    function handleScroll() {
      const nearBottom = checkIfNearBottom()
      isNearBottomRef.current = nearBottom
      setShowScrollButton(!nearBottom)
      if (nearBottom) {
        setNewMessageCount(0)
        setNewMessageStartId(null)
      }
    }

    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [checkIfNearBottom])

  // Load messages via admin API (bypasses RLS) and poll for updates
  useEffect(() => {
    const supabase = supabaseRef.current

    async function loadMessages() {
      try {
        const res = await fetch(`/api/admin/chat/${leadId}`)
        if (res.ok) {
          const data = await res.json() as ChatMessage[]
          setMessages(data)
          prevMessageCountRef.current = data.length
          // Scroll to bottom on initial load
          setTimeout(() => scrollToBottom(false), 50)
        }
      } catch { /* ignore */ }
      setLoading(false)
    }

    loadMessages()

    // Poll for new messages every 3 seconds
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/chat/${leadId}`)
        if (res.ok) {
          const data = await res.json() as ChatMessage[]
          setMessages((prev) => {
            if (data.length !== prev.length) {
              setIsLive(true)
              const newCount = data.length - prev.length
              // If not near bottom, show new message indicator
              if (!isNearBottomRef.current && newCount > 0) {
                setNewMessageCount(c => c + newCount)
                // Mark the first new message
                if (!newMessageStartId) {
                  const firstNewMsg = data[prev.length]
                  if (firstNewMsg) setNewMessageStartId(firstNewMsg.id)
                }
              }
              return data
            }
            return prev
          })
        }
      } catch { /* ignore */ }
    }, 3000)

    // Broadcast channel for admin join/leave signaling + client presence
    try {
      const broadcastChannel = supabase.channel(`proposal:${leadId}`, {
        config: { presence: { key: 'admin' } },
      })
      broadcastChannelRef.current = broadcastChannel

      broadcastChannel
        .on('presence', { event: 'sync' }, () => {
          const state = broadcastChannel.presenceState()
          const hasClient = Object.keys(state).some(key => key === 'client')
          setClientOnline(hasClient)
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await broadcastChannel.track({ user_type: 'admin' })
          }
        })
    } catch {
      // Realtime not configured yet
    }

    return () => {
      clearInterval(pollInterval)
      if (broadcastChannelRef.current) {
        supabase.removeChannel(broadcastChannelRef.current)
        broadcastChannelRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId])

  // Auto-scroll to bottom when new messages arrive (only if already near bottom)
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current && isNearBottomRef.current) {
      scrollToBottom()
    }
    prevMessageCountRef.current = messages.length
  }, [messages, scrollToBottom])

  async function handleJoinChat() {
    // Write to DB so client polling picks it up
    await fetch('/api/admin/chat', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId, active: true }),
    })
    // Also try broadcast for instant delivery
    const channel = broadcastChannelRef.current
    if (channel) {
      channel.send({
        type: 'broadcast',
        event: 'admin_status',
        payload: { type: 'admin_joined' },
      })
    }
    setIsJoined(true)
  }

  async function handleLeaveChat() {
    await fetch('/api/admin/chat', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId, active: false }),
    })
    const channel = broadcastChannelRef.current
    if (channel) {
      channel.send({
        type: 'broadcast',
        event: 'admin_status',
        payload: { type: 'admin_left' },
      })
    }
    setIsJoined(false)
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!adminMessage.trim() || sending) return

    const content = adminMessage.trim()
    setSending(true)
    const res = await fetch('/api/admin/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId, content }),
    })

    if (res.ok) {
      const savedMsg = await res.json() as ChatMessage
      setMessages((prev) => {
        if (prev.some((m) => m.id === savedMsg.id)) return prev
        return [...prev, savedMsg]
      })
      setAdminMessage('')

      const channel = broadcastChannelRef.current
      if (channel) {
        await channel.send({
          type: 'broadcast',
          event: 'admin_message',
          payload: { id: savedMsg.id, content, created_at: savedMsg.created_at },
        })
      }

      // Always scroll to bottom after sending
      setTimeout(() => scrollToBottom(), 50)
    }
    setSending(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Sticky header — always visible */}
      <div className="flex items-center justify-between px-4 md:px-6 py-2.5 border-b bg-background sticky top-0 z-20">
        <div className="flex items-center gap-3">
          {/* Client online status */}
          <span className="flex items-center gap-1.5 text-xs md:text-[11px]">
            <Circle className={`w-2 h-2 fill-current ${clientOnline ? 'text-green-500' : 'text-zinc-300 dark:text-zinc-600'}`} />
            <span className={clientOnline ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground/60'}>
              Client {clientOnline ? 'online' : 'offline'}
            </span>
          </span>

          {isLive && (
            <span className="flex items-center gap-1.5 text-[11px] text-green-500">
              <Radio className="w-3 h-3 animate-pulse" />
              Live
            </span>
          )}
          <span className="text-xs md:text-[11px] text-muted-foreground">
            {messages.length} message{messages.length !== 1 ? 's' : ''}
          </span>
        </div>

        {isJoined ? (
          <Button
            variant="outline"
            size="sm"
            onClick={handleLeaveChat}
            className="flex items-center gap-1.5 text-xs bg-green-500/10 text-green-500 hover:bg-green-500/20 hover:text-green-500 cursor-pointer"
          >
            <Play className="w-3 h-3" /> Resume AI
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={handleJoinChat}
            className="flex items-center gap-1.5 text-xs bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 hover:text-blue-500 cursor-pointer"
          >
            <UserPlus className="w-3 h-3" /> Join Chat
          </Button>
        )}
      </div>

      {/* Messages area with floating button container */}
      <div className="flex-1 min-h-0 relative">
        {/* Scrollable messages */}
        <div ref={scrollContainerRef} className="absolute inset-0 overflow-y-auto px-4 md:px-6 py-5">
          <div className="space-y-4">
            {messages.length === 0 && (
              <p className="text-base md:text-sm text-muted-foreground text-center py-8">No messages yet.</p>
            )}

            {messages.map((msg) => (
              <div key={msg.id}>
                {/* New message marker */}
                {msg.id === newMessageStartId && (
                  <div ref={newMessageMarkerRef} className="flex items-center gap-2 py-2">
                    <div className="flex-1 h-px bg-blue-500/30" />
                    <span className="text-[11px] text-blue-500 font-medium uppercase tracking-wider shrink-0">New messages</span>
                    <div className="flex-1 h-px bg-blue-500/30" />
                  </div>
                )}
                <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'items-start gap-2'}`}>
                  {msg.role !== 'user' && (
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5 ${
                      msg.role === 'admin'
                        ? 'bg-blue-500/20 text-blue-500'
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {msg.role === 'admin' ? 'A' : 'AI'}
                    </div>
                  )}

                  <div className="max-w-[80%] space-y-1">
                    {msg.role === 'admin' && (
                      <Badge variant="outline" className="text-blue-500 border-blue-500 text-[11px] font-medium uppercase tracking-wider">[Admin]</Badge>
                    )}
                    <div className={`px-3.5 py-2.5 text-base md:text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-2xl rounded-br-sm'
                        : msg.role === 'admin'
                          ? 'bg-blue-50 dark:bg-blue-950 text-foreground border border-blue-500/20 rounded-2xl rounded-bl-sm'
                          : 'bg-secondary text-secondary-foreground rounded-2xl rounded-bl-sm'
                    }`}>
                      {msg.content}
                    </div>
                    <p className="text-xs text-muted-foreground px-1">
                      {new Date(msg.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              </div>
            ))}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Scroll to bottom button + new message bubble — floating over messages */}
        {(showScrollButton || newMessageCount > 0) && (
          <div className="absolute bottom-4 right-6 md:right-8 z-30 flex flex-col items-center gap-2">
            {newMessageCount > 0 && (
              <button
                onClick={scrollToNewMessages}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-500 text-white text-xs font-medium shadow-lg hover:bg-blue-600 transition-colors cursor-pointer animate-in slide-in-from-bottom-2 duration-200"
              >
                {newMessageCount} new message{newMessageCount !== 1 ? 's' : ''}
                <ArrowDown className="w-3 h-3" />
              </button>
            )}
            {showScrollButton && newMessageCount === 0 && (
              <button
                onClick={() => scrollToBottom()}
                className="w-9 h-9 rounded-full bg-background border border-border shadow-lg flex items-center justify-center hover:bg-muted transition-colors cursor-pointer"
                title="Scroll to bottom"
              >
                <ArrowDown className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Admin input — only when joined */}
      {isJoined && (
        <form onSubmit={handleSendMessage} className="p-4 border-t bg-background sticky bottom-0 z-20">
          <div className="flex items-center gap-2">
            <Input
              value={adminMessage}
              onChange={(e) => setAdminMessage(e.target.value)}
              placeholder="Type a message as admin..."
              className="flex-1 rounded-xl text-base md:text-sm"
              autoFocus
            />
            <Button
              type="submit"
              size="icon"
              disabled={!adminMessage.trim() || sending}
              className="rounded-xl cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
