'use client';

import React from 'react';
import { formatCurrency, formatNumber } from '@/lib/formatters';

/**
 * Lightweight dependency-free SVG charts:
 *  - LineChart  (revenue over time)
 *  - BarChart   (comparative metrics)
 *  - DonutChart (distribution share)
 */
export function LineChart({ data = [], xKey = 'label', yKey = 'value', height = 220, formatValue = formatCurrency, color = '#4f46e5' }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-slate-400" style={{ height }}>
        No data available for the selected period
      </div>
    );
  }

  const padding = { top: 16, right: 12, bottom: 28, left: 52 };
  const width = 640;
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const maxValue = Math.max(...data.map((d) => Number(d[yKey] || 0)), 1);
  const stepX = data.length > 1 ? innerWidth / (data.length - 1) : 0;

  const points = data.map((d, i) => {
    const x = padding.left + i * stepX;
    const y = padding.top + innerHeight - (Number(d[yKey] || 0) / maxValue) * innerHeight;
    return { x, y, datum: d };
  });

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${path} L ${points[points.length - 1].x} ${padding.top + innerHeight} L ${
    points[0].x
  } ${padding.top + innerHeight} Z`;

  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[420px]" style={{ height }}>
        {/* Grid */}
        {gridLines.map((ratio) => {
          const y = padding.top + innerHeight - ratio * innerHeight;
          return (
            <g key={ratio}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="#e2e8f0"
                strokeWidth="1"
                strokeDasharray={ratio === 0 ? undefined : '3 3'}
              />
              <text x={padding.left - 8} y={y + 3} textAnchor="end" fontSize="9" fill="#94a3b8">
                {ratio === 0 ? '0' : `${Math.round(maxValue * ratio / 1000)}k`}
              </text>
            </g>
          );
        })}

        {/* Area + Line */}
        <path d={areaPath} fill={color} fillOpacity="0.08" />
        <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {/* Points + tooltips */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="3.5" fill="#fff" stroke={color} strokeWidth="2">
              <title>{`${p.datum[xKey]}: ${formatValue(p.datum[yKey])}`}</title>
            </circle>
            {(data.length <= 12 || i % Math.ceil(data.length / 8) === 0) && (
              <text x={p.x} y={height - 8} textAnchor="middle" fontSize="9" fill="#94a3b8">
                {p.datum[xKey]}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

export function BarChart({ data = [], xKey = 'label', yKey = 'value', height = 220, formatValue = formatCurrency, color = '#4f46e5' }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-slate-400" style={{ height }}>
        No data available
      </div>
    );
  }

  const padding = { top: 16, right: 12, bottom: 32, left: 52 };
  const width = 640;
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const maxValue = Math.max(...data.map((d) => Number(d[yKey] || 0)), 1);
  const barSlot = innerWidth / data.length;
  const barWidth = Math.min(barSlot * 0.6, 46);

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[420px]" style={{ height }}>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padding.top + innerHeight - ratio * innerHeight;
          return (
            <g key={ratio}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="#e2e8f0"
                strokeWidth="1"
                strokeDasharray={ratio === 0 ? undefined : '3 3'}
              />
              <text x={padding.left - 8} y={y + 3} textAnchor="end" fontSize="9" fill="#94a3b8">
                {ratio === 0 ? '0' : `${Math.round(maxValue * ratio / 1000)}k`}
              </text>
            </g>
          );
        })}

        {data.map((d, i) => {
          const barHeight = (Number(d[yKey] || 0) / maxValue) * innerHeight;
          const x = padding.left + i * barSlot + (barSlot - barWidth) / 2;
          const y = padding.top + innerHeight - barHeight;

          return (
            <g key={i}>
              <rect x={x} y={y} width={barWidth} height={barHeight} rx="4" fill={color} fillOpacity="0.85">
                <title>{`${d[xKey]}: ${formatValue(d[yKey])}`}</title>
              </rect>
              <text x={x + barWidth / 2} y={height - 10} textAnchor="middle" fontSize="9" fill="#94a3b8">
                {String(d[xKey]).length > 12 ? `${String(d[xKey]).slice(0, 11)}…` : d[xKey]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

const DONUT_COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f43f5e'];

export function DonutChart({ data = [], nameKey = 'label', valueKey = 'value', size = 200, formatValue = formatCurrency }) {
  const total = data.reduce((acc, d) => acc + Number(d[valueKey] || 0), 0);

  if (total <= 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-slate-400">
        No data available
      </div>
    );
  }

  const radius = 70;
  const strokeWidth = 26;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 200 200" width={size} height={size}>
          <g transform="translate(100, 100) rotate(-90)">
            <circle r={radius} fill="none" stroke="#f1f5f9" strokeWidth={strokeWidth} />
            {data.map((d, i) => {
              const value = Number(d[valueKey] || 0);
              const portion = value / total;
              const dash = portion * circumference;
              const element = (
                <circle
                  key={i}
                  r={radius}
                  fill="none"
                  stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-offset}
                >
                  <title>{`${d[nameKey]}: ${formatValue(value)}`}</title>
                </circle>
              );
              offset += dash;
              return element;
            })}
          </g>
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Total</span>
          <span className="text-lg font-bold text-slate-900">{formatValue(total)}</span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex-1 w-full space-y-2">
        {data.map((d, i) => (
          <div key={i} className="flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }}
              />
              <span className="text-slate-600 truncate">{d[nameKey]}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-semibold text-slate-900">{formatValue(d[valueKey])}</span>
              <span className="text-slate-400 w-11 text-right">
                {Math.round((Number(d[valueKey] || 0) / total) * 100)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProgressBar({ value, max, tone = 'indigo', showLabel = true }) {
  const percentage = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;

  const tones = {
    indigo: 'bg-indigo-500',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500',
    sky: 'bg-sky-500',
  };

  return (
    <div className="w-full">
      {showLabel && (
        <div className="flex items-center justify-between text-[11px] mb-1">
          <span className="text-slate-500 font-medium">{percentage}%</span>
        </div>
      )}
      <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full rounded-full ${tones[tone] || tones.indigo} transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}