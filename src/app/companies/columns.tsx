// src/app/companies/columns.tsx
'use client';

import { ColumnDef } from '@tanstack/react-table';
import { ArrowUpDown, MoreHorizontal } from 'lucide-react'; // Icons

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from "@/components/ui/badge"; // For Status

import { CompanyData } from '@/types'; // Your data types (ensure path is correct)
// Ensure utils path is correct and functions exist
import { formatNumber, formatCurrency } from '@/lib/utils';

// Helper function to create a sortable header
const createSortableHeader = (label: string): ColumnDef<CompanyData>['header'] =>
  ({ column }) => {
    return (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        className="-ml-4 h-8 data-[state=open]:bg-accent" // Shadcn table header button style
      >
        <span>{label}</span>
        <ArrowUpDown className="ml-2 h-3 w-3" />
      </Button>
    );
  };

// Helper function for formatting numbers in cells
const formatNumericCell = (accessorFn: (row: CompanyData) => number | null | undefined, decimals = 0): ColumnDef<CompanyData>['cell'] =>
  ({ row }) => {
    const value = accessorFn(row.original);
     // --- DEBUG LOG (Remove later) ---
     // if (accessorFn.toString().includes('resources_total_aueq_moz')) { // Example specific log
     //    console.log(`Res Moz for ${row.original.company_name}: ${value}`);
     // }
     // --- END DEBUG LOG ---
    return <div className="text-right tabular-nums pr-2">{formatNumber(value, decimals)}</div>; // Added padding-right
  };

// Helper function for formatting currency in cells
const formatCurrencyCell = (
   valueAccessor: (row: CompanyData) => number | null | undefined,
   currencyAccessor: (row: CompanyData) => string | null | undefined,
   defaultCurrency = 'USD'
): ColumnDef<CompanyData>['cell'] =>
  ({ row }) => {
    const value = valueAccessor(row.original);
    const currencyCode = currencyAccessor(row.original) || defaultCurrency;
    const displayCurrency = currencyCode?.toUpperCase() || 'USD';
     // --- DEBUG LOG (Remove later) ---
     // if (valueAccessor.toString().includes('market_cap_value')) { // Example specific log
     //    console.log(`Mkt Cap for ${row.original.company_name}: ${value} ${displayCurrency}`);
     // }
     // --- END DEBUG LOG ---
    return <div className="text-right tabular-nums pr-2">{formatCurrency(value, displayCurrency)}</div>; // Added padding-right
  };


