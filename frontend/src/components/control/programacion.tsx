import * as React from "react"
import {
  CalendarClockIcon,
  CircleCheckIcon,
  CircleXIcon,
  InfoIcon,
  Loader2Icon,
  PauseIcon,
  PlayIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react"
import { toast } from "sonner"

import { ConfirmarAccion } from "@/components/control/confirmar-accion"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api, type Programacion, type ProgramacionIn, type TipoProgramable } from "@/lib/api"
import { NOMBRE_PROGRAMABLE, fmtFecha } from "@/lib/formato"
import { cn } from "cn"

type Nivel = NonNullable<Programacion["UltimoNivel"]>

const COLOR_NIVEL: Record<Nivel, string> = {
  info: "text-blue-700 dark:text-blue-400",
  ok: "text-green-700 dark:text-green-400",
  warn: "text-amber-700 dark:text-amber-400",
  error: "text-red-700 dark:text-red-400",
}

const ICONO_NIVEL: Record<Nivel, React.ReactNode> = {
  info: <InfoIcon className="size-3.5" />,
  ok: <CircleCheckIcon className="size-3.5" />,
  warn: <TriangleAlertIcon className="size-3.5" />,
  error: <CircleXIcon className="size-3.5" />,
}

const errorMsg = (err: unknown) => (err instanceof Error ? err.message : "Error desconocido")

/** "2026-10-01T06:00:00" → valor para <input type="datetime-local"> */
function aInputLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Mínimo para "una vez": 1 minuto después del minuto en curso del servidor (igual que valida el backend). */
const MINIMO_FUTURO_MS = 60_000

/** Hora del servidor como Date "de pared": desfaseMs (de use-control) incluye la diferencia de zona horaria. */
const horaServidor = (desfaseMs: number) => new Date(Date.now() + desfaseMs)

function minimoServidor(desfaseMs: number) {
  const d = horaServidor(desfaseMs)
  d.setSeconds(0, 0)
  return new Date(d.getTime() + MINIMO_FUTURO_MS)
}

