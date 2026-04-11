'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ClipboardList, BarChart3, Users, Settings, BookOpen } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'

type Props = {
  adminRole: 'super_admin' | 'admin' | null
  adminEmail: string
  onTeamOpen: () => void
}

export function AppSidebar({ adminRole, onTeamOpen }: Props) {
  const pathname = usePathname()
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <div>
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg overflow-hidden bg-brand-charcoal">
                  <Image
                    src="/cd-logo.png"
                    alt="Contractors Direct"
                    width={32}
                    height={32}
                    className="object-contain"
                  />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-heading font-bold text-lg tracking-wide">CONTRACTORS DIRECT</span>
                </div>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton isActive={pathname === '/admin' || pathname.startsWith('/admin/proposals')} tooltip="Leads" asChild>
                  <Link href="/admin">
                    <ClipboardList />
                    <span>Leads</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton isActive={pathname.startsWith('/admin/price-book')} tooltip="Price Book" asChild>
                  <Link href="/admin/price-book">
                    <BookOpen />
                    <span>Price Book</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Analytics" disabled>
                  <BarChart3 />
                  <span>Analytics</span>
                </SidebarMenuButton>
                <SidebarMenuBadge className="text-[10px] text-muted-foreground">
                  Soon
                </SidebarMenuBadge>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {adminRole === 'super_admin' && (
          <SidebarGroup>
            <SidebarGroupLabel>Settings</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Team" onClick={onTeamOpen}>
                    <Users />
                    <span>Team</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Settings" disabled>
                    <Settings />
                    <span>Settings</span>
                  </SidebarMenuButton>
                  <SidebarMenuBadge className="text-[10px] text-muted-foreground">
                    Soon
                  </SidebarMenuBadge>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  )
}
