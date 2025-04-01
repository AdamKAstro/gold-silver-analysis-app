import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Home, Table2, ZoomIn, ZoomOut, RotateCcw, Settings } from 'lucide-react';
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer, Label } from 'recharts';
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
import { createLabelSimulation } from '../../lib/force-simulation';
import type { Company, ColumnTier, MetricConfig } from '../../lib/types';

interface ScatterPoint {
  x: number;
  y: number;
  z: number;
  normalizedZ: number;
  company: Company;
}

interface LabelPosition {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  density: number;
  dataX?: number;
  dataY?: number;
}

interface ToleranceSettings {
  labelCollisionRadius: number;
  labelForceStrength: number;
  labelYOffset: number;
  labelDensityThreshold: number;
  labelSimulationIterations: number;
  xAxisTitleOffset: number;
  yAxisTitleOffset: number;
  chartMarginTop: number;
  chartMarginRight: number;
  chartMarginBottom: number;
  chartMarginLeft: number;
}

const defaultTolerances: ToleranceSettings = {
  labelCollisionRadius: 5,    // Increased to reduce label drift
  labelForceStrength: 0.1,    // Reduced to keep labels close
  labelYOffset: -10,          // Above points, per your request
  labelDensityThreshold: 18,  // Per your request
  labelSimulationIterations: 300,
  xAxisTitleOffset: 20,       // Below X-axis
  yAxisTitleOffset: 20,       // Left of Y-axis
  chartMarginTop: 20,         // Per your request
  chartMarginRight: 20,       // Per your request
  chartMarginBottom: 50,      // Increased for title visibility
  chartMarginLeft: 60,        // Increased for title visibility
};

function calculateDensity(point: { x: number, y: number }, allPoints: Array<{ x: number, y: number }>, radius: number): number {
  return allPoints.filter(p => 
    Math.sqrt(Math.pow(p.x - point.x, 2) + Math.pow(p.y - point.y, 2)) < radius
  ).length;
}

function doLabelsOverlap(a: LabelPosition, b: LabelPosition, padding = 5): boolean {
  return !(
    a.x + a.width + padding < b.x ||
    b.x + b.width + padding < a.x ||
    a.y + a.height + padding < b.y ||
    b.y + b.height + padding < a.y
  );
}

function findBestLabelPosition(
  baseX: number,
  baseY: number,
  label: string,
  existingLabels: LabelPosition[],
  fontSize: number = 10,
  padding: number = 5
): { x: number; y: number } | null {
  const labelWidth = label.length * fontSize * 0.6;
  const labelHeight = fontSize + 4;

  const positions = [
    { x: baseX, y: baseY - 15 },
    { x: baseX + 15, y: baseY },
    { x: baseX, y: baseY + 15 },
    { x: baseX - 15, y: baseY },
    { x: baseX + 15, y: baseY - 15 },
    { x: baseX + 15, y: baseY + 15 },
    { x: baseX - 15, y: baseY + 15 },
    { x: baseX - 15, y: baseY - 15 },
    { x: baseX, y: baseY - 25 },
    { x: baseX + 25, y: baseY },
    { x: baseX, y: baseY + 25 },
    { x: baseX - 25, y: baseY }
  ];

  for (const pos of positions) {
    const newLabel: LabelPosition = {
      id: label,
      x: pos.x - labelWidth / 2,
      y: pos.y - labelHeight / 2,
      width: labelWidth,
      height: labelHeight,
      density: 0
    };

    if (!existingLabels.some(existing => doLabelsOverlap(existing, newLabel, padding))) {
      return pos;
    }
  }

  return null;
}