export function ProgramarDialog({
  tipo,
  actual,
  disabled,
  desfaseMs,
  zonaHoraria,
  onGuardado,
}: {
  tipo: TipoProgramable
  actual: Programacion | null
  disabled?: boolean
  /** Diferencia con el reloj del servidor: las fechas se escriben y validan en hora del servidor */
  desfaseMs: number
  zonaHoraria: string
  onGuardado: () => void
}) {
  const [abierto, setAbierto] = React.useState(false)
  const [modo, setModo] = React.useState<"UNICA" | "MENSUAL">(actual?.Modo ?? "UNICA")
  const [fechaHora, setFechaHora] = React.useState("")
  const [dia, setDia] = React.useState(String(actual?.DiaMes ?? 1))
  const [hora, setHora] = React.useState(actual?.Hora ?? "06:00")
  const [guardando, setGuardando] = React.useState(false)
  const [errorFecha, setErrorFecha] = React.useState<string | null>(null)
  const [minimo, setMinimo] = React.useState(() => minimoServidor(desfaseMs))

  function abrir(open: boolean) {
    if (open) {
      setModo(actual?.Modo ?? "UNICA")
      const base = actual?.FechaHora ? new Date(actual.FechaHora) : new Date(horaServidor(desfaseMs).getTime() + 60 * 60 * 1000)
      setFechaHora(aInputLocal(base))
      setMinimo(minimoServidor(desfaseMs))
      setErrorFecha(null)
      setDia(String(actual?.DiaMes ?? 1))
      setHora(actual?.Hora ?? "06:00")
    }
    setAbierto(open)
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (modo === "UNICA") {
      const min = minimoServidor(desfaseMs)
      setMinimo(min)
      if (new Date(fechaHora) < min) {
        setErrorFecha(`Debe ser al menos 1 minuto en el futuro: desde ${aInputLocal(min).replace("T", " ")} (hora del servidor).`)
        return
      }
    }
    setErrorFecha(null)
    const data: ProgramacionIn =
      modo === "UNICA" ? { modo, fecha_hora: fechaHora } : { modo, dia_mes: Number(dia), hora }
    setGuardando(true)
    try {
      const p = await api.programar(tipo, data)
      toast.success("Programación guardada", {
        description: p.ProximaEjecucion ? `Próxima ejecución: ${fmtFecha(p.ProximaEjecucion)}` : undefined,
      })
      setAbierto(false)
      onGuardado()
    } catch (err) {
      toast.error("No se pudo programar", { description: errorMsg(err) })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={abrir}>
      <DialogTrigger render={<Button variant="outline" size="sm" disabled={disabled} />}>
        <CalendarClockIcon />
        {actual ? "Editar programación" : "Programar"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={guardar} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Programar {NOMBRE_PROGRAMABLE[tipo]}</DialogTitle>
            <DialogDescription>
              El servidor lo ejecutará automáticamente a la hora indicada, aunque nadie tenga la app abierta.
              {tipo === "INSUMOS" && " Extrae a la vez los insumos que falten (omite los listos) y, si quedan válidos, genera la asignación."}
            </DialogDescription>
          </DialogHeader>
          <Tabs value={modo} onValueChange={(v) => setModo(v as "UNICA" | "MENSUAL")}>
            <TabsList className="w-full">
              <TabsTrigger value="UNICA">Una vez</TabsTrigger>
              <TabsTrigger value="MENSUAL">Cada mes</TabsTrigger>
            </TabsList>
            <TabsContent value="UNICA" className="flex flex-col gap-2 pt-3">
              <Label htmlFor="prog-fecha">Fecha y hora</Label>
              <Input
                id="prog-fecha"
                type="datetime-local"
                value={fechaHora}
                min={aInputLocal(minimo)}
                onChange={(e) => {
                  setFechaHora(e.target.value)
                  setErrorFecha(null)
                }}
                required={modo === "UNICA"}
                aria-invalid={!!errorFecha}
                aria-describedby="prog-fecha-ayuda"
              />
              {errorFecha ? (
                <p id="prog-fecha-ayuda" className="text-xs text-destructive">{errorFecha}</p>
              ) : (
                <p id="prog-fecha-ayuda" className="text-xs text-muted-foreground">
                  Hora del servidor ({zonaHoraria}): {aInputLocal(horaServidor(desfaseMs)).slice(11)} · mínimo 1 minuto
                  después.
                </p>
              )}
            </TabsContent>
            <TabsContent value="MENSUAL" className="grid grid-cols-2 gap-3 pt-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="prog-dia">Día del mes</Label>
                <Input
                  id="prog-dia"
                  type="number"
                  min={1}
                  max={31}
                  value={dia}
                  onChange={(e) => setDia(e.target.value)}
                  required={modo === "MENSUAL"}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="prog-hora">Hora</Label>
                <Input
                  id="prog-hora"
                  type="time"
                  value={hora}
                  onChange={(e) => setHora(e.target.value)}
                  required={modo === "MENSUAL"}
                />
              </div>
              <p className="col-span-2 text-xs text-muted-foreground">
                Si el mes no tiene ese día (ej. 31 en febrero), se ejecuta el último día del mes.
              </p>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button type="submit" disabled={guardando}>
              {guardando && <Loader2Icon className="animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Línea con la próxima ejecución programada y acciones para pausar/reanudar/eliminar. */
export function ProgramacionInfo({ prog, onCambio }: { prog: Programacion; onCambio: () => void }) {
  const descripcion =
    prog.Modo === "MENSUAL" ? `día ${prog.DiaMes} de cada mes a las ${prog.Hora}` : "una vez"

  async function cambiarActiva() {
    try {
      await api.activarProgramacion(prog.Tipo, !prog.Activa)
      onCambio()
    } catch (err) {
      toast.error("No se pudo actualizar la programación", { description: errorMsg(err) })
    }
  }

  async function eliminar() {
    try {
      await api.eliminarProgramacion(prog.Tipo)
      toast.success("Programación eliminada")
      onCambio()
    } catch (err) {
      toast.error("No se pudo eliminar", { description: errorMsg(err) })
    }
  }

  // Una programación "una vez" que ya se disparó queda inactiva: no está pausada, ya se procesó
  const procesada = !prog.Activa && prog.Modo === "UNICA" && !!prog.UltimaEjecucion

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-2">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <CalendarClockIcon className="size-4 text-muted-foreground" />
          {prog.Activa && prog.ProximaEjecucion ? (
            <span>
              Próxima ejecución: <b>{fmtFecha(prog.ProximaEjecucion)}</b>{" "}
              <span className="text-muted-foreground">({descripcion})</span>
            </span>
          ) : (
            <span className="text-muted-foreground">
              {procesada
                ? `Programación de una vez (${fmtFecha(prog.FechaHora!)}) ya procesada`
                : `Programación ${prog.Activa ? "sin próxima fecha" : "pausada"} (${descripcion})`}
            </span>
          )}
        </div>
        {prog.UltimoResultado && (
          <div className={cn("flex items-center gap-2 text-xs", COLOR_NIVEL[prog.UltimoNivel ?? "info"])}>
            {ICONO_NIVEL[prog.UltimoNivel ?? "info"]}
            <span>Último disparo: {prog.UltimoResultado}</span>
          </div>
        )}
      </div>
      <div className="flex gap-1">
        {(prog.Modo === "MENSUAL" || prog.Activa) && (
          <Button variant="ghost" size="sm" onClick={cambiarActiva}>
            {prog.Activa ? <PauseIcon /> : <PlayIcon />}
            {prog.Activa ? "Pausar" : "Reanudar"}
          </Button>
        )}
        <ConfirmarAccion
          variant="ghost"
          size="sm"
          titulo="¿Eliminar la programación?"
          descripcion={`${NOMBRE_PROGRAMABLE[prog.Tipo]} ya no se ejecutará automáticamente.`}
          textoConfirmar="Eliminar"
          destructiva
          onConfirmar={eliminar}
        >
          <Trash2Icon />
          <span className="sr-only">Eliminar</span>
        </ConfirmarAccion>
      </div>
    </div>
  )
}
