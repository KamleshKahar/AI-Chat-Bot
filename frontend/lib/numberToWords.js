/**
 * Indian-format currency words ("Twenty One Thousand Six Hundred Thirty Five
 * Rupees and Thirty Paise") for the printed invoice and credit note.
 *
 * Extracted from PrintableInvoice so the credit note can print the same
 * amount-in-words line without duplicating the converter.
 */

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety',
];

const twoDigits = (n) =>
  n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`;

const threeDigits = (n) => {
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  return `${hundred ? `${ONES[hundred]} Hundred` : ''}${hundred && rest ? ' ' : ''}${twoDigits(rest)}`;
};

function convertInteger(n) {
  if (n < 100) return twoDigits(n);
  if (n < 1000) return threeDigits(n);
  return String(n);
}

function convertToWords(value) {
  const num = Math.floor(Math.abs(Number(value) || 0));
  if (num === 0) return 'Zero';

  const crore = Math.floor(num / 10000000);
  const lakh = Math.floor((num % 10000000) / 100000);
  const thousand = Math.floor((num % 100000) / 1000);
  const remainder = num % 1000;

  const parts = [];
  if (crore) parts.push(`${convertInteger(crore)} Crore`);
  if (lakh) parts.push(`${convertInteger(lakh)} Lakh`);
  if (thousand) parts.push(`${convertInteger(thousand)} Thousand`);
  if (remainder) parts.push(threeDigits(remainder));

  return parts.join(' ').trim();
}

/** @param {number} value @returns {string} e.g. "One Thousand Rupees and Fifty Paise" */
export function numberToWords(value) {
  const num = Math.abs(Number(value) || 0);
  const whole = Math.floor(num);
  const paise = Math.round((num - whole) * 100);

  let words = '';
  if (whole > 0) words = `${convertToWords(whole)} Rupees`;
  if (paise > 0) words += `${words ? ' and ' : ''}${convertToWords(paise)} Paise`;

  return words || 'Zero Rupees Only';
}
