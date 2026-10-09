import * as React from "react"
import { Loader2Icon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { useAuth } from "@/auth/AuthContext"
import { ConfirmarAccion } from "@/components/control/confirmar-accion"
import { Button } from "@/components/ui/button"
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ApiError, api, type AgenciaCatalogo, type Distrito, type Municipio } from "@/lib/api"

/** Qué se edita en el diálogo: `nombre` (distrito, municipio o agencia) y, salvo en agencias, su agencia. */
type Formulario = {
  titulo: string
  etiqueta: string
  conAgencia: boolean
  nombre: string
  agencia: string
  guardar: (nombre: string, agencia: string) => Promise<unknown>
}

function DialogoFormulario({
  form,
  agencias,
  onCerrar,
}: {
  form: Formulario | null
  agencias: string[]
  onCerrar: () => void
}) {
  const [nombre, setNombre] = React.useState("")
  const [agencia, setAgencia] = React.useState("")
  const [enviando, setEnviando] = React.useState(false)

  React.useEffect(() => {
    setNombre(form?.nombre ?? "")
    setAgencia(form?.agencia ?? "")
  }, [form])

  const valido = nombre.trim() !== "" && (!form?.conAgencia || agencia.trim() !== "")

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!form || !valido) return
    setEnviando(true)
    try {
      await form.guardar(nombre.trim(), agencia.trim())
      onCerrar()
    } catch {
      // ya se avisó con un toast; el diálogo queda abierto para corregir
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={form !== null} onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={enviar} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{form?.titulo}</DialogTitle>
            <DialogDescription>
              {form?.conAgencia
                ? "Elige una agencia existente o escribe el nombre de una nueva."
                : "Se cambia en todos sus distritos y municipios."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cat-nombre">{form?.etiqueta}</Label>
            <Input id="cat-nombre" value={nombre} maxLength={100} onChange={(e) => setNombre(e.target.value)} autoFocus />
          </div>
          {form?.conAgencia && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="cat-agencia">Agencia</Label>
              <Input
                id="cat-agencia"
                list="cat-agencias"
                value={agencia}
                maxLength={100}
                onChange={(e) => setAgencia(e.target.value)}
              />
              <datalist id="cat-agencias">
                {agencias.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!valido || enviando}>
              {enviando && <Loader2Icon className="animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Acciones({ onEditar, onEliminar, descripcion }: { onEditar: () => void; onEliminar: () => Promise<unknown>; descripcion: string }) {
  return (
    <div className="flex justify-end gap-1">
      <Button variant="outline" size="sm" onClick={onEditar}>
        <PencilIcon /> Editar
      </Button>
      <ConfirmarAccion
        variant="outline"
        size="sm"
        titulo="¿Eliminar?"
        descripcion={descripcion}
        textoConfirmar="Eliminar"
        destructiva
        onConfirmar={onEliminar}
      >
        <Trash2Icon /> Eliminar
      </ConfirmarAccion>
    </div>
  )
}

function Tabla({ columnas, vacio, children }: { columnas: string[]; vacio: boolean; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            {columnas.map((c) => (
              <TableHead key={c}>{c}</TableHead>
            ))}
            <TableHead className="w-px" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {vacio ? (
            <TableRow>
              <TableCell colSpan={columnas.length + 1} className="h-24 text-center text-muted-foreground">
                Sin registros
              </TableCell>
            </TableRow>
          ) : (
            children
          )}
        </TableBody>
      </Table>
    </div>
  )
}

export function Catalogo() {
  const { logout } = useAuth()
  const [agencias, setAgencias] = React.useState<AgenciaCatalogo[]>([])
  const [distritos, setDistritos] = React.useState<Distrito[]>([])
  const [municipios, setMunicipios] = React.useState<Municipio[]>([])
  const [cargando, setCargando] = React.useState(true)
  const [buscar, setBuscar] = React.useState("")
  const [form, setForm] = React.useState<Formulario | null>(null)

  const cargar = React.useCallback(async () => {
    try {
      const [a, d, m] = await Promise.all([api.catalogoAgencias(), api.distritos(), api.municipios()])
      setAgencias(a)
      setDistritos(d)
      setMunicipios(m)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return logout()
      toast.error("No se pudo cargar el catálogo", { description: err instanceof Error ? err.message : undefined })
    } finally {
      setCargando(false)
    }
  }, [logout])

  React.useEffect(() => {
    void cargar()
  }, [cargar])

  /** Ejecuta una escritura: avisa el resultado y recarga; si falla relanza para que el diálogo siga abierto. */
  async function ejecutar(accion: () => Promise<unknown>, ok: string) {
    try {
      await accion()
      toast.success(ok)
      await cargar()
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return logout()
      toast.error("No se pudo guardar", { description: err instanceof Error ? err.message : undefined })
      throw err
    }
  }
  const guardar = ejecutar

  const nombresAgencias = agencias.map((a) => a.agencia)
  const q = buscar.trim().toLowerCase()
  const coincide = (...v: string[]) => !q || v.some((x) => x.toLowerCase().includes(q))

  const abrirDistrito = (d?: Distrito) =>
    setForm({
      titulo: d ? "Editar distrito" : "Nuevo distrito",
      etiqueta: "Distrito",
      conAgencia: true,
      nombre: d?.distrito ?? "",
      agencia: d?.agencia ?? "",
      guardar: (nombre, agencia) =>
        guardar(
          () => (d ? api.actualizarDistrito(d.distrito, { distrito: nombre, agencia }) : api.crearDistrito({ distrito: nombre, agencia })),
          d ? "Distrito actualizado" : "Distrito agregado",
        ),
    })

  const abrirMunicipio = (m?: Municipio) =>
    setForm({
      titulo: m ? "Editar municipio" : "Nuevo municipio",
      etiqueta: "Municipio",
      conAgencia: true,
      nombre: m?.municipio ?? "",
      agencia: m?.agencia ?? "",
      guardar: (nombre, agencia) =>
        guardar(
          () => (m ? api.actualizarMunicipio(m.id, { municipio: nombre, agencia }) : api.crearMunicipio({ municipio: nombre, agencia })),
          m ? "Municipio actualizado" : "Municipio agregado",
        ),
    })

  const abrirRenombrar = (a: AgenciaCatalogo) =>
    setForm({
      titulo: "Renombrar agencia",
      etiqueta: "Nombre de la agencia",
      conAgencia: false,
      nombre: a.agencia,
      agencia: "",
      guardar: (nombre) => guardar(() => api.renombrarAgencia(a.agencia, nombre), "Agencia renombrada"),
    })

  const eliminar = (accion: () => Promise<unknown>, ok: string) => ejecutar(accion, ok).catch(() => undefined)

  if (cargando) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6">
      <p className="text-sm text-muted-foreground">
        A qué agencia pertenece cada distrito y municipio. La asignación y la lista de agencias del paso 3 salen de
        aquí. Los cambios no se pueden hacer mientras corre un proceso.
      </p>
      <Tabs defaultValue="agencias" onValueChange={() => setBuscar("")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="agencias">Agencias ({agencias.length})</TabsTrigger>
            <TabsTrigger value="distritos">Distritos ({distritos.length})</TabsTrigger>
            <TabsTrigger value="municipios">Municipios ({municipios.length})</TabsTrigger>
          </TabsList>
          <Input className="max-w-56" placeholder="Buscar…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        </div>

        <TabsContent value="agencias" className="pt-3">
          <Tabla columnas={["Agencia", "Distritos", "Municipios"]} vacio={agencias.length === 0}>
            {agencias
              .filter((a) => coincide(a.agencia))
              .map((a) => (
                <TableRow key={a.agencia}>
                  <TableCell className="font-medium">{a.agencia}</TableCell>
                  <TableCell>{a.distritos}</TableCell>
                  <TableCell>{a.municipios}</TableCell>
                  <TableCell>
                    <Acciones
                      onEditar={() => abrirRenombrar(a)}
                      onEliminar={() => eliminar(() => api.eliminarAgencia(a.agencia), "Agencia eliminada")}
                      descripcion={`Se elimina la agencia «${a.agencia}» junto con sus ${a.distritos} distrito(s) y ${a.municipios} municipio(s). Los equipos ya asignados no cambian. Queda en la auditoría.`}
                    />
                  </TableCell>
                </TableRow>
              ))}
          </Tabla>
        </TabsContent>

        <TabsContent value="distritos" className="flex flex-col gap-3 pt-3">
          <div>
            <Button onClick={() => abrirDistrito()}>
              <PlusIcon /> Nuevo distrito
            </Button>
          </div>
          <Tabla columnas={["Distrito", "Agencia"]} vacio={distritos.length === 0}>
            {distritos
              .filter((d) => coincide(d.distrito, d.agencia))
              .map((d) => (
                <TableRow key={d.distrito}>
                  <TableCell className="font-medium">{d.distrito}</TableCell>
                  <TableCell>{d.agencia}</TableCell>
                  <TableCell>
                    <Acciones
                      onEditar={() => abrirDistrito(d)}
                      onEliminar={() => eliminar(() => api.eliminarDistrito(d.distrito), "Distrito eliminado")}
                      descripcion={`Se elimina el distrito «${d.distrito}» (agencia ${d.agencia}). Queda en la auditoría.`}
                    />
                  </TableCell>
                </TableRow>
              ))}
          </Tabla>
        </TabsContent>

        <TabsContent value="municipios" className="flex flex-col gap-3 pt-3">
          <div>
            <Button onClick={() => abrirMunicipio()}>
              <PlusIcon /> Nuevo municipio
            </Button>
          </div>
          <Tabla columnas={["Municipio", "Agencia"]} vacio={municipios.length === 0}>
            {municipios
              .filter((m) => coincide(m.municipio, m.agencia))
              .map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.municipio}</TableCell>
                  <TableCell>{m.agencia}</TableCell>
                  <TableCell>
                    <Acciones
                      onEditar={() => abrirMunicipio(m)}
                      onEliminar={() => eliminar(() => api.eliminarMunicipio(m.id), "Municipio eliminado")}
                      descripcion={`Se elimina el municipio «${m.municipio}» (agencia ${m.agencia}). Queda en la auditoría.`}
                    />
                  </TableCell>
                </TableRow>
              ))}
          </Tabla>
        </TabsContent>
      </Tabs>

      <DialogoFormulario form={form} agencias={nombresAgencias} onCerrar={() => setForm(null)} />
    </div>
  )
}
