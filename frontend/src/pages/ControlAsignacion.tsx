import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { Bitacora } from "@/components/control/bitacora"
import { EstadoBadge, type EstadoPaso } from "@/components/control/estado-badge"
import { PasoCompletar } from "@/components/control/paso-completar"
import { PasoSinAsignar } from "@/components/control/paso-sin-asignar"
import {
  PasoAsignacion,
  PasoInsumo,
  PasoMora,
  estadoAsignacion,
  estadoInsumo,
  estadoMora,
} from "@/components/control/pasos"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { useControl } from "@/hooks/use-control"
import { api, type EstadoControl } from "@/lib/api"
import { NOMBRE_PROCESO, nombrePeriodo } from "@/lib/formato"

function estadoGeneral(c: EstadoControl): { estado: EstadoPaso; texto: string } {
  if (c.en_curso) return { estado: "EN_PROCESO", texto: `${NOMBRE_PROCESO[c.en_curso.Tipo]} en curso` }
  if (c.cierre) return { estado: "OK", texto: "Asignación completada" }
  if (c.asignacion.proceso?.Estado === "OK") {
    return c.sin_asignar
      ? { estado: "ADVERTENCIA", texto: `Pendiente: ${c.sin_asignar} equipo(s) sin agencia` }
      : { estado: "OK", texto: "Lista para completar" }
  }
  if (c.puede_generar) return { estado: "OK", texto: "Pendiente de aprobación para generar" }
  return { estado: "ADVERTENCIA", texto: `Bloqueado: ${c.bloqueos[0]}` }
}

export function ControlAsignacion() {
  const { estado: c, error, desfaseMs, recargar } = useControl()
  const autoValidado = React.useRef(false)

  // Al entrar, validar los insumos que aún no se validaron en este periodo
  React.useEffect(() => {
    if (!c || autoValidado.current || c.en_curso) return
    autoValidado.current = true
    const pendientes = c.insumos.filter((i) => !i.validacion)
    if (pendientes.length) {
      Promise.allSettled(pendientes.map((i) => api.validar(i.clave))).then(recargar)
    }
  }, [c, recargar])

  if (!c) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        {error ? (
          <Alert variant="destructive" className="max-w-md">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : (
          <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
        )}
      </div>
    )
  }

  const listo = (e: EstadoPaso) => e === "OK" || e === "ADVERTENCIA"
  const pasos = [
    ...c.insumos.map((i) => listo(estadoInsumo(i, c))),
    listo(estadoMora(c)),
    listo(estadoAsignacion(c)),
    c.sin_asignar === 0, // paso 5: sin equipos pendientes de agencia
    !!c.cierre,
  ]
  const completos = pasos.filter(Boolean).length
  const general = estadoGeneral(c)
  const comunes = { control: c, desfaseMs, onCambio: recargar }

  return (
    <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
      <Card id="tour-periodo">
        <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold">Asignación {nombrePeriodo(c.periodo)}</h2>
            <p className="text-sm text-muted-foreground">
              Insumos esperados del periodo <b className="text-foreground">{c.periodo_insumos}</b> (
              {nombrePeriodo(c.periodo_insumos)})
            </p>
          </div>
          <div className="flex min-w-64 flex-col gap-2 md:items-end">
            <EstadoBadge estado={general.estado} label={general.texto} />
            <div className="flex w-full items-center gap-3 md:w-64">
              <Progress value={(completos / pasos.length) * 100} className="flex-1" aria-label="Pasos completos" />
              <span className="text-sm whitespace-nowrap text-muted-foreground tabular-nums">
                {completos} de {pasos.length}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>No se pudo actualizar: {error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <ol id="tour-pasos" className="xl:col-span-2">
          {c.insumos.map((ins, i) => (
            <PasoInsumo key={ins.clave} numero={i + 1} insumo={ins} {...comunes} />
          ))}
          <PasoMora numero={c.insumos.length + 1} {...comunes} />
          <PasoAsignacion numero={c.insumos.length + 2} {...comunes} />
          <PasoSinAsignar numero={c.insumos.length + 3} control={c} onCambio={recargar} />
          <PasoCompletar numero={c.insumos.length + 4} control={c} onCambio={recargar} />
        </ol>
        <Bitacora eventos={c.bitacora} />
      </div>
    </div>
  )
}
