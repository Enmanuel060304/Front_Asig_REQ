import * as React from "react"
import { Loader2Icon, PencilIcon, SearchIcon } from "lucide-react"
import { toast } from "sonner"

import { ConfirmarAccion } from "@/components/control/confirmar-accion"
import type { EstadoPaso } from "@/components/control/estado-badge"
import { Paso } from "@/components/control/paso"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { api, type Agencia, type EquipoSinAgencia, type EstadoControl, type SinAsignar } from "@/lib/api"
import { fmtNumero } from "@/lib/formato"

// Se dibuja como máximo esta cantidad de filas; el resto se encuentra con el buscador
const FILAS_VISIBLES = 100

type Vista = "pendientes" | "manuales"

const SIN_EDITABLES: string[] = []

const errorMsg = (err: unknown) => (err instanceof Error ? err.message : "Error desconocido")

function estadoSinAsignar(control: EstadoControl): EstadoPaso {
  if (control.sin_asignar == null) return "PENDIENTE"
  return control.sin_asignar > 0 ? "ADVERTENCIA" : "OK"
}

function etiquetaSinAsignar(control: EstadoControl) {
  if (control.sin_asignar == null) return undefined
  return control.sin_asignar > 0 ? `${fmtNumero(control.sin_asignar)} sin agencia` : "Todos con agencia"
}

// Más largo que esto ya no cabe en max-w-48: se corta con "…" y se ve completo en el tooltip
const MAX_CARACTERES = 28

/** Texto de celda acotado: no ensancha la tabla; si es largo, el valor completo va en un tooltip. */
function TextoCelda({ valor }: { valor: unknown }) {
  const texto = valor == null || valor === "" ? "—" : String(valor)
  if (texto.length <= MAX_CARACTERES) return <span className="block max-w-48 truncate">{texto}</span>
  return (
    <Tooltip>
      <TooltipTrigger render={<span tabIndex={0} className="block max-w-48 truncate" />}>{texto}</TooltipTrigger>
      <TooltipContent className="break-words">{texto}</TooltipContent>
    </Tooltip>
  )
}

