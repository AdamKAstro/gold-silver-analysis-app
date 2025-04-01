import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Home, Table2, ZoomIn, ZoomOut, RotateCcw, Settings } from 'lucide-react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelProps // Import LabelProps for custom label component typing
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../../components/ui/button';
import { MetricSelector } from '../../components/metric-selector';
import { TierSelector } from '../../components/tier-selector';
import { LoadingIndicator } from '../../components/ui/loading-indicator';
import { useSubscription } from '../../contexts/subscription-context';
import { useCurrency } from '../../contexts/currency-context';
import { cn, formatNumber, formatCurrency, formatPercent, formatMoz, formatKoz } from '../../lib/utils';
import { metrics, getMetricByKey, getAccessibleMetrics } from '../../lib/metric-types';
import { getCompaniesForScatterChart } from '../../lib/supabase';
import { createLabelSimulation } from '../../lib/force-simulation'; // Assuming this exists and works
import type { Company, ColumnTier, MetricConfig } from '../../lib/types';

// Interface for data points within the chart
interface ScatterPoint {
  x: number;
  y: number;
  z: number;
  normalizedZ: number; // Value between 0 and 1 for bubble size scaling
  company: Company;
}

// Interface for label positioning data used by the simulation
interface LabelPosition {
  id: string; // Usually the company ticker symbol
  x: number; // Current x position (updated by simulation)
  y: number; // Current y position (updated by simulation)
  width: number; // Calculated width of the label
  height: number; // Calculated height of the label
  density: number; // Calculated density (optional, used by some simulation logic)
}

// Interface for configurable tolerance/settings values
interface ToleranceSettings {
  labelCollisionRadius: number; // Radius for label collision detection in simulation
  labelForceStrength: number; // Strength of the repulsion force between labels
  labelYOffset: number; // Initial vertical offset for labels from their data point
  labelDensityThreshold: number; // Density threshold for showing labels (if implemented)
  labelSimulationIterations: number; // Number of iterations for the force simulation
  xAxisTitleOffset: number; // Offset of the X-axis title from the axis line
  yAxisTitleOffset: number; // Offset of the Y-axis title from the axis line
  chartMarginTop: number; // Top margin for the chart container
  chartMarginRight: number; // Right margin
  chartMarginBottom: number; // Bottom margin (needs space for X-axis title)
  chartMarginLeft: number; // Left margin (needs space for Y-axis title)
}

// Default values for the tolerance settings
const defaultTolerances: ToleranceSettings = {
  labelCollisionRadius: 1.5, // Increased slightly
  labelForceStrength: 0.8, // Slightly reduced
  labelYOffset: 5, // Default offset upwards
  labelDensityThreshold: 5, // Example threshold
  labelSimulationIterations: 250, // Reduced iterations for performance
  xAxisTitleOffset: 40, // Distance below X-axis line
  yAxisTitleOffset: 55, // Distance left of Y-axis line
  chartMarginTop: 20,
  chartMarginRight: 30, // Increased slightly for labels near edge
  chartMarginBottom: 70, // Make space for X-axis label + ticks
  chartMarginLeft: 80   // Make space for Y-axis label + ticks
};

// Helper function (if needed by simulation or label placement logic)
function calculateDensity(point: { x: number, y: number }, allPoints: Array<{ x: number, y: number }>, radius: number): number {
  let count = 0;
  for (const p of allPoints) {
      const dx = p.x - point.x;
      const dy = p.y - point.y;
      if (dx * dx + dy * dy < radius * radius) {
          count++;
      }
  }
  // Subtract 1 because the point itself is included
  return count > 0 ? count -1 : 0;
}

// Helper function to check for label overlap (basic AABB check)
function doLabelsOverlap(a: LabelPosition, b: LabelPosition, padding = 3): boolean {
  return !(
    a.x + a.width / 2 + padding < b.x - b.width / 2 || // a right < b left
    b.x + b.width / 2 + padding < a.x - a.width / 2 || // b right < a left
    a.y + a.height / 2 + padding < b.y - b.height / 2 || // a bottom < b top
    b.y + b.height / 2 + padding < a.y - a.height / 2    // b bottom < a top
  );
}

// Helper function - potentially used for finding initial non-overlapping positions (simplified approach)
function findBestLabelPosition(
  baseX: number,
  baseY: number,
  label: string,
  existingLabels: LabelPosition[],
  fontSize: number = 10,
  padding: number = 5
): { x: number; y: number } | null {
  const labelWidth = label.length * fontSize * 0.6; // Approximation
  const labelHeight = fontSize + 4;

  // Possible offsets from the base point (data point)
  const potentialOffsets = [
    { dx: 0, dy: -15 }, // Top
    { dx: 15, dy: 0 },   // Right
    { dx: 0, dy: 15 },  // Bottom
    { dx: -15, dy: 0 }, // Left
    { dx: 12, dy: -12 }, // Top-right
    { dx: 12, dy: 12 },  // Bottom-right
    { dx: -12, dy: 12 }, // Bottom-left
    { dx: -12, dy: -12 }, // Top-left
    { dx: 0, dy: -25 }, // Further Top
    { dx: 25, dy: 0 },   // Further Right
    { dx: 0, dy: 25 },  // Further Bottom
    { dx: -25, dy: 0 }  // Further Left
  ];

  for (const offset of potentialOffsets) {
    const potentialX = baseX + offset.dx;
    const potentialY = baseY + offset.dy;

    const newLabelRect: LabelPosition = {
      id: label, // Temporary ID for overlap check
      x: potentialX, // Center X
      y: potentialY, // Center Y
      width: labelWidth,
      height: labelHeight,
      density: 0, // Not used in this simple check
    };

    let overlaps = false;
    for (const existing of existingLabels) {
      if (doLabelsOverlap(existing, newLabelRect, padding)) {
        overlaps = true;
        break;
      }
    }

    if (!overlaps) {
      return { x: potentialX, y: potentialY }; // Return the center position
    }
  }

  return null; // No non-overlapping position found nearby
}

