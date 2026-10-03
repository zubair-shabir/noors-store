import { formatINR } from '@noors/shared';

/** A rendered email: subject plus HTML and plain-text bodies. */
export interface Rendered {
  subject: string;
  html: string;
  text: string;
}

export interface EmailOrder {
  number: string;
  email: string;
  items: {
    productName: string;
    variantTitle: string;
    quantity: number;
    unitPrice: number;
    imageUrl: string | null;
  }[];
  subtotal: number;
  discount: number;
  shippingFee: number;
  total: number;
  couponCode: string | null;
  paymentMethod: 'RAZORPAY' | 'COD';
  shippingAddress: {
    name: string;
    phone: string;
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    pincode: string;
  };
}

export interface EmailShipment {
  courier: string | null;
  awb: string | null;
  trackingUrl: string | null;
  estimatedDelivery: Date | null;
}

const esc = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const dateFormat = new Intl.DateTimeFormat('en-IN', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const font = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

/** Absolute URL for a path on the store, and for images stored as paths. */
const absolute = (storeUrl: string, pathOrUrl: string) =>
  /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : `${storeUrl}${pathOrUrl}`;

function layout(storeUrl: string, preheader: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Noor's</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;${font};color:#1c1c1c">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fdfdfd">
<tr><td style="background:#1c1c1c;padding:22px 32px;text-align:center"><a href="${esc(storeUrl)}" style="color:#fdfdfd;text-decoration:none;font-size:20px;letter-spacing:6px;font-family:Georgia,serif">NOOR'S</a></td></tr>
<tr><td style="padding:32px">${body}</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #e4e4e4;font-size:12px;color:#6b6b6b;line-height:1.6">Noor's, Srinagar, Kashmir. Reply to this email if you need help with your order.</td></tr>
</table></td></tr></table></body></html>`;
}

const heading = (text: string) =>
  `<h1 style="margin:0 0 12px;font-size:26px;line-height:1.15;text-transform:uppercase;letter-spacing:0.5px">${esc(text)}</h1>`;
const para = (html: string) =>
  `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3a3a3a">${html}</p>`;
const button = (href: string, label: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td style="background:#1c1c1c"><a href="${esc(href)}" style="display:inline-block;padding:14px 28px;color:#fdfdfd;text-decoration:none;font-size:12px;font-weight:600;letter-spacing:2px;text-transform:uppercase">${esc(label)}</a></td></tr></table>`;

function itemsTable(storeUrl: string, order: EmailOrder): string {
  const rows = order.items
    .map(
      (i) => `<tr>
<td width="64" style="padding:8px 12px 8px 0;vertical-align:top">${
        i.imageUrl
          ? `<img src="${esc(absolute(storeUrl, i.imageUrl))}" width="56" height="70" alt="" style="display:block;object-fit:cover;background:#f4f4f4">`
          : ''
      }</td>
<td style="padding:8px 0;font-size:14px;vertical-align:top">${esc(i.productName)}<br><span style="color:#6b6b6b;font-size:13px">${esc(i.variantTitle)} × ${i.quantity}</span></td>
<td align="right" style="padding:8px 0;font-size:14px;vertical-align:top;white-space:nowrap">${formatINR(i.unitPrice * i.quantity)}</td></tr>`,
    )
    .join('');
  const line = (label: string, value: string, bold = false) =>
    `<tr><td colspan="2" style="padding:4px 0;font-size:14px;${bold ? 'font-weight:700;' : 'color:#6b6b6b;'}">${esc(label)}</td><td align="right" style="padding:4px 0;font-size:14px;${bold ? 'font-weight:700;' : ''}">${value}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;border-top:1px solid #e4e4e4;border-bottom:1px solid #e4e4e4">${rows}</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${line('Subtotal', formatINR(order.subtotal))}
${order.discount > 0 ? line(`Discount${order.couponCode ? ` (${order.couponCode})` : ''}`, `−${formatINR(order.discount)}`) : ''}
${line('Shipping', order.shippingFee === 0 ? 'Free' : formatINR(order.shippingFee))}
${line(order.paymentMethod === 'COD' ? 'Pay on delivery' : 'Total paid', formatINR(order.total), true)}
</table>`;
}

function addressBlock(order: EmailOrder): string {
  const a = order.shippingAddress;
  const lines = [a.name, a.line1, a.line2, `${a.city}, ${a.state} ${a.pincode}`, a.phone].filter(
    (l): l is string => Boolean(l),
  );
  return `<p style="margin:24px 0 4px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase">Delivering to</p>
<p style="margin:0;font-size:14px;line-height:1.6;color:#3a3a3a">${lines.map(esc).join('<br>')}</p>`;
}

const itemsText = (order: EmailOrder) =>
  order.items
    .map(
      (i) =>
        `- ${i.productName} (${i.variantTitle}) x ${i.quantity}: ${formatINR(i.unitPrice * i.quantity)}`,
    )
    .join('\n');

const trackLink = (storeUrl: string, number: string) =>
  `${storeUrl}/track?order=${encodeURIComponent(number)}`;

export function signInCode(storeUrl: string, code: string): Rendered {
  return {
    subject: `${code} is your Noor's sign-in code`,
    html: layout(
      storeUrl,
      `Your sign-in code is ${code}`,
      `${heading('Your sign-in code')}${para('Enter this code to sign in. It works for 10 minutes.')}
<p style="margin:24px 0;font-size:34px;font-weight:700;letter-spacing:10px">${esc(code)}</p>
${para("If you didn't ask for it, you can ignore this email.")}`,
    ),
    text: `Your Noor's sign-in code is ${code}.\n\nIt expires in 10 minutes. If you didn't ask for it, you can ignore this email.`,
  };
}

export function orderConfirmed(storeUrl: string, order: EmailOrder): Rendered {
  const first = order.shippingAddress.name.split(/\s+/)[0];
  return {
    subject: `Order ${order.number} confirmed`,
    html: layout(
      storeUrl,
      `Thank you for your order. We'll email you when it ships.`,
      `${heading('Thank you')}${para(`Hi ${esc(first ?? '')}, your order <strong>${esc(order.number)}</strong> is confirmed. We'll email you again when it ships.`)}
${itemsTable(storeUrl, order)}${addressBlock(order)}${button(trackLink(storeUrl, order.number), 'Track your order')}`,
    ),
    text: `Thank you, ${first}. Your order ${order.number} is confirmed.\n\n${itemsText(order)}\n\n${order.paymentMethod === 'COD' ? 'Pay on delivery' : 'Total paid'}: ${formatINR(order.total)}\n\nTrack it: ${trackLink(storeUrl, order.number)}`,
  };
}

export function paymentFailed(
  storeUrl: string,
  order: EmailOrder,
  heldUntil: Date | null,
): Rendered {
  const until = heldUntil
    ? ` We're holding your items until ${heldUntil.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}.`
    : '';
  return {
    subject: 'Your payment did not go through',
    html: layout(
      storeUrl,
      'Your items are still in your bag.',
      `${heading('Payment not completed')}${para(`The payment for order <strong>${esc(order.number)}</strong> did not go through, so nothing was charged.${esc(until)}`)}
${para('Your items are still in your bag if you want to try again.')}${button(`${storeUrl}/checkout`, 'Return to checkout')}`,
    ),
    text: `The payment for order ${order.number} did not go through, so nothing was charged.${until}\n\nTry again: ${storeUrl}/checkout`,
  };
}

function shipmentLines(shipment: EmailShipment) {
  const parts: string[] = [];
  if (shipment.courier) parts.push(`Courier: ${shipment.courier}`);
  if (shipment.awb) parts.push(`Tracking number: ${shipment.awb}`);
  if (shipment.estimatedDelivery)
    parts.push(`Expected by ${dateFormat.format(shipment.estimatedDelivery)}`);
  return parts;
}

export function shipped(storeUrl: string, order: EmailOrder, shipment: EmailShipment): Rendered {
  const lines = shipmentLines(shipment);
  const link = shipment.trackingUrl ?? trackLink(storeUrl, order.number);
  return {
    subject: `Order ${order.number} is on its way`,
    html: layout(
      storeUrl,
      lines[2] ?? 'Your order has shipped.',
      `${heading('On its way')}${para(`Your order <strong>${esc(order.number)}</strong> has left our studio in Srinagar.`)}
${lines.length ? para(lines.map(esc).join('<br>')) : ''}${button(link, 'Track your parcel')}${itemsTable(storeUrl, order)}`,
    ),
    text: `Your order ${order.number} has shipped.\n${lines.join('\n')}\n\nTrack it: ${link}`,
  };
}

export function outForDelivery(
  storeUrl: string,
  order: EmailOrder,
  shipment: EmailShipment,
): Rendered {
  const link = shipment.trackingUrl ?? trackLink(storeUrl, order.number);
  return {
    subject: `Order ${order.number} is out for delivery`,
    html: layout(
      storeUrl,
      'Your parcel arrives today.',
      `${heading('Arriving today')}${para(`Your order <strong>${esc(order.number)}</strong> is out for delivery${shipment.courier ? ` with ${esc(shipment.courier)}` : ''}. Keep your phone handy for the courier.`)}${button(link, 'Track your parcel')}`,
    ),
    text: `Your order ${order.number} is out for delivery. Track it: ${link}`,
  };
}

export function delivered(storeUrl: string, order: EmailOrder, returnDays: number): Rendered {
  const returns =
    returnDays > 0
      ? `Something not right with the fit? You can ask for an exchange or return within ${returnDays} days from your order page.`
      : 'Something not right? Reply to this email and we will help.';
  return {
    subject: `Order ${order.number} was delivered`,
    html: layout(
      storeUrl,
      'We hope you love it.',
      `${heading('Delivered')}${para(`Your order <strong>${esc(order.number)}</strong> was delivered. We hope you love it.`)}
${para(esc(returns))}${button(trackLink(storeUrl, order.number), 'View your order')}`,
    ),
    text: `Your order ${order.number} was delivered. We hope you love it.\n\n${returns}\n${trackLink(storeUrl, order.number)}`,
  };
}

export function newOrderAlert(storeUrl: string, order: EmailOrder): Rendered {
  const a = order.shippingAddress;
  return {
    subject: `New order ${order.number}: ${formatINR(order.total)}`,
    html: layout(
      storeUrl,
      `${order.items.length} item(s) to ${a.city}`,
      `${heading(`New order ${order.number}`)}${para(`${esc(a.name)} in ${esc(a.city)}, ${esc(a.state)} ${order.paymentMethod === 'COD' ? 'will pay on delivery:' : 'paid'} ${formatINR(order.total)}.`)}${itemsTable(storeUrl, order)}${addressBlock(order)}`,
    ),
    text: `New order ${order.number}: ${formatINR(order.total)} from ${a.name} (${a.city}).\n\n${itemsText(order)}`,
  };
}

export function shipmentProblem(storeUrl: string, order: EmailOrder, problem: string): Rendered {
  return {
    subject: `Action needed: order ${order.number} was not booked with Shiprocket`,
    html: layout(
      storeUrl,
      problem,
      `${heading('Shipment not booked')}${para(`We tried several times to book order <strong>${esc(order.number)}</strong> with Shiprocket and it kept failing:`)}
<pre style="white-space:pre-wrap;font-size:12px;background:#f4f4f4;padding:12px">${esc(problem)}</pre>${para('Book it by hand in the Shiprocket panel. Common causes are a missing pickup address or a pincode the courier no longer serves.')}`,
    ),
    text: `Order ${order.number} could not be booked with Shiprocket:\n${problem}`,
  };
}

export function orderCancelled(storeUrl: string, order: EmailOrder, refund: number): Rendered {
  const money =
    refund > 0
      ? `We have refunded ${formatINR(refund)} to your original payment method. It usually shows up within 5 to 7 working days.`
      : order.paymentMethod === 'COD'
        ? 'Nothing was charged.'
        : '';
  return {
    subject: `Order ${order.number} was cancelled`,
    html: layout(
      storeUrl,
      money || 'Your order was cancelled.',
      `${heading('Order cancelled')}${para(`Your order <strong>${esc(order.number)}</strong> was cancelled.`)}${money ? para(esc(money)) : ''}${para('If you did not expect this, reply to this email and we will sort it out.')}`,
    ),
    text: `Your order ${order.number} was cancelled.\n${money}\n\nIf you did not expect this, reply to this email.`,
  };
}

export function refundIssued(storeUrl: string, order: EmailOrder, amount: number): Rendered {
  return {
    subject: `Refund of ${formatINR(amount)} for order ${order.number}`,
    html: layout(
      storeUrl,
      'It usually shows up within 5 to 7 working days.',
      `${heading('Refund on its way')}${para(`We have refunded <strong>${formatINR(amount)}</strong> for order <strong>${esc(order.number)}</strong> to your original payment method. It usually shows up within 5 to 7 working days.`)}`,
    ),
    text: `We have refunded ${formatINR(amount)} for order ${order.number} to your original payment method. It usually shows up within 5 to 7 working days.`,
  };
}

export interface EmailReturn {
  type: 'RETURN' | 'EXCHANGE';
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'RECEIVED' | 'COMPLETED';
  reason: string;
  items: { name: string; title: string; quantity: number }[];
  note: string | null;
}

const returnItemsText = (r: EmailReturn) =>
  r.items.map((i) => `- ${i.name} (${i.title}) x ${i.quantity}`).join('\n');

export function returnUpdate(storeUrl: string, order: EmailOrder, r: EmailReturn): Rendered {
  const kind = r.type === 'EXCHANGE' ? 'exchange' : 'return';
  const copy: Record<EmailReturn['status'], { subject: string; title: string; body: string }> = {
    REQUESTED: {
      subject: `We got your ${kind} request for order ${order.number}`,
      title: 'Request received',
      body: `Thanks for letting us know. We will look at your ${kind} request and email you within 2 working days.`,
    },
    APPROVED: {
      subject: `Your ${kind} for order ${order.number} is approved`,
      title: `${r.type === 'EXCHANGE' ? 'Exchange' : 'Return'} approved`,
      body: `Your ${kind} is approved. Pack the items with their tags on; we will arrange a pickup or tell you where to send them.`,
    },
    REJECTED: {
      subject: `About your ${kind} request for order ${order.number}`,
      title: 'Request declined',
      body: `We are sorry, we cannot accept this ${kind}.`,
    },
    RECEIVED: {
      subject: `We received your ${kind} for order ${order.number}`,
      title: 'Items received',
      body:
        r.type === 'EXCHANGE'
          ? 'Your items reached us. We will send the replacement shortly.'
          : 'Your items reached us. We will check them and process your refund.',
    },
    COMPLETED: {
      subject: `Your ${kind} for order ${order.number} is complete`,
      title: `${r.type === 'EXCHANGE' ? 'Exchange' : 'Return'} complete`,
      body:
        r.type === 'EXCHANGE'
          ? 'Your exchange is complete.'
          : 'Your return is complete. If a refund is due, it is on its way to your original payment method.',
    },
  };
  const c = copy[r.status];
  return {
    subject: c.subject,
    html: layout(
      storeUrl,
      c.body,
      `${heading(c.title)}${para(`Order <strong>${esc(order.number)}</strong>`)}${para(esc(c.body))}${r.note ? para(esc(r.note)) : ''}${para(r.items.map((i) => `${esc(i.name)} (${esc(i.title)}) × ${i.quantity}`).join('<br>'))}${button(trackLink(storeUrl, order.number), 'View your order')}`,
    ),
    text: `${c.body}\n${r.note ? `\n${r.note}\n` : ''}\n${returnItemsText(r)}\n\n${trackLink(storeUrl, order.number)}`,
  };
}

export function returnRequestedAlert(
  storeUrl: string,
  order: EmailOrder,
  r: EmailReturn,
): Rendered {
  const kind = r.type === 'EXCHANGE' ? 'Exchange' : 'Return';
  return {
    subject: `${kind} requested for order ${order.number}`,
    html: layout(
      storeUrl,
      r.reason,
      `${heading(`${kind} requested`)}${para(`${esc(order.shippingAddress.name)} asked for a ${kind.toLowerCase()} on order <strong>${esc(order.number)}</strong>.`)}${para(r.items.map((i) => `${esc(i.name)} (${esc(i.title)}) × ${i.quantity}`).join('<br>'))}
<pre style="white-space:pre-wrap;font-size:13px;background:#f4f4f4;padding:12px">${esc(r.reason)}</pre>${button(`${storeUrl}/admin/returns`, 'Open returns')}`,
    ),
    text: `${kind} requested for order ${order.number} by ${order.shippingAddress.name}.\n\n${returnItemsText(r)}\n\nReason: ${r.reason}\n\n${storeUrl}/admin/returns`,
  };
}

export interface EmailContact {
  name: string;
  email: string;
  phone?: string;
  orderNumber?: string;
  message: string;
}

/** Contact form message, sent to the store. Plain on purpose: it is read, then answered. */
export function contactMessage(storeUrl: string, c: EmailContact): Rendered {
  const details = [
    `From: ${c.name} <${c.email}>`,
    c.phone ? `Phone: ${c.phone}` : null,
    c.orderNumber ? `Order: ${c.orderNumber}` : null,
  ].filter((l): l is string => Boolean(l));
  const subject = `Contact form: ${c.name}${c.orderNumber ? ` (order ${c.orderNumber})` : ''}`;
  const orderLink = c.orderNumber
    ? `${storeUrl}/admin/orders/${encodeURIComponent(c.orderNumber)}`
    : null;
  return {
    subject,
    html: layout(
      storeUrl,
      c.message.slice(0, 120),
      `${heading('New message')}${para(details.map(esc).join('<br>'))}
<pre style="white-space:pre-wrap;font-size:14px;line-height:1.6;background:#f4f4f4;padding:16px;${font}">${esc(c.message)}</pre>
${button(`mailto:${c.email}?subject=${encodeURIComponent(`Re: your message to Noor's`)}`, `Reply to ${c.name}`)}${orderLink ? para(`<a href="${esc(orderLink)}" style="color:#1c1c1c">Open order ${esc(c.orderNumber!)} in the dashboard</a>`) : ''}`,
    ),
    text: `${details.join('\n')}\n\n${c.message}\n\nReply to: ${c.email}${orderLink ? `\nOrder: ${orderLink}` : ''}`,
  };
}
