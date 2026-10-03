import type { Metadata } from 'next';
import { EmailLink, PolicyLink, PolicyPage, PolicySection } from '@/components/content/PolicyPage';
import { getStoreInfo } from '@/lib/store-api';

export const metadata: Metadata = {
  title: 'Terms of use and sale',
  description:
    "The terms for using the Noor's website and buying from us: orders, prices, payment, delivery, returns and how to reach us.",
  alternates: { canonical: '/terms' },
};

export default async function TermsPage() {
  const info = await getStoreInfo();
  return (
    <PolicyPage
      title="Terms"
      intro={
        <p>
          These terms apply when you use this website or buy from us. They are written to be read;
          if anything is unclear, ask us before you order.
        </p>
      }
    >
      <PolicySection title="About us">
        <p>
          This website is owned and run by <strong>Noor&apos;s Private Limited</strong>, a company
          registered in India, {/* TODO(owner): confirm registered office address */}
          {info.address}. You can reach us at <EmailLink email={info.email} />
          {info.phone ? ` or ${info.phone}` : ''}.
          {info.gstNumber ? ` Our GSTIN is ${info.gstNumber}.` : ''}
        </p>
        <p>
          By using the site or placing an order, you agree to these terms, our{' '}
          <PolicyLink href="/privacy">privacy policy</PolicyLink>, our{' '}
          <PolicyLink href="/shipping">shipping policy</PolicyLink> and our{' '}
          <PolicyLink href="/returns">returns and refunds policy</PolicyLink>.
        </p>
      </PolicySection>

      <PolicySection title="Using the site">
        <p>
          You must be at least 18, or use the site with a parent or guardian. Please do not misuse
          the site: no attempts to break or overload it, scrape it, place fake orders, or use
          someone else&apos;s details or payment method.
        </p>
        <p>
          You sign in with a one-time code sent to your email. Keep access to that email safe; you
          are responsible for orders placed from your account.
        </p>
      </PolicySection>

      <PolicySection title="Products and prices">
        <p>
          We do our best to show every product accurately, but colours can look slightly different
          on screens and small details can vary between batches. Check the size chart on each
          product page, where there is one, before you order.
        </p>
        <p>
          Prices are in Indian rupees and include GST. Shipping and any cash on delivery charge are
          shown separately at checkout before you pay. Prices and stock can change at any time, but
          the price you pay is the one shown when you place your order.
        </p>
        <p>
          If we list something at an obviously wrong price, or an item turns out to be out of stock
          after you order, we will tell you and cancel that item with a full refund.
        </p>
      </PolicySection>

      <PolicySection title="Orders">
        <p>
          When you place an order you make us an offer to buy. We email you a confirmation when it
          is received; the contract between us is made when we confirm your order. We may decline or
          cancel an order, for example if a product is unavailable, we cannot deliver to your
          address, or we suspect fraud. If we do, we refund anything you paid in full.
        </p>
        <p>
          You can cancel before your order is dispatched; see{' '}
          <PolicyLink href="/returns">cancellations</PolicyLink>.
        </p>
      </PolicySection>

      <PolicySection title="Payment">
        <p>
          Online payments (UPI, cards, net banking and wallets) are processed securely by Razorpay.
          We never see or store your full card details. Where cash on delivery is offered, you pay
          the courier when your parcel arrives.
        </p>
        <p>
          Coupons have their own conditions (for example a minimum order or an end date), cannot be
          exchanged for cash, and one coupon can be used per order.
        </p>
      </PolicySection>

      <PolicySection title="Delivery, returns and refunds">
        <p>
          We deliver within India only. Delivery times, charges and what happens if a delivery fails
          are set out in our <PolicyLink href="/shipping">shipping policy</PolicyLink>. Returns,
          exchanges and refunds are covered by our{' '}
          <PolicyLink href="/returns">returns and refunds policy</PolicyLink>. Nothing in these
          terms takes away your rights under the Consumer Protection Act, 2019.
        </p>
      </PolicySection>

      <PolicySection title="Our content">
        <p>
          The Noor&apos;s name and logo, our designs, photos and text belong to Noor&apos;s Private
          Limited or are used with permission. You may share links to our pages, but please do not
          copy or reuse our content for commercial purposes without written permission.
        </p>
      </PolicySection>

      <PolicySection title="Liability">
        <p>
          We are responsible for loss or damage you suffer that is a foreseeable result of us
          breaking these terms or not taking reasonable care. Otherwise, to the extent the law
          allows, our liability for any order is limited to the amount you paid for it. We are not
          responsible for delays or failures caused by events outside our reasonable control, such
          as natural disasters, strikes, curfews, network shutdowns or courier disruptions.
        </p>
      </PolicySection>

      <PolicySection title="Complaints and grievances">
        {/* TODO(owner): confirm the grievance officer's name and designation. */}
        <p>
          If something has gone wrong, write to our grievance officer at{' '}
          <EmailLink email={info.email} /> with your order number. We acknowledge complaints within
          48 hours and aim to resolve them within one month, as the Consumer Protection (E-Commerce)
          Rules, 2020 require.
        </p>
      </PolicySection>

      <PolicySection title="Law and disputes">
        {/* TODO(owner): confirm the courts (city) that should have jurisdiction. */}
        <p>
          These terms are governed by the laws of India. We would always rather sort out a problem
          directly with you, but any dispute that cannot be settled will be decided by the courts at
          Srinagar, Jammu and Kashmir, without affecting your right to approach a consumer
          commission.
        </p>
      </PolicySection>

      <PolicySection title="Changes to these terms">
        <p>
          We may update these terms from time to time; the date at the top shows the latest version.
          The terms in force when you place an order apply to that order.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
