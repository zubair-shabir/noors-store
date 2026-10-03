'use client';

import { formatINR, type DashboardDto } from '@noors/shared';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

type Point = DashboardDto['revenue'][number];

/* Daily sales as columns. Hand-drawn SVG so it follows the site's own colour tokens in both themes. */

const HEIGHT = 240;
const PAD = { top: 22, right: 8, bottom: 26, left: 52 };
const MAX_BAR = 24;
const RADIUS = 4;

const oneDecimal = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 });
/** Rupees as ₹950, ₹7.5k, ₹2.5L or ₹1.2Cr (Intl's en-IN compact form writes thousands as "T"). */
const compactINR = {
  format(rupees: number) {
    if (rupees >= 1e7) return `₹${oneDecimal.format(rupees / 1e7)}Cr`;
    if (rupees >= 1e5) return `₹${oneDecimal.format(rupees / 1e5)}L`;
    if (rupees >= 1e3) return `₹${oneDecimal.format(rupees / 1e3)}k`;
    return `₹${oneDecimal.format(rupees)}`;
  },
};
const shortDate = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const longDate = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "2026-10-03" is already a day in Indian time, so read it as a plain calendar date. */
const asDate = (day: string) => new Date(`${day}T00:00:00Z`);

/** Clean y-axis ticks in rupees: 0, 2,000, 4,000 ... */
function niceTicks(maxRupees: number): number[] {
  const max = maxRupees > 0 ? maxRupees : 1000;
  const rough = max / 4;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= rough) ?? 10 * mag;
  const ticks: number[] = [];
  for (let v = 0; v < max + step; v += step) {
    ticks.push(v);
    if (v >= max) break;
  }
  return ticks;
}

