import { toast } from "sonner"
import { registerSW } from "virtual:pwa-register"

export function registrarServiceWorker() {
  const actualizar = registerSW({
    onNeedRefresh() {
      toast.info("Nueva versión disponible", {
        duration: Infinity,
        action: { label: "Actualizar", onClick: () => actualizar(true) },
      })
    },
  })
}
