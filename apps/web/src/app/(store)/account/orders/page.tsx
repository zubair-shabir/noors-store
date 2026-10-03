import { redirect } from 'next/navigation';

// Order history lives on the account page.
export default function OrdersPage() {
  redirect('/account');
}
