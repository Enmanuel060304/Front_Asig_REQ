export class ApiError extends Error {
  status: number
  motivos: string[]
  constructor(status: number, message: string, motivos: string[] = []) {
    super(message)
    this.status = status
    this.motivos = motivos
  }
}

type Metodo = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

async function lanzarError(res: Response): Promise<never> {
  const data = await res.json().catch(() => null)
  const detail = data?.detail
  if (detail && typeof detail === "object" && "mensaje" in detail) {
    throw new ApiError(res.status, detail.mensaje, detail.motivos ?? [])
  }
  throw new ApiError(res.status, typeof detail === "string" ? detail : `Error ${res.status}`)
}

async function request<T>(method: Metodo, url: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, {
      method,
      credentials: "include", // envía la cookie httpOnly
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        ...(body !== undefined && { "Content-Type": "application/json" }),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(0, "Sin conexión con el servidor")
  }
  if (!res.ok) await lanzarError(res)
  return res.json()
}

/** Descarga un archivo de la API (GET con la cookie de sesión) con el nombre que manda el servidor. */
async function descargar(url: string, nombrePorDefecto: string): Promise<void> {
  let res: Response
  try {
    res = await fetch(url, { credentials: "include" })
  } catch {
    throw new ApiError(0, "Sin conexión con el servidor")
  }
  if (!res.ok) await lanzarError(res)
  const nombre = /filename="?([^";]+)"?/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? nombrePorDefecto
  const href = URL.createObjectURL(await res.blob())
  const a = document.createElement("a")
  a.href = href
  a.download = nombre
  a.click()
  setTimeout(() => URL.revokeObjectURL(href), 1000)
}

export type TipoProceso = "EXTRAER_BAJAS" | "EXTRAER_CAMBIO_TEC" | "MORA" | "ASIGNACION"
export type TipoProgramable = Exclude<TipoProceso, "ASIGNACION">
export type InsumoClave = "BAJAS" | "CAMBIO_TEC"

export type Proceso = {
  Id: number
  Periodo: string
  Tipo: TipoProceso
  Origen: "MANUAL" | "PROGRAMADO"
  Estado: "EN_PROCESO" | "OK" | "ERROR"
  Usuario: string
  Inicio: string
  Fin: string | null
  DuracionMs: number | null
  Filas: number | null
  Spid: number | null
  Error: string | null
}

export type ProcesoEnCurso = Proceso & {
  DuracionPromedioMs: number | null
  DetalleSql: {
    Estado: string
    Comando: string
    Espera: string | null
    BloqueadoPor: number
  } | null
}

export type Validacion = {
  Estado: "OK" | "ADVERTENCIA" | "ERROR"
  PeriodoEncontrado: string | null
  Filas: number | null
  FilasPeriodoAnterior: number | null
  Usuario: string
  Fecha: string
  Detalle: string
}

export type Programacion = {
  Tipo: TipoProgramable
  Modo: "UNICA" | "MENSUAL"
  FechaHora: string | null
  DiaMes: number | null
  Hora: string | null
  Activa: boolean
  ProximaEjecucion: string | null
  UltimaEjecucion: string | null
  UltimoProcesoId: number | null
  UltimoResultado: string | null
  UltimoNivel: "info" | "ok" | "warn" | "error" | null
  CreadoPor: string
}

export type EventoBitacora = {
  Id: number
  Fecha: string
  Usuario: string
  Nivel: "info" | "ok" | "warn" | "error"
  Mensaje: string
}

export type EstadoInsumo = {
  clave: InsumoClave
  nombre: string
  tipo_proceso: TipoProgramable
  validacion: Validacion | null
  extraccion: Proceso | null
  programacion: Programacion | null
}