function formatValue(value: number | null | undefined, format: string): string {
  if (value === null || value === undefined) return '-';

  const roundToSignificant = (num: number): number => {
    if (num === 0) return 0;
    const magnitude = Math.floor(Math.log10(Math.abs(num)));
    const scale = Math.pow(10, magnitude - 1);
    return Math.round(num / scale) * scale;
  };

  switch (format) {
    case 'currency':
      return formatCurrency(roundToSignificant(value));
    case 'percent':
      return formatPercent(value);
    case 'moz':
      return formatMoz(roundToSignificant(value));
    case 'koz':
      return formatKoz(roundToSignificant(value));
    default:
      return formatNumber(roundToSignificant(value), { decimals: 2 });
  }
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((o, i) => (o && o[i] !== 'undefined') ? o[i] : null, obj);
}

function normalizeValues(values: number[], scale: 'linear' | 'log'): number[] {
  if (values.length === 0) return [];

  if (scale === 'log') {
    const logValues = values.map(v => Math.log(Math.max(v, 1)));
    const minLog = Math.min(...logValues);
    const maxLog = Math.max(...logValues);
    return logValues.map(v => maxLog === minLog ? 0 : (v - minLog) / (maxLog - minLog));
  } else {
    const min = Math.min(...values);
    const max = Math.max(...values);
    return values.map(v => max === min ? 0 : (v - min) / (max - min));
  }
}

