// src/app/companies/page.tsx
'use client'; // This page requires client-side interactivity

import React, { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client'; // Your Supabase client
import { CompanyData } from '@/types'; // Your data types (ensure this path is correct)
import { DataTable } from './data-table'; // The table component
import { columns } from './columns'; // The column definitions
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; // Shadcn Alert for errors
import { Skeleton } from "@/components/ui/skeleton"; // Shadcn Skeleton for loading
import { Terminal } from "lucide-react"; // Icon for Alert

// Define the structure for the default objects more explicitly, matching CompanyData structure
const defaultFinancials: CompanyData['financials'] = { market_cap_value: null, market_cap_currency: null, cash_value: null, enterprise_value_value: null, debt_value: null };
const defaultMineralEstimates: CompanyData['mineral_estimates'] = { reserves_total_aueq_moz: null, resources_total_aueq_moz: null };
const defaultProduction: CompanyData['production'] = { current_production_total_aueq_koz: null };
const defaultCosts: CompanyData['costs'] = { aisc_last_year: null, aisc_last_year_currency: null };
const defaultValuationMetrics: CompanyData['valuation_metrics'] = { mkt_cap_per_resource_oz_all: null, ev_per_resource_oz_all: null };

// Define the columns we want to select from Supabase
// Include fields needed now and potentially for future filtering/scoring
const SELECT_QUERY = `
  company_id,
  tsx_code,
  company_name,
  status,
  headquarters,
  financials (
    market_cap_value,
    market_cap_currency,
    cash_value,
    cash_currency,
    enterprise_value_value,
    enterprise_value_currency,
    debt_value
  ),
  mineral_estimates (
    reserves_total_aueq_moz,
    resources_total_aueq_moz
  ),
  production (
    current_production_total_aueq_koz
  ),
  costs (
    aisc_last_year,
    aisc_last_year_currency
  ),
  valuation_metrics (
     mkt_cap_per_resource_oz_all,
     ev_per_resource_oz_all
  )
`;


export default function CompaniesPage() {
  const [rawData, setRawData] = useState<any[]>([]); // Store raw fetched data
  const [formattedData, setFormattedData] = useState<CompanyData[]>([]); // Store processed data for table
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  // Function to format the raw data fetched from Supabase
  // Applies the fix for nested arrays and ensures type consistency
  const formatFetchedData = useCallback((rawData: any[]): CompanyData[] => {
    return rawData?.map((company): CompanyData => {
        // Access the first element of related arrays, or use default object
        const financialsData = company.financials?.[0];
        const mineralEstimatesData = company.mineral_estimates?.[0];
        const productionData = company.production?.[0];
        const costsData = company.costs?.[0];
        const valuationMetricsData = company.valuation_metrics?.[0];

        return {
          // Spread base company fields
          company_id: company.company_id,
          tsx_code: company.tsx_code,
          company_name: company.company_name,
          status: company.status,
          headquarters: company.headquarters,

          // Assign processed nested data or defaults
          financials: financialsData ? {
            market_cap_value: financialsData.market_cap_value ?? null,
            market_cap_currency: financialsData.market_cap_currency ?? null,
            cash_value: financialsData.cash_value ?? null,
            cash_currency: financialsData.cash_currency ?? null, // Ensure field exists if selected
            enterprise_value_value: financialsData.enterprise_value_value ?? null,
            enterprise_value_currency: financialsData.enterprise_value_currency ?? null, // Ensure field exists
            debt_value: financialsData.debt_value ?? null, // Ensure field exists
          } : defaultFinancials,

          mineral_estimates: mineralEstimatesData ? {
             reserves_total_aueq_moz: mineralEstimatesData.reserves_total_aueq_moz ?? null,
             resources_total_aueq_moz: mineralEstimatesData.resources_total_aueq_moz ?? null,
          } : defaultMineralEstimates,

          production: productionData ? {
              current_production_total_aueq_koz: productionData.current_production_total_aueq_koz ?? null,
          } : defaultProduction,

          costs: costsData ? {
             aisc_last_year: costsData.aisc_last_year ?? null,
             aisc_last_year_currency: costsData.aisc_last_year_currency ?? null,
          } : defaultCosts,

          valuation_metrics: valuationMetricsData ? {
              mkt_cap_per_resource_oz_all: valuationMetricsData.mkt_cap_per_resource_oz_all ?? null,
              ev_per_resource_oz_all: valuationMetricsData.ev_per_resource_oz_all ?? null,
          } : defaultValuationMetrics,
        };
    }) || [];
  }, []); // Empty dependency array as format logic doesn't depend on external state/props

  // Fetch data on component mount
  useEffect(() => {
    const fetchCompanies = async () => {
      setIsLoading(true);
      setError(null);
      setRawData([]); // Clear previous raw data
      setFormattedData([]); // Clear previous formatted data

      try {
        const { data: companiesData, error: fetchError } = await supabase
          .from('companies')
          .select(SELECT_QUERY) // Use the defined query string
          .order('company_name', { ascending: true });

        if (fetchError) {
          // Throw error to be caught by the catch block
          throw fetchError;
        }

        if (companiesData) {
          setRawData(companiesData); // Store raw data
          const processedData = formatFetchedData(companiesData); // Format the data
          setFormattedData(processedData); // Set formatted data for the table

          // --- DEBUGGING LOG (Confirm structure AFTER formatting fix) ---
           if (processedData.length > 0) {
               console.log("Formatted Data Check (First Row - Post-Formatting):", JSON.stringify(processedData[0], null, 2));
           } else {
               console.log("No data available after formatting.");
           }
          // --- END DEBUGGING LOG ---

        } else {
          console.log("No company data received from Supabase.");
          setFormattedData([]); // Ensure empty array if no data
        }

      } catch (err: any) {
        console.error('Error fetching or processing company data:', err);
        setError(`Failed to load company data. ${err.message || 'Unknown error'}. See console.`);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCompanies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, formatFetchedData]); // Include formatFetchedData (stable due to useCallback)

  // Render Skeleton Loading state
  const renderLoadingSkeleton = () => (
      <div className="space-y-4">
          {/* Skeleton for Toolbar */}
          <div className="flex items-center py-4 gap-2">
              <Skeleton className="h-9 w-[250px]" />
              <Skeleton className="h-9 w-[100px] ml-auto" />
          </div>
          {/* Skeleton for Table */}
          <div className="rounded-md border">
              <Skeleton className="h-12 w-full" /> {/* Header */}
              {[...Array(10)].map((_, i) => ( // Show 10 skeleton rows
                  <Skeleton key={i} className="h-12 w-full" />
              ))}
          </div>
      </div>
  );

  return (
    <div className="w-full p-4 md:p-6"> {/* Added padding */}
      <h1 className="text-2xl md:text-3xl font-bold mb-6">Mining Companies</h1>

      {/* Display Loading Skeleton, Error Alert, or Data Table */}
      {isLoading ? (
          renderLoadingSkeleton()
       ) : error ? (
          <Alert variant="destructive">
              <Terminal className="h-4 w-4" />
              <AlertTitle>Error Loading Data</AlertTitle>
              <AlertDescription>
                {error}
              </AlertDescription>
          </Alert>
       ) : (
         // Pass the correctly formatted data to the table
         <DataTable columns={columns} data={formattedData} />
       )}
    </div>
  );
}