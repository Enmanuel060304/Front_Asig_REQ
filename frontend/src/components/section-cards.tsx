import { EstadoBadge } from "@/components/control/estado-badge"
import type { Proceso, Resumen } from "@/lib/api"
import { fmtDuracion, fmtFecha, fmtNumero, nombrePeriodo } from "@/lib/formato"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

function EstadoProceso({ proceso }: { proceso: Proceso | null }) {
  if (!proceso) return <EstadoBadge estado="PENDIENTE" />
  return (
    <EstadoBadge
      estado={proceso.Estado === "EN_PROCESO" ? "EN_PROCESO" : proceso.Estado === "OK" ? "OK" : "ERROR"}
    />
  )
}

export function SectionCards({ resumen }: { resumen: Resumen | null }) {
  const asig = resumen?.asignacion ?? null
  const mora = resumen?.mora ?? null

  return (
    <div id="tour-cards" className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4 dark:*:data-[slot=card]:bg-card">
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Asignación {resumen ? nombrePeriodo(resumen.periodo) : ""}</CardDescription>
          <CardTitle className="text-2xl font-semibold @[250px]/card:text-3xl">
            {asig?.Estado === "OK" ? "Generada" : asig?.Estado === "EN_PROCESO" ? "En proceso" : asig ? "Con error" : "Pendiente"}
          </CardTitle>
          <CardAction>
            <EstadoProceso proceso={asig} />
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 font-medium">{asig ? `Por ${asig.Usuario}` : "Aún no se genera este mes"}</div>
          <div className="text-muted-foreground">{asig ? fmtFecha(asig.Fin ?? asig.Inicio) : "—"}</div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Filas de la asignación</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {asig?.Estado === "OK" ? fmtNumero(asig.Filas) : "—"}
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 font-medium">Equipos a retirar</div>
          <div className="text-muted-foreground">Según lo reportado por el SP</div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Mora del periodo</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {mora?.Estado === "OK" ? fmtNumero(mora.Filas) : mora?.Estado === "EN_PROCESO" ? "En proceso" : "—"}
          </CardTitle>
          <CardAction>
            <EstadoProceso proceso={mora} />
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 font-medium">{mora?.Estado === "OK" ? "Filas en la tabla de mora" : "Sin generar este mes"}</div>
          <div className="text-muted-foreground">{mora ? fmtFecha(mora.Fin ?? mora.Inicio) : "—"}</div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Duración promedio de mora</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {fmtDuracion(resumen?.mora_duracion_promedio_ms)}
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 font-medium">Últimas 5 ejecuciones OK</div>
          <div className="text-muted-foreground">Se usa para estimar el fin</div>
        </CardFooter>
      </Card>
    </div>
  )
}