// Define the columns for your table
export const columns: ColumnDef<CompanyData>[] = [
  // --- Selection Column ---
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && 'indeterminate')
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
        className="translate-y-[2px]"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
        className="translate-y-[2px]"
      />
    ),
    enableSorting: false,
    enableHiding: false,
    size: 40, // Fixed small size
  },

  // --- Company Info ---
  {
    accessorKey: 'company_name',
    header: createSortableHeader('Company Name'),
    cell: ({ row }) => <div className="font-medium pl-1">{row.getValue('company_name')}</div>, // Added padding-left
    size: 250,
  },
  {
    accessorKey: 'tsx_code',
    header: createSortableHeader('Ticker'),
    cell: ({ row }) => <div className="uppercase pl-1">{row.getValue('tsx_code')}</div>, // Added padding-left
    size: 100,
  },
   {
    accessorKey: 'status',
    header: createSortableHeader('Status'),
    cell: ({ row }) => {
      const status = row.getValue('status') as string | null;
      if (!status) return <div className="pl-1">-</div>;
      let variant: "default" | "secondary" | "destructive" | "outline" = "secondary";
      if (status.toLowerCase() === 'producer') variant = "default";
      if (status.toLowerCase() === 'developer') variant = "outline";
      // Add more status types if needed
      return <div className="pl-1"><Badge variant={variant} className="capitalize">{status}</Badge></div>; // Added padding-left
    },
    size: 120,
  },
   {
    accessorKey: 'headquarters', // Example hidden by default
    header: createSortableHeader('Headquarters'),
    cell: ({ row }) => <div className="pl-1">{row.getValue('headquarters') ?? '-'}</div>,
    size: 180,
  },


  // --- Financials ---
  {
    accessorKey: 'financials.market_cap_value',
    header: createSortableHeader('Market Cap'),
    cell: formatCurrencyCell(
      (row) => row.financials?.market_cap_value,
      (row) => row.financials?.market_cap_currency,
      'CAD'
    ),
    size: 150,
  },
   {
    accessorKey: 'financials.cash_value',
    header: createSortableHeader('Cash'),
     cell: formatCurrencyCell(
       (row) => row.financials?.cash_value,
       (row) => row.financials?.market_cap_currency, // Assuming currency match - VERIFY
       'CAD'
    ),
    size: 150,
  },
   {
    accessorKey: 'financials.enterprise_value_value',
    header: createSortableHeader('Enterprise Value'),
     cell: formatCurrencyCell(
       (row) => row.financials?.enterprise_value_value,
       (row) => row.financials?.market_cap_currency, // Assuming currency match - VERIFY
       'CAD'
    ),
    size: 150,
  },


  // --- Mineral Estimates ---
  {
    accessorKey: 'mineral_estimates.resources_total_aueq_moz',
    header: createSortableHeader('Total Resources (Moz AuEq)'),
    cell: formatNumericCell((row) => row.mineral_estimates?.resources_total_aueq_moz, 2),
    size: 200,
  },
   {
    accessorKey: 'mineral_estimates.reserves_total_aueq_moz',
    header: createSortableHeader('Total Reserves (Moz AuEq)'),
    cell: formatNumericCell((row) => row.mineral_estimates?.reserves_total_aueq_moz, 2),
    size: 200,
  },


   // --- Production & Costs ---
   {
    accessorKey: 'production.current_production_total_aueq_koz',
    header: createSortableHeader('Production (koz AuEq)'),
    cell: formatNumericCell((row) => row.production?.current_production_total_aueq_koz, 0),
    size: 180,
  },
  {
    accessorKey: 'costs.aisc_last_year',
    header: createSortableHeader('AISC (Last Yr)'),
     cell: formatCurrencyCell(
       (row) => row.costs?.aisc_last_year,
       (row) => row.costs?.aisc_last_year_currency,
       'USD'
    ),
    size: 150,
  },

  // --- Valuation ---
   {
    accessorKey: 'valuation_metrics.mkt_cap_per_resource_oz_all',
    header: createSortableHeader('Mkt Cap / Res Oz'), // Shortened header
    cell: formatCurrencyCell(
       (row) => row.valuation_metrics?.mkt_cap_per_resource_oz_all,
       () => 'USD',
       'USD'
    ),
    size: 160, // Adjusted size
  },
  {
    accessorKey: 'valuation_metrics.ev_per_resource_oz_all',
    header: createSortableHeader('EV / Res Oz'), // Shortened header
     cell: formatCurrencyCell(
       (row) => row.valuation_metrics?.ev_per_resource_oz_all,
       () => 'USD',
       'USD'
    ),
    size: 160, // Adjusted size
  },

  // --- Actions Column ---
  {
    id: 'actions',
    cell: ({ row }) => {
      const company = row.original;
      return (
        <div className="flex justify-center"> {/* Center the button */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <span className="sr-only">Open menu</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => navigator.clipboard.writeText(company.company_id.toString())}
                >
                  Copy Company ID
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {/* Update later with actual link/modal */}
                <DropdownMenuItem onClick={() => alert(`Viewing details for ${company.company_name}`)}>
                    View details
                 </DropdownMenuItem>
                <DropdownMenuItem onClick={() => alert(`Saving ${company.company_name}`)}>
                    Save company
                 </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
         </div>
      );
    },
    enableSorting: false,
    enableHiding: false,
    size: 60, // Fixed small size
  },
];