import { cn } from "cn"

import { EstadoBadge, type EstadoPaso } from "@/components/control/estado-badge"

const COLOR_NUMERO: Record<EstadoPaso, string> = {
  OK: "bg-green-600 text-white dark:bg-green-500",
  ADVERTENCIA: "bg-amber-500 text-white",
  ERROR: "bg-red-600 text-white dark:bg-red-500",
  EN_PROCESO: "bg-blue-600 text-white dark:bg-blue-500",
  PENDIENTE: "bg-muted text-muted-foreground",
}

/** Un paso del flujo de la asignación: número, título, estado, contenido y acciones. */
export function Paso({
  numero,
  titulo,
  estado,
  etiquetaEstado,
  acciones,
  ultimo,
  id,
  children,
}: {
  numero: number
  titulo: string
  estado: EstadoPaso
  etiquetaEstado?: string
  acciones?: React.ReactNode
  ultimo?: boolean
  id?: string
  children: React.ReactNode
}) {
  return (
    <li id={id} className="relative flex gap-4">
      {!ultimo && <span className="absolute top-10 bottom-0 left-4 w-px bg-border" aria-hidden />}
      <span
        className={cn(
          "z-10 flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
          COLOR_NUMERO[estado]
        )}
      >
        {numero}
      </span>
      <div className="mb-6 flex min-w-0 flex-1 flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{titulo}</h3>
            <EstadoBadge estado={estado} label={etiquetaEstado} />
          </div>
          {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
        </div>
        <div className="flex flex-col gap-3 text-sm">{children}</div>
      </div>
    </li>
  )
}

/** Fila de datos "etiqueta: valor" compacta. */
export function Datos({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
      {items.map(([k, v]) => (
        <div key={k} className="flex flex-col">
          <dt className="text-xs text-muted-foreground">{k}</dt>
          <dd className="font-medium tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  )
}
