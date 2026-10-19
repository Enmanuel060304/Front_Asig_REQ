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
  numerico?: boolean
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

  const valido = nombre.trim() !== "" && (!form?.numerico || /^[1-9]\d{0,8}$/.test(nombre.trim())) && (!form?.conAgencia || agencia.trim() !== "")

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
            <Input id="cat-nombre" value={nombre} maxLength={form?.numerico ? 9 : 100} inputMode={form?.numerico ? "numeric" : undefined} onChange={(e) => setNombre(e.target.value)} autoFocus />
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

/** Una agencia solo existe si cubre zonas: se crea eligiendo los distritos y municipios que pasan a ella. */
function DialogoNuevaAgencia({
  abierto,
  distritos,
  municipios,
  nombresAgencias,
  onCerrar,
  guardar,
}: {
  abierto: boolean
  distritos: Distrito[]
  municipios: Municipio[]
  nombresAgencias: string[]
  onCerrar: () => void
  guardar: (a: { agencia: string; distritos: number[]; municipios: number[] }) => Promise<unknown>
}) {
  const [nombre, setNombre] = React.useState("")
  const [selD, setSelD] = React.useState<Set<number>>(new Set())
  const [selM, setSelM] = React.useState<Set<number>>(new Set())
  const [enviando, setEnviando] = React.useState(false)

  React.useEffect(() => {
    if (!abierto) return
    setNombre("")
    setSelD(new Set())
    setSelM(new Set())
  }, [abierto])

  const limpio = nombre.trim()
  const repetida = nombresAgencias.some((a) => a.toLowerCase() === limpio.toLowerCase())
  const valido = limpio !== "" && !repetida && selD.size + selM.size > 0

  const alternar = (set: Set<number>, setSet: (s: Set<number>) => void, id: number) => {
    const n = new Set(set)
    if (!n.delete(id)) n.add(id)
    setSet(n)
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!valido) return
    setEnviando(true)
    try {
      await guardar({ agencia: limpio, distritos: [...selD], municipios: [...selM] })
      onCerrar()
    } catch {
      // ya se avisó con un toast
    } finally {
      setEnviando(false)
    }
  }

  const lista = (titulo: string, items: { id: number; texto: string; agencia: string }[], sel: Set<number>, setSel: (s: Set<number>) => void) => (
    <div className="flex flex-col gap-1">
      <Label>{titulo} ({sel.size} elegidos)</Label>
      <div className="max-h-40 overflow-y-auto rounded-md border p-2">
        {items.map((i) => (
          <label key={i.id} className="flex cursor-pointer items-center gap-2 py-0.5 text-sm">
            <input type="checkbox" checked={sel.has(i.id)} onChange={() => alternar(sel, setSel, i.id)} />
            <span>{i.texto}</span>
            <span className="text-muted-foreground">· hoy: {i.agencia}</span>
          </label>
        ))}
      </div>
    </div>
  )

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={enviar} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Nueva agencia</DialogTitle>
            <DialogDescription>
              Elige qué distritos y municipios pasan a la nueva agencia (dejan de pertenecer a la que tenían).
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="nueva-agencia">Nombre de la agencia</Label>
            <Input id="nueva-agencia" value={nombre} maxLength={100} onChange={(e) => setNombre(e.target.value)} autoFocus />
            {repetida && <p className="text-sm text-destructive">Ya existe una agencia con ese nombre.</p>}
          </div>
          {lista("Distritos", distritos.map((d) => ({ id: d.distrito, texto: `Distrito ${d.distrito}`, agencia: d.agencia })), selD, setSelD)}
          {lista("Municipios", municipios.map((m) => ({ id: m.id, texto: m.municipio, agencia: m.agencia })), selM, setSelM)}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!valido || enviando}>
              {enviando && <Loader2Icon className="animate-spin" />}
              Crear
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
  const [nueva, setNueva] = React.useState(false)

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

  const abrirDistrito = (d: Distrito) =>
    setForm({
      titulo: "Editar distrito",
      etiqueta: "Distrito (código numérico)",
      conAgencia: true,
      numerico: true,
      nombre: String(d.distrito),
      agencia: d.agencia,
      guardar: (nombre, agencia) =>
        guardar(
          () => api.actualizarDistrito(d.distrito, { distrito: Number(nombre), agencia }),
          "Distrito actualizado",
        ),
    })

  const abrirMunicipio = (m: Municipio) =>
    setForm({
      titulo: "Editar municipio",
      etiqueta: "Municipio",
      conAgencia: true,
      nombre: m.municipio,
      agencia: m.agencia,
      guardar: (nombre, agencia) =>
        guardar(
          () => api.actualizarMunicipio(m.id, { municipio: nombre, agencia }),
          "Municipio actualizado",
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

        <TabsContent value="agencias" className="flex flex-col gap-3 pt-3">
          <div>
            <Button onClick={() => setNueva(true)}>
              <PlusIcon /> Nueva agencia
            </Button>
          </div>
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

        <TabsContent value="distritos" className="pt-3">
          <Tabla columnas={["Distrito", "Agencia"]} vacio={distritos.length === 0}>
            {distritos
              .filter((d) => coincide(String(d.distrito), d.agencia))
              .map((d) => (
                <TableRow key={d.distrito}>
                  <TableCell className="font-medium">{d.distrito}</TableCell>
                  <TableCell>{d.agencia}</TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <Button variant="outline" size="sm" onClick={() => abrirDistrito(d)}>
                        <PencilIcon /> Editar
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
          </Tabla>
        </TabsContent>

        <TabsContent value="municipios" className="pt-3">
          <Tabla columnas={["Municipio", "Agencia"]} vacio={municipios.length === 0}>
            {municipios
              .filter((m) => coincide(m.municipio, m.agencia))
              .map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.municipio}</TableCell>
                  <TableCell>{m.agencia}</TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <Button variant="outline" size="sm" onClick={() => abrirMunicipio(m)}>
                        <PencilIcon /> Editar
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
          </Tabla>
        </TabsContent>
      </Tabs>

      <DialogoNuevaAgencia
        abierto={nueva}
        distritos={distritos}
        municipios={municipios}
        nombresAgencias={nombresAgencias}
        onCerrar={() => setNueva(false)}
        guardar={(a) => ejecutar(() => api.crearAgencia(a), "Agencia creada")}
      />
      <DialogoFormulario form={form} agencias={nombresAgencias} onCerrar={() => setForm(null)} />
    </div>
  )
}
