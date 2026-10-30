/**
 * CheckMate — offline demo fixtures
 *
 * Vector "screenshots" for the three one-click demo presets, so a live hackathon
 * pitch works with no internet, no API key and no image files. Each mock is a
 * phone-viewport SVG that reproduces the real dark patterns (buried fine print,
 * pre-ticked add-ons, urgency timers, drip fees) the scanner is meant to catch.
 */

const W = 390;
const H = 760;

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function text(
  x: number,
  y: number,
  value: string,
  opts: { size?: number; weight?: number; fill?: string; anchor?: 'start' | 'middle' | 'end'; opacity?: number; mono?: boolean } = {},
): string {
  const {
    size = 13,
    weight = 400,
    fill = '#e8edf4',
    anchor = 'start',
    opacity = 1,
    mono = false,
  } = opts;
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" opacity="${opacity}" font-family="${
    mono ? 'monospace' : 'Inter, Helvetica, Arial, sans-serif'
  }">${esc(value)}</text>`;
}

function rect(
  x: number,
  y: number,
  width: number,
  height: number,
  opts: { fill?: string; stroke?: string; radius?: number; opacity?: number } = {},
): string {
  const { fill = '#161c25', stroke = 'none', radius = 8, opacity = 1 } = opts;
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}" opacity="${opacity}"/>`;
}

