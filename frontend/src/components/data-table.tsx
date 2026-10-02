import * as React from "react"
import {
  columnVisibilityFeature,
  createColumnHelper,
  createPaginatedRowModel,
  createSortedRowModel,
  FlexRender,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnVisibilityState,
  type SortingState,
} from "@tanstack/react-table"

import type { Proceso } from "@/lib/api"
import { NOMBRE_PROCESO, fmtDuracion, fmtNumero } from "@/lib/formato"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CircleCheckIcon, CircleXIcon, Loader2Icon, Columns3Icon, ChevronDownIcon, ChevronsLeftIcon, ChevronLeftIcon, ChevronRightIcon, ChevronsRightIcon } from "lucide-react"

const features = tableFeatures({
  columnVisibilityFeature,
  rowPaginationFeature,
  rowSortingFeature,
  paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(),
})

const columnHelper = createColumnHelper<typeof features, Proceso>()

const fmtFecha = (v: string) =>
  new Date(v).toLocaleString("es", { dateStyle: "short", timeStyle: "medium" })

const columns = columnHelper.columns([
  columnHelper.accessor("Inicio", {
    header: "Fecha",
    cell: ({ row }) => fmtFecha(row.original.Inicio),
    enableHiding: false,
  }),
  columnHelper.accessor("Tipo", {
    header: "Proceso",
    cell: ({ row }) => (
      <span className="font-medium">
        {NOMBRE_PROCESO[row.original.Tipo]}
        {row.original.Origen === "PROGRAMADO" && <span className="ml-1 text-xs text-muted-foreground">(prog.)</span>}
      </span>
    ),
  }),
  columnHelper.accessor("Usuario", { header: "Usuario" }),
  columnHelper.accessor("Estado", {
    header: "Estado",
    cell: ({ row }) => (
      <Badge variant="outline" className="px-1.5 text-muted-foreground" title={row.original.Error ?? undefined}>
        {row.original.Estado === "OK" ? (
          <CircleCheckIcon className="fill-green-500 dark:fill-green-400" />
        ) : row.original.Estado === "ERROR" ? (
          <CircleXIcon className="fill-red-500 dark:fill-red-400" />
        ) : (
          <Loader2Icon className="animate-spin" />
        )}
        {row.original.Estado === "EN_PROCESO" ? "En proceso" : row.original.Estado}
      </Badge>
    ),
  }),
  columnHelper.accessor("Filas", {
    header: () => <div className="w-full text-right">Filas</div>,
    cell: ({ row }) => (
      <div className="text-right tabular-nums">{fmtNumero(row.original.Filas)}</div>
    ),
  }),
  columnHelper.accessor("DuracionMs", {
    header: () => <div className="w-full text-right">Duración</div>,
    cell: ({ row }) => (
      <div className="text-right tabular-nums">{fmtDuracion(row.original.DuracionMs)}</div>
    ),
  }),
])

const COLUMN_LABELS: Record<string, string> = {
  Usuario: "Usuario",
  Estado: "Estado",
  Tipo: "Proceso",
  Filas: "Filas",
  DuracionMs: "Duración",
}

export function DataTable({ data, filtro }: { data: Proceso[]; filtro?: React.ReactNode }) {
  const [columnVisibility, setColumnVisibility] = React.useState<ColumnVisibilityState>({})
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 10 })

  const table = useTable({
    features,
    data,
    columns,
    state: { sorting, columnVisibility, pagination },
    getRowId: (row) => row.Id.toString(),
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
  })

  return (
    <div id="tour-historial" className="flex w-full flex-col gap-4 px-4 lg:px-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Historial de procesos</h2>
        <div className="flex items-center gap-2">
          {filtro}
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
              <Columns3Icon data-icon="inline-start" />
              Columnas
              <ChevronDownIcon data-icon="inline-end" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-32">
              {table
                .getAllColumns()
                .filter((column) => typeof column.accessorFn !== "undefined" && column.getCanHide())
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                  >
                    {COLUMN_LABELS[column.id] ?? column.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} colSpan={header.colSpan}>
                    {header.isPlaceholder ? null : <FlexRender header={header} />}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      <FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  Sin procesos registrados.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between px-4">
        <div className="hidden flex-1 text-sm text-muted-foreground lg:flex">
          {data.length} proceso(s)
        </div>
        <div className="flex w-full items-center gap-8 lg:w-fit">
          <div className="hidden items-center gap-2 lg:flex">
            <Label htmlFor="rows-per-page" className="text-sm font-medium">
              Filas por página
            </Label>
            <Select
              value={`${table.state.pagination.pageSize}`}
              onValueChange={(value) => table.setPageSize(Number(value))}
              items={[10, 20, 30, 40, 50].map((n) => ({ label: `${n}`, value: `${n}` }))}
            >
              <SelectTrigger size="sm" className="w-20" id="rows-per-page">
                <SelectValue placeholder={table.state.pagination.pageSize} />
              </SelectTrigger>
              <SelectContent side="top">
                <SelectGroup>
                  {[10, 20, 30, 40, 50].map((n) => (
                    <SelectItem key={n} value={`${n}`}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="flex w-fit items-center justify-center text-sm font-medium">
            Página {table.state.pagination.pageIndex + 1} de {Math.max(table.getPageCount(), 1)}
          </div>
          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            <Button variant="outline" className="hidden h-8 w-8 p-0 lg:flex" onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}>
              <span className="sr-only">Primera página</span>
              <ChevronsLeftIcon />
            </Button>
            <Button variant="outline" className="size-8" size="icon" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
              <span className="sr-only">Página anterior</span>
              <ChevronLeftIcon />
            </Button>
            <Button variant="outline" className="size-8" size="icon" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
              <span className="sr-only">Página siguiente</span>
              <ChevronRightIcon />
            </Button>
            <Button variant="outline" className="hidden size-8 lg:flex" size="icon" onClick={() => table.setPageIndex(table.getPageCount() - 1)} disabled={!table.getCanNextPage()}>
              <span className="sr-only">Última página</span>
              <ChevronsRightIcon />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
