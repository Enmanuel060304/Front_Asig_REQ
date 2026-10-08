import * as React from "react"
import { ChevronDownIcon, DatabaseZapIcon, PlayIcon, RefreshCwIcon, RotateCcwIcon } from "lucide-react"
import { toast } from "sonner"

import { ConfirmarAccion } from "@/components/control/confirmar-accion"
import { EstadoBadge, type EstadoPaso } from "@/components/control/estado-badge"
import { Datos, Paso } from "@/components/control/paso"
import { ProcesoProgreso } from "@/components/control/proceso-progreso"
import { ProgramacionInfo, ProgramarDialog } from "@/components/control/programacion"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { pedirPermisoNotificaciones } from "@/hooks/use-control"
import {
  ApiError,
  api,
  type EstadoControl,
  type EstadoInsumo,
  type InsumoClave,
  type Proceso,
  type TipoProgramable,
} from "@/lib/api"
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

// ---------- Paso 1: extracción de insumos (Bajas, Cambio de tecnología y Mora, a la vez) ----------

type Clave = "BAJAS" | "CAMBIO_TEC" | "MORA"

/** Orden de presentación: se extraen a la vez, no dependen entre sí. */
const ORDEN: Clave[] = ["BAJAS", "CAMBIO_TEC", "MORA"]
const NOMBRE: Record<Clave, string> = { BAJAS: "Bajas", CAMBIO_TEC: "Cambio de tecnología", MORA: "Mora" }

const listo = (e: EstadoPaso) => e === "OK" || e === "ADVERTENCIA"

const enCurso = (control: EstadoControl, tipo: string) => control.en_curso.find((p) => p.Tipo === tipo) ?? null

export function estadoInsumo(ins: EstadoInsumo, control: EstadoControl): EstadoPaso {
  if (enCurso(control, ins.tipo_proceso)) return "EN_PROCESO"
  return ins.validacion?.Estado ?? "PENDIENTE"
}

export function estadoMora(control: EstadoControl): EstadoPaso {
  if (enCurso(control, "MORA")) return "EN_PROCESO"
  const p = control.mora.proceso
  return p?.Estado === "OK" ? "OK" : p?.Estado === "ERROR" ? "ERROR" : "PENDIENTE"
}

function estadoClave(control: EstadoControl, clave: Clave): EstadoPaso {
  return clave === "MORA" ? estadoMora(control) : estadoInsumo(control.insumos.find((i) => i.clave === clave)!, control)
}

/** Estado agregado del paso 1: en curso > error > listos > pendiente. La Advertencia cuenta como lista (no bloquea). */
export function estadoInsumos(control: EstadoControl): { estado: EstadoPaso; texto: string } {
  const estados = ORDEN.map((k) => estadoClave(control, k))
  const corriendo = ORDEN.filter((_, i) => estados[i] === "EN_PROCESO")
  if (corriendo.length) return { estado: "EN_PROCESO", texto: `Extrayendo ${corriendo.map((k) => NOMBRE[k]).join(", ")}` }
  if (control.secuencia?.fase === "EXTRACCION") return { estado: "EN_PROCESO", texto: "Extracción en curso" }
  const fallos = ORDEN.filter((_, i) => estados[i] === "ERROR")
  if (fallos.length) return { estado: "ERROR", texto: `Error en ${fallos.map((k) => NOMBRE[k]).join(" y ")}` }
  if (estados.every(listo)) {
    const avisos = estados.filter((e) => e === "ADVERTENCIA").length
    return { estado: "OK", texto: avisos ? `Insumos listos · ${avisos} advertencia${avisos > 1 ? "s" : ""}` : "Insumos listos" }
  }
  return { estado: "PENDIENTE", texto: `${estados.filter(listo).length} de ${ORDEN.length} listos` }
}

export const insumosListos = (control: EstadoControl) => ORDEN.every((k) => listo(estadoClave(control, k)))

/** "▲ 44%" a partir de una variación en %. */
const fmtVariacion = (v: number) => `${v > 0 ? "▲" : "▼"} ${Math.abs(v).toFixed(0)}%`

