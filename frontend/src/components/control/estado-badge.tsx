import { CircleCheckIcon, CircleDashedIcon, CircleXIcon, Loader2Icon, TriangleAlertIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { cn } from "cn"

export type EstadoPaso = "OK" | "ADVERTENCIA" | "ERROR" | "EN_PROCESO" | "PENDIENTE"

export const ESTILO_ESTADO: Record<EstadoPaso, { label: string; clase: string; icono: React.ReactNode }> = {
  OK: {
    label: "OK",
    clase: "border-green-600/30 bg-green-500/10 text-green-700 dark:text-green-400",
    icono: <CircleCheckIcon />,
  },
  ADVERTENCIA: {
    label: "Advertencia",
    clase: "border-amber-600/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    icono: <TriangleAlertIcon />,
  },
  ERROR: {
    label: "Error",
    clase: "border-red-600/30 bg-red-500/10 text-red-700 dark:text-red-400",
    icono: <CircleXIcon />,
  },
  EN_PROCESO: {
    label: "En proceso",
    clase: "border-blue-600/30 bg-blue-500/10 text-blue-700 dark:text-blue-400",
    icono: <Loader2Icon className="animate-spin" />,
  },
  PENDIENTE: {
    label: "Pendiente",
    clase: "text-muted-foreground",
    icono: <CircleDashedIcon />,
  },
}

export function EstadoBadge({ estado, label }: { estado: EstadoPaso; label?: string }) {
  const e = ESTILO_ESTADO[estado]
  return (
    <Badge variant="outline" className={cn("gap-1", e.clase)}>
      {e.icono}
      {label ?? e.label}
    </Badge>
  )
}
