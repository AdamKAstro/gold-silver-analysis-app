// src/types/index.ts

export type CompanyFinancials = {
  market_cap_value: number | null;
  market_cap_currency: string | null;
  cash_value: number | null;
  enterprise_value_value: number | null;
  // Add ALL other financials fields you select in page.tsx
};

export type CompanyMineralEstimates = {
  reserves_total_aueq_moz: number | null;
  resources_total_aueq_moz: number | null;
  // Add ALL other estimates fields you select in page.tsx
};

export type CompanyProduction = {
  current_production_total_aueq_koz: number | null;
  // Add ALL other production fields you select in page.tsx
}

export type CompanyCosts = {
   aisc_last_year: number | null;
   aisc_last_year_currency: string | null;
   // Add ALL other costs fields you select in page.tsx
}

export type ValuationMetrics = {
    mkt_cap_per_resource_oz_all: number | null;
    ev_per_resource_oz_all: number | null;
    // Add ALL other valuation fields you select in page.tsx
}


// Main Company Type combining data
export type CompanyData = {
  company_id: number;
  tsx_code: string;
  company_name: string;
  status: string | null;
  headquarters: string | null;
  // Add ALL other company fields you select in page.tsx

  // Ensure these match the keys used in the .select() string in page.tsx
  financials: CompanyFinancials | null;
  mineral_estimates: CompanyMineralEstimates | null;
  production: CompanyProduction | null;
  costs: CompanyCosts | null;
  valuation_metrics: ValuationMetrics | null;

  score?: number; // For personalized ranking later
};