export type EstadoControl = {
  periodo: string
  periodo_insumos: string
  ahora: string
  en_curso: ProcesoEnCurso | null
  insumos: EstadoInsumo[]
  mora: { proceso: Proceso | null; duracion_promedio_ms: number | null; programacion: Programacion | null }
  asignacion: { proceso: Proceso | null; duracion_promedio_ms: number | null }
  /** Equipos con agencia NULL; null si la asignación del periodo aún no está generada */
  sin_asignar: number | null
  /** Periodo completado (cerrado): habilita la exportación y bloquea el paso 5 y Regenerar */
  cierre: Cierre | null
  bloqueos_completar: string[]
  puede_completar: boolean
  bloqueos: string[]
  puede_generar: boolean
  /** Insumos listos y asignación sin generar: espera que una persona la apruebe */
  pendiente_aprobacion: boolean
  bitacora: EventoBitacora[]
}

/** Equipo sin agencia: `_id` es el identificador; el resto son las columnas configuradas.
 *  `_agencia` solo viene en "asignados a mano" (agencia actual). */
export type EquipoSinAgencia = { _id: string; _agencia?: string | null } & Record<string, unknown>

export type SinAsignar = { columnas: string[]; filas: EquipoSinAgencia[]; total: number }

export type Cierre = { Periodo: string; Usuario: string; Fecha: string }

export type Agencia = { valor: string; nombre: string }

export type Resumen = {
  periodo: string
  asignacion: Proceso | null
  mora: Proceso | null
  mora_duracion_promedio_ms: number | null
  por_dia: { fecha: string; ok: number; error: number }[]
}

export type ProgramacionIn =
  | { modo: "UNICA"; fecha_hora: string }
  | { modo: "MENSUAL"; dia_mes: number; hora: string }

export const api = {
  login: (username: string, password: string) =>
    request<{ username: string }>("POST", "/api/auth/login", { username, password }),
  logout: () => request<{ ok: boolean }>("POST", "/api/auth/logout"),
  me: () => request<{ username: string }>("GET", "/api/auth/me"),
  config: () => request<{ demo: boolean }>("GET", "/api/auth/config"),

  control: () => request<EstadoControl>("GET", "/api/control"),
  validar: (insumo: InsumoClave) => request<Validacion>("POST", `/api/control/validar/${insumo}`),
  extraer: (insumo: InsumoClave) => request<{ id: number }>("POST", `/api/control/extraer/${insumo}`),
  mora: () => request<{ id: number }>("POST", "/api/control/mora"),
  asignacion: (regenerar = false) =>
    request<{ id: number }>("POST", `/api/control/asignacion${regenerar ? "?regenerar=true" : ""}`),
  sinAsignar: () => request<SinAsignar>("GET", "/api/control/sin-asignar"),
  asignadosManual: () => request<SinAsignar>("GET", "/api/control/asignados-manual"),
  agencias: () => request<Agencia[]>("GET", "/api/control/agencias"),
  asignarAgencia: (ids: string[], agencia: string) =>
    request<{ actualizados: number }>("POST", "/api/control/sin-asignar", { ids, agencia }),
  completar: () => request<Cierre>("POST", "/api/control/completar"),
  reabrir: () => request<{ ok: boolean }>("POST", "/api/control/reabrir"),
  exportar: () => descargar("/api/control/exportar", "Asignacion.xlsx"),
  proceso: (id: number) => request<Proceso>("GET", `/api/control/procesos/${id}`),
  procesos: (tipo?: TipoProceso) =>
    request<Proceso[]>("GET", `/api/control/procesos${tipo ? `?tipo=${tipo}` : ""}`),
  resumen: () => request<Resumen>("GET", "/api/control/resumen"),

  programar: (tipo: TipoProgramable, data: ProgramacionIn) =>
    request<Programacion>("PUT", `/api/control/programaciones/${tipo}`, data),
  activarProgramacion: (tipo: TipoProgramable, activa: boolean) =>
    request<Programacion>("PATCH", `/api/control/programaciones/${tipo}`, { activa }),
  eliminarProgramacion: (tipo: TipoProgramable) =>
    request<{ ok: boolean }>("DELETE", `/api/control/programaciones/${tipo}`),
}
