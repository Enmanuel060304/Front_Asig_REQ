import { SkipForwardIcon } from "lucide-react"
import { toast } from "sonner"

import { useAuth } from "@/auth/AuthContext"
import { ConfirmarAccion } from "@/components/control/confirmar-accion"
import { ModeToggle } from "@/components/mode-toggle"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { api } from "@/lib/api"
import { nombrePeriodo } from "@/lib/formato"

async function siguientePeriodo() {
  try {
    const { periodo } = await api.siguientePeriodo()
    toast.success(`Ahora es ${nombrePeriodo(periodo)}`)
    setTimeout(() => location.reload(), 800) // Control y Dashboard cargan el periodo nuevo
  } catch (err) {
    toast.error("No se pudo cambiar de periodo", { description: err instanceof Error ? err.message : undefined })
  }
}

export function SiteHeader({ title }: { title: string }) {
  const { demo } = useAuth()
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 h-4 data-vertical:self-auto" />
        <h1 className="text-base font-medium">{title}</h1>
        {demo && <Badge variant="secondary">Modo demo</Badge>}
        {demo && (
          <ConfirmarAccion
            id="tour-demo-periodo"
            size="sm"
            variant="ghost"
            titulo="¿Pasar al siguiente periodo?"
            descripcion="Solo existe en la demo: simula que empezó el mes siguiente. Los insumos del nuevo periodo hay que extraerlos de nuevo y las cantidades varían al azar. Lo hecho en el periodo actual queda en el histórico del Dashboard."
            textoConfirmar="Siguiente periodo"
            onConfirmar={siguientePeriodo}
          >
            <SkipForwardIcon />
            <span className="hidden sm:inline">Siguiente periodo</span>
          </ConfirmarAccion>
        )}
        <div className="ml-auto">
          <ModeToggle />
        </div>
      </div>
    </header>
  )
}
