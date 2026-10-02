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
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    const detail = data?.detail
    if (detail && typeof detail === "object" && "mensaje" in detail) {
      throw new ApiError(res.status, detail.mensaje, detail.motivos ?? [])
    }
    throw new ApiError(res.status, typeof detail === "string" ? detail : `Error ${res.status}`)
  }
  return res.json()
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
  bloqueos: string[]
  puede_generar: boolean
  bitacora: EventoBitacora[]
}

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

  control: () => request<EstadoControl>("GET", "/api/control"),
  validar: (insumo: InsumoClave) => request<Validacion>("POST", `/api/control/validar/${insumo}`),
  extraer: (insumo: InsumoClave) => request<{ id: number }>("POST", `/api/control/extraer/${insumo}`),
  mora: () => request<{ id: number }>("POST", "/api/control/mora"),
  asignacion: (regenerar = false) =>
    request<{ id: number }>("POST", `/api/control/asignacion${regenerar ? "?regenerar=true" : ""}`),
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
