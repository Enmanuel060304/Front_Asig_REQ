import * as React from "react"
import { toast } from "sonner"

import { useAuth } from "@/auth/AuthContext"
import { ChartAreaInteractive } from "@/components/chart-area-interactive"
import { ChartCalidad } from "@/components/chart-calidad"
import { ChartInsumos } from "@/components/chart-insumos"
import { DataTable } from "@/components/data-table"
import { SectionCards } from "@/components/section-cards"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ApiError, api, type Proceso, type Resumen, type TipoProceso } from "@/lib/api"
import { NOMBRE_PROCESO } from "@/lib/formato"

const TODOS = "TODOS"
const OPCIONES = [
  { label: "Todos los procesos", value: TODOS },
  ...(Object.keys(NOMBRE_PROCESO) as TipoProceso[]).map((t) => ({ label: NOMBRE_PROCESO[t], value: t })),
]

export function Dashboard() {
  const { logout } = useAuth()
  const [resumen, setResumen] = React.useState<Resumen | null>(null)
  const [procesos, setProcesos] = React.useState<Proceso[]>([])
  const [tipo, setTipo] = React.useState<string>(TODOS)

  const onError = React.useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) return logout()
      toast.error("No se pudieron cargar los datos", {
        description: err instanceof Error ? err.message : undefined,
      })
    },
    [logout]
  )

  React.useEffect(() => {
    api.resumen().then(setResumen).catch(onError)
  }, [onError])

  React.useEffect(() => {
    api
      .procesos(tipo === TODOS ? undefined : (tipo as TipoProceso))
      .then(setProcesos)
      .catch(onError)
  }, [tipo, onError])

  const filtro = (
    <Select value={tipo} onValueChange={(v) => setTipo(String(v))} items={OPCIONES}>
      <SelectTrigger size="sm" className="w-56" aria-label="Filtrar por proceso">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {OPCIONES.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <SectionCards resumen={resumen} />
      <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @5xl/main:grid-cols-2">
        <ChartInsumos historico={resumen?.historico ?? []} umbral={resumen?.variacion_alerta_pct ?? 30} />
        <ChartCalidad historico={resumen?.historico ?? []} />
      </div>
      <div className="px-4 lg:px-6">
        <ChartAreaInteractive porDia={resumen?.por_dia ?? []} />
      </div>
      <DataTable data={procesos} filtro={filtro} />
    </div>
  )
}