// Helper function to format numerical values based on metric type
function formatValue(value: number | null | undefined, format: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';

  // Simple rounding for display - adjust logic as needed
  const roundForDisplay = (num: number, decimals = 2): number => {
       if (Math.abs(num) < 1) return parseFloat(num.toPrecision(2)); // Use precision for small numbers
       if (Math.abs(num) > 1000) return Math.round(num); // Round large numbers
       return parseFloat(num.toFixed(decimals)); // Default to fixed decimals
   };

  const roundedValue = roundForDisplay(value);

  switch (format) {
    case 'currency':
      return formatCurrency(roundedValue); // Assumes formatCurrency handles rounding/formatting well
    case 'percent':
      return formatPercent(value); // formatPercent might expect the original value (e.g., 0.1 not 10)
    case 'moz':
      return formatMoz(roundedValue); // Assumes formatMoz handles rounding/formatting
    case 'koz':
      return formatKoz(roundedValue); // Assumes formatKoz handles rounding/formatting
    default: // 'number' or unspecified
      return formatNumber(roundedValue, { decimals: Math.abs(roundedValue) < 10 ? 2 : 0 }); // Fewer decimals for larger numbers
  }
}

// Helper function to safely access nested properties
function getNestedValue(obj: any, path: string): any {
  if (!path || !obj) return null;
  return path.split('.').reduce((o, i) => (o && typeof o === 'object' && i in o) ? o[i] : null, obj);
}

// Normalizes an array of numbers to a 0-1 range, supporting linear or log scaling
function normalizeValues(values: number[], scale: 'linear' | 'log'): number[] {
  if (values.length === 0) return [];

  const finiteValues = values.filter(v => Number.isFinite(v));
  if (finiteValues.length === 0) return values.map(() => 0.5); // Default if no finite values

  if (scale === 'log') {
    const positiveValues = finiteValues.filter(v => v > 0);
    if (positiveValues.length === 0) {
      // Handle case where there are finite values, but none are positive
      // Map all non-positive to 0, others relative to something? Or just return 0.5?
      return values.map(v => (Number.isFinite(v) && v > 0) ? 0.5 : 0); // Simplistic handling
    }

    const minLog = Math.log10(Math.min(...positiveValues));
    const maxLog = Math.log10(Math.max(...positiveValues));

    if (minLog === maxLog) {
      // All positive values are the same
      return values.map(v => (Number.isFinite(v) && v > 0) ? 0.5 : 0);
    }

    return values.map(v => {
        if (!Number.isFinite(v) || v <= 0) return 0; // Map non-finite or non-positive to 0
        const logV = Math.log10(v);
        // Clamp values in case of floating point issues outside the min/max range
        return Math.max(0, Math.min(1, (logV - minLog) / (maxLog - minLog)));
    });

  } else { // Linear scale
    const min = Math.min(...finiteValues);
    const max = Math.max(...finiteValues);

    if (min === max) {
      // All finite values are the same
      return values.map(v => Number.isFinite(v) ? 0.5 : 0); // Map non-finite to 0
    }

    return values.map(v => {
      if (!Number.isFinite(v)) return 0; // Map non-finite to 0
      // Clamp values
      return Math.max(0, Math.min(1, (v - min) / (max - min)));
    });
  }
}