function frame(title: string, body: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#0b1017"/>
    <stop offset="100%" stop-color="#05070a"/>
  </linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<rect x="0" y="0" width="${W}" height="46" fill="#0f151d"/>
${text(18, 29, title, { size: 14, weight: 700, fill: '#9fb0c4' })}
${text(W - 18, 29, '100%  ▮▮▮', { size: 11, fill: '#5f6c7d', anchor: 'end' })}
${body}
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Preset 1 — flagship smartphone "No-Cost EMI" trap on a marketplace. */
export function buildMarketplaceEmiMock(): string {
  const body = [
    rect(0, 46, W, 1, { fill: '#1f2733', radius: 0 }),
    // product tile
    rect(16, 62, 90, 90, { fill: '#1b2330', radius: 10 }),
    text(61, 112, '📱', { size: 34, anchor: 'middle' }),
    text(120, 80, 'FlagshipPro X5 5G', { size: 14, weight: 700 }),
    text(120, 99, '(Midnight Titanium, 256 GB)', { size: 11, fill: '#8b98a9' }),
    text(120, 123, '₹79,999', { size: 19, weight: 700, fill: '#ffffff' }),
    text(120, 141, 'M.R.P ₹89,999  ·  11% off', { size: 11, fill: '#8b98a9' }),
    // no-cost banner
    rect(16, 168, W - 32, 54, { fill: '#0f2a22', stroke: '#1d5c47', radius: 10 }),
    text(30, 192, 'No-Cost EMI available', { size: 14, weight: 700, fill: '#2ee6a8' }),
    text(30, 210, '0% interest · Zero down payment · Instant approval', { size: 10.5, fill: '#7fd9bd' }),
    // emi tenure pills
    text(16, 250, 'EMI options', { size: 12, weight: 700, fill: '#9fb0c4' }),
    rect(16, 262, 108, 58, { fill: '#101822', stroke: '#2ee6a8' }),
    text(70, 283, '6 months', { size: 12, weight: 700, anchor: 'middle' }),
    text(70, 302, '₹13,334/mo', { size: 11, fill: '#8b98a9', anchor: 'middle' }),
    rect(134, 262, 108, 58, { fill: '#101822', stroke: '#26303d' }),
    text(188, 283, '9 months', { size: 12, weight: 700, anchor: 'middle' }),
    text(188, 302, '₹8,889/mo', { size: 11, fill: '#8b98a9', anchor: 'middle' }),
    rect(252, 262, 122, 58, { fill: '#101822', stroke: '#26303d' }),
    text(313, 283, '12 months', { size: 12, weight: 700, anchor: 'middle' }),
    text(313, 302, '₹6,667/mo', { size: 11, fill: '#8b98a9', anchor: 'middle' }),
    // lender tabs
    rect(16, 336, 112, 34, { fill: '#141c26', stroke: '#26303d' }),
    text(72, 358, 'HDFC Bank', { size: 11.5, weight: 600, anchor: 'middle' }),
    rect(136, 336, 112, 34, { fill: '#141c26', stroke: '#26303d' }),
    text(192, 358, 'ICICI Bank', { size: 11.5, weight: 600, anchor: 'middle' }),
    rect(256, 336, 118, 34, { fill: '#141c26', stroke: '#26303d' }),
    text(315, 358, 'SBI Card', { size: 11.5, weight: 600, anchor: 'middle' }),
    // key facts block (what is actually shown)
    rect(16, 388, W - 32, 88, { fill: '#111823', stroke: '#26303d' }),
    text(30, 412, 'Key facts you see', { size: 12, weight: 700, fill: '#9fb0c4' }),
    text(30, 433, 'Interest rate', { size: 11.5, fill: '#c3cddb' }),
    text(W - 30, 433, '0% (No Cost)', { size: 11.5, weight: 700, fill: '#2ee6a8', anchor: 'end' }),
    text(30, 453, 'Processing fee', { size: 11.5, fill: '#c3cddb' }),
    text(W - 30, 453, '₹299 + taxes', { size: 11.5, fill: '#c3cddb', anchor: 'end' }),
    text(30, 470, 'Upfront discount', { size: 11.5, fill: '#c3cddb' }),
    text(W - 30, 470, '₹3,607', { size: 11.5, fill: '#c3cddb', anchor: 'end' }),
    // buried fine print
    rect(16, 490, W - 32, 96, { fill: '#0c1117', stroke: '#1a212b' }),
    text(30, 512, '* T&C apply. Interest, if any, will be charged by the bank.', {
      size: 9,
      fill: '#5c6878',
    }),
    text(30, 527, '* GST on interest as applicable will be debited monthly in the', { size: 9, fill: '#5c6878' }),
    text(30, 540, '   statement as per prevailing tax laws.', { size: 9, fill: '#5c6878' }),
    text(30, 555, '* Pre-closure charges 3% + GST. Reward points not applicable.', { size: 9, fill: '#5c6878' }),
    text(30, 572, 'Effective APR not disclosed on this page.', { size: 9, fill: '#5c6878' }),
    // CTA
    rect(16, 606, W - 32, 48, { fill: '#2ee6a8', radius: 8 }),
    text(W / 2, 636, 'Buy Now · No Cost EMI', { size: 14, weight: 700, fill: '#05130e', anchor: 'middle' }),
    text(W / 2, 686, 'EMI booking fee may appear in your statement', { size: 10, fill: '#5c6878', anchor: 'middle' }),
    text(20, 730, 'amazon.in', { size: 10, fill: '#3d4653' }),
  ].join('\n');
  return frame('Amazon India · Checkout', body);
}

/** Preset 2 — electronics checkout with Bajaj Finserv and a pre-ticked warranty. */
export function buildBajajCheckoutMock(): string {
  const body = [
    rect(0, 46, W, 1, { fill: '#1f2733', radius: 0 }),
    text(18, 76, 'Order Summary', { size: 15, weight: 700 }),
    rect(16, 90, 72, 72, { fill: '#1b2330', radius: 10 }),
    text(52, 132, '📺', { size: 30, anchor: 'middle' }),
    text(100, 108, 'UltraView 55" 4K Smart TV', { size: 12.5, weight: 600 }),
    text(100, 126, 'Sold by Croma Retail', { size: 10.5, fill: '#8b98a9' }),
    text(100, 146, '₹42,990', { size: 16, weight: 700 }),
    rect(16, 176, W - 32, 40, { fill: '#101822', stroke: '#2ee6a8' }),
    text(30, 201, 'Bajaj Finserv Insta EMI Card · 6 months', { size: 11.5, weight: 600, fill: '#2ee6a8' }),
    text(W - 30, 201, '₹7,165/mo', { size: 11.5, anchor: 'end' }),
    text(16, 240, 'Charges added to your order', { size: 12, weight: 700, fill: '#9fb0c4' }),
    // pre-ticked add-ons
    rect(16, 252, 20, 20, { fill: '#2ee6a8', radius: 4 }),
    text(26, 267, '✓', { size: 14, weight: 700, fill: '#05130e', anchor: 'middle' }),
    text(46, 267, 'Extended Warranty (2 years) — recommended', { size: 11, fill: '#e8edf4' }),
    text(W - 20, 267, '₹1,499', { size: 11, anchor: 'end' }),
    rect(16, 280, 20, 20, { fill: '#2ee6a8', radius: 4 }),
    text(26, 295, '✓', { size: 14, weight: 700, fill: '#05130e', anchor: 'middle' }),
    text(46, 295, 'Screen protection plan (auto-added)', { size: 11, fill: '#e8edf4' }),
    text(W - 20, 295, '₹899', { size: 11, anchor: 'end' }),
    rect(16, 308, 20, 20, { fill: '#1b2330', stroke: '#3a4453', radius: 4 }),
    text(46, 323, 'Credit shield insurance (opt-out)', { size: 11, fill: '#c3cddb' }),
    text(W - 20, 323, '₹649', { size: 11, fill: '#8b98a9', anchor: 'end' }),
    // fees
    text(16, 362, 'Convenience / processing fee', { size: 11.5, fill: '#c3cddb' }),
    text(W - 20, 362, '₹199', { size: 11.5, anchor: 'end' }),
    text(16, 384, 'e-Mandate registration fee', { size: 11.5, fill: '#c3cddb' }),
    text(W - 20, 384, '₹118', { size: 11.5, anchor: 'end' }),
    text(16, 406, 'GST on fees (18%)', { size: 11.5, fill: '#c3cddb' }),
    text(W - 20, 406, '₹57', { size: 11.5, anchor: 'end' }),
    rect(16, 420, W - 32, 1, { fill: '#1f2733', radius: 0 }),
    text(16, 444, 'Total payable', { size: 13, weight: 700 }),
    text(W - 20, 444, '₹45,612', { size: 15, weight: 700, anchor: 'end' }),
    text(16, 466, 'Interest: ₹0 (subvented by brand)', { size: 11, fill: '#2ee6a8' }),
    rect(16, 486, W - 32, 92, { fill: '#0c1117', stroke: '#1a212b' }),
    text(28, 508, '* Bounce/penal charges ₹450–₹500 on NACH mandate failure.', { size: 9, fill: '#5c6878' }),
    text(28, 523, '* Annual membership fee ₹117 + GST applicable.', { size: 9, fill: '#5c6878' }),
    text(28, 538, '* Bundled plans can be removed before payment only.', { size: 9, fill: '#5c6878' }),
    text(28, 553, '* Effective APR of the plan is not displayed.', { size: 9, fill: '#5c6878' }),
    rect(16, 594, W - 32, 46, { fill: '#2ee6a8', radius: 8 }),
    text(W / 2, 622, 'Pay ₹45,612', { size: 14, weight: 700, fill: '#05130e', anchor: 'middle' }),
    text(20, 700, 'croma.com · Payment step 3 of 3', { size: 10, fill: '#3d4653' }),
    text(20, 720, 'Bajaj Finserv Insta EMI Card', { size: 10, fill: '#3d4653' }),
  ].join('\n');
  return frame('Croma · Payment', body);
}

/** Preset 3 — flight checkout with drip pricing, urgency timer and shaming copy. */
export function buildFlightCheckoutMock(): string {
  const body = [
    rect(0, 46, W, 1, { fill: '#1f2733', radius: 0 }),
    rect(16, 62, W - 32, 66, { fill: '#121a24', stroke: '#26303d' }),
    text(30, 88, 'DEL → BOM', { size: 15, weight: 700 }),
    text(30, 108, 'IndiGo 6E-2134 · 12 Nov · 06:40', { size: 11, fill: '#8b98a9' }),
    text(W - 30, 88, '₹5,478', { size: 16, weight: 700, anchor: 'end' }),
    text(W - 30, 108, 'Fare for 1 adult', { size: 10.5, fill: '#8b98a9', anchor: 'end' }),
    // urgency
    rect(16, 142, W - 32, 36, { fill: '#3a1418', stroke: '#7d2b33' }),
    text(30, 165, 'Deal ends in 04:12  ·  Only 2 seats left', { size: 12, weight: 700, fill: '#ff8a93' }),
    // no cost emi banner
    rect(16, 190, W - 32, 44, { fill: '#0f2a22', stroke: '#1d5c47' }),
    text(30, 218, 'No-Cost EMI on this fare · 0% interest', { size: 12.5, weight: 700, fill: '#2ee6a8' }),
    text(16, 258, 'Payment step — charges revealed now', { size: 12, weight: 700, fill: '#9fb0c4' }),
    text(16, 282, 'Base fare', { size: 11.5, fill: '#c3cddb' }),
    text(W - 20, 282, '₹4,899', { size: 11.5, anchor: 'end' }),
    text(16, 304, 'Convenience fee (appears now)', { size: 11.5, fill: '#ffb020' }),
    text(W - 20, 304, '₹420', { size: 11.5, fill: '#ffb020', anchor: 'end' }),
    text(16, 326, 'Seat selection (auto)', { size: 11.5, fill: '#c3cddb' }),
    text(W - 20, 326, '₹159', { size: 11.5, anchor: 'end' }),
    text(16, 348, 'EMI processing fee (HDFC 6M)', { size: 11.5, fill: '#c3cddb' }),
    text(W - 20, 348, '₹199 + GST', { size: 11.5, anchor: 'end' }),
    rect(16, 362, W - 32, 1, { fill: '#1f2733', radius: 0 }),
    text(16, 386, 'Payable now', { size: 13, weight: 700 }),
    text(W - 20, 386, '₹5,677', { size: 15, weight: 700, anchor: 'end' }),
    // confirm shaming (partially visible / low contrast)
    rect(16, 404, W - 32, 52, { fill: '#0c1117', stroke: '#1a212b' }),
    text(28, 424, 'No, I prefer to risk my trip without', { size: 10, fill: '#7c8899' }),
    text(28, 440, 'the protection cover. Continue', { size: 10, fill: '#7c8899' }),
    rect(16, 470, W - 32, 92, { fill: '#0c1117', stroke: '#1a212b' }),
    text(28, 492, '* GST @18% is levied on the monthly interest component', { size: 9, fill: '#5c6878' }),
    text(28, 507, '  by the bank and is not part of the advertised EMI.', { size: 9, fill: '#5c6878' }),
    text(28, 522, '* Convenience fee is non-refundable on cancellation.', { size: 9, fill: '#5c6878' }),
    text(28, 537, '* APR of the EMI plan is not displayed on this page.', { size: 9, fill: '#5c6878' }),
    rect(16, 578, W - 32, 46, { fill: '#2ee6a8', radius: 8 }),
    text(W / 2, 606, 'Continue to payment', { size: 14, weight: 700, fill: '#05130e', anchor: 'middle' }),
    text(W / 2, 650, 'Fare shown on search page was ₹5,478', { size: 10, fill: '#5c6878', anchor: 'middle' }),
    text(20, 700, 'makemytrip.com', { size: 10, fill: '#3d4653' }),
  ].join('\n');
  return frame('MakeMyTrip · Review', body);
}
