import * as React from "react"
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"

import type { Resumen } from "@/lib/api"
import { useIsMobile } from "@/hooks/use-mobile"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"

const chartConfig = {
  ok: {
    label: "Exitosas",
    color: "var(--primary)",
  },
  error: {
    label: "Con error",
    color: "var(--destructive)",
  },
} satisfies ChartConfig

// Rellena con ceros los días sin ejecuciones para que el área sea continua
function completarDias(porDia: Resumen["por_dia"], dias: number) {
  const mapa = new Map(porDia.map((d) => [d.fecha, d]))
  const hoy = new Date()
  return Array.from({ length: dias + 1 }, (_, i) => {
    const d = new Date(hoy)
    d.setDate(hoy.getDate() - (dias - i))
    const fecha = d.toLocaleDateString("en-CA") // YYYY-MM-DD local
    return mapa.get(fecha) ?? { fecha, ok: 0, error: 0 }
  })
}

const fmtDia = (value: string) =>
  new Date(value + "T00:00:00").toLocaleDateString("es", { month: "short", day: "numeric" })

export function ChartAreaInteractive({ porDia }: { porDia: Resumen["por_dia"] }) {
  const isMobile = useIsMobile()
  const [timeRange, setTimeRange] = React.useState("90d")

  React.useEffect(() => {
    if (isMobile) {
      setTimeRange("7d")
    }
  }, [isMobile])

  const filteredData = completarDias(porDia, timeRange === "30d" ? 30 : timeRange === "7d" ? 7 : 90)

  return (
    <Card id="tour-chart" className="@container/card">
      <CardHeader>
        <CardTitle>Procesos por día</CardTitle>
        <CardDescription>
          <span className="hidden @[540px]/card:block">
            Exitosas y con error en el periodo
          </span>
          <span className="@[540px]/card:hidden">Últimos 3 meses</span>
        </CardDescription>
        <CardAction>
          <ToggleGroup
            multiple={false}
            value={timeRange ? [timeRange] : []}
            onValueChange={(value) => {
              setTimeRange(value[0] ?? "90d")
            }}
            variant="outline"
            className="hidden *:data-[slot=toggle-group-item]:px-4! @[767px]/card:flex"
          >
            <ToggleGroupItem value="90d">Últimos 3 meses</ToggleGroupItem>
            <ToggleGroupItem value="30d">Últimos 30 días</ToggleGroupItem>
            <ToggleGroupItem value="7d">Últimos 7 días</ToggleGroupItem>
          </ToggleGroup>
          <Select
            value={timeRange}
            onValueChange={(value) => {
              if (value !== null) {
                setTimeRange(value)
              }
            }}
          >
            <SelectTrigger
              className="flex w-40 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate @[767px]/card:hidden"
              size="sm"
              aria-label="Select a value"
            >
              <SelectValue placeholder="Últimos 3 meses" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="90d" className="rounded-lg">
                Últimos 3 meses
              </SelectItem>
              <SelectItem value="30d" className="rounded-lg">
                Últimos 30 días
              </SelectItem>
              <SelectItem value="7d" className="rounded-lg">
                Últimos 7 días
              </SelectItem>
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-[250px] w-full"
        >
          <AreaChart data={filteredData}>
            <defs>
              <linearGradient id="fillOk" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-ok)"
                  stopOpacity={1.0}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-ok)"
                  stopOpacity={0.1}
                />
              </linearGradient>
              <linearGradient id="fillError" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-error)"
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-error)"
                  stopOpacity={0.1}
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="fecha"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={fmtDia}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(value) => fmtDia(String(value))}
                  indicator="dot"
                />
              }
            />
            <Area
              dataKey="error"
              type="natural"
              fill="url(#fillError)"
              stroke="var(--color-error)"
              stackId="a"
            />
            <Area
              dataKey="ok"
              type="natural"
              fill="url(#fillOk)"
              stroke="var(--color-ok)"
              stackId="a"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
