import type { Metadata } from 'next';
import { EmailLink, PolicyLink, PolicyPage, PolicySection } from '@/components/content/PolicyPage';
import { getStoreInfo } from '@/lib/store-api';

export const metadata: Metadata = {
  title: 'Returns, exchanges and refunds',
  description:
    "How to return or exchange a Noor's order, when refunds reach you, and what to do about a damaged or wrong item.",
  alternates: { canonical: '/returns' },
};

export default async function ReturnsPage() {
  const info = await getStoreInfo();
  const days = info.returns.windowDays;
  const window = days > 0 ? `${days} days` : null;
  return (
    <PolicyPage
      title="Returns & refunds"
      intro={
        <p>
          If something does not fit or is not what you hoped, we will make it right. This page
          covers returns, size exchanges, refunds and cancellations.
        </p>
      }
      facts={[
        {
          label: 'Return window',
          value: window ? `${window} from delivery` : 'Damaged or wrong only',
        },
        { label: 'Exchanges', value: 'For another size' },
        { label: 'Refund time', value: '5 to 7 working days' },
        { label: 'Ask from', value: 'Your order page' },
      ]}
    >
      <PolicySection title="The return window">
        {window ? (
          <p>
            You can ask for a return or an exchange within <strong>{window} of delivery</strong>.
            The window starts on the day the courier marks your order as delivered, and you can see
            the last day on your order page.
          </p>
        ) : (
          <p>
            We are not taking returns or exchanges for change of mind at the moment. If your item
            arrives damaged, faulty or is not what you ordered, we will still replace or refund it
            (see below).
          </p>
        )}
      </PolicySection>

      <PolicySection title="What can be returned">
        <p>To be accepted, items must be:</p>
        <ul>
          <li>unworn, unwashed and free of perfume, makeup or pet hair;</li>
          <li>with all the original tags still attached;</li>
          <li>in their original packaging where possible.</li>
        </ul>
        <p>
          We check every return when it reaches us. If an item does not meet these conditions we
          will send it back to you and let you know why.
        </p>
      </PolicySection>

      <PolicySection title="How to ask for a return or exchange">
        <ol>
          <li>
            Open your order from your <PolicyLink href="/account">account</PolicyLink>, or find it
            on the <PolicyLink href="/track">order tracking page</PolicyLink> with your order number
            and phone number.
          </li>
          <li>
            Choose <strong>return</strong> or <strong>exchange</strong>, pick the items and tell us
            why. One request can be made per order, so include everything you want to send back.
          </li>
          <li>
            We reply within 2 working days. Once approved, pack the items with their tags on and we
            will arrange a pickup or tell you where to send them.
          </li>
        </ol>
        <p>
          Prefer email? Write to <EmailLink email={info.email} /> with your order number.
        </p>
      </PolicySection>

      <PolicySection title="Exchanges">
        <p>
          Exchanges are for a different size of the same item. As soon as your original item reaches
          us and passes our check, we send the new size out. If the size you want has sold out, we
          will refund you instead.
        </p>
      </PolicySection>

      <PolicySection title="Refunds">
        <p>
          Once your return reaches us and passes our check, we refund the price you paid for the
          returned items. The original shipping charge and any cash on delivery charge are not
          refunded, unless the item was damaged, faulty or wrong.
        </p>
        <ul>
          <li>
            <strong>Paid online (cards, UPI, net banking, wallets):</strong> refunded to the same
            payment method through Razorpay. It usually shows up within 5 to 7 working days of the
            refund being issued, depending on your bank.
          </li>
          <li>
            <strong>Cash on delivery:</strong> we refund by bank transfer or UPI. We will email you
            to ask for the details; we never ask for your PIN, OTP or card number.
          </li>
        </ul>
        <p>We email you when the refund is issued.</p>
      </PolicySection>

      <PolicySection title="Damaged, faulty or wrong items">
        <p>
          If your order arrives damaged, has a manufacturing fault, or is not what you ordered,
          please tell us within 48 hours of delivery at <EmailLink email={info.email} />, with your
          order number and a photo or two. We will send a replacement or give you a full refund,
          including shipping, and we cover the cost of getting the item back.
        </p>
      </PolicySection>

      <PolicySection title="Cancelling an order">
        <p>
          You can cancel any time before your order is dispatched. Email{' '}
          <EmailLink email={info.email} /> or use our{' '}
          <PolicyLink href="/contact">contact form</PolicyLink> with your order number as soon as
          you can. If you paid online, the full amount goes back to your original payment method,
          usually within 5 to 7 working days.
        </p>
        <p>
          Once an order has shipped it can no longer be cancelled, but you can return it under the
          policy above once it is delivered.
        </p>
        <p>
          Rarely, we may have to cancel an order ourselves, for example if an item sells out or we
          cannot deliver to your pincode. If that happens we refund you in full and let you know by
          email.
        </p>
      </PolicySection>

      <PolicySection title="Questions">
        <p>
          Write to <EmailLink email={info.email} />
          {info.phone ? ` or call ${info.phone}` : ''}. We reply within 24 hours. See also our{' '}
          <PolicyLink href="/shipping">shipping policy</PolicyLink>.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
