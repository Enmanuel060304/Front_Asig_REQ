import * as React from "react"
import { Loader2Icon, SearchIcon } from "lucide-react"
import { toast } from "sonner"

import { ConfirmarAccion } from "@/components/control/confirmar-accion"
import type { EstadoPaso } from "@/components/control/estado-badge"
import { Paso } from "@/components/control/paso"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, type Agencia, type EstadoControl, type SinAsignar } from "@/lib/api"
import { fmtNumero } from "@/lib/formato"

// Se dibuja como máximo esta cantidad de filas; el resto se encuentra con el buscador
const FILAS_VISIBLES = 100

const errorMsg = (err: unknown) => (err instanceof Error ? err.message : "Error desconocido")

function estadoSinAsignar(control: EstadoControl): EstadoPaso {
  if (control.sin_asignar == null) return "PENDIENTE"
  return control.sin_asignar > 0 ? "ADVERTENCIA" : "OK"
}

function etiquetaSinAsignar(control: EstadoControl) {
  if (control.sin_asignar == null) return undefined
  return control.sin_asignar > 0 ? `${fmtNumero(control.sin_asignar)} sin agencia` : "Todos con agencia"
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
  const bloqueado = !!control.en_curso || !!control.cierre
  const [datos, setDatos] = React.useState<SinAsignar | null>(null)
  const [agencias, setAgencias] = React.useState<Agencia[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [filtro, setFiltro] = React.useState("")
  const [seleccion, setSeleccion] = React.useState<Set<string>>(new Set())
  const [porFila, setPorFila] = React.useState<Record<string, Agencia | null>>({})
  const [agenciaLote, setAgenciaLote] = React.useState<Agencia | null>(null)

  // Recargar la lista cuando cambia el conteo (otro usuario asignó, se regeneró, etc.)
  React.useEffect(() => {
    if (!habilitado || !control.sin_asignar) return
    api.sinAsignar().then(
      (d) => {
        setDatos(d)
        setError(null)
      },
      (e) => setError(errorMsg(e))
    )
  }, [habilitado, control.sin_asignar])

  React.useEffect(() => {
    if (habilitado && control.sin_asignar && !agencias) {
      api.agencias().then(setAgencias, (e) => setError(errorMsg(e)))
    }
  }, [habilitado, control.sin_asignar, agencias])

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

  async function asignar(ids: string[], agencia: Agencia) {
    try {
      const { actualizados } = await api.asignarAgencia(ids, agencia.valor)
      if (actualizados === ids.length) {
        toast.success(`${agencia.nombre} asignada a ${fmtNumero(actualizados)} equipo(s)`)
      } else {
        toast.warning(`Se asignaron ${fmtNumero(actualizados)} de ${fmtNumero(ids.length)} equipos`, {
          description: "El resto ya tenía agencia.",
        })
      }
      setSeleccion((s) => new Set([...s].filter((id) => !ids.includes(id))))
      setPorFila((p) => Object.fromEntries(Object.entries(p).filter(([id]) => !ids.includes(id))))
    } catch (err) {
      toast.error("No se pudo asignar la agencia", { description: errorMsg(err) })
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
      ) : !control.sin_asignar ? (
        <p className="text-muted-foreground">Todos los equipos de la asignación tienen agencia.</p>
      ) : error ? (
        <p className="text-red-700 dark:text-red-400">No se pudo cargar: {error}</p>
      ) : !datos || !agencias ? (
        <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
      ) : (
        <>
          <p className="text-muted-foreground">
            El SP no pudo asignarles agencia. Elige una por equipo, o marca varios y asígnales la misma. Para
            completar la asignación no puede quedar ninguno.
            {bloqueado && " Espera a que termine el proceso en curso."}
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
                  titulo="¿Asignar agencia a los seleccionados?"
                  descripcion={`Se asignará ${agenciaLote?.nombre} a ${fmtNumero(seleccion.size)} equipo(s). Si se regenera la asignación, esta asignación manual se pierde.`}
                  textoConfirmar="Asignar"
                  onConfirmar={() => asignar([...seleccion], agenciaLote!)}
                >
                  Asignar
                </ConfirmarAccion>
              </div>
            )}
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <Checkbox
                      checked={todasMarcadas}
                      onCheckedChange={(v) => marcarVisibles(!!v)}
                      aria-label="Marcar todos"
                    />
                  </TableHead>
                  {datos.columnas.map((c) => (
                    <TableHead key={c}>{c}</TableHead>
                  ))}
                  <TableHead>Agencia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map((f) => (
                  <TableRow key={f._id} data-state={seleccion.has(f._id) ? "selected" : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={seleccion.has(f._id)}
                        onCheckedChange={(v) => marcar(f._id, !!v)}
                        aria-label={`Marcar ${f._id}`}
                      />
                    </TableCell>
                    {datos.columnas.map((c) => (
                      <TableCell key={c}>{String(f[c] ?? "—")}</TableCell>
                    ))}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <SelectorAgencia
                          agencias={agencias}
                          valor={porFila[f._id] ?? null}
                          onCambio={(a) => setPorFila((p) => ({ ...p, [f._id]: a }))}
                          disabled={bloqueado}
                        />
                        <ConfirmarAccion
                          size="sm"
                          variant="outline"
                          disabled={!porFila[f._id] || bloqueado}
                          titulo="¿Asignar agencia?"
                          descripcion={`Se asignará ${porFila[f._id]?.nombre} al equipo ${f._id}.`}
                          textoConfirmar="Asignar"
                          onConfirmar={() => asignar([f._id], porFila[f._id]!)}
                        >
                          Asignar
                        </ConfirmarAccion>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {visibles.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={datos.columnas.length + 2} className="text-center text-muted-foreground">
                      Ningún equipo coincide con la búsqueda
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {(filas.length > visibles.length || datos.total > datos.filas.length) && (
            <p className="text-xs text-muted-foreground">
              Mostrando {fmtNumero(visibles.length)} de {fmtNumero(filtro ? filas.length : datos.total)}. Usa el
              buscador para encontrar el resto.
            </p>
          )}
        </>
      )}
    </Paso>
  )
}
