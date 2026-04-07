'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'

type AdminUser = {
  id: string
  email: string
  role: 'super_admin' | 'admin'
  added_by: string | null
  created_at: string
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function TeamModal({ open, onOpenChange }: Props) {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [newEmail, setNewEmail] = useState('')
  const [adding, setAdding] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users')
      const data = await res.json()
      if (res.ok) {
        setUsers(data.users)
      }
    } catch {
      setError('Failed to load team members')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      loadUsers()
    }
  }, [open, loadUsers])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newEmail.trim()) return

    setAdding(true)
    setError(null)

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail.trim() }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error)
        return
      }

      setUsers((prev) => [...prev, data.user])
      setNewEmail('')
    } catch {
      setError('Failed to add team member')
    } finally {
      setAdding(false)
    }
  }

  async function handleRemove(id: string) {
    setRemovingId(id)
    setError(null)

    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error)
        return
      }

      setUsers((prev) => prev.filter((u) => u.id !== id))
    } catch {
      setError('Failed to remove team member')
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading font-bold text-xl tracking-wide">TEAM MEMBERS</DialogTitle>
        </DialogHeader>

        {/* Content */}
        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
            </div>
          ) : (
            <div className="space-y-1">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between py-3 px-3 rounded-lg hover:bg-muted group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="h-8 w-8 flex-shrink-0">
                      <AvatarFallback className="text-xs">
                        {user.email.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-foreground truncate">{user.email}</p>
                        {user.role === 'super_admin' ? (
                          <Badge>Super Admin</Badge>
                        ) : (
                          <Badge variant="secondary">Admin</Badge>
                        )}
                      </div>
                      {user.added_by && (
                        <p className="text-xs text-muted-foreground">
                          Added by {user.added_by}
                        </p>
                      )}
                    </div>
                  </div>

                  {user.role !== 'super_admin' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemove(user.id)}
                      disabled={removingId === user.id}
                      className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive hover:bg-destructive/10 transition-all disabled:opacity-50"
                    >
                      {removingId === user.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add member form */}
        <div className="border-t pt-4">
          {error && <p className="text-xs text-destructive mb-3">{error}</p>}
          <form onSubmit={handleAdd} className="flex gap-2">
            <Input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="Add team member by email..."
              className="flex-1"
            />
            <Button
              type="submit"
              disabled={adding || !newEmail.trim()}
            >
              {adding ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Add
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
