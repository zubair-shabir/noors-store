'use client';

import { formatINR, type AdminOrderDto } from '@noors/shared';
import { FileText, Truck } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { adminFetch, ApiError, paiseToRupees, rupeesToPaise } from '@/lib/admin/api';
import { toast } from '@/lib/admin/toast-store';
import { useIsOwner } from '../../AdminShell';
import { Button, ConfirmDialog, ErrorNote, Field, Input, Modal, Textarea } from '../../ui';

type Open = null | 'ship' | 'deliver' | 'cancel' | 'refund';

const path = (order: AdminOrderDto, action: string) =>
  `/orders/${encodeURIComponent(order.number)}/${action}`;

/** The buttons along the top of an order, and the dialogs behind them. */
export function OrderActions({
  order,
  onChange,
}: {
  order: AdminOrderDto;
  onChange: (order: AdminOrderDto) => void;
}) {
  const isOwner = useIsOwner();
  const [open, setOpen] = useState<Open>(null);
  const [booking, setBooking] = useState(false);
  const [delivering, setDelivering] = useState(false);
  const close = () => setOpen(null);

  async function book() {
    setBooking(true);
    try {
      const next = await adminFetch<AdminOrderDto>(path(order, 'book'), { method: 'POST' });
      onChange(next);
      const shipment = next.shipments.find((s) => s.status !== 'CANCELLED') ?? next.shipments[0];
      if (shipment?.awb) toast.success(`Booked with ${shipment.courier ?? 'Shiprocket'}`);
      else if (shipment?.lastError) toast.error(new Error(shipment.lastError));
      else toast.success('Booking sent to Shiprocket');
    } catch (err) {
      toast.error(err);
    } finally {
      setBooking(false);
    }
  }

  async function deliver() {
    setDelivering(true);
    try {
      onChange(await adminFetch<AdminOrderDto>(path(order, 'deliver'), { method: 'POST' }));
      toast.success('Marked delivered');
      close();
    } catch (err) {
      toast.error(err);
    } finally {
      setDelivering(false);
    }
  }

  const { can } = order;
  return (
    <>
      <a
        href={`/admin/invoice/${encodeURIComponent(order.number)}`}
        target="_blank"
        rel="noopener"
        className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-background px-4 text-sm font-medium transition hover:bg-surface"
      >
        <FileText className="size-4" aria-hidden /> Invoice
      </a>
      {can.book && (
        <Button variant="primary" busy={booking} onClick={book}>
          <Truck className="size-4" aria-hidden /> Book with Shiprocket
        </Button>
      )}
      {can.markShipped && <Button onClick={() => setOpen('ship')}>Mark shipped</Button>}
      {can.markDelivered && <Button onClick={() => setOpen('deliver')}>Mark delivered</Button>}
      {isOwner && can.refund && order.refundable > 0 && (
        <Button onClick={() => setOpen('refund')}>Refund</Button>
      )}
      {isOwner && can.cancel && (
        <Button variant="danger" onClick={() => setOpen('cancel')}>
          Cancel order
        </Button>
      )}

      <ShipModal open={open === 'ship'} order={order} onClose={close} onDone={onChange} />
      <ConfirmDialog
        open={open === 'deliver'}
        title="Mark as delivered?"
        body="Only do this when you know the parcel reached the customer. They will get an email."
        confirmLabel="Mark delivered"
        busy={delivering}
        onConfirm={deliver}
        onClose={close}
      />
      {isOwner && (
        <>
          <CancelModal open={open === 'cancel'} order={order} onClose={close} onDone={onChange} />
          <RefundModal
            key={order.refundable}
            open={open === 'refund'}
            order={order}
            onClose={close}
            onDone={onChange}
          />
        </>
      )}
    </>
  );
}

interface DialogProps {
  open: boolean;
  order: AdminOrderDto;
  onClose: () => void;
  onDone: (order: AdminOrderDto) => void;
}

/** Busy flag and error for one dialog's submit. */
function useSubmit(onDone: (order: AdminOrderDto) => void, onClose: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | Error>();
  async function submit(send: () => Promise<AdminOrderDto>, message: string) {
    setBusy(true);
    setError(undefined);
    try {
      onDone(await send());
      toast.success(message);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Something went wrong'));
    } finally {
      setBusy(false);
    }
  }
  const fieldError = (field: string) =>
    error instanceof ApiError ? error.fieldError(field) : undefined;
  return { busy, error, setError, submit, fieldError };
}

