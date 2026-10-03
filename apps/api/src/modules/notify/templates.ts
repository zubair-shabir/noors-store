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
${line('Total paid', formatINR(order.total), true)}
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
    text: `Thank you, ${first}. Your order ${order.number} is confirmed.\n\n${itemsText(order)}\n\nTotal paid: ${formatINR(order.total)}\n\nTrack it: ${trackLink(storeUrl, order.number)}`,
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

export function delivered(storeUrl: string, order: EmailOrder): Rendered {
  return {
    subject: `Order ${order.number} was delivered`,
    html: layout(
      storeUrl,
      'We hope you love it.',
      `${heading('Delivered')}${para(`Your order <strong>${esc(order.number)}</strong> was delivered. We hope you love it.`)}
${para('Something not right with the fit? You can ask for an exchange or return within 7 days of delivery by replying to this email.')}${button(`${storeUrl}/shop/latest`, 'See the latest drip')}`,
    ),
    text: `Your order ${order.number} was delivered. We hope you love it.\n\nNeed an exchange or return? Reply to this email within 7 days.`,
  };
}

export function newOrderAlert(storeUrl: string, order: EmailOrder): Rendered {
  const a = order.shippingAddress;
  return {
    subject: `New order ${order.number}: ${formatINR(order.total)}`,
    html: layout(
      storeUrl,
      `${order.items.length} item(s) to ${a.city}`,
      `${heading(`New order ${order.number}`)}${para(`${esc(a.name)} in ${esc(a.city)}, ${esc(a.state)} paid ${formatINR(order.total)}.`)}${itemsTable(storeUrl, order)}${addressBlock(order)}`,
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
