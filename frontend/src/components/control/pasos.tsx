import * as React from "react"
import { DatabaseZapIcon, PlayIcon, RefreshCwIcon, RotateCcwIcon } from "lucide-react"
import { toast } from "sonner"

import { ConfirmarAccion } from "@/components/control/confirmar-accion"
import type { EstadoPaso } from "@/components/control/estado-badge"
import { Datos, Paso } from "@/components/control/paso"
import { ProcesoProgreso } from "@/components/control/proceso-progreso"
import { ProgramacionInfo, ProgramarDialog } from "@/components/control/programacion"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { pedirPermisoNotificaciones } from "@/hooks/use-control"
import { ApiError, api, type EstadoControl, type EstadoInsumo, type Proceso } from "@/lib/api"
import { fmtDuracion, fmtFecha, fmtHora, fmtNumero, variacionPct } from "@/lib/formato"
import { cn } from "cn"

type Comunes = { control: EstadoControl; desfaseMs: number; onCambio: () => void }

const errorMsg = (err: unknown) => (err instanceof Error ? err.message : "Error desconocido")

/** Lanza un proceso en segundo plano y avisa; el polling se encarga del resto. */
async function lanzar(nombre: string, fn: () => Promise<unknown>, onCambio: () => void) {
  pedirPermisoNotificaciones()
  try {
    await fn()
    toast.info(`${nombre} iniciado`, { description: "Te avisaremos cuando termine." })
  } catch (err) {
    const motivos = err instanceof ApiError ? err.motivos : []
    toast.error(`No se pudo iniciar ${nombre.toLowerCase()}`, {
      description: motivos.length ? motivos.join(" · ") : errorMsg(err),
    })
  } finally {
    onCambio()
  }
}

/** Resumen del último proceso terminado (OK o error). */
function UltimoProceso({ proceso, etiqueta }: { proceso: Proceso; etiqueta: string }) {
  if (proceso.Estado === "ERROR") {
    return (
      <p className="text-red-700 dark:text-red-400">
        {etiqueta} falló el {fmtFecha(proceso.Inicio)}: {proceso.Error}
      </p>
    )
  }
  return (
    <p className="text-muted-foreground">
      {etiqueta}: OK el {fmtFecha(proceso.Fin ?? proceso.Inicio)} por {proceso.Usuario}
      {proceso.Origen === "PROGRAMADO" && " (programado)"} · {fmtDuracion(proceso.DuracionMs)}
      {proceso.Filas != null && ` · ${fmtNumero(proceso.Filas)} filas`}
    </p>
  )
}

// ---------- Insumos (Bajas / Cambio de tecnología) ----------

export function estadoInsumo(ins: EstadoInsumo, control: EstadoControl): EstadoPaso {
  if (control.en_curso?.Tipo === ins.tipo_proceso) return "EN_PROCESO"
  return ins.validacion?.Estado ?? "PENDIENTE"
}

