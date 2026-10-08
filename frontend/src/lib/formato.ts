import type { TipoProceso, TipoProgramable } from "@/lib/api"

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

/** "202610" → "Octubre 2026" */
export function nombrePeriodo(periodo: string) {
  return `${MESES[Number(periodo.slice(4)) - 1]} ${periodo.slice(0, 4)}`
}

/** "202610" → "Oct 26" (ejes de los gráficos) */
export function periodoCorto(periodo: string) {
  return `${MESES[Number(periodo.slice(4)) - 1].slice(0, 3)} ${periodo.slice(2, 4)}`
}

export const NOMBRE_PROCESO: Record<TipoProceso, string> = {
  EXTRAER_BAJAS: "Extracción Bajas",
  EXTRAER_CAMBIO_TEC: "Extracción Cambio de tecnología",
  MORA: "Mora",
  ASIGNACION: "Asignación",
}

/** Lo que se puede programar: los procesos (excepto la asignación) y el flujo completo (extraer y generar). */
export const NOMBRE_PROGRAMABLE: Record<TipoProgramable, string> = {
  EXTRAER_BAJAS: NOMBRE_PROCESO.EXTRAER_BAJAS,
  EXTRAER_CAMBIO_TEC: NOMBRE_PROCESO.EXTRAER_CAMBIO_TEC,
  MORA: NOMBRE_PROCESO.MORA,
  INSUMOS: "Extraer y generar asignación (los 3 insumos a la vez)",
}

export const fmtFecha = (v: string) =>
  new Date(v).toLocaleString("es", { dateStyle: "short", timeStyle: "short" })

export const fmtHora = (v: string) => new Date(v).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })

export const fmtNumero = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("es"))

export function fmtDuracion(ms: number | null | undefined) {
  if (ms == null) return "—"
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ${s % 60 ? `${s % 60} s` : ""}`.trim()
  return `${Math.floor(m / 60)} h ${m % 60} min`
}

export function variacionPct(actual: number | null, previo: number | null) {
  if (!actual || !previo) return null
  return ((actual - previo) / previo) * 100
}
