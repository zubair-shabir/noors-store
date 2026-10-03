import { z } from 'zod';
import { phoneSchema, pincodeSchema } from './schemas.js';
import type { OrderItemDto, OrderStatus } from './commerce.js';

export const serviceabilityQuerySchema = z.object({ pincode: pincodeSchema });

export interface ServiceabilityDto {
  pincode: string;
  serviceable: boolean;
  /** Working days the courier quotes for delivery, when known. */
  estimatedDays: number | null;
  /** Expected delivery date (YYYY-MM-DD), when known. */
  estimatedDate: string | null;
}

export type ShipmentStatus =
  | 'PENDING'
  | 'AWB_ASSIGNED'
  | 'PICKUP_SCHEDULED'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'RTO'
  | 'CANCELLED';

export interface ShipmentDto {
  status: ShipmentStatus;
  courier: string | null;
  awb: string | null;
  trackingUrl: string | null;
  estimatedDelivery: string | null;
}

/** One scan from the courier, newest first in lists. */
export interface TrackingScanDto {
  at: string;
  status: string;
  location: string | null;
}

/** A milestone on the order (placed, paid, shipped...). */
export interface TimelineEntryDto {
  at: string;
  label: string;
}

export const trackQuerySchema = z.object({
  order: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^NR-\d{6,}$/, 'Enter the order number, like NR-100245'),
  phone: phoneSchema,
});
export type TrackQuery = z.input<typeof trackQuerySchema>;

/** What the public tracking page shows: no address or email, since only a phone is asked for. */
export interface TrackingDto {
  number: string;
  status: OrderStatus;
  placedAt: string | null;
  items: OrderItemDto[];
  shipment: ShipmentDto | null;
  scans: TrackingScanDto[];
  timeline: TimelineEntryDto[];
}
