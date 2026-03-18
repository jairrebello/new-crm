import * as React from "react"
import Link from "next/link"
import { 
  LayoutDashboard, 
  KanbanSquare, 
  MessageSquare, 
  Settings, 
  Users 
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { TenantSwitcher } from "@/components/tenant-switcher"

type Tenant = { id: string; name: string; slug: string; logo_url: string | null }

export function AppSidebar({ tenantSlug, tenants }: { tenantSlug: string, tenants: Tenant[] }) {
  const navItems = [
    { title: "Painel", url: `/${tenantSlug}/dashboard`, icon: LayoutDashboard },
    { title: "CRM (Kanban)", url: `/${tenantSlug}/crm`, icon: KanbanSquare },
    { title: "Caixa de entrada", url: `/${tenantSlug}/inbox`, icon: MessageSquare },
    { title: "Contatos", url: `/${tenantSlug}/contacts`, icon: Users },
    { title: "Configurações", url: `/${tenantSlug}/settings`, icon: Settings },
  ]

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b">
        <h2 className="font-bold text-lg px-2">SaaS CRM</h2>
        <TenantSwitcher currentTenantSlug={tenantSlug} tenants={tenants} />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Aplicativo</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton render={<Link href={item.url} />}>
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
