import * as React from "react"
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts"

import type { Historico } from "@/lib/api"
import { fmtNumero, nombrePeriodo, periodoCorto } from "@/lib/formato"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

type Serie = "bajas" | "cambio_tec" | "mora"

const SERIES: { valor: Serie; label: string; corto: string }[] = [
  { valor: "bajas", label: "Bajas", corto: "Bajas" },
  { valor: "cambio_tec", label: "Cambio de tecnología", corto: "Cambio tec." },
  { valor: "mora", label: "Mora", corto: "Mora" },
]

// Ámbar de Tailwind (el mismo tono que la insignia de Advertencia); los tokens --chart-* son grises
const COLOR_ALERTA = "oklch(0.769 0.188 70.08)"

const chartConfig = {
  filas: { label: "Filas", color: "var(--primary)" },
} satisfies ChartConfig

type Punto = { periodo: string; filas: number | null; variacion: number | null; alerta: boolean }

const puntos = (historico: Historico[], serie: Serie): Punto[] =>
  historico.map((h) => ({
    periodo: h.periodo,
    filas: h[serie],
    variacion: h[`${serie}_variacion`],
    alerta: h[`${serie}_alerta`],
  }))

export function ChartInsumos({ historico, umbral }: { historico: Historico[]; umbral: number }) {
  const [serie, setSerie] = React.useState<Serie>("bajas")
  const datos = puntos(historico, serie)
  const hayDatos = datos.some((d) => d.filas != null)
  const nombre = SERIES.find((s) => s.valor === serie)!.label

  return (
    <Card id="tour-chart-insumos" className="@container/card">
      <CardHeader>
        <CardTitle>Insumos por periodo</CardTitle>
        <CardDescription>
          Filas de {nombre} en cada periodo.{" "}
          {serie === "mora"
            ? `En ámbar, variación mayor a ${umbral}% respecto a la mora anterior.`
            : "En ámbar, los que quedaron en Advertencia al validarse."}
        </CardDescription>
        <CardAction>
          <ToggleGroup
            multiple={false}
            value={[serie]}
            onValueChange={(v) => v[0] && setSerie(v[0] as Serie)}
            variant="outline"
            size="sm"
          >
            {SERIES.map((s) => (
              <ToggleGroupItem key={s.valor} value={s.valor} aria-label={s.label}>
                {s.corto}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        {hayDatos ? (
          <ChartContainer config={chartConfig} className="aspect-auto h-[250px] w-full">
            <BarChart data={datos} margin={{ left: 4, right: 4 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="periodo" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={periodoCorto} />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={(v: number) => v.toLocaleString("es", { notation: "compact" })}
              />
              <ChartTooltip
                cursor={false}
                content={({ active, payload }) => {
                  const p = payload?.[0]?.payload as Punto | undefined
                  if (!active || !p) return null
                  return (
                    <div className="grid gap-1 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl">
                      <div className="font-medium">{nombrePeriodo(p.periodo)}</div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">{nombre}</span>
                        <span className="font-mono tabular-nums">{p.filas == null ? "Sin dato" : fmtNumero(p.filas)}</span>
                      </div>
                      {p.variacion != null && (
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">Variación</span>
                          <span className="font-mono tabular-nums" style={p.alerta ? { color: COLOR_ALERTA } : undefined}>
                            {p.variacion > 0 ? "+" : ""}
                            {p.variacion.toFixed(1)}%
                          </span>
                        </div>
                      )}
                    </div>
                  )
                }}
              />
              <Bar dataKey="filas" radius={4}>
                {datos.map((d) => (
                  <Cell key={d.periodo} fill={d.alerta ? COLOR_ALERTA : "var(--color-filas)"} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        ) : (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Aún no hay periodos con {nombre} registrados.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
