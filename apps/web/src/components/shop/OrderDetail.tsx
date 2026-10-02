import { orderStatusLabel, type OrderDto } from '@noors/shared';
import { OrderLines, Totals } from './OrderLines';

const dateFormat = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

/** Items, totals, address and status of one order. */
export function OrderDetail({ order }: { order: OrderDto }) {
  const a = order.shippingAddress;
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div>
        <OrderLines
          lines={order.items.map((i, n) => ({
            key: `${i.sku}-${n}`,
            name: i.name,
            title: i.title,
            image: i.image,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
          }))}
        />
        <div className="mt-8 border-t border-line pt-6">
          <Totals
            subtotal={order.subtotal}
            discount={order.discount}
            discountLabel={order.couponCode ?? undefined}
            shippingFee={order.shippingFee}
            total={order.total}
          />
        </div>
      </div>
      <dl className="space-y-6 text-sm">
        <div>
          <dt className="text-[11px] font-semibold tracking-[0.14em] uppercase">Status</dt>
          <dd className="mt-2">{orderStatusLabel[order.status]}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold tracking-[0.14em] uppercase">Placed</dt>
          <dd className="mt-2">{dateFormat.format(new Date(order.placedAt ?? order.createdAt))}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold tracking-[0.14em] uppercase">Delivering to</dt>
          <dd className="mt-2 leading-relaxed">
            {a.name}
            <br />
            {a.line1}
            {a.line2 && (
              <>
                <br />
                {a.line2}
              </>
            )}
            <br />
            {a.city}, {a.state} {a.pincode}
            <br />
            {a.phone}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold tracking-[0.14em] uppercase">Contact</dt>
          <dd className="mt-2">{order.email}</dd>
        </div>
      </dl>
    </div>
  );
}