function ShipModal({ open, order, onClose, onDone }: DialogProps) {
  const [courier, setCourier] = useState('');
  const [awb, setAwb] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const { busy, error, submit, fieldError } = useSubmit(onDone, onClose);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Mark as shipped"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="ship-form" busy={busy}>
            Mark shipped
          </Button>
        </>
      }
    >
      <form
        id="ship-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(
            () =>
              adminFetch(path(order, 'ship'), {
                body: { courier, awb, trackingUrl: trackingUrl || undefined },
              }),
            'Marked shipped',
          );
        }}
      >
        <p className="text-sm text-muted">
          Use this when you booked the parcel yourself, outside the dashboard. The customer gets an
          email with the tracking details.
        </p>
        <Field label="Courier" error={fieldError('courier')}>
          {(id) => (
            <Input
              id={id}
              value={courier}
              onChange={(e) => setCourier(e.target.value)}
              placeholder="e.g. Delhivery"
              aria-invalid={Boolean(fieldError('courier'))}
              required
            />
          )}
        </Field>
        <Field label="Tracking number (AWB)" error={fieldError('awb')}>
          {(id) => (
            <Input
              id={id}
              value={awb}
              onChange={(e) => setAwb(e.target.value)}
              aria-invalid={Boolean(fieldError('awb'))}
              required
            />
          )}
        </Field>
        <Field label="Tracking link" hint="Optional" error={fieldError('trackingUrl')}>
          {(id) => (
            <Input
              id={id}
              type="url"
              value={trackingUrl}
              onChange={(e) => setTrackingUrl(e.target.value)}
              placeholder="https://"
              aria-invalid={Boolean(fieldError('trackingUrl'))}
            />
          )}
        </Field>
        <ErrorNote error={error} />
      </form>
    </Modal>
  );
}

function CancelModal({ open, order, onClose, onDone }: DialogProps) {
  const [reason, setReason] = useState('');
  const [refund, setRefund] = useState(true);
  const [restock, setRestock] = useState(true);
  const { busy, error, submit, fieldError } = useSubmit(onDone, onClose);
  const canRefund = order.refundable > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Cancel order ${order.number}`}
      footer={
        <>
          <Button onClick={onClose}>Keep order</Button>
          <Button variant="danger" type="submit" form="cancel-form" busy={busy}>
            Cancel order
          </Button>
        </>
      }
    >
      <form
        id="cancel-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(
            () =>
              adminFetch(path(order, 'cancel'), {
                body: { reason, refund: canRefund && refund, restock },
              }),
            'Order cancelled',
          );
        }}
      >
        <p className="text-sm text-muted">
          The customer will get an email. Any courier booking is cancelled too.
        </p>
        <Field label="Reason" error={fieldError('reason')}>
          {(id) => (
            <Textarea
              id={id}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
              placeholder="e.g. Customer asked to cancel"
              aria-invalid={Boolean(fieldError('reason'))}
              required
            />
          )}
        </Field>
        {canRefund && (
          <Checkbox checked={refund} onChange={setRefund}>
            Refund {formatINR(order.refundable)} to the customer
          </Checkbox>
        )}
        <Checkbox checked={restock} onChange={setRestock}>
          Put items back in stock
        </Checkbox>
        <ErrorNote error={error} />
      </form>
    </Modal>
  );
}

function RefundModal({ open, order, onClose, onDone }: DialogProps) {
  const [amount, setAmount] = useState(() => paiseToRupees(order.refundable));
  const [reason, setReason] = useState('');
  const { busy, error, setError, submit, fieldError } = useSubmit(onDone, onClose);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Refund"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="refund-form" busy={busy}>
            Refund
          </Button>
        </>
      }
    >
      <form
        id="refund-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const paise = rupeesToPaise(amount);
          if (!paise) return setError(new Error('Enter an amount in rupees'));
          if (paise > order.refundable) {
            return setError(new Error(`You can refund at most ${formatINR(order.refundable)}`));
          }
          void submit(
            () => adminFetch(path(order, 'refund'), { body: { amount: paise, reason } }),
            `Refund of ${formatINR(paise)} started`,
          );
        }}
      >
        <p className="text-sm text-muted">
          The money goes back to the customer&apos;s original payment method. Up to{' '}
          {formatINR(order.refundable)} can be refunded.
        </p>
        <Field label="Amount (₹)" error={fieldError('amount')}>
          {(id) => (
            <Input
              id={id}
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={Boolean(fieldError('amount'))}
              required
            />
          )}
        </Field>
        <Field label="Reason" error={fieldError('reason')}>
          {(id) => (
            <Textarea
              id={id}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
              placeholder="e.g. Item out of stock"
              aria-invalid={Boolean(fieldError('reason'))}
              required
            />
          )}
        </Field>
        <ErrorNote error={error} />
      </form>
    </Modal>
  );
}

function Checkbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-foreground"
      />
      {children}
    </label>
  );
}
