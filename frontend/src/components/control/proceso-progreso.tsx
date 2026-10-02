import { useAhora } from "@/hooks/use-control"
import type { ProcesoEnCurso } from "@/lib/api"
import { fmtDuracion, fmtHora } from "@/lib/formato"
import { Progress } from "@/components/ui/progress"

/** Avance estimado de un proceso en curso según el promedio de sus últimas corridas. */
export function ProcesoProgreso({ proceso, desfaseMs }: { proceso: ProcesoEnCurso; desfaseMs: number }) {
  const ahora = useAhora(true) + desfaseMs
  const inicio = new Date(proceso.Inicio).getTime()
  const transcurrido = Math.max(0, ahora - inicio)
  const promedio = proceso.DuracionPromedioMs
  const pct = promedio ? Math.min(95, (transcurrido / promedio) * 100) : null
  const excedido = promedio != null && transcurrido > promedio
  const sql = proceso.DetalleSql

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
      <div className="flex flex-wrap justify-between gap-2">
        <span>
          Iniciado {fmtHora(proceso.Inicio)} por <b>{proceso.Usuario}</b>
          {proceso.Origen === "PROGRAMADO" && " (programado)"}
        </span>
        <span className="font-medium tabular-nums">{fmtDuracion(transcurrido)} transcurridos</span>
      </div>
      {pct != null ? (
        <>
          <Progress value={pct} aria-label="Avance estimado" />
          <span className="text-xs text-muted-foreground">
            {excedido
              ? `Está tardando más que el promedio (${fmtDuracion(promedio)})`
              : `Fin estimado ~${fmtHora(new Date(inicio + promedio!).toISOString())} · promedio ${fmtDuracion(promedio)}`}
          </span>
        </>
      ) : (
        <span className="text-xs text-muted-foreground">Sin historial para estimar la duración</span>
      )}
      {sql && (
        <span className="text-xs text-muted-foreground">
          SQL: {sql.Estado}
          {sql.Espera && ` · espera ${sql.Espera}`}
          {sql.BloqueadoPor ? ` · bloqueado por sesión ${sql.BloqueadoPor}` : ""}
        </span>
      )}
    </div>
  )
}