/** A column with a rounded top and a square foot on the baseline. */
function columnPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(RADIUS, w / 2, h);
  const bottom = y + h;
  return [
    `M${x},${bottom}`,
    `V${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `H${x + w - r}`,
    `Q${x + w},${y} ${x + w},${y + r}`,
    `V${bottom}`,
    'Z',
  ].join(' ');
}

export function RevenueChart({ points }: { points: Point[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(280, Math.round(entry.contentRect.width)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const n = points.length;
  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const ticks = niceTicks(Math.max(0, ...points.map((p) => p.sales)) / 100);
  const top = ticks[ticks.length - 1] * 100;
  const band = n ? plotW / n : plotW;
  const barW = Math.max(1, Math.min(MAX_BAR, band * 0.7, band - 2));
  const y = (paise: number) => PAD.top + plotH - (paise / top) * plotH;
  const center = (i: number) => PAD.left + band * i + band / 2;

  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / 72))));
  const peak = points.reduce((best, p, i) => (p.sales > (points[best]?.sales ?? 0) ? i : best), 0);
  const hasSales = points.some((p) => p.sales > 0);
  const total = points.reduce((sum, p) => sum + p.sales, 0);

  function onKeyDown(e: KeyboardEvent<SVGSVGElement>) {
    if (!n) return;
    const current = active ?? n - 1;
    const next =
      e.key === 'ArrowLeft'
        ? Math.max(0, current - 1)
        : e.key === 'ArrowRight'
          ? Math.min(n - 1, current + 1)
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? n - 1
              : null;
    if (next === null) return;
    e.preventDefault();
    setActive(next);
  }

  const point = active !== null ? points[active] : undefined;
  // The tooltip sits beside the day, on the side with more room, so it never covers the bar.
  const tipStyle =
    active === null
      ? undefined
      : center(active) < width / 2
        ? { left: center(active) + band / 2 + 8, top: PAD.top }
        : { right: width - (center(active) - band / 2) + 8, top: PAD.top };

  const summary = n
    ? `Daily sales from ${shortDate.format(asDate(points[0].date))} to ${shortDate.format(asDate(points[n - 1].date))}, ${formatINR(total)} in total.${hasSales ? ` Best day ${longDate.format(asDate(points[peak].date))} with ${formatINR(points[peak].sales)}.` : ' No sales yet.'} Use the arrow keys to read each day.`
    : 'No days to show.';

  return (
    <div>
      <div ref={wrapRef} className="relative" onPointerLeave={() => setActive(null)}>
        <svg
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          role="img"
          aria-label={summary}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onFocus={() => setActive((a) => a ?? (n ? n - 1 : null))}
          onBlur={() => setActive(null)}
          className="block max-w-full rounded-md outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
        >
          {/* Gridlines and y-axis ticks */}
          {ticks.map((t) => {
            const ty = y(t * 100);
            return (
              <g key={t}>
                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={ty}
                  y2={ty}
                  stroke="var(--line)"
                  strokeWidth={1}
                  shapeRendering="crispEdges"
                />
                <text
                  x={PAD.left - 8}
                  y={ty}
                  dy="0.32em"
                  textAnchor="end"
                  fontSize={11}
                  fill="var(--muted)"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {t === 0 ? '₹0' : compactINR.format(t)}
                </text>
              </g>
            );
          })}

          {/* Highlight behind the day under the pointer */}
          {active !== null && (
            <rect
              x={PAD.left + band * active}
              y={PAD.top}
              width={band}
              height={plotH}
              fill="var(--surface)"
              rx={2}
            />
          )}

          {/* Columns */}
          {points.map((p, i) => {
            const h = PAD.top + plotH - y(p.sales);
            if (h <= 0) return null;
            return (
              <path
                key={p.date}
                d={columnPath(center(i) - barW / 2, y(p.sales), barW, Math.max(h, 1))}
                fill="var(--foreground)"
                fillOpacity={active === null || active === i ? 0.85 : 0.35}
                style={{ transition: 'fill-opacity 120ms' }}
              />
            );
          })}

          {/* Baseline */}
          <line
            x1={PAD.left}
            x2={width - PAD.right}
            y1={PAD.top + plotH}
            y2={PAD.top + plotH}
            stroke="var(--muted)"
            strokeOpacity={0.5}
            strokeWidth={1}
            shapeRendering="crispEdges"
          />

          {/* One direct label: the best day */}
          {hasSales && active === null && (
            <text
              x={Math.min(Math.max(center(peak), PAD.left + 24), width - PAD.right - 24)}
              y={y(points[peak].sales) - 6}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill="var(--foreground)"
            >
              {compactINR.format(points[peak].sales / 100)}
            </text>
          )}

          {/* X-axis dates, counted back from today so the latest day is always labelled */}
          {points.map((p, i) => {
            if ((n - 1 - i) % labelEvery !== 0) return null;
            const x = center(i);
            if (i !== n - 1 && x > width - PAD.right - 56) return null;
            if (x < PAD.left + 16) return null;
            return (
              <text
                key={p.date}
                x={i === n - 1 ? Math.min(x, width - PAD.right) : x}
                y={HEIGHT - 8}
                textAnchor={i === n - 1 && x > width - PAD.right - 28 ? 'end' : 'middle'}
                fontSize={11}
                fill="var(--muted)"
              >
                {shortDate.format(asDate(p.date))}
              </text>
            );
          })}

          {/* Hit areas: the whole day column, not just the painted bar */}
          {points.map((p, i) => (
            <rect
              key={p.date}
              x={PAD.left + band * i}
              y={PAD.top}
              width={band}
              height={plotH}
              fill="transparent"
              onPointerEnter={() => setActive(i)}
              onPointerDown={() => setActive(i)}
            />
          ))}
        </svg>

        {point && (
          <div
            className="pointer-events-none absolute z-10 min-w-36 rounded-lg border border-line bg-background px-3 py-2 text-xs shadow-lg"
            style={tipStyle}
          >
            <p className="text-sm font-semibold">{formatINR(point.sales)}</p>
            <p className="text-muted">
              {point.orders} {point.orders === 1 ? 'order' : 'orders'}
            </p>
            <p className="mt-1 text-muted">{longDate.format(asDate(point.date))}</p>
          </div>
        )}
        <p className="sr-only" aria-live="polite">
          {point
            ? `${longDate.format(asDate(point.date))}: ${formatINR(point.sales)}, ${point.orders} ${point.orders === 1 ? 'order' : 'orders'}`
            : ''}
        </p>
      </div>

      {!hasSales && (
        <p className="mt-2 text-center text-sm text-muted">No sales in this period yet.</p>
      )}

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-muted hover:text-foreground">
          Show as a table
        </summary>
        <div className="mt-2 max-h-72 overflow-y-auto rounded-md border border-line">
          <table className="w-full">
            <thead className="sticky top-0 bg-background text-left text-xs text-muted">
              <tr className="border-b border-line">
                <th className="px-3 py-2 font-medium">Day</th>
                <th className="px-3 py-2 text-right font-medium">Orders</th>
                <th className="px-3 py-2 text-right font-medium">Sales</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {[...points].reverse().map((p) => (
                <tr key={p.date}>
                  <td className="px-3 py-1.5">{longDate.format(asDate(p.date))}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{p.orders}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatINR(p.sales)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
