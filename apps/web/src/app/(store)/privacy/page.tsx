import type { Metadata } from 'next';
import { EmailLink, PolicyLink, PolicyPage, PolicySection } from '@/components/content/PolicyPage';
import { getStoreInfo } from '@/lib/store-api';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description:
    "What personal data Noor's collects, why, who we share it with, the cookies we use and your rights under India's Digital Personal Data Protection Act, 2023.",
  alternates: { canonical: '/privacy' },
};

export default async function PrivacyPage() {
  const info = await getStoreInfo();
  return (
    <PolicyPage
      title="Privacy"
      intro={
        <p>
          We collect only what we need to sell you clothes and get them to your door. We do not sell
          your data, and we do not use advertising trackers.
        </p>
      }
    >
      <PolicySection title="Who we are">
        <p>
          This website is run by <strong>Noor&apos;s Private Limited</strong>{' '}
          (&ldquo;Noor&apos;s&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;),{' '}
          {/* TODO(owner): confirm registered office address */}
          {info.address}. We are the data fiduciary for the personal data described here under the
          Digital Personal Data Protection Act, 2023 (the &ldquo;DPDP Act&rdquo;) and the other laws
          of India.
        </p>
      </PolicySection>

      <PolicySection title="What we collect">
        <ul>
          <li>
            <strong>Contact details:</strong> your name, email address and phone number.
          </li>
          <li>
            <strong>Delivery details:</strong> the addresses you ship to, including pincode.
          </li>
          <li>
            <strong>Orders:</strong> what you bought, when, the amounts paid, coupons used, and any
            returns, exchanges or refunds.
          </li>
          <li>
            <strong>Messages:</strong> what you write to us by email or through the contact form.
          </li>
          <li>
            <strong>Technical data:</strong> your IP address, browser and the pages you request,
            which our servers log for security and to stop abuse.
          </li>
        </ul>
        <p>
          We do <strong>not</strong> see or store your card number, UPI PIN or bank login. Payments
          are handled entirely by Razorpay; we only receive a payment reference and whether it
          succeeded.
        </p>
      </PolicySection>

      <PolicySection title="Why we use it">
        <ul>
          <li>to take and deliver your order, and to let you track it;</li>
          <li>to sign you in with a one-time code sent to your email;</li>
          <li>to send emails about your order (confirmation, shipping, delivery, refunds);</li>
          <li>to handle returns, exchanges, refunds and your questions;</li>
          <li>to keep accounts and tax records that Indian law requires us to keep;</li>
          <li>to protect the store and our customers from fraud and abuse.</li>
        </ul>
        <p>
          We use your data because you give it to us to place an order or contact us (your consent,
          or a purpose you have given it for voluntarily) and because the law requires some records.
          We do not send marketing emails unless you have asked for them, and you can stop them at
          any time.
        </p>
      </PolicySection>

      <PolicySection title="Who we share it with">
        <p>
          We share only what each service needs to do its job, and they may use it only for that
          job:
        </p>
        <ul>
          <li>
            <strong>Razorpay</strong> processes online payments and refunds.
          </li>
          <li>
            <strong>Shiprocket and its courier partners</strong> receive your name, phone number and
            delivery address to deliver your parcel and returns.
          </li>
          <li>
            <strong>Resend</strong> sends our emails, so it handles your email address and the
            content of order emails.
          </li>
          <li>
            <strong>Cloudinary</strong> stores and serves the product photos on this site; your
            browser connects to it when it loads images.
          </li>
          <li>
            <strong>Our hosting providers</strong> run the website, servers and database where your
            data is stored.
          </li>
        </ul>
        <p>
          Some of these providers may process data outside India, which the DPDP Act allows except
          to countries the Government of India restricts. We also disclose data when the law
          requires it, for example to a court or a tax authority. We never sell your personal data.
        </p>
      </PolicySection>

      <PolicySection title="Cookies">
        <p>We use a small number of cookies, all needed for the store to work:</p>
        <ul>
          <li>
            <strong>Cart cookie</strong> remembers your bag if you are not signed in. It lasts 60
            days.
          </li>
          <li>
            <strong>Sign-in cookies</strong> keep you signed in to your account (and our staff
            signed in to the dashboard).
          </li>
        </ul>
        <p>
          Your browser also stores your light or dark theme choice and your delivery pincode, which
          never leave your device. We do not use advertising or social media trackers. Razorpay may
          set its own cookies on its payment window when you pay.
        </p>
      </PolicySection>

      <PolicySection title="How long we keep it">
        <ul>
          <li>
            Order and payment records: as long as tax and company law requires, currently up to 8
            years.
          </li>
          <li>Your account and saved addresses: until you ask us to delete them.</li>
          <li>Bags of shoppers who are not signed in: the cart cookie expires after 60 days.</li>
          <li>
            Messages to us: as long as we need them to help you, and then for a reasonable time in
            case you follow up.
          </li>
          <li>Server logs: a short period, for security.</li>
        </ul>
      </PolicySection>

      <PolicySection title="Your rights">
        <p>Under the DPDP Act you can ask us to:</p>
        <ul>
          <li>tell you what personal data we hold about you and who we have shared it with;</li>
          <li>correct, complete or update it;</li>
          <li>
            erase it, unless we must keep it by law (for example invoices), and withdraw any consent
            you have given;
          </li>
          <li>nominate someone to exercise these rights for you if you die or cannot act;</li>
          <li>address a grievance about how we handle your data.</li>
        </ul>
        <p>
          Email <EmailLink email={info.email} /> from the address on your account. We will reply
          within 30 days. If you are not happy with our answer, you can complain to the Data
          Protection Board of India.
        </p>
      </PolicySection>

      <PolicySection title="Security">
        <p>
          The site runs over HTTPS, sign-in uses one-time codes rather than passwords, and only
          staff who need it can see order details. No system is perfectly secure, but if we learn of
          a breach that affects you, we will tell you and the Data Protection Board as the law
          requires.
        </p>
      </PolicySection>

      <PolicySection title="Children">
        <p>
          Our store is meant for adults. If you are under 18, please ask a parent or guardian to
          place the order for you. We do not knowingly collect data from children without a
          parent&apos;s consent.
        </p>
      </PolicySection>

      <PolicySection title="Grievance officer and contact">
        {/* TODO(owner): confirm the grievance officer's name and designation, and a postal address. */}
        <p>
          For any question or complaint about your personal data, write to our grievance officer at{' '}
          <EmailLink email={info.email} />
          {info.phone ? ` or call ${info.phone}` : ''}, or by post to Noor&apos;s Private Limited,{' '}
          {info.address}. You can also use our <PolicyLink href="/contact">contact form</PolicyLink>
          .
        </p>
      </PolicySection>

      <PolicySection title="Changes to this policy">
        <p>
          If we change this policy we will update the date at the top of this page, and tell you by
          email if the change is significant.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
