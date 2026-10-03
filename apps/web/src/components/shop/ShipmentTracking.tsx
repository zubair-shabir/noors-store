import type { ShipmentDto, TimelineEntryDto, TrackingScanDto } from '@noors/shared';
import { labelClass } from './form';

const when = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Asia/Kolkata',
});
const day = new Intl.DateTimeFormat('en-IN', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'Asia/Kolkata',
});

/** Courier, AWB and expected delivery for a booked shipment. Goes inside a <dl>. */
export function ShipmentSummary({ shipment }: { shipment: ShipmentDto | null }) {
  if (!shipment?.awb) return null;
  const done = shipment.status === 'DELIVERED';
  return (
    <div>
      <dt className={labelClass}>Shipment</dt>
      <dd className="mt-2 leading-relaxed">
        {shipment.courier ?? 'Courier'}, AWB <span className="tabular-nums">{shipment.awb}</span>
        {!done && shipment.estimatedDelivery && (
          <>
            <br />
            Expected by {day.format(new Date(shipment.estimatedDelivery))}
          </>
        )}
      </dd>
      {shipment.trackingUrl && !done && (
        <dd>
          <a
            href={shipment.trackingUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-[11px] font-medium tracking-[0.14em] uppercase underline decoration-1 underline-offset-[5px] hover:opacity-60"
          >
            Track with the courier
          </a>
        </dd>
      )}
    </div>
  );
}

/** The order's milestones, oldest first. Goes inside a <dl>. */
export function Timeline({ entries }: { entries: TimelineEntryDto[] }) {
  if (!entries.length) return null;
  return (
    <div>
      <dt className={labelClass}>Progress</dt>
      <dd>
        <ol className="mt-3 space-y-3 border-l border-line pl-4">
          {entries.map((e) => (
            <li key={`${e.label}-${e.at}`} className="relative">
              <span
                className="absolute top-1.5 -left-[21px] h-2 w-2 rounded-full bg-foreground"
                aria-hidden
              />
              <span className="block">{e.label}</span>
              <span className="block text-xs text-muted">{when.format(new Date(e.at))}</span>
            </li>
          ))}
        </ol>
      </dd>
    </div>
  );
}

/** Every scan the courier has reported, newest first. */
export function Scans({ scans }: { scans: TrackingScanDto[] }) {
  if (!scans.length) return null;
  return (
    <div>
      <p className={labelClass}>Courier updates</p>
      <ul className="mt-3 divide-y divide-line border-y border-line text-sm">
        {scans.map((s) => (
          <li key={`${s.at}-${s.status}`} className="flex flex-wrap justify-between gap-x-6 py-3">
            <span>
              {s.status}
              {s.location && <span className="text-muted"> · {s.location}</span>}
            </span>
            <span className="text-xs text-muted tabular-nums">{when.format(new Date(s.at))}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
