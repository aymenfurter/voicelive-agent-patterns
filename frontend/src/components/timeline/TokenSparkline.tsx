import { useEffect, useRef, useState } from 'react';

export interface TokenPoint {
  timestamp: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cumulativeInput: number;
  cumulativeOutput: number;
  cumulativeTotal: number;
  responseIndex: number;
}

interface Props {
  points: TokenPoint[];
  field: 'cumulativeInput' | 'cumulativeOutput' | 'cumulativeTotal';
  color: string;
  height?: number;
}

export function TokenSparkline({ points, field, color, height = 80 }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [svgWidth, setSvgWidth] = useState(400);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) setSvgWidth(w);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (points.length < 1) {
    return (
      <svg ref={svgRef} viewBox={`0 0 ${svgWidth} ${height}`} style={{ width: '100%', height }}>
        <text x={svgWidth / 2} y={height / 2} textAnchor="middle" fill="var(--text-3)" fontSize="11">No data yet</text>
      </svg>
    );
  }

  const maxVal = Math.max(...points.map((p) => p[field]), 1);
  const minTs = points[0].timestamp;
  const maxTs = points[points.length - 1].timestamp;
  const timeRange = Math.max(maxTs - minTs, 1);

  const pad = 4;
  const toX = (ts: number) => ((ts - minTs) / timeRange) * (svgWidth - pad * 2) + pad;
  const toY = (val: number) => height - pad - (val / maxVal) * (height - pad * 2);

  const pathParts = points.map((p, i) => {
    const x = toX(p.timestamp);
    const y = toY(p[field]);
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  });

  const firstX = toX(points[0].timestamp).toFixed(1);
  const lastX = toX(points[points.length - 1].timestamp).toFixed(1);
  const areaPath = `${pathParts.join(' ')} L ${lastX} ${height - pad} L ${firstX} ${height - pad} Z`;

  return (
    <svg ref={svgRef} viewBox={`0 0 ${svgWidth} ${height}`} style={{ width: '100%', height }}>
      <defs>
        <linearGradient id={`grad-${field}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#grad-${field})`} />
      <path d={pathParts.join(' ')} fill="none" stroke={color} strokeWidth="1.5" />
      {points.map((p) => (
        <circle
          key={p.responseIndex}
          cx={toX(p.timestamp).toFixed(1)}
          cy={toY(p[field]).toFixed(1)}
          r="3"
          fill={color}
        />
      ))}
    </svg>
  );
}