// Custom component to render Axis Labels with direction arrows
const CustomAxisLabel = (props: LabelProps & { higherIsBetter: boolean; isVertical: boolean }) => {
  const { x, y, value, higherIsBetter, isVertical } = props;

  // Guard against undefined props during render cycles
  if (x === undefined || y === undefined || value === undefined) {
    return null;
  }

  const arrowColor = higherIsBetter ? '#34D399' : '#F87171'; // Emerald-400 or Red-400
  const arrowSize = 12; // Size of the arrow indicator
  const textStyle: React.CSSProperties = {
    textAnchor: 'middle',
    fill: '#E2E8F0', // Slate-200 text
    fontSize: '12px',
    fontFamily: 'sans-serif',
  };

  // Arrow shapes (using SVG path data)
   const arrowPath = isVertical
     ? higherIsBetter ? "M0 -4 L4 2 L-4 2 Z" : "M0 4 L4 -2 L-4 -2 Z" // Up/Down arrow (filled triangle)
     : higherIsBetter ? "M-4 0 L2 -4 L2 4 Z" : "M4 0 L-2 -4 L-2 4 Z"; // Right/Left arrow (filled triangle)


  // Positioning relative to the anchor point (x, y) provided by recharts
  const textX = 0;
  const textY = isVertical ? 0 : 3; // Slight baseline adjustment for horizontal text

  // Position the arrow SVG container relative to the text anchor
  // Adjust spacing based on approximate text width
  const approxTextWidth = String(value).length * 6; // Heuristic for width
  const arrowSpacing = 4; // Space between text and arrow
  const arrowContainerX = isVertical
      ? 10 // Position arrow to the right (after rotation)
      : textX + approxTextWidth / 2 + arrowSpacing; // Position arrow after text horizontally
  const arrowContainerY = isVertical
      ? 0 // Center vertically (after rotation)
      : textY - arrowSize / 2; // Center vertically for horizontal text


  const transform = isVertical
    ? `translate(${x}, ${y}) rotate(-90)` // Apply rotation for Y-axis label
    : `translate(${x}, ${y})`; // Simple translation for X-axis

  return (
    <g transform={transform}>
      <text x={textX} y={textY} style={textStyle}>
        {value}
      </text>
      {/* SVG container for the arrow */}
      <svg
        x={arrowContainerX}
        y={arrowContainerY}
        width={arrowSize}
        height={arrowSize}
        viewBox="-6 -6 12 12" // Centered viewBox makes path easier
        overflow="visible"
      >
        <path d={arrowPath} fill={arrowColor} />
      </svg>
    </g>
  );
};


