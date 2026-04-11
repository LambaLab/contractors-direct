'use client'

import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { AppSidebar } from '@/components/admin/app-sidebar'
import TeamModal from '@/components/admin/TeamModal'

type Props = {
  children: React.ReactNode
  adminEmail: string
  adminRole: 'super_admin' | 'admin'
}

export function AdminLayoutShell({ children, adminEmail, adminRole }: Props) {
  const [teamOpen, setTeamOpen] = useState(false)

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/admin/login'
  }

  return (
    <SidebarProvider className="!h-svh !overflow-hidden">
      <AppSidebar
        adminRole={adminRole}
        adminEmail={adminEmail}
        onTeamOpen={() => setTeamOpen(true)}
      />
      <SidebarInset className="!min-h-0 !overflow-hidden">
        <header className="bg-background flex h-14 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-14 md:rounded-tl-xl">
          <div className="flex w-full items-center gap-1 px-4 lg:gap-2">
            <SidebarTrigger />
            <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-4" />
            <div id="admin-header-portal"><h1 className="text-sm font-medium">Leads</h1></div>
            {/* Portal target for service dropdown rendered by page */}
            <div id="header-service-slot" className="flex items-center" />

            <div className="ml-auto flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger>
                  <Avatar className="size-8 cursor-pointer">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
                      {adminEmail.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="min-w-56" align="end">
                  <DropdownMenuLabel className="p-0">
                    <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                      <Avatar className="size-8">
                        <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
                          {adminEmail.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="grid flex-1 text-left text-sm leading-tight">
                        <span className="truncate font-semibold">Admin</span>
                        <span className="text-muted-foreground truncate text-xs">{adminEmail}</span>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="mr-2 size-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>
        <div className="bg-muted/40 flex flex-1 flex-col min-h-0 overflow-hidden">
          {children}
        </div>
      </SidebarInset>
      <TeamModal open={teamOpen} onOpenChange={setTeamOpen} />
    </SidebarProvider>
  )
}