export function PasoInsumo({ numero, insumo, control, desfaseMs, onCambio }: Comunes & { numero: number; insumo: EstadoInsumo }) {
  const [validando, setValidando] = React.useState(false)
  const v = insumo.validacion
  const estado = estadoInsumo(insumo, control)
  const corriendo = control.en_curso?.Tipo === insumo.tipo_proceso ? control.en_curso : null
  const ocupado = !!control.en_curso
  const valido = v?.Estado === "OK" || v?.Estado === "ADVERTENCIA"
  const variacion = variacionPct(v?.Filas ?? null, v?.FilasPeriodoAnterior ?? null)

  async function revalidar() {
    setValidando(true)
    try {
      await api.validar(insumo.clave)
    } catch (err) {
      toast.error(`No se pudo validar ${insumo.nombre}`, { description: errorMsg(err) })
    } finally {
      setValidando(false)
      onCambio()
    }
  }

  return (
    <Paso
      id={`tour-insumo-${insumo.clave}`}
      numero={numero}
      titulo={insumo.nombre}
      estado={estado}
      etiquetaEstado={estado === "ERROR" ? "Periodo incorrecto" : estado === "PENDIENTE" ? "Sin validar" : undefined}
      acciones={
        <>
          <Button variant="outline" size="sm" onClick={revalidar} disabled={validando || !!corriendo}>
            <RefreshCwIcon className={cn(validando && "animate-spin")} />
            {v ? "Revalidar" : "Validar"}
          </Button>
          <ConfirmarAccion
            size="sm"
            variant={valido ? "outline" : "default"}
            disabled={ocupado}
            titulo={`¿Extraer ${insumo.nombre} del servidor?`}
            descripcion={`Se ejecutará el SP de extracción para traer el periodo ${control.periodo_insumos}. Al terminar se validará automáticamente.`}
            textoConfirmar="Extraer"
            onConfirmar={() => lanzar(`Extracción de ${insumo.nombre}`, () => api.extraer(insumo.clave), onCambio)}
          >
            <DatabaseZapIcon />
            Extraer del servidor
          </ConfirmarAccion>
          <ProgramarDialog tipo={insumo.tipo_proceso} actual={insumo.programacion} onGuardado={onCambio} />
        </>
      }
    >
      {corriendo ? (
        <ProcesoProgreso proceso={corriendo} desfaseMs={desfaseMs} />
      ) : v ? (
        <>
          <Datos
            items={[
              ["Periodo encontrado", v.PeriodoEncontrado ?? "—"],
              ["Filas", fmtNumero(v.Filas)],
              [
                `Vs. periodo anterior`,
                variacion == null ? "—" : (
                  <span className={cn(v.Estado === "ADVERTENCIA" && "text-amber-700 dark:text-amber-400")}>
                    {variacion > 0 ? "▲" : "▼"} {Math.abs(variacion).toFixed(0)}%
                  </span>
                ),
              ],
              ["Validado", `${fmtHora(v.Fecha)} · ${v.Usuario}`],
            ]}
          />
          {v.Estado !== "OK" && (
            <p className={v.Estado === "ERROR" ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}>
              {v.Detalle}
              {v.Estado === "ERROR" && " — usa “Extraer del servidor” para traer el periodo."}
            </p>
          )}
        </>
      ) : (
        <p className="text-muted-foreground">Aún no se ha validado en este periodo.</p>
      )}
      {!corriendo && insumo.extraccion && <UltimoProceso proceso={insumo.extraccion} etiqueta="Última extracción" />}
      {insumo.programacion && <ProgramacionInfo prog={insumo.programacion} onCambio={onCambio} />}
    </Paso>
  )
}

// ---------- Mora ----------

export function estadoMora(control: EstadoControl): EstadoPaso {
  if (control.en_curso?.Tipo === "MORA") return "EN_PROCESO"
  const p = control.mora.proceso
  return p?.Estado === "OK" ? "OK" : p?.Estado === "ERROR" ? "ERROR" : "PENDIENTE"
}

