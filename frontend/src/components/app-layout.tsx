import * as React from "react"
import { Outlet, useLocation } from "react-router-dom"

import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { iniciarTourSiPrimeraVez } from "@/tour/tour"

const TITULOS: Record<string, string> = {
  "/": "Dashboard",
  "/control": "Control de asignación",
}

export function AppLayout() {
  const { pathname } = useLocation()

  React.useEffect(() => {
    const t = setTimeout(iniciarTourSiPrimeraVez, 500)
    return () => clearTimeout(t)
  }, [])

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader title={TITULOS[pathname] ?? "Asignación REQ"} />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <Outlet />
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
