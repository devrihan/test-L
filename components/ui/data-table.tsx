import * as React from "react"

import { cn } from "../../lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table"

type DataTableColumn<TData> = {
  key: keyof TData | string
  header: React.ReactNode
  cell?: (row: TData) => React.ReactNode
  className?: string
}

function DataTable<TData extends Record<string, unknown>>({
  columns,
  data,
  emptyMessage = "No results.",
  className,
}: {
  columns: DataTableColumn<TData>[]
  data: TData[]
  emptyMessage?: React.ReactNode
  className?: string
}) {
  return (
    <div data-slot="data-table" className={cn("rounded-md border", className)}>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={String(column.key)} className={column.className}>
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length ? (
            data.map((row, rowIndex) => (
              <TableRow key={rowIndex}>
                {columns.map((column) => (
                  <TableCell key={String(column.key)} className={column.className}>
                    {column.cell
                      ? column.cell(row)
                      : (row[column.key as keyof TData] as React.ReactNode)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}

export { DataTable, type DataTableColumn }
