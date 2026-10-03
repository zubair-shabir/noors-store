'use client';

import { formatINR, type AdminReturnDto, type ReturnUpdateInput } from '@noors/shared';
import { useState, type FormEvent } from 'react';
import { adminFetch, paiseToRupees, rupeesToPaise, type ApiError } from '@/lib/admin/api';
import { toast } from '@/lib/admin/toast-store';
import { useIsOwner } from '../../AdminShell';
import { Button, ErrorNote, Field, Input, Modal, Textarea } from '../../ui';

export type ReturnAction = 'APPROVED' | 'REJECTED' | 'RECEIVED' | 'COMPLETED';

const COPY: Record<ReturnAction, { title: string; button: string; done: string }> = {
  APPROVED: { title: 'Approve request', button: 'Approve', done: 'Request approved' },
  REJECTED: { title: 'Decline request', button: 'Decline', done: 'Request declined' },
  RECEIVED: { title: 'Mark as received', button: 'Mark received', done: 'Marked as received' },
  COMPLETED: { title: 'Complete request', button: 'Complete', done: 'Request completed' },
};

/** Moves a return to its next status. Keyed by return + action so the form resets each time. */
export function ReturnActionModal({
  ret,
  action,
  onClose,
  onDone,
  onStale,
}: {
  ret: AdminReturnDto | null;
  action: ReturnAction | null;
  onClose: () => void;
  onDone: (updated: AdminReturnDto) => void;
  /** Reload the list: the return may have changed even though the request failed. */
  onStale: () => void;
}) {
  const open = Boolean(ret && action);
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={action ? COPY[action].title : ''}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            form="return-action-form"
            busy={busy}
            variant={action === 'REJECTED' ? 'danger' : 'primary'}
          >
            {action ? COPY[action].button : ''}
          </Button>
        </>
      }
    >
      {ret && action && (
        <ActionForm
          key={`${ret.id}:${action}`}
          ret={ret}
          action={action}
          busy={busy}
          setBusy={setBusy}
          onDone={onDone}
          onStale={onStale}
        />
      )}
    </Modal>
  );
}

function ActionForm({
  ret,
  action,
  busy,
  setBusy,
  onDone,
  onStale,
}: {
  ret: AdminReturnDto;
  action: ReturnAction;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onDone: (updated: AdminReturnDto) => void;
  onStale: () => void;
}) {
  const isOwner = useIsOwner();
  const [note, setNote] = useState('');
  const [restock, setRestock] = useState(true);
  const [refund, setRefund] = useState(paiseToRupees(ret.itemsValue));
  const [refundError, setRefundError] = useState<string>();
  const [error, setError] = useState<ApiError>();

  const completing = action === 'COMPLETED';
  const canRefund = completing && ret.type === 'RETURN' && isOwner;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const body: ReturnUpdateInput = { status: action, note: note.trim() || undefined };
    if (completing) body.restock = restock;
    let refundAmount = 0;
    if (canRefund) {
      const paise = rupeesToPaise(refund);
      if (paise === undefined) return setRefundError('Enter an amount in rupees, like 1499');
      refundAmount = paise ?? 0;
      body.refundAmount = refundAmount;
    }
    setRefundError(undefined);
    setError(undefined);
    setBusy(true);
    try {
      const updated = await adminFetch<AdminReturnDto>(`/returns/${ret.id}`, {
        method: 'PATCH',
        body,
      });
      toast.success(
        refundAmount
          ? `${COPY[action].done}, ${formatINR(refundAmount)} refund started`
          : COPY[action].done,
      );
      onDone(updated);
    } catch (err) {
      setError(err as ApiError);
      // The refund runs after the return is completed, so a refund error can leave it completed.
      if (refundAmount) onStale();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form id="return-action-form" onSubmit={submit} className="space-y-4">
      <p className="text-sm text-muted">
        {ret.type === 'EXCHANGE' ? 'Exchange' : 'Return'} for order {ret.orderNumber} from{' '}
        {ret.name}.{action === 'RECEIVED' && ' Use this once the parcel is back with you.'}
        {action === 'REJECTED' && ' The customer is told by email.'}
      </p>

      {completing && (
        <>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={restock}
              onChange={(e) => setRestock(e.target.checked)}
              className="mt-0.5 size-4 accent-foreground"
            />
            <span>
              <span className="font-medium">Put items back in stock</span>
              <span className="block text-xs text-muted">
                Untick if the items are damaged or cannot be sold again.
              </span>
            </span>
          </label>

          {ret.type === 'RETURN' &&
            (canRefund ? (
              <Field
                label="Refund amount (₹)"
                error={refundError ?? error?.fieldError('refundAmount')}
                hint={`Items value is ${formatINR(ret.itemsValue)}. Enter 0 to complete without a refund, for example on cash on delivery orders, which are refunded by bank transfer or UPI.`}
              >
                {(id) => (
                  <Input
                    id={id}
                    inputMode="decimal"
                    value={refund}
                    onChange={(e) => setRefund(e.target.value)}
                    aria-invalid={Boolean(refundError)}
                  />
                )}
              </Field>
            ) : (
              <p className="rounded-md bg-surface px-3 py-2 text-sm text-muted">
                This completes the return without a refund. An owner issues refunds from the order
                page.
              </p>
            ))}

          {ret.type === 'EXCHANGE' && (
            <p className="rounded-md bg-surface px-3 py-2 text-sm text-muted">
              Completing does not send anything by itself. Send the replacement by placing or
              handling a new order for the customer yourself.
            </p>
          )}
        </>
      )}

      <Field label="Note to the customer" hint="Optional. Included in the email we send them.">
        {(id) => (
          <Textarea
            id={id}
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              action === 'REJECTED' ? 'For example, the item has been worn' : 'Anything to add?'
            }
          />
        )}
      </Field>

      <ErrorNote error={error} />
    </form>
  );
}
