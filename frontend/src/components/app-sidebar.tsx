import * as React from "react"
import { Link } from "react-router-dom"
import { CircleHelpIcon, DownloadIcon, LayoutDashboardIcon, ListChecksIcon, WorkflowIcon } from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import { useInstallPrompt } from "@/pwa/use-install-prompt"
import { iniciarTour } from "@/tour/tour"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

const navMain = [
  { title: "Dashboard", url: "/", icon: <LayoutDashboardIcon /> },
  { title: "Control de asignación", url: "/control", icon: <ListChecksIcon />, id: "tour-nav-control" },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { puedeInstalar, instalar } = useInstallPrompt()

  const navSecondary = [
    { title: "Ayuda", icon: <CircleHelpIcon />, onClick: iniciarTour, id: "tour-ayuda" },
    ...(puedeInstalar ? [{ title: "Instalar app", icon: <DownloadIcon />, onClick: instalar }] : []),
  ]

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton className="data-[slot=sidebar-menu-button]:p-1.5!" render={<Link to="/" />}>
              <WorkflowIcon className="size-5!" />
              <span className="text-base font-semibold">Asignación REQ</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
        <NavSecondary items={navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  )
}
