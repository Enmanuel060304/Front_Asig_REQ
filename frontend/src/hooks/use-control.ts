import * as React from "react"
import { toast } from "sonner"

import { useAuth } from "@/auth/AuthContext"
import { ApiError, api, type EstadoControl } from "@/lib/api"
import { NOMBRE_PROCESO, fmtDuracion } from "@/lib/formato"

const POLL_EN_CURSO_MS = 10_000
const POLL_REPOSO_MS = 30_000

/** Pide permiso de notificaciones (llamar desde un clic del usuario). */
export function pedirPermisoNotificaciones() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission().catch(() => {})
  }
}

function notificar(titulo: string, cuerpo: string) {
  if (!("Notification" in window) || Notification.permission !== "granted" || !document.hidden) return
  try {
    new Notification(titulo, { body: cuerpo, icon: "/pwa-192x192.png" })
  } catch {
    // Algunos navegadores solo permiten notificaciones desde el service worker
  }
}

/** Estado del control del periodo con polling adaptativo y aviso al terminar un proceso. */
export function useControl() {
  const { logout } = useAuth()
  const [estado, setEstado] = React.useState<EstadoControl | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  // Diferencia entre el reloj del servidor y el del navegador, para los cronómetros
  const [desfaseMs, setDesfaseMs] = React.useState(0)
  const enCursoPrevio = React.useRef<number | null>(null)

  const cargar = React.useCallback(async () => {
    try {
      const e = await api.control()
      setEstado(e)
      setDesfaseMs(new Date(e.ahora).getTime() - Date.now())
      setError(null)

      const previo = enCursoPrevio.current
      enCursoPrevio.current = e.en_curso?.Id ?? null
      if (previo && previo !== e.en_curso?.Id) {
        const p = await api.proceso(previo)
        const nombre = NOMBRE_PROCESO[p.Tipo]
        if (p.Estado === "OK") {
          toast.success(`${nombre} terminó`, { description: `Duración: ${fmtDuracion(p.DuracionMs)}` })
          notificar(`${nombre} terminó`, `Duración: ${fmtDuracion(p.DuracionMs)}`)
        } else {
          toast.error(`${nombre} falló`, { description: p.Error ?? undefined })
          notificar(`${nombre} falló`, p.Error ?? "Revisa la bitácora")
        }
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return logout()
      setError(err instanceof Error ? err.message : "Error al cargar")
    }
  }, [logout])

  React.useEffect(() => {
    cargar()
  }, [cargar])

  const hayProceso = !!estado?.en_curso
  React.useEffect(() => {
    const id = setInterval(cargar, hayProceso ? POLL_EN_CURSO_MS : POLL_REPOSO_MS)
    return () => clearInterval(id)
  }, [cargar, hayProceso])

  return { estado, error, desfaseMs, recargar: cargar }
}

/** Fuerza un re-render cada segundo (para cronómetros). */
export function useAhora(activo: boolean) {
  const [ahora, setAhora] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!activo) return
    const id = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(id)
  }, [activo])
  return ahora
}
