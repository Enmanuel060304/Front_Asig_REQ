import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import type { Historico } from "@/lib/api"
import { fmtNumero, nombrePeriodo, periodoCorto } from "@/lib/formato"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart"

const chartConfig = {
  pct: { label: "Asignados a mano", color: "var(--primary)" },
} satisfies ChartConfig

type Punto = { periodo: string; pct: number | null; manuales: number; equipos: number | null }

export function ChartCalidad({ historico }: { historico: Historico[] }) {
  // Solo cuenta con asignación generada: sin total no hay porcentaje
  const datos: Punto[] = historico.map((h) => ({
    periodo: h.periodo,
    manuales: h.manuales ?? 0,
    equipos: h.equipos,
    pct: h.equipos ? ((h.manuales ?? 0) / h.equipos) * 100 : null,
  }))
  const hayDatos = datos.some((d) => d.pct != null)

  return (
    <Card id="tour-chart-calidad" className="@container/card">
      <CardHeader>
        <CardTitle>Equipos asignados a mano</CardTitle>
        <CardDescription>
          % de equipos que el SP dejó sin agencia (datos que no cuadran) y se asignaron a mano. Menos es mejor.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        {hayDatos ? (
          <ChartContainer config={chartConfig} className="aspect-auto h-[250px] w-full">
            <BarChart data={datos} margin={{ left: 4, right: 4 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="periodo" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={periodoCorto} />
              <YAxis tickLine={false} axisLine={false} width={40} tickFormatter={(v: number) => `${v}%`} />
              <ChartTooltip
                cursor={false}
                content={({ active, payload }) => {
                  const p = payload?.[0]?.payload as Punto | undefined
                  if (!active || !p) return null
                  return (
                    <div className="grid gap-1 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl">
                      <div className="font-medium">{nombrePeriodo(p.periodo)}</div>
                      {p.pct == null ? (
                        <span className="text-muted-foreground">Sin asignación generada</span>
                      ) : (
                        <>
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Asignados a mano</span>
                            <span className="font-mono tabular-nums">{p.pct.toFixed(1)}%</span>
                          </div>
                          <span className="text-muted-foreground">
                            {fmtNumero(p.manuales)} de {fmtNumero(p.equipos)} equipos
                          </span>
                        </>
                      )}
                    </div>
                  )
                }}
              />
              <Bar dataKey="pct" fill="var(--color-pct)" radius={4} />
            </BarChart>
          </ChartContainer>
        ) : (
          <p className="py-16 text-center text-sm text-muted-foreground">Aún no hay asignaciones generadas.</p>
        )}
      </CardContent>
    </Card>
  )
}
