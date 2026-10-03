import type { Metadata } from 'next';
import { Invoice } from '@/components/admin/ops/orders/Invoice';

export const metadata: Metadata = {
  title: "Invoice | Noor's dashboard",
  robots: { index: false, follow: false },
};

/** Lives outside the dashboard layout so the printed page has no sidebar. */
export default async function InvoicePage({ params }: PageProps<'/admin/invoice/[number]'>) {
  const { number } = await params;
  return <Invoice number={number} />;
}