export function ScatterChartPage() {
  const { getEffectiveTier, setTier } = useSubscription();
  const { currency } = useCurrency();
  const effectiveTier = getEffectiveTier() as ColumnTier;

  const [xMetric, setXMetric] = useState('market_cap_value');
  const [yMetric, setYMetric] = useState('ev_per_resource_oz_all');
  const [zMetric, setZMetric] = useState('current_production_total_aueq_koz');
  const [xScale, setXScale] = useState<'linear' | 'log'>('linear');
  const [yScale, setYScale] = useState<'linear' | 'log'>('linear');
  const [zScale, setZScale] = useState<'linear' | 'log'>('linear');
  const [zoom, setZoom] = useState(1);
  const [showLabels, setShowLabels] = useState(true);
  const [labelPositions, setLabelPositions] = useState<LabelPosition[]>([]);
  const [showTolerances, setShowTolerances] = useState(false);
  const [tolerances, setTolerances] = useState<ToleranceSettings>(defaultTolerances);

  const chartRef = useRef<HTMLDivElement>(null);
  const [labelElements, setLabelElements] = useState<React.ReactNode[]>([]);

  const accessibleMetrics = useMemo(() => getAccessibleMetrics(effectiveTier), [effectiveTier]);

  const xMetricConfig = getMetricByKey(xMetric);
  const yMetricConfig = getMetricByKey(yMetric);
  const zMetricConfig = getMetricByKey(zMetric);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Company[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const companies = await getCompaniesForScatterChart(currency);
        setData(companies);
      } catch (err: any) {
        console.error('Error fetching data:', err);
        setError(err.message || 'An error occurred while fetching data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [currency]);

  const transformedData = useMemo(() => {
    const validPoints = data.map(company => ({
      x: getNestedValue(company, xMetricConfig?.path || ''),
      y: getNestedValue(company, yMetricConfig?.path || ''),
      z: getNestedValue(company, zMetricConfig?.path || ''),
      company
    })).filter(point => 
      point.x !== null && point.y !== null && point.z !== null &&
      (!xScale || xScale === 'linear' || point.x > 0) &&
      (!yScale || yScale === 'linear' || point.y > 0) &&
      (!zScale || zScale === 'linear' || point.z > 0)
    );

    const zValues = validPoints.map(p => p.z);
    const normalizedZValues = normalizeValues(zValues, zScale);

    return validPoints.map((point, i) => ({
      ...point,
      normalizedZ: normalizedZValues[i] || 0
    }));
  }, [data, xMetricConfig, yMetricConfig, zMetricConfig, xScale, yScale, zScale]);

  const handleZoomIn = () => setZoom(prev => Math.min(prev * 1.2, 5));
  const handleZoomOut = () => setZoom(prev => Math.max(prev / 1.2, 0.5));
  const handleResetZoom = () => setZoom(1);

  const getDomain = useCallback((values: number[], scale: 'linear' | 'log'): [number, number] => {
    if (!values.length) return [0, 1];

    if (scale === 'log') {
      const logValues = values.map(v => Math.log(Math.max(v, 1)));
      const minLog = Math.min(...logValues);
      const maxLog = Math.max(...logValues);
      const padding = (maxLog - minLog) * 0.1 || 0.1;
      return [
        Math.pow(10, minLog - padding),
        Math.pow(10, maxLog + padding)
      ];
    } else {
      const min = Math.min(...values);
      const max = Math.max(...values);
      const padding = (max - min) * 0.1 || 0.1;
      return [min - padding, max + padding];
    }
  }, []);

  const xDomain = useMemo(() => getDomain(transformedData.map(d => d.x), xScale), [transformedData, xScale, getDomain]);
  const yDomain = useMemo(() => getDomain(transformedData.map(d => d.y), yScale), [transformedData, yScale, getDomain]);

  const debounce = (func: Function, wait: number) => {
    let timeout: NodeJS.Timeout;
    return (...args: any[]) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  };

  const updateLabels = useCallback(() => {
    if (!showLabels || !chartRef.current) return;

    const container = chartRef.current.getBoundingClientRect();
    const plotWidth = container.width - tolerances.chartMarginLeft - tolerances.chartMarginRight - 32; // Adjust for p-4 (16px each side)
    const plotHeight = container.height - tolerances.chartMarginTop - tolerances.chartMarginBottom - 32;
    const fontSize = 10;
    const padding = 5;
    const labelHeight = fontSize + 4;

    const screenPoints = transformedData.map(point => {
      const { x: dataX, y: dataY } = point;
      const screenX = tolerances.chartMarginLeft + ((dataX - xDomain[0]) / (xDomain[1] - xDomain[0])) * plotWidth;
      const screenY = tolerances.chartMarginTop + plotHeight - ((dataY - yDomain[0]) / (yDomain[1] - yDomain[0])) * plotHeight;
      return { x: screenX, y: screenY };
    });

    const sortedData = [...transformedData]
      .sort((a, b) => b.z - a.z)
      .filter((_, i) => {
        const point = screenPoints[i];
        return point.x >= tolerances.chartMarginLeft && point.x <= container.width - tolerances.chartMarginRight - 16 &&
               point.y >= tolerances.chartMarginTop && point.y <= container.height - tolerances.chartMarginBottom - 16;
      });

    const labelData = sortedData.map((point, i) => {
      const { company } = point;
      const label = company.tsx_code;
      const labelWidth = label.length * fontSize * 0.6;
      
      return {
        id: label,
        x: screenPoints[i].x - tolerances.chartMarginLeft, // Relative to plot area
        y: screenPoints[i].y - tolerances.chartMarginTop + tolerances.labelYOffset,
        width: labelWidth,
        height: labelHeight,
        dataX: screenPoints[i].x,
        dataY: screenPoints[i].y,
        density: calculateDensity(screenPoints[i], screenPoints, tolerances.labelCollisionRadius)
      };
    });

    const simulatedLabels = createLabelSimulation(
      labelData,
      plotWidth,
      plotHeight,
      {
        collisionRadius: tolerances.labelCollisionRadius,
        forceStrength: tolerances.labelForceStrength,
        yOffset: tolerances.labelYOffset,
        densityThreshold: tolerances.labelDensityThreshold,
        iterations: tolerances.labelSimulationIterations
      }
    );

    setLabelElements(
      simulatedLabels.map(label => {
        const labelCenterX = label.x + tolerances.chartMarginLeft;
        const labelCenterY = label.y + tolerances.chartMarginTop;
        
        const dx = labelCenterX - (label.dataX || 0);
        const dy = labelCenterY - (label.dataY || 0);
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < 15) return null;

        return (
          <g key={label.id} className="label-group" style={{ pointerEvents: 'none' }}>
            <line
              x1={label.dataX}
              y1={label.dataY}
              x2={labelCenterX}
              y2={labelCenterY}
              stroke="#E2E8F0"
              strokeWidth={0.5}
              strokeOpacity={0.3}
            />
            <rect
              x={labelCenterX - label.width / 2}
              y={labelCenterY - label.height / 2}
              width={label.width}
              height={label.height}
              fill="#1C2526"
              rx={2}
              opacity={0.9}
            />
            <text
              x={labelCenterX}
              y={labelCenterY + fontSize / 2 - 1}
              fill="#F4A261"
              textAnchor="middle"
              fontSize={fontSize}
              fontWeight={500}
              className="font-mono"
            >
              {label.id}
            </text>
          </g>
        );
      }).filter(Boolean)
    );
  }, [showLabels, transformedData, xDomain, yDomain, tolerances]);

  const debouncedUpdateLabels = useMemo(() => debounce(updateLabels, 100), [updateLabels]);

  useEffect(() => {
    debouncedUpdateLabels();
    window.addEventListener('resize', debouncedUpdateLabels);
    return () => window.removeEventListener('resize', debouncedUpdateLabels);
  }, [debouncedUpdateLabels]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.[0]?.payload) return null;

    const point: ScatterPoint = payload[0].payload;
    const { company } = point;

    return (
      <div className="bg-navy-400/95 p-3 rounded-lg shadow-lg border border-navy-300/20 text-white">
        <div className="font-medium mb-2">
          {company.company_name} ({company.tsx_code})
        </div>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between gap-4">
            <span className="opacity-70">{xMetricConfig?.label}:</span>
            <span className="font-medium">{formatValue(point.x, xMetricConfig?.format || 'number')}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="opacity-70">{yMetricConfig?.label}:</span>
            <span className="font-medium">{formatValue(point.y, yMetricConfig?.format || 'number')}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="opacity-70">{zMetricConfig?.label}:</span>
            <span className="font-medium">{formatValue(point.z, zMetricConfig?.format || 'number')}</span>
          </div>
        </div>
      </div>
    );
  };

  const TolerancePanel = () => (
    <div className="absolute top-4 right-4 bg-navy-400/95 p-4 rounded-lg border border-navy-300/20 shadow-lg z-50 w-64">
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-surface-white">Label Settings</h3>
        <div className="space-y-2">
          <div>
            <label className="text-xs text-surface-white/70">Collision Radius</label>
            <input
              type="range"
              min="0"
              max="20"
              step="0.1"
              value={tolerances.labelCollisionRadius}
              onChange={(e) => setTolerances(prev => ({ ...prev, labelCollisionRadius: parseFloat(e.target.value) }))}
              className="w-full"
            />
            <div className="text-xs text-surface-white/50">{tolerances.labelCollisionRadius}</div>
          </div>
          <div>
            <label className="text-xs text-surface-white/70">Force Strength</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={tolerances.labelForceStrength}
              onChange={(e) => setTolerances(prev => ({ ...prev, labelForceStrength: parseFloat(e.target.value) }))}
              className="w-full"
            />
            <div className="text-xs text-surface-white/50">{tolerances.labelForceStrength}</div>
          </div>
          <div>
            <label className="text-xs text-surface-white/70">Y Offset</label>
            <input
              type="range"
              min="-100"
              max="100"
              value={tolerances.labelYOffset}
              onChange={(e) => setTolerances(prev => ({ ...prev, labelYOffset: parseInt(e.target.value) }))}
              className="w-full"
            />
            <div className="text-xs text-surface-white/50">{tolerances.labelYOffset}px</div>
          </div>
          <div>
            <label className="text-xs text-surface-white/70">Density Threshold</label>
            <input
              type="range"
              min="1"
              max="18"
              value={tolerances.labelDensityThreshold}
              onChange={(e) => setTolerances(prev => ({ ...prev, labelDensityThreshold: parseInt(e.target.value) }))}
              className="w-full"
            />
            <div className="text-xs text-surface-white/50">{tolerances.labelDensityThreshold}</div>
          </div>
          <div>
            <label className="text-xs text-surface-white/70">Simulation Iterations</label>
            <input
              type="range"
              min="100"
              max="1000"
              step="50"
              value={tolerances.labelSimulationIterations}
              onChange={(e) => setTolerances(prev => ({ ...prev, labelSimulationIterations: parseInt(e.target.value) }))}
              className="w-full"
            />
            <div className="text-xs text-surface-white/50">{tolerances.labelSimulationIterations}</div>
          </div>
        </div>

        <h3 className="text-sm font-semibold text-surface-white mt-6">Axis Settings</h3>
        <div className="space-y-2">
          <div>
            <label className="text-xs text-surface-white/70">X-Axis Title Offset</label>
            <input
              type="range"
              min="-100"
              max="100"
              value={tolerances.xAxisTitleOffset}
              onChange={(e) => setTolerances(prev => ({ ...prev, xAxisTitleOffset: parseInt(e.target.value) }))}
              className="w-full"
            />
            <div className="text-xs text-surface-white/50">{tolerances.xAxisTitleOffset}px</div>
          </div>
          <div>
            <label className="text-xs text-surface-white/70">Y-Axis Title Offset</label>
            <input
              type="range"
              min="-100"
              max="100"
              value={tolerances.yAxisTitleOffset}
              onChange={(e) => setTolerances(prev => ({ ...prev, yAxisTitleOffset: parseInt(e.target.value) }))}
              className="w-full"
            />
            <div className="text-xs text-surface-white/50">{tolerances.yAxisTitleOffset}px</div>
          </div>
        </div>

        <h3 className="text-sm font-semibold text-surface-white mt-6">Chart Margins</h3>
        <div className="space-y-2">
          <div>
            <label className="text-xs text-surface-white/70">Top Margin</label>
            <input
              type="range"
              min="-100"
              max="100"
              value={tolerances.chartMarginTop}
              onChange={(e) => setTolerances(prev => ({ ...prev, chartMarginTop: parseInt(e.target.value) }))}
              className="w-full"
            />
            <div className="text-xs text-surface-white/50">{tolerances.chartMarginTop}px</div>
          </div>
          <div>
            <label className="text-xs text-surface-white/70">Right Margin</label>
            <input
              type="range"
              min="-100"
              max="100"
              value={tolerances.chartMarginRight}
              onChange={(e) => setTolerances(prev => ({ ...prev, chartMarginRight: parseInt(e.target.value) }))}
              className="w-full"
            />
            <div className="text-xs text-surface-white/50">{tolerances.chartMarginRight}px</div>
          </div>
          <div>
            <label className="text-xs text-surface-white/70">Bottom Margin</label>
            <input
              type="range"
              min="-100"
              max="100"
              value={tolerances.chartMarginBottom}
              onChange={(e) => setTolerances(prev => ({ ...prev, chartMarginBottom: parseInt(e.target.value) }))}
              className="w-full"
            />
            <div className="text-xs text-surface-white/50">{tolerances.chartMarginBottom}px</div>
          </div>
          <div>
            <label className="text-xs text-surface-white/70">Left Margin</label>
            <input
              type="range"
              min="-100"
              max="100"
              value={tolerances.chartMarginLeft}
              onChange={(e) => setTolerances(prev => ({ ...prev, chartMarginLeft: parseInt(e.target.value) }))}
              className="w-full"
            />
            <div className="text-xs text-surface-white/50">{tolerances.chartMarginLeft}px</div>
          </div>
        </div>

        <button
          onClick={() => setTolerances(defaultTolerances)}
          className="w-full mt-4 px-3 py-1.5 text-xs bg-navy-300/20 hover:bg-navy-300/30 rounded-md text-surface-white/70 hover:text-surface-white transition-colors"
        >
          Reset to Defaults
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-navy-500">
      <div className="px-4 py-4 space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-xl font-bold text-surface-white">Mining Companies Analysis</h1>
            <p className="text-sm text-surface-white/70">Compare key metrics across companies</p>
          </div>

          <div className="flex items-center gap-3">
            <TierSelector currentTier={effectiveTier} onTierChange={setTier} />
            <Link to="/companies">
              <Button
                variant="ghost"
                size="sm"
                className="text-surface-white/70 hover:text-surface-white hover:bg-navy-400/20"
                title="View Companies Table"
              >
                <Table2 className="h-5 w-5" />
              </Button>
            </Link>
            <Link to="/">
              <Button
                variant="ghost"
                size="sm"
                className="text-surface-white/70 hover:text-surface-white hover:bg-navy-400/20"
              >
                <Home className="h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-4">
            <MetricSelector
              label="X-Axis Metric"
              selectedMetric={xMetric}
              onMetricChange={setXMetric}
              metrics={accessibleMetrics}
              currentTier={effectiveTier}
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => setXScale('linear')}
                className={cn(
                  'px-3 py-1.5 text-xs rounded-md transition-colors',
                  xScale === 'linear' ? 'bg-accent-teal text-surface-white' : 'bg-navy-400/20 text-surface-white/70 hover:bg-navy-400/30'
                )}
              >
                Linear
              </button>
              <button
                onClick={() => setXScale('log')}
                className={cn(
                  'px-3 py-1.5 text-xs rounded-md transition-colors',
                  xScale === 'log' ? 'bg-accent-teal text-surface-white' : 'bg-navy-400/20 text-surface-white/70 hover:bg-navy-400/30'
                )}
              >
                Log
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <MetricSelector
              label="Y-Axis Metric"
              selectedMetric={yMetric}
              onMetricChange={setYMetric}
              metrics={accessibleMetrics}
              currentTier={effectiveTier}
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => setYScale('linear')}
                className={cn(
                  'px-3 py-1.5 text-xs rounded-md transition-colors',
                  yScale === 'linear' ? 'bg-accent-teal text-surface-white' : 'bg-navy-400/20 text-surface-white/70 hover:bg-navy-400/30'
                )}
              >
                Linear
              </button>
              <button
                onClick={() => setYScale('log')}
                className={cn(
                  'px-3 py-1.5 text-xs rounded-md transition-colors',
                  yScale === 'log' ? 'bg-accent-teal text-surface-white' : 'bg-navy-400/20 text-surface-white/70 hover:bg-navy-400/30'
                )}
              >
                Log
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <MetricSelector
              label="Bubble Size"
              selectedMetric={zMetric}
              onMetricChange={setZMetric}
              metrics={accessibleMetrics}
              currentTier={effectiveTier}
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => setZScale('linear')}
                className={cn(
                  'px-3 py-1.5 text-xs rounded-md transition-colors',
                  zScale === 'linear' ? 'bg-accent-teal text-surface-white' : 'bg-navy-400/20 text-surface-white/70 hover:bg-navy-400/30'
                )}
              >
                Linear
              </button>
              <button
                onClick={() => setZScale('log')}
                className={cn(
                  'px-3 py-1.5 text-xs rounded-md transition-colors',
                  zScale === 'log' ? 'bg-accent-teal text-surface-white' : 'bg-navy-400/20 text-surface-white/70 hover:bg-navy-400/30'
                )}
              >
                Log
              </button>
            </div>
          </div>
        </div>

        <div
          ref={chartRef}
          className="relative bg-navy-400 rounded-lg p-4"
          role="region"
          aria-label="Scatter chart displaying mining company metrics"
        >
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <LoadingIndicator />
            </div>
          )}
          {error && (
            <div className="text-red-500 text-center py-4">
              {error}
              <button
                onClick={() => setData([])} // Trigger refetch
                className="ml-2 text-xs underline hover:text-red-400"
              >
                Retry
              </button>
            </div>
          )}
          {!loading && !error && (
            <ResponsiveContainer width="100%" height={600}>
              <ScatterChart
                margin={{
                  top: Math.max(tolerances.chartMarginTop, 0),    // Prevent negative margins from breaking layout
                  right: Math.max(tolerances.chartMarginRight, 0),
                  bottom: Math.max(tolerances.chartMarginBottom, 0),
                  left: Math.max(tolerances.chartMarginLeft, 0),
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name={xMetricConfig?.label}
                  domain={xDomain}
                  scale={xScale}
                  tickFormatter={(value) => formatValue(value, xMetricConfig?.format || 'number')}
                  stroke="#E2E8F0"
                  tick={{ fill: '#E2E8F0', fontSize: 12 }}
                >
                  <Label
                    value={`${xMetricConfig?.label || 'X-Axis'} ${xMetricConfig?.higherIsBetter ? '↑' : '↓'}`}
                    position="bottom"
                    offset={tolerances.xAxisTitleOffset}
                    fill="#E2E8F0"
                    fontSize={14}
                    fontWeight="medium"
                  />
                </XAxis>
                <YAxis
                  type="number"
                  dataKey="y"
                  name={yMetricConfig?.label}
                  domain={yDomain}
                  scale={yScale}
                  tickFormatter={(value) => formatValue(value, yMetricConfig?.format || 'number')}
                  stroke="#E2E8F0"
                  tick={{ fill: '#E2E8F0', fontSize: 12 }}
                >
                  <Label
                    value={`${yMetricConfig?.label || 'Y-Axis'} ${yMetricConfig?.higherIsBetter ? '↑' : '↓'}`}
                    position="left"
                    offset={tolerances.yAxisTitleOffset}
                    angle={-90}
                    fill="#E2E8F0"
                    fontSize={14}
                    fontWeight="medium"
                  />
                </YAxis>
                <ZAxis
                  type="number"
                  dataKey="normalizedZ"
                  range={[50, 1000 * zoom]}
                  name={zMetricConfig?.label}
                />
                <Tooltip content={<CustomTooltip />} />
                <Scatter
                  data={transformedData}
                  fill="#F4A261"
                  fillOpacity={0.7}
                  shape="circle"
                />
              </ScatterChart>
            </ResponsiveContainer>
          )}
          <svg
            className="absolute"
            style={{
              top: tolerances.chartMarginTop + 16, // Adjust for p-4 top
              left: tolerances.chartMarginLeft + 16, // Adjust for p-4 left
              width: `calc(100% - ${tolerances.chartMarginLeft + tolerances.chartMarginRight + 32}px)`,
              height: `calc(100% - ${tolerances.chartMarginTop + tolerances.chartMarginBottom + 32}px)`,
              pointerEvents: 'none'
            }}
          >
            {labelElements}
          </svg>
          <div className="absolute top-4 left-4 flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleZoomIn}
              className="text-surface-white/70 hover:text-surface-white hover:bg-navy-400/20"
              aria-label="Zoom in"
            >
              <ZoomIn className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleZoomOut}
              className="text-surface-white/70 hover:text-surface-white hover:bg-navy-400/20"
              aria-label="Zoom out"
            >
              <ZoomOut className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetZoom}
              className="text-surface-white/70 hover:text-surface-white hover:bg-navy-400/20"
              aria-label="Reset zoom"
            >
              <RotateCcw className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowTolerances(!showTolerances)}
              className="text-surface-white/70 hover:text-surface-white hover:bg-navy-400/20"
              aria-label="Toggle settings panel"
            >
              <Settings className="h-5 w-5" />
            </Button>
          </div>
          <AnimatePresence>
            {showTolerances && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
              >
                <TolerancePanel />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}