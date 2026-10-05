'use client';

import React from 'react';
import { useData } from '@/context/DataContext';
import { formatCurrency, formatDate } from '@/lib/formatters';

const numberToWords = (num) => {
  const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const twoDigits = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`);

const threeDigits = (n) => {
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  return `${hundred ? `${ONES[hundred]} Hundred` : ''}${hundred && rest ? ' ' : ''}${twoDigits(rest)}`;
};

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

function convertInteger(n) {
  if (n < 100) return twoDigits(n);
  if (n < 1000) return threeDigits(n);
  return String(n);
}

function numberToWords(value) {
  const num = Math.abs(Number(value) || 0);
  const whole = Math.floor(num);
  const paise = Math.round((num - whole) * 100);

  let words = '';
  if (whole > 0) words = `${convertToWords(whole)} Rupees`;
  if (paise > 0) words += `${words ? ' and ' : ''}${convertToWords(paise)} Paise`;

  return words || 'Zero Rupees Only';
}
};

export function PrintableInvoice({ invoice }) {
  const { company } = useData();

  if (!invoice) return null;

  const c = invoice.customer || {};

  /*
    * GST split, taken from the API rather than recomputed.
    *
    * `taxType` is the server's decision: 'IGST' for inter-state supply,
    * 'CGST_SGST' when the customer and company share a state. The three amounts
    * are persisted separately at invoice time, so printing them is exact even if
    * the tax rate is fractional or the split needed rounding.
    */
  const isInterState = invoice.taxType === 'IGST';
  const cgstAmount = Number(invoice.cgstAmount ?? 0);
  const sgstAmount = Number(invoice.sgstAmount ?? 0);
  const igstAmount = Number(invoice.igstAmount ?? 0);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm print:border-0 print:shadow-none print:rounded-none">
      {/* Header band */}
      <div className="px-8 py-6 border-b-2 border-slate-900 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold">
              FP
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">{company.name}</h1>
              <p className="text-[11px] text-slate-500 font-medium">{company.tagline}</p>
            </div>
          </div>

          <div className="mt-4 text-[11px] text-slate-600 leading-relaxed">
            <p>{company.address}</p>
            <p>
              {company.city}, {company.state} {company.pincode}
            </p>
            <p>
              GSTIN: <span className="font-mono font-semibold text-slate-800">{company.gstin}</span> • PAN:{' '}
              <span className="font-mono font-semibold text-slate-800">{company.pan}</span>
            </p>
            <p>
              {company.email} • {company.phone}
            </p>
          </div>
        </div>

        <div className="sm:text-right shrink-0">
          <p className="text-2xl font-bold tracking-tight text-slate-900">TAX INVOICE</p>
          <p className="text-sm text-slate-500 mt-0.5">Original for Recipient</p>

          <div className="mt-4 space-y-1 text-[11px] sm:text-right">
            <p>
              <span className="text-slate-500">Invoice No:</span>{' '}
              <span className="font-mono font-bold text-slate-900">{invoice.id}</span>
            </p>
            <p>
              <span className="text-slate-500">Date:</span>{' '}
              <span className="font-semibold text-slate-900">{formatDate(invoice.date)}</span>
            </p>
            <p>
              <span className="text-slate-500">Due Date:</span>{' '}
              <span className="font-semibold text-slate-900">{formatDate(invoice.dueDate)}</span>
            </p>
            <p>
              <span className="text-slate-500">Sale Ref:</span>{' '}
              <span className="font-mono font-semibold text-slate-900">{invoice.saleId}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Parties */}
      <div className="px-8 py-6 grid grid-cols-1 sm:grid-cols-2 gap-6 bg-slate-50 print:bg-white">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
            Billed To
          </p>
          <p className="text-sm font-bold text-slate-900">{c.name}</p>
          {c.company && <p className="text-xs text-slate-600 font-medium">{c.company}</p>}
          <p className="text-[11px] text-slate-600 leading-relaxed mt-1.5">
            {c.address}
            <br />
            {c.city}, {c.state} {c.pincode}
          </p>
          <div className="mt-2 space-y-0.5 text-[11px]">
            {c.phone && (
              <p>
                <span className="text-slate-500">Phone:</span>{' '}
                <span className="text-slate-800 font-medium">{c.phone}</span>
              </p>
            )}
            {c.email && (
              <p>
                <span className="text-slate-500">Email:</span>{' '}
                <span className="text-slate-800 font-medium">{c.email}</span>
              </p>
            )}
            <p>
              <span className="text-slate-500">GSTIN:</span>{' '}
              <span className="font-mono font-semibold text-slate-900">{c.gstin || 'Unregistered'}</span>
            </p>
          </div>
        </div>

        <div className="sm:text-right">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
            Payment Details
          </p>
          <div className="space-y-1 text-[11px] text-slate-700">
            <p>
              <span className="text-slate-500">Payment Method:</span>{' '}
              <span className="font-semibold">{invoice.paymentMethod}</span>
            </p>
            <p>
              <span className="text-slate-500">Payment Status:</span>{' '}
              <span
                className={`font-bold ${
                  invoice.paymentStatus === 'Paid'
                    ? 'text-emerald-600'
                    : invoice.paymentStatus === 'Overdue'
                    ? 'text-rose-600'
                    : 'text-amber-600'
                }`}
              >
                {invoice.paymentStatus}
              </span>
            </p>
            <p>
              <span className="text-slate-500">Place of Supply:</span>{' '}
              <span className="font-semibold">
                {c.state} ({c.gstin ? c.gstin.slice(0, 2) : '—'})
              </span>
            </p>
            <p>
              <span className="text-slate-500">UPI / Bank:</span>{' '}
              <span className="font-mono font-semibold text-slate-800">{company.upiId}</span>
            </p>
            <p className="pt-1">
              <span className="text-slate-500">A/c:</span>{' '}
              <span className="font-mono font-semibold text-slate-800">
                {company.bankName} • {company.bankAccount}
              </span>
            </p>
            <p>
              <span className="text-slate-500">IFSC:</span>{' '}
              <span className="font-mono font-semibold text-slate-800">{company.ifscCode}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Items table */}
      <div className="px-8 py-6">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b-2 border-slate-900">
              <th className="py-2 pr-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 w-8">
                #
              </th>
              <th className="py-2 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                Item Description
              </th>
              <th className="py-2 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 w-20 text-center">
                Qty
              </th>
              <th className="py-2 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 w-12 text-center">
                Rate
              </th>
              <th className="py-2 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 w-24 text-right">
                Taxable
              </th>
              <th className="py-2 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 w-20 text-right">
                GST
              </th>
              <th className="py-2 pl-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 w-28 text-right">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, index) => {
              const taxAmount = (Number(item.subtotal) * Number(invoice.taxRate || 0)) / 100;
              const taxable = Number(item.subtotal);

              return (
                <tr key={`${item.productId}-${index}`} className="border-b border-slate-200">
                  <td className="py-2.5 pr-2 text-slate-500 align-top">{index + 1}</td>
                  <td className="py-2.5 px-2 align-top">
                    <p className="font-semibold text-slate-900">{item.productName}</p>
                    <p className="text-[10px] text-slate-500 font-mono">SKU: {item.sku}</p>
                  </td>
                  <td className="py-2.5 px-2 text-center text-slate-800 font-medium align-top">
                    {item.quantity}
                  </td>
                  <td className="py-2.5 px-2 text-center text-slate-600 align-top">
                    {formatCurrency(item.unitPrice)}
                  </td>
                  <td className="py-2.5 px-2 text-right text-slate-800 align-top">
                    {formatCurrency(taxable)}
                  </td>
                  <td className="py-2.5 px-2 text-right text-slate-600 align-top">
                    {formatCurrency(taxAmount)}
                    <span className="block text-[9px] text-slate-400">@ {invoice.taxRate}%</span>
                  </td>
                  <td className="py-2.5 pl-2 text-right font-bold text-slate-900 align-top">
                    {formatCurrency(Number(item.subtotal) + taxAmount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Totals */}
        <div className="mt-5 flex flex-col sm:flex-row justify-between gap-5">
          {/* Amount in words */}
          <div className="flex-1">
            <div className="rounded-lg border border-slate-300 bg-slate-50 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                Amount in Words
              </p>
              <p className="text-xs font-semibold text-slate-800">
                {numberToWords(Number(invoice.grandTotal))}
              </p>
            </div>

            {invoice.notes && (
              <div className="mt-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                  Notes
                </p>
                <p className="text-[11px] text-slate-600">{invoice.notes}</p>
              </div>
            )}
          </div>

          <div className="sm:w-72 space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span className="font-semibold text-slate-900">
                {formatCurrency(invoice.subtotal)}
              </span>
            </div>

            {Number(invoice.discountAmount) > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>
                  Discount
                  {invoice.discountPercent > 0 ? ` (${invoice.discountPercent}%)` : ''}
                </span>
                <span className="font-semibold text-emerald-600">
                  − {formatCurrency(invoice.discountAmount)}
                </span>
              </div>
            )}

            <div className="flex justify-between text-slate-600">
              <span>Taxable Value</span>
              <span className="font-semibold text-slate-900">
                {formatCurrency(Number(invoice.subtotal) - Number(invoice.discountAmount))}
              </span>
            </div>

            {/*
              GST is a genuine three-way split, decided server-side by comparing
              the customer's state to the company's:
                - same state  -> CGST + SGST, each at taxRate / 2
                - other state -> IGST at the full taxRate

              This used to hardcode a 50/50 CGST/SGST split, which is legally
              wrong on every inter-state supply and disagreed with the totals
              printed directly above it. The three amounts and `taxType` come
              from the API, so what is printed is exactly what was charged.
            */}
            {isInterState ? (
              <div className="flex justify-between text-slate-600">
                <span>IGST ({invoice.taxRate}%)</span>
                <span className="font-semibold text-slate-900">
                  {formatCurrency(igstAmount)}
                </span>
              </div>
            ) : (
              <>
                <div className="flex justify-between text-slate-600">
                  <span>CGST ({invoice.taxRate / 2}%)</span>
                  <span className="font-semibold text-slate-900">
                    {formatCurrency(cgstAmount)}
                  </span>
                </div>

                <div className="flex justify-between text-slate-600">
                  <span>SGST ({invoice.taxRate / 2}%)</span>
                  <span className="font-semibold text-slate-900">
                    {formatCurrency(sgstAmount)}
                  </span>
                </div>
              </>
            )}

            <div className="flex justify-between items-baseline pt-2.5 mt-2 border-t-2 border-slate-900">
              <span className="text-sm font-bold text-slate-900">Total Amount</span>
              <span className="text-lg font-bold text-slate-900">
                {formatCurrency(invoice.grandTotal)}
              </span>
            </div>

            <div className="flex justify-between text-emerald-700">
              <span>Amount Paid</span>
              <span className="font-semibold">− {formatCurrency(invoice.paidAmount)}</span>
            </div>

            <div className="flex justify-between items-baseline pt-2 border-t border-slate-300">
              <span className="font-bold text-slate-900">Balance Due</span>
              <span
                className={`font-bold ${
                  Number(invoice.balanceDue) > 0 ? 'text-rose-600' : 'text-emerald-600'
                }`}
              >
                {formatCurrency(invoice.balanceDue)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Terms & signature */}
      <div className="px-8 py-6 border-t border-slate-200 bg-slate-50 print:bg-white grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
            Terms &amp; Conditions
          </p>
          <div className="text-[10px] text-slate-600 leading-relaxed whitespace-pre-line">
            {invoice.terms}
          </div>
        </div>

        <div className="sm:text-right sm:self-end">
          <p className="text-[11px] text-slate-600">For <strong>{company.name}</strong></p>
          <div className="mt-10 pt-2 border-t border-slate-400 inline-block min-w-48">
            <p className="text-[11px] font-semibold text-slate-700">Authorised Signatory</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-8 py-3 border-t border-slate-200 text-center text-[10px] text-slate-400">
        This is a computer-generated invoice and does not require a physical signature. • Generated by
        FlowPilot Sales &amp; Inventory
      </div>
    </div>
  );
}