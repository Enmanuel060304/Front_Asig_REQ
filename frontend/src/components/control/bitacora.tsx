import { CircleCheckIcon, CircleXIcon, InfoIcon, TriangleAlertIcon } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { EventoBitacora } from "@/lib/api"
import { fmtFecha } from "@/lib/formato"

const ICONO: Record<EventoBitacora["Nivel"], React.ReactNode> = {
  info: <InfoIcon className="size-4 text-blue-600 dark:text-blue-400" />,
  ok: <CircleCheckIcon className="size-4 text-green-600 dark:text-green-400" />,
  warn: <TriangleAlertIcon className="size-4 text-amber-600 dark:text-amber-400" />,
  error: <CircleXIcon className="size-4 text-red-600 dark:text-red-400" />,
}

export function Bitacora({ eventos }: { eventos: EventoBitacora[] }) {
  return (
    <Card id="tour-bitacora" className="xl:sticky xl:top-4">
      <CardHeader>
        <CardTitle>Bitácora del periodo</CardTitle>
        <CardDescription>Validaciones, ejecuciones y cambios de programación.</CardDescription>
      </CardHeader>
      <CardContent>
        {eventos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin eventos todavía.</p>
        ) : (
          <ol className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto pr-1">
            {eventos.map((e) => (
              <li key={e.Id} className="flex gap-2 text-sm">
                <span className="mt-0.5 shrink-0">{ICONO[e.Nivel]}</span>
                <div className="flex flex-col">
                  <span>{e.Mensaje}</span>
                  <span className="text-xs text-muted-foreground">
                    {fmtFecha(e.Fecha)} · {e.Usuario}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