function FilaInsumo({
  clave,
  orden,
  control,
  desfaseMs,
  onCambio,
}: Comunes & { clave: Clave; orden: number }) {
  const insumo = control.insumos.find((i) => i.clave === clave)
  const esMora = clave === "MORA"
  const tipo: TipoProgramable = insumo?.tipo_proceso ?? "MORA"
  const programacion = insumo?.programacion ?? control.mora.programacion
  const v = insumo?.validacion ?? null
  const mora = control.mora.proceso
  const ultimo = esMora ? mora : (insumo?.extraccion ?? null)
  const estado = estadoClave(control, clave)
  const corriendo = enCurso(control, tipo)
  const ocupado = control.en_curso.length > 0 || !!control.secuencia
  const variacion = variacionPct(v?.Filas ?? null, v?.FilasPeriodoAnterior ?? null)
  const vacio = !esMora && v?.Estado === "OK" && v.Filas === 0 // Cambio de tecnología sin datos en el periodo

  const [abierto, setAbierto] = React.useState<boolean | null>(null)
  const [validando, setValidando] = React.useState(false)
  const desplegada = abierto ?? (estado === "ERROR" || estado === "EN_PROCESO")

  // La Advertencia no bloquea: se muestra OK y, al lado, el aviso con la variación (para no confundir)
  const estadoBadge: EstadoPaso = estado === "ADVERTENCIA" ? "OK" : estado
  let etiqueta: string | undefined
  if (estado === "PENDIENTE") etiqueta = esMora ? "No generada" : "Sin validar"
  else if (estado === "ERROR" && !esMora) etiqueta = ultimo?.Estado === "ERROR" ? "Extracción fallida" : "Periodo incorrecto"
  else if (vacio) etiqueta = "OK · sin datos"

  // Resumen visible aunque la fila esté plegada
  const resumen =
    estado === "EN_PROCESO"
      ? ""
      : esMora
        ? mora?.Estado === "OK"
          ? `${fmtNumero(mora.Filas)} filas · ${fmtDuracion(mora.DuracionMs)}`
          : ""
        : v
          ? `${v.PeriodoEncontrado ?? "—"} · ${fmtNumero(v.Filas)} filas${variacion == null ? "" : ` · ${fmtVariacion(variacion)}`}`
          : ""

  async function revalidar() {
    if (!insumo) return
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
    <div id={`tour-insumo-${clave}`} className="rounded-lg border">
      <button
        type="button"
        aria-expanded={desplegada}
        onClick={() => setAbierto(!desplegada)}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2 text-left outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronDownIcon className={cn("size-4 shrink-0 text-muted-foreground transition-transform", !desplegada && "-rotate-90")} />
        <span className="text-muted-foreground tabular-nums">{orden}.</span>
        <span className="font-medium">{NOMBRE[clave]}</span>
        <EstadoBadge estado={estadoBadge} label={etiqueta} />
        {estado === "ADVERTENCIA" && (
          <EstadoBadge estado="ADVERTENCIA" label={variacion == null ? "Advertencia" : `Advertencia ${fmtVariacion(variacion)}`} />
        )}
        {resumen && <span className="ml-auto truncate text-xs text-muted-foreground tabular-nums">{resumen}</span>}
      </button>
      {desplegada && (
        <div className="flex flex-col gap-3 border-t px-3 py-3 text-sm">
          {corriendo ? (
            <ProcesoProgreso proceso={corriendo} desfaseMs={desfaseMs} />
          ) : insumo && v ? (
            <>
              <Datos
                items={[
                  ["Periodo encontrado", v.PeriodoEncontrado ?? "—"],
                  ["Filas", fmtNumero(v.Filas)],
                  [
                    "Vs. periodo anterior",
                    variacion == null ? "—" : (
                      <span className={cn(v.Estado === "ADVERTENCIA" && "text-amber-700 dark:text-amber-400")}>
                        {fmtVariacion(variacion)}
                      </span>
                    ),
                  ],
                  ["Validado", `${fmtHora(v.Fecha)} · ${v.Usuario}`],
                ]}
              />
              {v.Estado === "ADVERTENCIA" && (
                <p className="text-amber-700 dark:text-amber-400">
                  {v.Detalle}. Es solo un aviso: el insumo está OK y no bloquea la asignación.
                </p>
              )}
              {vacio && (
                <p className="text-muted-foreground">
                  {v.Detalle}. Cambio de tecnología es opcional cuando el periodo no trae datos: no bloquea la asignación.
                </p>
              )}
              {v.Estado === "ERROR" && (
                <p className="text-red-700 dark:text-red-400">
                  {v.Detalle} — usa “Extraer” para traer el periodo.
                </p>
              )}
            </>
          ) : esMora && mora?.Estado === "OK" ? (
            <Datos
              items={[
                ["Filas en tabla", fmtNumero(mora.Filas)],
                ["Duración", fmtDuracion(mora.DuracionMs)],
                ["Terminó", fmtFecha(mora.Fin ?? mora.Inicio)],
                ["Por", mora.Usuario + (mora.Origen === "PROGRAMADO" ? " (prog.)" : "")],
              ]}
            />
          ) : esMora && !mora ? (
            <p className="text-muted-foreground">
              No se ha generado en este periodo. Duración típica: {fmtDuracion(control.mora.duracion_promedio_ms) || "~40 min"}.
            </p>
          ) : !esMora ? (
            <p className="text-muted-foreground">Aún no se ha validado en este periodo.</p>
          ) : null}
          {!corriendo && ultimo && (!esMora || ultimo.Estado === "ERROR") && (
            <UltimoProceso proceso={ultimo} etiqueta={esMora ? "Mora" : "Última extracción"} />
          )}
          {programacion && <ProgramacionInfo prog={programacion} onCambio={onCambio} />}
          <div className="flex flex-wrap items-center gap-2">
            <ConfirmarAccion
              size="sm"
              variant="outline"
              disabled={ocupado}
              titulo={esMora ? "¿Ejecutar mora ahora?" : `¿Extraer ${NOMBRE[clave]} del servidor?`}
              descripcion={
                esMora ? (
                  <>
                    El SP trunca la tabla de mora y la vuelve a cargar. Suele tardar{" "}
                    <b>{control.mora.duracion_promedio_ms ? fmtDuracion(control.mora.duracion_promedio_ms) : "unos 40 min"}</b>.
                    Mientras corre no se puede ejecutar ningún otro proceso. No genera la asignación: para eso usa
                    “Extraer y generar asignación” o el paso 2.
                  </>
                ) : (
                  `Se ejecutará solo el SP de extracción para traer el periodo ${control.periodo_insumos}. Al terminar se validará automáticamente. No genera la asignación: para eso usa “Extraer y generar asignación” o el paso 2.`
                )
              }
              textoConfirmar="Extraer"
              onConfirmar={() =>
                lanzar(
                  esMora ? "Mora" : `Extracción de ${NOMBRE[clave]}`,
                  () => (esMora ? api.mora() : api.extraer(clave as InsumoClave)),
                  onCambio
                )
              }
            >
              {listo(estado) ? <RotateCcwIcon /> : <DatabaseZapIcon />}
              {listo(estado) ? "Volver a extraer" : "Extraer"}
            </ConfirmarAccion>
            {insumo && (
              <Button variant="outline" size="sm" onClick={revalidar} disabled={validando || !!corriendo}>
                <RefreshCwIcon className={cn(validando && "animate-spin")} />
                {v ? "Revalidar" : "Validar"}
              </Button>
            )}
            <ProgramarDialog
              tipo={tipo}
              actual={programacion}
              desfaseMs={desfaseMs}
              zonaHoraria={control.zona_horaria}
              onGuardado={onCambio}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export function PasoInsumos({ numero, control, desfaseMs, onCambio }: Comunes & { numero: number }) {
  const { estado, texto } = estadoInsumos(control)
  const ocupado = control.en_curso.length > 0 || !!control.secuencia
  const generada = control.asignacion.proceso?.Estado === "OK"
  const prog = control.insumos_programacion

  return (
    <Paso
      id="tour-insumos"
      numero={numero}
      titulo="Extracción de insumos para generar asignación"
      estado={estado}
      etiquetaEstado={texto}
      acciones={
        <>
          <ConfirmarAccion
            id="tour-extraer-insumos"
            disabled={ocupado || !!control.cierre || (generada && insumosListos(control))}
            titulo="¿Extraer los insumos y generar la asignación?"
            descripcion={
              <>
                Se extraen <b>a la vez</b> Bajas, Cambio de tecnología y Mora (los que ya están listos se omiten). La
                mora suele tardar{" "}
                <b>{control.mora.duracion_promedio_ms ? fmtDuracion(control.mora.duracion_promedio_ms) : "unos 40 min"}</b>.
                Al terminar, si <b>Bajas y Mora quedan OK</b> y Cambio de tecnología OK (o sin datos en el periodo), la
                asignación <b>se genera automáticamente</b>. Si alguno falla, el flujo se detiene, no se genera y la
                bitácora indica el motivo.
              </>
            }
            textoConfirmar="Extraer y generar"
            onConfirmar={() => lanzar("Extracción y generación de la asignación", api.extraerInsumos, onCambio)}
          >
            <DatabaseZapIcon />
            Extraer y generar asignación
          </ConfirmarAccion>
          <ProgramarDialog
            tipo="INSUMOS"
            actual={prog}
            desfaseMs={desfaseMs}
            zonaHoraria={control.zona_horaria}
            onGuardado={onCambio}
          />
        </>
      }
    >
      {prog && <ProgramacionInfo prog={prog} onCambio={onCambio} />}
      <div className="flex flex-col gap-2">
        {ORDEN.map((clave, i) => (
          <FilaInsumo key={clave} clave={clave} orden={i + 1} control={control} desfaseMs={desfaseMs} onCambio={onCambio} />
        ))}
      </div>
    </Paso>
  )
}

// ---------- Asignación ----------

export function estadoAsignacion(control: EstadoControl): EstadoPaso {
  if (enCurso(control, "ASIGNACION")) return "EN_PROCESO"
  const p = control.asignacion.proceso
  return p?.Estado === "OK" ? "OK" : p?.Estado === "ERROR" ? "ERROR" : "PENDIENTE"
}

export function PasoAsignacion({ numero, control, desfaseMs, onCambio }: Comunes & { numero: number }) {
  const { proceso } = control.asignacion
  const corriendo = enCurso(control, "ASIGNACION")
  const generada = proceso?.Estado === "OK"
  const bloqueos = control.bloqueos.filter((b) => b !== "Hay un proceso en curso")

  return (
    <Paso
      id="tour-asignacion"
      numero={numero}
      titulo="Asignación"
      estado={estadoAsignacion(control)}
      etiquetaEstado={estadoAsignacion(control) === "OK" ? "Generada" : undefined}
      acciones={
        <ConfirmarAccion
          id="tour-ejecutar"
          variant={generada ? "outline" : "default"}
          disabled={!control.puede_generar || !!control.cierre}
          destructiva={generada}
          titulo={generada ? "¿Regenerar la asignación?" : "¿Generar la asignación?"}
          descripcion={
            generada
              ? `Ya existe una asignación generada para este periodo (${fmtFecha(proceso!.Fin ?? proceso!.Inicio)}). Regenerarla reemplazará la base que se envía a las empresas. Las agencias asignadas a mano en "Equipos sin asignar" se vuelven a aplicar a los equipos que sigan sin agencia.`
              : "Los insumos están listos. Se ejecutará el SP de asignación; los insumos se revalidan antes de iniciar."
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
      {control.cierre && (
        <p className="text-muted-foreground">La asignación está completada: reábrela en el paso 4 para regenerarla.</p>
      )}
      {!corriendo && control.listo_para_generar && (
        <Alert>
          <AlertTitle>Lista para generar</AlertTitle>
          <AlertDescription>
            Los insumos del periodo están listos pero la asignación no se generó (se extrajeron por separado o el
            flujo no llegó a generar). Genérala con el botón.
          </AlertDescription>
        </Alert>
      )}
      {!corriendo && bloqueos.length > 0 && (
        <Alert>
          <AlertTitle>Se habilita cuando Bajas y Mora estén OK (y Cambio de tecnología OK o sin datos)</AlertTitle>
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
