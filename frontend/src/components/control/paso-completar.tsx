import * as React from "react"
import { CheckCheckIcon, FileSpreadsheetIcon, Loader2Icon, LockOpenIcon } from "lucide-react"
import { toast } from "sonner"

import { ConfirmarAccion } from "@/components/control/confirmar-accion"
import type { EstadoPaso } from "@/components/control/estado-badge"
import { Datos, Paso } from "@/components/control/paso"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ApiError, api, type EstadoControl } from "@/lib/api"
import { fmtFecha } from "@/lib/formato"

const errorMsg = (err: unknown) => (err instanceof Error ? err.message : "Error desconocido")

function estadoCompletar(control: EstadoControl): EstadoPaso {
  return control.cierre ? "OK" : "PENDIENTE"
}

export function PasoCompletar({
  numero,
  control,
  onCambio,
}: {
  numero: number
  control: EstadoControl
  onCambio: () => void
}) {
  const { cierre } = control
  const [exportando, setExportando] = React.useState(false)

  async function accion(fn: () => Promise<unknown>, ok: string, fallo: string) {
    try {
      await fn()
      toast.success(ok)
    } catch (err) {
      const motivos = err instanceof ApiError ? err.motivos : []
      toast.error(fallo, { description: motivos.length ? motivos.join(" · ") : errorMsg(err) })
    } finally {
      onCambio()
    }
  }

  async function exportar() {
    setExportando(true)
    try {
      await api.exportar()
    } catch (err) {
      toast.error("No se pudo exportar", { description: errorMsg(err) })
    } finally {
      setExportando(false)
      onCambio() // la exportación queda en la bitácora
    }
  }

  return (
    <Paso
      id="tour-completar"
      numero={numero}
      titulo="Completar asignación"
      estado={estadoCompletar(control)}
      etiquetaEstado={cierre ? "Completada" : undefined}
      ultimo
      acciones={
        cierre ? (
          <>
            <Button size="sm" onClick={exportar} disabled={exportando}>
              {exportando ? <Loader2Icon className="animate-spin" /> : <FileSpreadsheetIcon />}
              Exportar a Excel
            </Button>
            <ConfirmarAccion
              size="sm"
              variant="outline"
              destructiva
              titulo="¿Reabrir la asignación?"
              descripcion="Se volverán a habilitar la asignación manual de agencias y Regenerar. Tendrás que completarla de nuevo para exportar."
              textoConfirmar="Reabrir"
              onConfirmar={() => accion(api.reabrir, "Asignación reabierta", "No se pudo reabrir")}
            >
              <LockOpenIcon />
              Reabrir
            </ConfirmarAccion>
          </>
        ) : (
          <ConfirmarAccion
            size="sm"
            disabled={!control.puede_completar}
            titulo="¿Completar la asignación?"
            descripcion="Se cerrará el periodo: ya no se podrán asignar agencias a mano ni regenerar la asignación (salvo que la reabras). Después podrás exportarla a Excel."
            textoConfirmar="Completar"
            onConfirmar={() => accion(api.completar, "Asignación completada", "No se pudo completar")}
          >
            <CheckCheckIcon />
            Completar asignación
          </ConfirmarAccion>
        )
      }
    >
      {cierre ? (
        <>
          <Datos
            items={[
              ["Completada", fmtFecha(cierre.Fecha)],
              ["Por", cierre.Usuario],
            ]}
          />
          <p className="text-muted-foreground">
            El Excel incluye toda la tabla de asignación: lo nuevo del periodo y lo pendiente de periodos anteriores.
          </p>
        </>
      ) : control.bloqueos_completar.length > 0 ? (
        <Alert>
          <AlertTitle>Se habilita cuando la asignación esté generada y todos los equipos tengan agencia</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {control.bloqueos_completar.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : (
        <p className="text-muted-foreground">Todo listo: completa la asignación para poder exportarla a Excel.</p>
      )}
    </Paso>
  )
}