// Main component for the Scatter Chart Page
export function ScatterChartPage() {
  const { getEffectiveTier, setTier } = useSubscription();
  const { currency } = useCurrency();
  const effectiveTier = getEffectiveTier() as ColumnTier;

  // State for metric selections and scales
  const [xMetric, setXMetric] = useState('market_cap_value');
  const [yMetric, setYMetric] = useState('ev_per_resource_oz_all');
  const [zMetric, setZMetric] = useState('current_production_total_aueq_koz');
  const [xScale, setXScale] = useState<'linear' | 'log'>('log'); // Default to log often makes sense
  const [yScale, setYScale] = useState<'linear' | 'log'>('log'); // Default to log
  const [zScale, setZScale] = useState<'linear' | 'log'>('linear'); // Bubble size often linear

  // State for chart interaction and display options
  const [zoom, setZoom] = useState(1);
  const [showLabels, setShowLabels] = useState(true);
  const [showTolerances, setShowTolerances] = useState(false);
  const [tolerances, setTolerances] = useState<ToleranceSettings>(defaultTolerances);

  // State for data fetching and derived data
  const [loading, setLoading] = useState(true); // Start loading initially
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Company[]>([]);

  // Refs and state for managing labels generated by force simulation
  const chartRef = useRef<HTMLDivElement>(null); // Ref for the chart container div
  const [labelElements, setLabelElements] = useState<React.ReactNode[]>([]); // Rendered label elements

  // Memoized values for performance
  const accessibleMetrics = useMemo(() => getAccessibleMetrics(effectiveTier), [effectiveTier]);
  const xMetricConfig = useMemo(() => getMetricByKey(xMetric), [xMetric]);
  const yMetricConfig = useMemo(() => getMetricByKey(yMetric), [yMetric]);
  const zMetricConfig = useMemo(() => getMetricByKey(zMetric), [zMetric]);

  // Effect to fetch data when currency changes
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      setData([]); // Clear previous data
      try {
        const companies = await getCompaniesForScatterChart(currency);
        setData(companies);
      } catch (err: any) {
        console.error('Error fetching scatter chart data:', err);
        setError(err.message || 'An error occurred while fetching data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [currency]); // Re-fetch only when currency changes

  // Effect to transform raw data into plot points based on selected metrics and scales
  const transformedData = useMemo(() => {
    const validPoints = data
      .map(company => ({
        x: getNestedValue(company, xMetricConfig?.path || ''),
        y: getNestedValue(company, yMetricConfig?.path || ''),
        z: getNestedValue(company, zMetricConfig?.path || ''),
        company
      }))
      .filter(point =>
        point.x !== null && point.y !== null && point.z !== null &&
        Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z) &&
        (xScale === 'linear' || point.x > 0) && // Log scale requires positive X
        (yScale === 'linear' || point.y > 0) && // Log scale requires positive Y
        (zScale === 'linear' || point.z > 0)    // Log scale requires positive Z (if used for size)
      );

    const zValues = validPoints.map(p => p.z);
    const normalizedZValues = normalizeValues(zValues, zScale);

    // Map normalized Z values back to the points
    return validPoints.map((point, index) => ({
      ...point,
      normalizedZ: normalizedZValues[index] ?? 0.5, // Use normalized value, default if undefined
    }));
  }, [data, xMetricConfig, yMetricConfig, zMetricConfig, xScale, yScale, zScale]);

  // --- Domain Calculation ---
   const getDomain = useCallback((values: number[], scale: 'linear' | 'log'): [number | string, number | string] => {
    const finiteValues = values.filter(v => Number.isFinite(v));
    if (finiteValues.length === 0) return ['auto', 'auto']; // Let recharts decide if no valid data

    if (scale === 'log') {
       const positiveValues = finiteValues.filter(v => v > 0);
       if (positiveValues.length === 0) return ['auto', 'auto']; // No positive values for log scale

       const minVal = Math.min(...positiveValues);
       const maxVal = Math.max(...positiveValues);

       // Avoid log(0) or negative values; Add padding (e.g., factor of 1.5 or 2)
       // Using factors often works better visually for log scales than additive padding
       const domainMin = minVal / 1.5;
       const domainMax = maxVal * 1.5;

       return [domainMin > 0 ? domainMin : 1e-9, domainMax]; // Ensure min is positive

    } else { // Linear scale
        const minVal = Math.min(...finiteValues);
        const maxVal = Math.max(...finiteValues);

        if (minVal === maxVal) {
           // Handle case where all values are the same
           const padding = Math.abs(minVal * 0.1) || 1; // Add 10% padding or 1 if value is 0
           return [minVal - padding, minVal + padding];
        }

        const range = maxVal - minVal;
        const padding = range * 0.1; // 10% padding on each side

        return [minVal - padding, maxVal + padding];
    }
  }, []); // No dependencies, pure function


  const xDomain = useMemo(() =>
    getDomain(transformedData.map(d => d.x), xScale),
    [transformedData, xScale, getDomain]
  );

  const yDomain = useMemo(() =>
    getDomain(transformedData.map(d => d.y), yScale),
    [transformedData, yScale, getDomain]
  );

  // --- Label Simulation and Rendering ---
  const updateLabels = useCallback(() => {
    if (!showLabels || !chartRef.current || !transformedData.length) {
        setLabelElements([]);
        return;
    }

    const chartSurface = chartRef.current.querySelector('.recharts-surface');
    const chartLayout = chartRef.current.querySelector('.recharts-wrapper');
    if (!chartSurface || !chartLayout) return;

    const viewBoxAttr = chartSurface.getAttribute('viewBox');
    if (!viewBoxAttr) return;
    const [, , vbWidth, vbHeight] = viewBoxAttr.split(' ').map(parseFloat);

    // Get computed margins (might differ slightly from state due to rounding/calculation)
    const style = window.getComputedStyle(chartLayout);
    const marginLeft = parseFloat(style.paddingLeft || '0') || tolerances.chartMarginLeft;
    const marginTop = parseFloat(style.paddingTop || '0') || tolerances.chartMarginTop;

    // Approximation function to map data value to SVG coordinate
    // NOTE: This is an approximation and might be inaccurate, especially with padding/ticks.
    // A more robust method might involve hidden elements or accessing internal Recharts state (difficult).
    const mapX = (dataX: number): number => {
        const [dMin, dMax] = xDomain as [number, number];
        if (!Number.isFinite(dMin) || !Number.isFinite(dMax) || dMax === dMin) return marginLeft;
        if (xScale === 'log') {
            if (dataX <= 0 || dMin <= 0 || dMax <= 0) return marginLeft;
            const logMin = Math.log10(dMin);
            const logMax = Math.log10(dMax);
            if(logMin === logMax) return marginLeft;
            return marginLeft + ((Math.log10(dataX) - logMin) / (logMax - logMin)) * vbWidth;
        } else {
            return marginLeft + ((dataX - dMin) / (dMax - dMin)) * vbWidth;
        }
    };
    const mapY = (dataY: number): number => {
        const [dMin, dMax] = yDomain as [number, number];
         if (!Number.isFinite(dMin) || !Number.isFinite(dMax) || dMax === dMin) return marginTop + vbHeight;
        // Y is inverted in SVG coords
        if (yScale === 'log') {
            if (dataY <= 0 || dMin <= 0 || dMax <= 0) return marginTop + vbHeight;
            const logMin = Math.log10(dMin);
            const logMax = Math.log10(dMax);
             if(logMin === logMax) return marginTop + vbHeight;
            return marginTop + vbHeight - (((Math.log10(dataY) - logMin) / (logMax - logMin)) * vbHeight);
        } else {
            return marginTop + vbHeight - (((dataY - dMin) / (dMax - dMin)) * vbHeight);
        }
    };

    const fontSize = 10;
    const labelHeight = fontSize + 4;

    const initialLabelData = transformedData
        .map((point) => {
            const { company, x: dataX, y: dataY } = point;
            const label = company.tsx_code || company.company_name || 'N/A';
            const screenX = mapX(dataX);
            const screenY = mapY(dataY);
            const labelWidth = label.length * fontSize * 0.6; // Approximation

            // Basic check if point is roughly within viewbox (add buffer)
            const buffer = 20;
            if (screenX < marginLeft - buffer || screenX > marginLeft + vbWidth + buffer || screenY < marginTop - buffer || screenY > marginTop + vbHeight + buffer) {
                return null; // Exclude points far outside
            }

            return {
                id: label + "_" + company.id, // Ensure unique ID
                text: label,
                x: screenX, // Start simulation at screen X
                y: screenY - tolerances.labelYOffset, // Start slightly offset
                width: labelWidth,
                height: labelHeight,
                dataX: screenX, // Store original mapped X
                dataY: screenY, // Store original mapped Y
                density: 0, // Will be calculated if needed
            };
        })
        .filter(Boolean) as (LabelPosition & { text: string, dataX: number, dataY: number })[];


    // Run the label simulation (assuming createLabelSimulation exists and works)
    const simulatedLabels = createLabelSimulation(
        initialLabelData,
        vbWidth + marginLeft, // Pass simulation boundaries including margins
        vbHeight + marginTop,
        {
            collisionRadius: tolerances.labelCollisionRadius,
            forceStrength: tolerances.labelForceStrength,
            yOffset: 0, // Y-offset is already applied initially
            densityThreshold: tolerances.labelDensityThreshold,
            iterations: tolerances.labelSimulationIterations,
            bounds: { // Define simulation bounding box relative to SVG origin
                x0: marginLeft,
                y0: marginTop,
                x1: marginLeft + vbWidth,
                y1: marginTop + vbHeight,
            }
        }
    );

    // Generate React elements for the labels based on simulation results
    setLabelElements(
        simulatedLabels.map(label => {
            const finalX = label.x;
            const finalY = label.y;
            const showLine = true; // Option to draw leader lines
            const dx = finalX - label.dataX;
            const dy = finalY - label.dataY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const shouldShowLine = showLine && distance > 5; // Only draw line if label moved a bit

            return (
                <g key={label.id} className="label-group" style={{ pointerEvents: 'none' }}>
                    {shouldShowLine && (
                         <line
                            x1={label.dataX} y1={label.dataY}
                            x2={finalX} y2={finalY}
                            stroke="#9CA3AF" // Gray-400
                            strokeWidth={0.5}
                            strokeOpacity={0.6}
                         />
                    )}
                    {/* Background rect for readability */}
                    <rect
                        x={finalX - label.width / 2 - 2} // Add padding
                        y={finalY - label.height / 2 - 1} // Add padding
                        width={label.width + 4}
                        height={label.height + 2}
                        fill="#1F2937" // Gray-800 (dark background)
                        rx={3}
                        opacity={0.8}
                    />
                    {/* The actual label text */}
                    <text
                        x={finalX} // Center text
                        y={finalY} // Center text (use alignment-baseline)
                        fill="#FDBA74" // Orange-300 (brighter accent)
                        textAnchor="middle"
                        fontSize={fontSize}
                        fontWeight={500}
                        fontFamily="monospace"
                        dominantBaseline="middle" // Vertical centering
                    >
                        {label.text}
                    </text>
                </g>
            );
        })
    );
}, [
    showLabels, transformedData,
    xDomain, yDomain, xScale, yScale, // Domain/scale influence mapping
    tolerances, // Use tolerances in simulation and initial offset
    chartRef // Need the ref to find elements
]);

  // Effect to run label update when relevant state changes
  useEffect(() => {
    // Debounce or throttle might be good here if updates are frequent/slow
    const timerId = setTimeout(updateLabels, 50); // Run shortly after changes settle
    return () => clearTimeout(timerId);
  }, [updateLabels]); // updateLabels itself includes all its dependencies

  // --- Chart Interaction Handlers ---
  const handleZoomIn = () => setZoom(prev => Math.min(prev * 1.2, 5));
  const handleZoomOut = () => setZoom(prev => Math.max(prev / 1.2, 0.5));
  const handleResetZoom = () => setZoom(1);

  // --- Tooltip Component ---
  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.[0]?.payload) return null;

    const point: ScatterPoint = payload[0].payload;
    const { company } = point;

    return (
      <div className="bg-gray-800/90 p-3 rounded-md shadow-lg border border-gray-700/50 text-xs">
        <div className="font-semibold text-gray-100 mb-2">
          {company.company_name} ({company.tsx_code})
        </div>
        <div className="space-y-1">
          <div className="flex justify-between gap-4">
            <span className="text-gray-400">{xMetricConfig?.label}:</span>
            <span className="font-medium text-gray-200">
              {formatValue(point.x, xMetricConfig?.format || 'number')}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-gray-400">{yMetricConfig?.label}:</span>
            <span className="font-medium text-gray-200">
              {formatValue(point.y, yMetricConfig?.format || 'number')}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-gray-400">{zMetricConfig?.label}:</span>
            <span className="font-medium text-gray-200">
              {formatValue(point.z, zMetricConfig?.format || 'number')}
            </span>
          </div>
        </div>
      </div>
    );
  };

  // --- Settings Panel Component (Inline) ---
  const TolerancePanel = () => (
    <div className="absolute top-4 right-4 bg-gray-800/95 p-4 rounded-lg border border-gray-700/50 shadow-lg z-50 w-64 max-h-[80vh] overflow-y-auto text-xs">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-100 mb-2">Label Settings</h3>
        {/* Label Controls */}
        <div>
          <label className="text-gray-400 block mb-1">Collision Radius: <span className="text-gray-500 float-right">{tolerances.labelCollisionRadius.toFixed(1)}</span></label>
          <input type="range" min="0" max="10" step="0.1" value={tolerances.labelCollisionRadius} onChange={(e) => setTolerances(prev => ({...prev, labelCollisionRadius: parseFloat(e.target.value)}))} className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer range-sm accent-teal-500"/>
        </div>
         <div>
           <label className="text-gray-400 block mb-1">Force Strength: <span className="text-gray-500 float-right">{tolerances.labelForceStrength.toFixed(1)}</span></label>
           <input type="range" min="0" max="2" step="0.1" value={tolerances.labelForceStrength} onChange={(e) => setTolerances(prev => ({...prev, labelForceStrength: parseFloat(e.target.value)}))} className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer range-sm accent-teal-500"/>
        </div>
         <div>
            <label className="text-gray-400 block mb-1">Y Offset: <span className="text-gray-500 float-right">{tolerances.labelYOffset}px</span></label>
            <input type="range" min="-20" max="20" step="1" value={tolerances.labelYOffset} onChange={(e) => setTolerances(prev => ({...prev, labelYOffset: parseInt(e.target.value, 10)}))} className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer range-sm accent-teal-500"/>
        </div>
        <div>
           <label className="text-gray-400 block mb-1">Sim Iterations: <span className="text-gray-500 float-right">{tolerances.labelSimulationIterations}</span></label>
           <input type="range" min="50" max="1000" step="50" value={tolerances.labelSimulationIterations} onChange={(e) => setTolerances(prev => ({...prev, labelSimulationIterations: parseInt(e.target.value, 10)}))} className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer range-sm accent-teal-500"/>
        </div>
        {/* Density threshold might be added here if simulation uses it */}

        <h3 className="text-sm font-semibold text-gray-100 mt-4 mb-2">Axis & Margin Settings</h3>
        {/* Axis Title Offsets */}
         <div>
            <label className="text-gray-400 block mb-1">X-Axis Title Offset: <span className="text-gray-500 float-right">{tolerances.xAxisTitleOffset}px</span></label>
            <input type="range" min="0" max="100" step="1" value={tolerances.xAxisTitleOffset} onChange={(e) => setTolerances(prev => ({...prev, xAxisTitleOffset: parseInt(e.target.value, 10)}))} className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer range-sm accent-teal-500"/>
        </div>
         <div>
            <label className="text-gray-400 block mb-1">Y-Axis Title Offset: <span className="text-gray-500 float-right">{tolerances.yAxisTitleOffset}px</span></label>
            <input type="range" min="0" max="100" step="1" value={tolerances.yAxisTitleOffset} onChange={(e) => setTolerances(prev => ({...prev, yAxisTitleOffset: parseInt(e.target.value, 10)}))} className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer range-sm accent-teal-500"/>
        </div>
        {/* Chart Margins */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 mt-3">
             <div>
                <label className="text-gray-400 block mb-1">Top: <span className="text-gray-500 float-right">{tolerances.chartMarginTop}</span></label>
                <input type="range" min="0" max="100" step="5" value={tolerances.chartMarginTop} onChange={(e) => setTolerances(prev => ({...prev, chartMarginTop: parseInt(e.target.value, 10)}))} className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer range-sm accent-teal-500"/>
            </div>
            <div>
                <label className="text-gray-400 block mb-1">Right: <span className="text-gray-500 float-right">{tolerances.chartMarginRight}</span></label>
                <input type="range" min="0" max="100" step="5" value={tolerances.chartMarginRight} onChange={(e) => setTolerances(prev => ({...prev, chartMarginRight: parseInt(e.target.value, 10)}))} className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer range-sm accent-teal-500"/>
            </div>
            <div>
                <label className="text-gray-400 block mb-1">Bottom: <span className="text-gray-500 float-right">{tolerances.chartMarginBottom}</span></label>
                <input type="range" min="20" max="150" step="5" value={tolerances.chartMarginBottom} onChange={(e) => setTolerances(prev => ({...prev, chartMarginBottom: parseInt(e.target.value, 10)}))} className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer range-sm accent-teal-500"/>
            </div>
            <div>
                <label className="text-gray-400 block mb-1">Left: <span className="text-gray-500 float-right">{tolerances.chartMarginLeft}</span></label>
                <input type="range" min="20" max="150" step="5" value={tolerances.chartMarginLeft} onChange={(e) => setTolerances(prev => ({...prev, chartMarginLeft: parseInt(e.target.value, 10)}))} className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer range-sm accent-teal-500"/>
            </div>
        </div>

        {/* Reset Button */}
        <button
          onClick={() => setTolerances(defaultTolerances)}
          className="w-full mt-4 px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 rounded-md text-gray-300 hover:text-gray-100 transition-colors"
        >
          Reset Settings
        </button>
      </div>
    </div>
  );


  // --- Main JSX Render ---
  return (
    <div className="min-h-screen bg-gray-900 text-gray-300"> {/* Using Tailwind dark theme colors */}
      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-100">Mining Companies Scatter Analysis</h1>
            <p className="text-sm text-gray-400">Visualize relationships between key financial and operational metrics.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap"> {/* Use flex-wrap for smaller screens */}
             <TierSelector currentTier={effectiveTier} onTierChange={setTier} />
             <Button variant="ghost" size="icon" className="text-gray-400 hover:text-gray-100" title="Toggle Settings Panel" onClick={() => setShowTolerances(prev => !prev)}>
                 <Settings className={`h-5 w-5 transition-transform duration-200 ${showTolerances ? 'rotate-90' : ''}`} />
             </Button>
            <Link to="/companies">
              <Button variant="ghost" size="icon" className="text-gray-400 hover:text-gray-100" title="View Companies Table">
                <Table2 className="h-5 w-5" />
              </Button>
            </Link>
            <Link to="/">
              <Button variant="ghost" size="icon" className="text-gray-400 hover:text-gray-100" title="Home">
                <Home className="h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Metric Selectors Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
           {/* X-Axis Selector */}
           <div className="space-y-2">
             <MetricSelector label="X-Axis Metric" selectedMetric={xMetric} onMetricChange={setXMetric} metrics={accessibleMetrics} currentTier={effectiveTier} />
             <div className="flex items-center gap-2">
               <button onClick={() => setXScale('linear')} className={cn('px-3 py-1 text-xs rounded-md transition-colors', xScale === 'linear' ? 'bg-teal-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600')}>Linear Scale</button>
               <button onClick={() => setXScale('log')} className={cn('px-3 py-1 text-xs rounded-md transition-colors', xScale === 'log' ? 'bg-teal-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600')}>Log Scale</button>
             </div>
           </div>
           {/* Y-Axis Selector */}
           <div className="space-y-2">
             <MetricSelector label="Y-Axis Metric" selectedMetric={yMetric} onMetricChange={setYMetric} metrics={accessibleMetrics} currentTier={effectiveTier} />
             <div className="flex items-center gap-2">
               <button onClick={() => setYScale('linear')} className={cn('px-3 py-1 text-xs rounded-md transition-colors', yScale === 'linear' ? 'bg-teal-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600')}>Linear Scale</button>
               <button onClick={() => setYScale('log')} className={cn('px-3 py-1 text-xs rounded-md transition-colors', yScale === 'log' ? 'bg-teal-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600')}>Log Scale</button>
             </div>
           </div>
            {/* Z-Axis (Bubble Size) Selector */}
           <div className="space-y-2">
             <MetricSelector label="Bubble Size" selectedMetric={zMetric} onMetricChange={setZMetric} metrics={accessibleMetrics} currentTier={effectiveTier} />
              {/* Optional: Add scale toggle for Z-axis size if needed */}
              <div className="flex items-center gap-2">
                 <button onClick={() => setZScale('linear')} className={cn('px-3 py-1 text-xs rounded-md transition-colors', zScale === 'linear' ? 'bg-teal-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600')}>Linear Size</button>
                 {/* <button onClick={() => setZScale('log')} className={cn('px-3 py-1 text-xs rounded-md transition-colors', zScale === 'log' ? 'bg-teal-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600')}>Log Size</button> */}
              </div>
           </div>
        </div>

        {/* Chart Area */}
        <div ref={chartRef} className="relative h-[70vh] bg-gray-800/50 rounded-lg p-1 border border-gray-700/50 shadow-inner">
           {/* Loading and Error States Overlay */}
           <AnimatePresence>
            {loading && (
                 <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="absolute inset-0 flex items-center justify-center bg-gray-800/70 z-20 rounded-lg"
                 >
                    <LoadingIndicator message="Loading chart data..." />
                </motion.div>
            )}
            {error && !loading && (
                 <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="absolute inset-0 flex items-center justify-center bg-gray-800/70 z-20 rounded-lg"
                >
                    <div className="text-center p-4">
                        <p className="text-red-400 font-semibold">Error Loading Data</p>
                        <p className="text-sm text-gray-400 mt-1">{error}</p>
                        {/* Optionally add a retry button here */}
                    </div>
                </motion.div>
            )}
            </AnimatePresence>

            {/* Chart Render Area (only if not loading and no error) */}
            {!loading && !error && transformedData.length > 0 && (
                <>
                 <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart
                      // Apply margins from state dynamically
                       margin={{
                         top: tolerances.chartMarginTop,
                         right: tolerances.chartMarginRight,
                         bottom: tolerances.chartMarginBottom,
                         left: tolerances.chartMarginLeft,
                       }}
                    >
                      {/* Background Grid */}
                      <CartesianGrid strokeDasharray="3 3" stroke="#4B5563" strokeOpacity={0.5} /> {/* Gray-600 */}

                      {/* X-Axis Definition */}
                      <XAxis
                        dataKey="x"
                        type="number"
                        scale={xScale}
                        domain={xDomain} // Use calculated domain
                        name={xMetricConfig?.label || 'X'}
                        tick={{ fill: '#9CA3AF', fontSize: 10 }} // Gray-400
                        stroke="#6B7280" // Gray-500 axis line
                        tickFormatter={(value) => formatValue(value, xMetricConfig?.format || 'number')}
                        height={tolerances.chartMarginBottom - 25} // Reserve space (adjust fudge factor as needed)
                        axisLine={{ stroke: "#6B7280" }}
                        tickLine={{ stroke: "#6B7280" }}
                        allowDataOverflow={true} // Prevent clipping points exactly on edge
                        // Axis Label using standard object format + custom renderer
                        label={{
                           value: xMetricConfig?.label || '',
                           position: 'bottom',
                           offset: tolerances.xAxisTitleOffset, // Controlled by state
                           content: (props) => (
                             <CustomAxisLabel
                                {...props}
                                higherIsBetter={xMetricConfig?.higherIsBetter || false}
                                isVertical={false}
                              />
                           ),
                         }}
                      />

                      {/* Y-Axis Definition */}
                      <YAxis
                        dataKey="y"
                        type="number"
                        scale={yScale}
                        domain={yDomain} // Use calculated domain
                        name={yMetricConfig?.label || 'Y'}
                        tick={{ fill: '#9CA3AF', fontSize: 10 }}
                        stroke="#6B7280"
                        tickFormatter={(value) => formatValue(value, yMetricConfig?.format || 'number')}
                        width={tolerances.chartMarginLeft - 25} // Reserve space
                        axisLine={{ stroke: "#6B7280" }}
                        tickLine={{ stroke: "#6B7280" }}
                        allowDataOverflow={true}
                        // Axis Label using standard object format + custom renderer
                        label={{
                           value: yMetricConfig?.label || '',
                           position: 'left',
                           offset: tolerances.yAxisTitleOffset, // Controlled by state
                           content: (props) => (
                             <CustomAxisLabel
                               {...props}
                               higherIsBetter={yMetricConfig?.higherIsBetter || false}
                               isVertical={true}
                              />
                            ),
                         }}
                      />

                      {/* Z-Axis Definition (Controls Bubble Size) */}
                       <ZAxis
                         dataKey="normalizedZ" // Use the 0-1 normalized value
                         range={[20 * zoom, 400 * zoom]} // Define min/max pixel size range, affected by zoom
                         name={zMetricConfig?.label || 'Size'}
                       />

                      {/* Tooltip Configuration */}
                      <Tooltip
                        cursor={{ strokeDasharray: '3 3', stroke: '#9CA3AF', strokeOpacity: 0.5 }}
                        content={<CustomTooltip />}
                        wrapperStyle={{ zIndex: 100 }} // Ensure tooltip is above labels potentially
                      />

                      {/* Scatter Series */}
                      <Scatter
                        name="Companies"
                        data={transformedData}
                        fill="#2DD4BF" // Teal-400
                        fillOpacity={0.6}
                        shape="circle"
                        isAnimationActive={false} // Consider disabling animation if label simulation is heavy
                       />

                      {/* Custom Labels Layer - rendered on top */}
                       <g className="recharts-custom-labels-layer">
                           {labelElements}
                       </g>

                    </ScatterChart>
                  </ResponsiveContainer>

                  {/* Chart Controls Overlay */}
                  <div className="absolute bottom-4 right-4 flex gap-2 z-10">
                     <Button variant="outline" size="icon" className="bg-gray-700/50 border-gray-600 hover:bg-gray-600/70" onClick={handleZoomIn} title="Zoom In"><ZoomIn className="h-4 w-4 text-gray-300" /></Button>
                     <Button variant="outline" size="icon" className="bg-gray-700/50 border-gray-600 hover:bg-gray-600/70" onClick={handleZoomOut} title="Zoom Out"><ZoomOut className="h-4 w-4 text-gray-300" /></Button>
                     <Button variant="outline" size="icon" className="bg-gray-700/50 border-gray-600 hover:bg-gray-600/70" onClick={handleResetZoom} title="Reset Zoom"><RotateCcw className="h-4 w-4 text-gray-300" /></Button>
                     <Button
                        variant={showLabels ? "secondary" : "outline"}
                        size="sm"
                        className={cn("text-xs", showLabels ? "bg-teal-700 hover:bg-teal-600 border-teal-700" : "bg-gray-700/50 border-gray-600 hover:bg-gray-600/70 text-gray-300")}
                        onClick={() => setShowLabels(prev => !prev)}
                        title={showLabels ? "Hide Labels" : "Show Labels"}
                     >
                        {showLabels ? "Hide Labels" : "Show Labels"}
                     </Button>
                  </div>

                  {/* Settings Panel (Animated) */}
                  <AnimatePresence>
                     {showTolerances && (
                        <motion.div
                           initial={{ opacity: 0, x: 100 }}
                           animate={{ opacity: 1, x: 0 }}
                           exit={{ opacity: 0, x: 100 }}
                           transition={{ type: "spring", stiffness: 300, damping: 30 }}
                           className="absolute top-0 right-0 h-full z-30" // Position container
                           style={{ paddingTop: '1rem', paddingRight: '1rem' }} // Match panel's own padding approximately
                        >
                           <TolerancePanel />
                        </motion.div>
                     )}
                   </AnimatePresence>
                </>
            )}
            {/* Placeholder if no data after loading */}
            {!loading && !error && transformedData.length === 0 && (
                 <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                    No data available for the selected metrics and filters.
                 </div>
            )}

        </div> {/* End Chart Area */}

      </div> {/* End Container */}
    </div> // End Page Wrapper
  );
}

// If this is the primary export of the file:
// export default ScatterChartPage;