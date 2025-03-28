// src/app/companies/data-table.tsx
'use client';

import React, { useState, useRef, useMemo, useEffect } from 'react'; // Added useEffect
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel, // Keep for potential future use
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  useReactTable,
  Row,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Settings2 } from 'lucide-react';
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
}

export function DataTable<TData, TValue>({
  columns,
  data,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    headquarters: false, // Keep headquarters hidden initially
    // Add other columns to hide by default if desired
  });
  const [rowSelection, setRowSelection] = useState({});

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
    // getPaginationRowModel: getPaginationRowModel(), // Keep commented out while using full virtual scroll
  });

  // --- Virtualization Setup ---
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const { rows } = table.getRowModel();

  // ---> IMPORTANT: VERIFY THIS ESTIMATE <---
  // Inspect a rendered table row (<tr>) in dev tools and set this accurately
  const estimatedRowHeight = 60; // Example: Adjust this based on your inspection!

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => estimatedRowHeight, // Use the variable
    overscan: 10,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();

  const paddingTop = virtualRows.length > 0 ? virtualRows?.[0]?.start || 0 : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? rowVirtualizer.getTotalSize() -
        (virtualRows?.[virtualRows.length - 1]?.end || 0)
      : 0;
  // --- End Virtualization Setup ---

  return (
    <div>
      {/* --- Toolbar --- */}
      <div className="flex items-center py-4 gap-2">
        <Input
          placeholder="Filter companies..."
          value={(table.getColumn('company_name')?.getFilterValue() as string) ?? ''}
          onChange={(event) =>
            table.getColumn('company_name')?.setFilterValue(event.target.value)
          }
          className="max-w-sm h-9" // Adjusted height
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="ml-auto h-9"> {/* Adjusted height */}
              <Settings2 className="mr-2 h-4 w-4" /> Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
           <DropdownMenuLabel>Toggle Columns</DropdownMenuLabel>
           <DropdownMenuSeparator />
            {table
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => {
                return (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                  >
                    {/* Improved Label Generation */}
                    {column.id.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()).replace(/\./g, ' - ')}
                  </DropdownMenuCheckboxItem>
                );
              })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* --- Table Container with Virtual Scroll --- */}
       <ScrollArea
        ref={tableContainerRef}
        className="rounded-md border h-[70vh]" // Fixed height is essential
        style={{ overflowY: 'auto' }}
      >
        {/* Use getTotalSize() for accurate width calculation if columns have varying sizes */}
        <Table style={{ width: table.getTotalSize() }}>
          <TableHeader
            // Sticky header styling
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 1,
              // Use Shadcn theme variable for background
              backgroundColor: 'hsl(var(--background))'
             }}
          >
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                     key={header.id}
                     style={{
                       width: header.getSize(), // Use defined column size
                       // Sticky column styling (adjust IDs if needed)
                       position: (header.column.id === 'select' || header.column.id === 'actions') ? 'sticky' : undefined,
                       left: header.column.id === 'select' ? 0 : undefined,
                       right: header.column.id === 'actions' ? 0 : undefined,
                       zIndex: (header.column.id === 'select' || header.column.id === 'actions') ? 2 : 1,
                       backgroundColor: 'inherit', // Ensures sticky header matches row bg
                      }}
                      colSpan={header.colSpan}
                    >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody
             // Styling for virtualizer positioning context
             style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                position: 'relative',
              }}
          >
            {/* Top padding */}
            {paddingTop > 0 && (
              <TableRow style={{ height: `${paddingTop}px` }}>
                <TableCell colSpan={columns.length} />
              </TableRow>
            )}

            {/* Render only virtual rows */}
            {virtualRows.map((virtualRow) => {
              const row = rows[virtualRow.index] as Row<TData>;
              return (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  // Apply hover and zebra striping from Shadcn table styles
                  className="hover:bg-muted/50 data-[state=selected]:bg-muted"
                   style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                       style={{
                         width: cell.column.getSize(),
                         // REMOVED display:flex - Cells should behave like normal table cells
                         // Sticky column styling for cells
                         position: (cell.column.id === 'select' || cell.column.id === 'actions') ? 'sticky' : undefined,
                         left: cell.column.id === 'select' ? 0 : undefined,
                         right: cell.column.id === 'actions' ? 0 : undefined,
                         zIndex: (cell.column.id === 'select' || cell.column.id === 'actions') ? 1 : 0,
                         backgroundColor: 'inherit', // Ensure sticky cells match row background
                        }}
                        // Add padding class directly for consistency if needed, or handle in column def
                        // className="p-2" // Example padding
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}

             {/* Bottom padding */}
            {paddingBottom > 0 && (
              <TableRow style={{ height: `${paddingBottom}px` }}>
                 <TableCell colSpan={columns.length} />
              </TableRow>
            )}
          </TableBody>
        </Table>
        <ScrollBar orientation="horizontal" />
       </ScrollArea>
    </div>
  );
}