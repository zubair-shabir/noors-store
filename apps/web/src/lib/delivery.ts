'use client';

import type { ServiceabilityDto } from '@noors/shared';
import { useEffect, useState } from 'react';
import { shopFetch } from './shop-api';

const PINCODE = /^[1-9][0-9]{5}$/;
const KEY = 'noors-pincode';
const cache = new Map<string, Promise<ServiceabilityDto>>();

function lookup(pincode: string) {
  let hit = cache.get(pincode);
  if (!hit) {
    hit = shopFetch<ServiceabilityDto>(`/shipping/serviceability?pincode=${pincode}`);
    hit.catch(() => cache.delete(pincode));
    cache.set(pincode, hit);
  }
  return hit;
}

export type Delivery =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'done'; result: ServiceabilityDto };

/** Whether couriers reach a pincode and when, for any complete 6-digit pincode. */
export function useDelivery(pincode: string): Delivery {
  const valid = PINCODE.test(pincode);
  const [answer, setAnswer] = useState<{ pincode: string; result: ServiceabilityDto | null }>();
  useEffect(() => {
    if (!valid) return;
    let live = true;
    lookup(pincode).then(
      (result) => live && setAnswer({ pincode, result }),
      () => live && setAnswer({ pincode, result: null }),
    );
    return () => {
      live = false;
    };
  }, [pincode, valid]);
  if (!valid) return { state: 'idle' };
  if (answer?.pincode !== pincode) return { state: 'loading' };
  return answer.result ? { state: 'done', result: answer.result } : { state: 'error' };
}

const dateFormat = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

/** "Tue, 7 Oct" from "2026-10-07". */
export const deliveryDate = (isoDate: string) =>
  dateFormat.format(new Date(`${isoDate}T00:00:00Z`));

/** The pincode the shopper last checked, so product pages remember it. */
export function savedPincode(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function savePincode(pincode: string) {
  try {
    localStorage.setItem(KEY, pincode);
  } catch {
    // Private mode: nothing to remember it in.
  }
}