/** Buscador de agencias (combobox con filtro por nombre). */
function SelectorAgencia({
  agencias,
  valor,
  onCambio,
  disabled,
}: {
  agencias: Agencia[]
  valor: Agencia | null
  onCambio: (a: Agencia | null) => void
  disabled?: boolean
}) {
  return (
    <Combobox
      items={agencias}
      value={valor}
      onValueChange={onCambio}
      itemToStringLabel={(a: Agencia) => a.nombre}
      isItemEqualToValue={(a: Agencia, b: Agencia) => a.valor === b.valor}
      disabled={disabled}
    >
      <ComboboxInput placeholder="Elegir agencia…" className="w-44" disabled={disabled} />
      <ComboboxContent>
        <ComboboxEmpty>Sin coincidencias</ComboboxEmpty>
        <ComboboxList>
          {(a: Agencia) => (
            <ComboboxItem key={a.valor} value={a}>
              {a.nombre}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

/** Modal de un equipo: datos de contexto, corrección de las columnas editables y agencia, con un solo Guardar. */
function EditarEquipoDialog({
  equipo,
  columnas,
  editables,
  agenciaActual,
  agencias,
  bloqueado,
  onCerrar,
  onGuardar,
}: {
  equipo: EquipoSinAgencia | null
  columnas: string[]
  editables: string[]
  /** Solo en "Asignados a mano": nombre de la agencia que tiene hoy (el modal sirve para cambiarla) */
  agenciaActual: string | null
  agencias: Agencia[]
  bloqueado: boolean
  onCerrar: () => void
  onGuardar: (id: string, valores: Record<string, string> | null, agencia: Agencia | null) => Promise<boolean>
}) {
  const inicial = React.useMemo(
    () => Object.fromEntries(editables.map((c) => [c, String(equipo?.[c] ?? "")])),
    [equipo, editables]
  )
  const [valores, setValores] = React.useState(inicial)
  const [agencia, setAgencia] = React.useState<Agencia | null>(null)
  const [guardando, setGuardando] = React.useState(false)

  // Cada vez que se abre con otro equipo, el formulario arranca de sus valores
  React.useEffect(() => {
    setValores(inicial)
    setAgencia(null)
  }, [inicial])

  const cambios = editables.some((c) => valores[c].trim() !== inicial[c].trim())
  const puedeGuardar = (cambios || !!agencia) && !guardando && !bloqueado

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!equipo || !puedeGuardar) return
    setGuardando(true)
    const ok = await onGuardar(equipo._id, cambios ? valores : null, agencia)
    setGuardando(false)
    if (ok) onCerrar()
  }

  return (
    <Dialog open={!!equipo} onOpenChange={(abierto) => !abierto && !guardando && onCerrar()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={guardar} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Equipo {equipo?._id}</DialogTitle>
            <DialogDescription>
              {agenciaActual
                ? "Elige la nueva agencia. El cambio queda en la bitácora y se conserva si se regenera la asignación."
                : "Corrige los datos que no cuadran y, si ya sabes cuál, elige la agencia. Todo queda en la bitácora."}
            </DialogDescription>
          </DialogHeader>

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg bg-muted/40 p-3 text-sm">
            {columnas
              .filter((c) => !editables.includes(c))
              .map((c) => (
                <React.Fragment key={c}>
                  <dt className="text-muted-foreground">{c}</dt>
                  <dd className="break-words">{String(equipo?.[c] ?? "—")}</dd>
                </React.Fragment>
              ))}
            {agenciaActual && (
              <>
                <dt className="text-muted-foreground">Agencia actual</dt>
                <dd className="break-words font-medium">{agenciaActual}</dd>
              </>
            )}
          </dl>

          <div className="grid gap-3">
            {editables.map((c, i) => (
              <div key={c} className="grid gap-1.5">
                <Label htmlFor={`editar-${c}`}>{c}</Label>
                <Input
                  id={`editar-${c}`}
                  value={valores[c] ?? ""}
                  onChange={(e) => setValores((v) => ({ ...v, [c]: e.target.value }))}
                  maxLength={200}
                  autoFocus={i === 0}
                  disabled={guardando}
                />
              </div>
            ))}
            <div className="grid gap-1.5">
              <Label>{agenciaActual ? "Nueva agencia" : "Agencia (opcional)"}</Label>
              <SelectorAgencia agencias={agencias} valor={agencia} onCambio={setAgencia} disabled={guardando} />
            </div>
          </div>

          {bloqueado && (
            <p className="text-sm text-muted-foreground">Hay un proceso en curso o el periodo está completado.</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCerrar} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!puedeGuardar}>
              {guardando && <Loader2Icon className="animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function PasoSinAsignar({
  numero,
  control,
  onCambio,
}: {
  numero: number
  control: EstadoControl
  onCambio: () => void
}) {
  const habilitado = control.sin_asignar != null
  const bloqueado = control.en_curso.length > 0 || !!control.secuencia || !!control.cierre
  const [vista, setVista] = React.useState<Vista>("pendientes")
  const [datos, setDatos] = React.useState<SinAsignar | null>(null)
  const [agencias, setAgencias] = React.useState<Agencia[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [filtro, setFiltro] = React.useState("")
  const [seleccion, setSeleccion] = React.useState<Set<string>>(new Set())
  const [agenciaLote, setAgenciaLote] = React.useState<Agencia | null>(null)
  // Se incrementa tras asignar para recargar la lista de "asignados a mano" (el conteo del estado no la cubre)
  const [refresco, setRefresco] = React.useState(0)
  // Equipo abierto en el modal de edición
  const [editando, setEditando] = React.useState<EquipoSinAgencia | null>(null)

  const manuales = vista === "manuales"
  const hayPendientes = !!control.sin_asignar
  // En "pendientes" sin ningún equipo no hay nada que listar
  const listar = habilitado && (manuales || hayPendientes)

  // Recargar la lista cuando cambia el conteo (otro usuario asignó, se regeneró, etc.) o la vista
  React.useEffect(() => {
    if (!listar) return
    let vigente = true
    setDatos(null)
    const pedir = manuales ? api.asignadosManual : api.sinAsignar
    pedir().then(
      (d) => {
        if (!vigente) return
        setDatos(d)
        setError(null)
      },
      (e) => vigente && setError(errorMsg(e))
    )
    return () => {
      vigente = false
    }
  }, [listar, manuales, control.sin_asignar, refresco])

  React.useEffect(() => {
    if (habilitado && !agencias) api.agencias().then(setAgencias, (e) => setError(errorMsg(e)))
  }, [habilitado, agencias])

  const nombreAgencia = React.useMemo(
    () => new Map((agencias ?? []).map((a) => [a.valor, a.nombre])),
    [agencias]
  )
  const nombreDe = (valor: string | null | undefined) => (valor ? (nombreAgencia.get(valor) ?? valor) : null)

  const filas = React.useMemo(() => {
    if (!datos) return []
    const q = filtro.trim().toLowerCase()
    if (!q) return datos.filas
    return datos.filas.filter((f) =>
      [f._id, ...datos.columnas.map((c) => f[c])].some((v) => String(v ?? "").toLowerCase().includes(q))
    )
  }, [datos, filtro])
  const visibles = filas.slice(0, FILAS_VISIBLES)
  const todasMarcadas = visibles.length > 0 && visibles.every((f) => seleccion.has(f._id))

  function cambiarVista(v: Vista) {
    setVista(v)
    setSeleccion(new Set())
    setFiltro("")
    setError(null)
    setEditando(null)
  }

  // Referencia estable: el modal reinicia su formulario cuando cambia
  const editables = (!manuales && datos?.editables) || SIN_EDITABLES

  /** Guarda lo del modal: primero los datos corregidos, luego la agencia (si se eligió). Devuelve true si todo salió. */
  async function guardarEquipo(id: string, valores: Record<string, string> | null, agencia: Agencia | null) {
    if (valores) {
      try {
        const { actualizados } = await api.editarEquipo(id, valores)
        if (actualizados && !agencia) toast.success(`Equipo ${id} actualizado`)
        setDatos((d) => d && { ...d, filas: d.filas.map((f) => (f._id === id ? { ...f, ...valores } : f)) })
      } catch (err) {
        toast.error("No se pudo guardar el equipo", { description: errorMsg(err) })
        return false
      }
    }
    if (!agencia) {
      onCambio()
      return true
    }
    return asignar([id], agencia, valores ? "Los datos del equipo sí se guardaron." : undefined)
  }

  async function asignar(ids: string[], agencia: Agencia, siFalla?: string): Promise<boolean> {
    try {
      const { actualizados } = await api.asignarAgencia(ids, agencia.valor)
      if (actualizados === ids.length) {
        toast.success(`${agencia.nombre} asignada a ${fmtNumero(actualizados)} equipo(s)`)
      } else {
        toast.warning(`Se asignaron ${fmtNumero(actualizados)} de ${fmtNumero(ids.length)} equipos`, {
          description: "El resto ya tenía esa agencia o la puso el SP.",
        })
      }
      setSeleccion((s) => new Set([...s].filter((id) => !ids.includes(id))))
      setRefresco((n) => n + 1)
      return true
    } catch (err) {
      toast.error("No se pudo asignar la agencia", { description: [errorMsg(err), siFalla].filter(Boolean).join(" ") })
      return false
    } finally {
      onCambio()
    }
  }

  function marcar(id: string, marcado: boolean) {
    setSeleccion((s) => {
      const n = new Set(s)
      if (marcado) n.add(id)
      else n.delete(id)
      return n
    })
  }

  function marcarVisibles(marcado: boolean) {
    setSeleccion((s) => {
      const n = new Set(s)
      for (const f of visibles) {
        if (marcado) n.add(f._id)
        else n.delete(f._id)
      }
      return n
    })
  }

  const verbo = manuales ? "Cambiar" : "Asignar"

  return (
    <Paso
      id="tour-sin-asignar"
      numero={numero}
      titulo="Equipos sin asignar"
      estado={estadoSinAsignar(control)}
      etiquetaEstado={etiquetaSinAsignar(control)}
    >
      {!habilitado ? (
        <p className="text-muted-foreground">
          Se habilita al generar la asignación: aquí aparecen los equipos que el SP dejó sin agencia por datos
          inconsistentes (p. ej. un barrio que no corresponde al municipio).
        </p>
      ) : (
        <>
          <div className="flex gap-2">
            <Button size="sm" variant={manuales ? "outline" : "default"} onClick={() => cambiarVista("pendientes")}>
              Sin agencia ({fmtNumero(control.sin_asignar)})
            </Button>
            <Button size="sm" variant={manuales ? "default" : "outline"} onClick={() => cambiarVista("manuales")}>
              Asignados a mano
            </Button>
          </div>

          {!listar ? (
            <p className="text-muted-foreground">Todos los equipos de la asignación tienen agencia.</p>
          ) : error ? (
            <p className="text-red-700 dark:text-red-400">No se pudo cargar: {error}</p>
          ) : !datos || !agencias ? (
            <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
          ) : (
            <>
              <p className="text-muted-foreground">
                {manuales
                  ? "Agencias asignadas a mano en este periodo. Corrígelas con el lápiz mientras el periodo no esté completado; se conservan si se regenera la asignación."
                  : "El SP no pudo asignarles agencia. Usa el lápiz para corregir el equipo y elegir su agencia, o marca varios y asígnales la misma. Para completar la asignación no puede quedar ninguno."}
                {bloqueado && !control.cierre && " Espera a que termine el proceso en curso."}
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={filtro}
                    onChange={(e) => setFiltro(e.target.value)}
                    placeholder="Buscar equipo, municipio, barrio…"
                    className="w-64 pl-8"
                  />
                </div>
                {seleccion.size > 0 && (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-2 py-1">
                    <span className="text-sm font-medium tabular-nums">{fmtNumero(seleccion.size)} seleccionados</span>
                    <SelectorAgencia agencias={agencias} valor={agenciaLote} onCambio={setAgenciaLote} disabled={bloqueado} />
                    <ConfirmarAccion
                      size="sm"
                      disabled={!agenciaLote || bloqueado}
                      titulo={`¿${verbo} agencia a los seleccionados?`}
                      descripcion={`Se asignará ${agenciaLote?.nombre} a ${fmtNumero(seleccion.size)} equipo(s). Queda registrado y se conserva si se regenera la asignación.`}
                      textoConfirmar={verbo}
                      onConfirmar={() => asignar([...seleccion], agenciaLote!)}
                    >
                      {verbo}
                    </ConfirmarAccion>
                  </div>
                )}
              </div>

              {/* Un solo contenedor con scroll (alto acotado): la barra horizontal siempre está a la vista, el
                  encabezado y la primera columna quedan fijos. Sin <Table>: su envoltorio con overflow rompe el sticky. */}
              <div className="max-h-[65vh] overflow-auto rounded-lg border">
                <table data-slot="table" className="w-full caption-bottom text-sm">
                  <TableHeader className="sticky top-0 z-10 bg-background shadow-[0_1px_0_var(--border)]">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="sticky left-0 z-20 bg-background">
                        <Checkbox
                          checked={todasMarcadas}
                          onCheckedChange={(v) => marcarVisibles(!!v)}
                          aria-label="Marcar todos"
                        />
                      </TableHead>
                      {datos.columnas.map((c) => (
                        <TableHead key={c}>{c}</TableHead>
                      ))}
                      {manuales && <TableHead>Agencia actual</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibles.map((f) => (
                      <TableRow
                        key={f._id}
                        className="group"
                        data-state={seleccion.has(f._id) ? "selected" : undefined}
                      >
                        <TableCell className="sticky left-0 z-[5] bg-background group-hover:bg-muted group-data-[state=selected]:bg-muted">
                          <div className="flex items-center gap-1">
                            <Checkbox
                              checked={seleccion.has(f._id)}
                              onCheckedChange={(v) => marcar(f._id, !!v)}
                              aria-label={`Marcar ${f._id}`}
                            />
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              onClick={() => setEditando(f)}
                              disabled={bloqueado}
                              aria-label={`Editar equipo ${f._id}`}
                              title={manuales ? "Cambiar agencia" : "Editar equipo y asignar agencia"}
                            >
                              <PencilIcon />
                            </Button>
                          </div>
                        </TableCell>
                        {datos.columnas.map((c) => (
                          <TableCell key={c}>
                            <TextoCelda valor={f[c]} />
                          </TableCell>
                        ))}
                        {manuales && (
                          <TableCell>
                            <TextoCelda valor={nombreDe(f._agencia)} />
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                    {visibles.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={datos.columnas.length + (manuales ? 2 : 1)}
                          className="text-center text-muted-foreground"
                        >
                          {datos.filas.length === 0 && manuales
                            ? "Aún no se ha asignado ninguna agencia a mano en este periodo"
                            : "Ningún equipo coincide con la búsqueda"}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </table>
              </div>
              {(filas.length > visibles.length || datos.total > datos.filas.length) && (
                <p className="text-xs text-muted-foreground">
                  Mostrando {fmtNumero(visibles.length)} de {fmtNumero(filtro ? filas.length : datos.total)}. Usa el
                  buscador para encontrar el resto.
                </p>
              )}
              <EditarEquipoDialog
                equipo={editando}
                columnas={datos.columnas}
                editables={editables}
                agenciaActual={manuales ? (nombreDe(editando?._agencia) ?? "—") : null}
                agencias={agencias}
                bloqueado={bloqueado}
                onCerrar={() => setEditando(null)}
                onGuardar={guardarEquipo}
              />
            </>
          )}
        </>
      )}
    </Paso>
  )
}
