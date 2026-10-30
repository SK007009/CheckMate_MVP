/** Indian-locale display helpers (lakh/crore grouping, ₹ prefix, INR words). */

const INR = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 0,
});

const INR_PRECISE = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatINR(value: number): string {
  if (!Number.isFinite(value)) return '₹0';
  return `₹${INR.format(Math.round(value))}`;
}

export function formatINRPrecise(value: number): string {
  if (!Number.isFinite(value)) return '₹0.00';
  return `₹${INR_PRECISE.format(value)}`;
}

export function formatPercent(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '0%';
  return `${value.toFixed(digits)}%`;
}

export function formatSignedINR(value: number): string {
  if (!Number.isFinite(value)) return '₹0';
  const prefix = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${prefix}₹${INR.format(Math.abs(Math.round(value)))}`;
}

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(value: number): string {
  if (value < 20) return ONES[value];
  const tens = Math.floor(value / 10);
  const ones = value % 10;
  return `${TENS[tens]}${ones ? ` ${ONES[ones]}` : ''}`;
}

/** Indian numbering system words, used in the formal complaint letter. */
export function numberToIndianWords(value: number): string {
  const rounded = Math.round(Math.abs(value));
  if (rounded === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(rounded / 10000000);
  const lakh = Math.floor((rounded % 10000000) / 100000);
  const thousand = Math.floor((rounded % 100000) / 1000);
  const hundred = Math.floor((rounded % 1000) / 100);
  const rest = rounded % 100;

  if (crore) parts.push(`${numberToIndianWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (hundred) parts.push(`${ONES[hundred]} Hundred`);
  if (rest) parts.push(twoDigits(rest));
  return parts.join(' ');
}

export function formatIndianDate(date: Date): string {
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}