export function PasoMora({ numero, control, desfaseMs, onCambio }: Comunes & { numero: number }) {
  const { proceso, duracion_promedio_ms, programacion } = control.mora
  const corriendo = control.en_curso?.Tipo === "MORA" ? control.en_curso : null

  return (
    <Paso
      id="tour-mora"
      numero={numero}
      titulo="Mora"
      estado={estadoMora(control)}
      etiquetaEstado={estadoMora(control) === "PENDIENTE" ? "No generada" : undefined}
      acciones={
        <>
          <ConfirmarAccion
            size="sm"
            variant={proceso?.Estado === "OK" ? "outline" : "default"}
            disabled={!!control.en_curso}
            titulo="¿Ejecutar mora ahora?"
            descripcion={
              <>
                El SP trunca la tabla de mora y la vuelve a cargar. Suele tardar{" "}
                <b>{duracion_promedio_ms ? fmtDuracion(duracion_promedio_ms) : "unos 40 min"}</b>. Mientras corre no se
                puede ejecutar ningún otro proceso.
              </>
            }
            textoConfirmar="Ejecutar"
            onConfirmar={() => lanzar("Mora", api.mora, onCambio)}
          >
            {proceso ? <RotateCcwIcon /> : <PlayIcon />}
            {proceso ? "Volver a ejecutar" : "Ejecutar mora"}
          </ConfirmarAccion>
          <ProgramarDialog tipo="MORA" actual={programacion} onGuardado={onCambio} />
        </>
      }
    >
      {corriendo ? (
        <ProcesoProgreso proceso={corriendo} desfaseMs={desfaseMs} />
      ) : proceso?.Estado === "OK" ? (
        <Datos
          items={[
            ["Filas en tabla", fmtNumero(proceso.Filas)],
            ["Duración", fmtDuracion(proceso.DuracionMs)],
            ["Terminó", fmtFecha(proceso.Fin ?? proceso.Inicio)],
            ["Por", proceso.Usuario + (proceso.Origen === "PROGRAMADO" ? " (prog.)" : "")],
          ]}
        />
      ) : proceso?.Estado === "ERROR" ? (
        <UltimoProceso proceso={proceso} etiqueta="Mora" />
      ) : (
        <p className="text-muted-foreground">
          No se ha generado en este periodo. Duración típica: {fmtDuracion(duracion_promedio_ms) || "~40 min"}.
        </p>
      )}
      {programacion && <ProgramacionInfo prog={programacion} onCambio={onCambio} />}
    </Paso>
  )
}

// ---------- Asignación ----------

export function estadoAsignacion(control: EstadoControl): EstadoPaso {
  if (control.en_curso?.Tipo === "ASIGNACION") return "EN_PROCESO"
  const p = control.asignacion.proceso
  return p?.Estado === "OK" ? "OK" : p?.Estado === "ERROR" ? "ERROR" : "PENDIENTE"
}

export function PasoAsignacion({ numero, control, desfaseMs, onCambio }: Comunes & { numero: number }) {
  const { proceso } = control.asignacion
  const corriendo = control.en_curso?.Tipo === "ASIGNACION" ? control.en_curso : null
  const generada = proceso?.Estado === "OK"
  const bloqueos = control.bloqueos.filter((b) => b !== "Hay un proceso en curso")

  return (
    <Paso
      id="tour-asignacion"
      numero={numero}
      titulo="Asignación"
      estado={estadoAsignacion(control)}
      etiquetaEstado={estadoAsignacion(control) === "OK" ? "Generada" : undefined}
      ultimo
      acciones={
        <ConfirmarAccion
          id="tour-ejecutar"
          size="sm"
          variant={generada ? "outline" : "default"}
          disabled={!control.puede_generar}
          destructiva={generada}
          titulo={generada ? "¿Regenerar la asignación?" : "¿Generar la asignación?"}
          descripcion={
            generada
              ? `Ya existe una asignación generada para este periodo (${fmtFecha(proceso!.Fin ?? proceso!.Inicio)}). Regenerarla reemplazará la base que se envía a las empresas.`
              : "Se ejecutará el SP de asignación con los insumos validados. Los insumos se revalidan antes de iniciar."
          }
          textoConfirmar={generada ? "Regenerar" : "Generar"}
          onConfirmar={() => lanzar("Asignación", () => api.asignacion(generada), onCambio)}
        >
          {generada ? <RotateCcwIcon /> : <PlayIcon />}
          {generada ? "Regenerar" : "Generar asignación"}
        </ConfirmarAccion>
      }
    >
      {corriendo ? (
        <ProcesoProgreso proceso={corriendo} desfaseMs={desfaseMs} />
      ) : generada ? (
        <Datos
          items={[
            ["Filas", fmtNumero(proceso.Filas)],
            ["Duración", fmtDuracion(proceso.DuracionMs)],
            ["Generada", fmtFecha(proceso.Fin ?? proceso.Inicio)],
            ["Por", proceso.Usuario],
          ]}
        />
      ) : proceso?.Estado === "ERROR" ? (
        <UltimoProceso proceso={proceso} etiqueta="La asignación" />
      ) : null}
      {!corriendo && bloqueos.length > 0 && (
        <Alert>
          <AlertTitle>Se habilita cuando todos los insumos estén listos</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {bloqueos.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </Paso>
  )
}
