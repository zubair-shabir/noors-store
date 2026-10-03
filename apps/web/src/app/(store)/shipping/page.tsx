import type { Metadata } from 'next';
import { EmailLink, PolicyLink, PolicyPage, PolicySection } from '@/components/content/PolicyPage';
import {
  codFact,
  codSentence,
  deliveryEstimates,
  shippingFact,
  shippingFeeSentence,
} from '@/lib/policies';
import { getStoreInfo } from '@/lib/store-api';

export const metadata: Metadata = {
  title: 'Shipping policy',
  description:
    "Where Noor's delivers, what shipping and cash on delivery cost, how long delivery takes and how to track your parcel.",
  alternates: { canonical: '/shipping' },
};

export default async function ShippingPage() {
  const info = await getStoreInfo();
  return (
    <PolicyPage
      title="Shipping"
      intro={
        <p>
          Every order is packed by hand at our studio in Srinagar and sent with a tracked courier.
          Here is what it costs and how long it takes.
        </p>
      }
      facts={[
        { label: 'Ships to', value: 'All of India' },
        { label: 'Shipping', value: shippingFact(info) },
        { label: 'Cash on delivery', value: codFact(info) },
        { label: 'Delivery', value: '3 to 5 working days' },
      ]}
    >
      <PolicySection title="Where we ship">
        <p>
          We deliver anywhere in India that our courier partners serve, which is almost every
          pincode. We do not ship outside India yet.
        </p>
        <p>
          Enter your pincode on a product page or at checkout and we will tell you straight away if
          we can deliver there.
        </p>
      </PolicySection>

      <PolicySection title="Shipping charges">
        <p>{shippingFeeSentence(info)}</p>
        <p>
          The exact charge is always shown at checkout before you pay. Prices on the site include
          GST, and there are no customs or other charges on delivery.
        </p>
      </PolicySection>

      <PolicySection title="Cash on delivery">
        <p>{codSentence(info)}</p>
        {info.cod.enabled && (
          <p>
            Please keep the exact amount ready, or pay the courier by UPI if they offer it. If a
            cash on delivery parcel is refused at the door, we may ask you to pay online for future
            orders.
          </p>
        )}
      </PolicySection>

      <PolicySection title="How long delivery takes">
        <p>We usually hand your order to the courier within 1 to 2 working days. After that:</p>
        <ul>
          <li>
            <strong>Jammu and Kashmir:</strong> {deliveryEstimates.local}.
          </li>
          <li>
            <strong>Rest of India:</strong> {deliveryEstimates.elsewhere}. Remote areas and the
            North East can take a few days more.
          </li>
        </ul>
        <p>
          Checkout shows an estimated delivery date for your pincode. It is an estimate from the
          courier, not a promise: weather, strikes, festivals and road closures can slow things
          down, and we will let you know if we hear of a delay.
        </p>
      </PolicySection>

      <PolicySection title="Tracking your order">
        <p>
          When your order ships we email you the courier name and tracking number. You can follow it
          any time on our <PolicyLink href="/track">order tracking page</PolicyLink> with your order
          number and the phone number you used at checkout, or from your{' '}
          <PolicyLink href="/account">account</PolicyLink> if you signed in.
        </p>
      </PolicySection>

      <PolicySection title="If a delivery fails">
        <p>
          The courier will usually try to deliver up to three times and may call the phone number on
          the order. Please make sure your address, pincode and phone number are correct; we cannot
          change the address once the parcel has shipped.
        </p>
        <p>
          If the parcel comes back to us because it could not be delivered or was refused, we will
          get in touch. For prepaid orders you can choose to have it sent again (we may ask you to
          pay the shipping charge again) or to cancel and get a refund of the order value, less the
          original shipping charge. Refunds follow our{' '}
          <PolicyLink href="/returns">returns and refunds policy</PolicyLink>.
        </p>
      </PolicySection>

      <PolicySection title="Damaged or tampered parcels">
        <p>
          If the outer packaging looks damaged or opened, please take a photo before you open it and
          write to us within 48 hours of delivery at <EmailLink email={info.email} />. We will sort
          it out with a replacement or a refund.
        </p>
      </PolicySection>

      <PolicySection title="Questions">
        <p>
          Write to <EmailLink email={info.email} />
          {info.phone ? ` or call ${info.phone}` : ''}, or use our{' '}
          <PolicyLink href="/contact">contact form</PolicyLink>. We reply within 24 hours.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
