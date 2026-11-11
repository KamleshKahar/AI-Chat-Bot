'use client';

import React from 'react';
import { useData } from '@/context/DataContext';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { round2 } from '@/lib/salesLogic';
import { numberToWords } from '@/lib/numberToWords';

/**
 * Printable credit note (NOTA).
 *
 * Same legal-document rules as the invoice it reverses: the customer block is
 * the frozen snapshot taken at creation, every line carries its own GST slab
 * and HSN code, and the tax split printed is exactly what the server stored —
 * never recomputed in the browser.
 */
export function PrintableCreditNote({ note }) {
  const { company } = useData();

  if (!note) return null;

  const c = note.customer || {};
  const isInterState = note.taxType === 'IGST';
  const cgstAmount = Number(note.cgstAmount ?? 0);
  const sgstAmount = Number(note.sgstAmount ?? 0);
  const igstAmount = Number(note.igstAmount ?? 0);

  const itemRate = (item) => Number(item.taxRate ?? note.taxRate ?? 0);
  const itemTaxable = (item) => Number(item.taxableValue ?? item.subtotal ?? 0);
  const distinctRates = [...new Set((note.items ?? []).map((item) => itemRate(item)))].sort(
    (a, b) => a - b
  );
  const rateLabel = distinctRates.length === 1 ? ` (${distinctRates[0]}%)` : ' (mixed)';

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
              GSTIN: <span className="font-mono font-semibold text-slate-800">{company.gstin}</span>{' '}
              • PAN: <span className="font-mono font-semibold text-slate-800">{company.pan}</span>
            </p>
            <p>
              {company.email} • {company.phone}
            </p>
          </div>
        </div>

        <div className="sm:text-right shrink-0">
          <p className="text-2xl font-bold tracking-tight text-slate-900">CREDIT NOTE</p>
          <p className="text-sm text-slate-500 mt-0.5">Original for Recipient</p>

          <div className="mt-4 space-y-1 text-[11px] sm:text-right">
            <p>
              <span className="text-slate-500">Credit Note No:</span>{' '}
              <span className="font-mono font-bold text-slate-900">{note.id}</span>
            </p>
            <p>
              <span className="text-slate-500">Date:</span>{' '}
              <span className="font-semibold text-slate-900">{formatDate(note.date)}</span>
            </p>
            <p>
              <span className="text-slate-500">Against Invoice:</span>{' '}
              <span className="font-mono font-semibold text-slate-900">{note.invoiceId}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Parties */}
      <div className="px-8 py-6 grid grid-cols-1 sm:grid-cols-2 gap-6 bg-slate-50 print:bg-white">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
            Credited To
          </p>
          <p className="text-sm font-bold text-slate-900">{c.name}</p>
          {c.company && <p className="text-xs text-slate-600 font-medium">{c.company}</p>}
          <div className="mt-2 space-y-0.5 text-[11px]">
            {c.state && (
              <p>
                <span className="text-slate-500">State:</span>{' '}
                <span className="text-slate-800 font-medium">{c.state}</span>
              </p>
            )}
            <p>
              <span className="text-slate-500">GSTIN:</span>{' '}
              <span className="font-mono font-semibold text-slate-900">
                {c.gstin || 'Unregistered'}
              </span>
            </p>
          </div>
        </div>

        <div className="sm:text-right">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
            Return Details
          </p>
          <div className="space-y-1 text-[11px] text-slate-700">
            <p>
              <span className="text-slate-500">Original Invoice:</span>{' '}
              <span className="font-mono font-semibold">{note.invoiceId}</span>
            </p>
            <p>
              <span className="text-slate-500">Tax Type:</span>{' '}
              <span className="font-semibold">
                {isInterState ? 'IGST (Inter-state)' : 'CGST + SGST (Intra-state)'}
              </span>
            </p>
            {note.reason && (
              <p className="pt-1">
                <span className="text-slate-500">Reason:</span>{' '}
                <span className="font-medium text-slate-800">{note.reason}</span>
              </p>
            )}
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
              <th className="py-2 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 w-16 text-center">
                HSN
              </th>
              <th className="py-2 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 w-16 text-center">
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
            {(note.items || []).map((item, index) => {
              const taxable = itemTaxable(item);
              const rate = itemRate(item);
              const lineTax = round2((taxable * rate) / 100);

              return (
                <tr key={`${item.id ?? index}`} className="border-b border-slate-200">
                  <td className="py-2.5 pr-2 text-slate-500 align-top">{index + 1}</td>
                  <td className="py-2.5 px-2 align-top">
                    <p className="font-semibold text-slate-900">{item.productName}</p>
                    <p className="text-[10px] text-slate-500 font-mono">SKU: {item.sku}</p>
                  </td>
                  <td className="py-2.5 px-2 text-center text-slate-600 font-mono align-top">
                    {item.hsnCode || '—'}
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
                    {formatCurrency(lineTax)}
                    <span className="block text-[9px] text-slate-400">@ {rate}%</span>
                  </td>
                  <td className="py-2.5 pl-2 text-right font-bold text-slate-900 align-top">
                    {formatCurrency(taxable + lineTax)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Totals */}
        <div className="mt-5 flex flex-col sm:flex-row justify-between gap-5">
          <div className="flex-1">
            <div className="rounded-lg border border-slate-300 bg-slate-50 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                Amount in Words
              </p>
              <p className="text-xs font-semibold text-slate-800">
                {numberToWords(Number(note.grandTotal))}
              </p>
            </div>

            {note.reason && (
              <div className="mt-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                  Reason for Credit
                </p>
                <p className="text-[11px] text-slate-600">{note.reason}</p>
              </div>
            )}
          </div>

          <div className="sm:w-72 space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Credited Value</span>
              <span className="font-semibold text-slate-900">
                {formatCurrency(note.subtotal)}
              </span>
            </div>

            {Number(note.discountAmount) > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Discount Reversed</span>
                <span className="font-semibold text-emerald-600">
                  − {formatCurrency(note.discountAmount)}
                </span>
              </div>
            )}

            <div className="flex justify-between text-slate-600">
              <span>Taxable Value</span>
              <span className="font-semibold text-slate-900">
                {formatCurrency(note.taxableAmount)}
              </span>
            </div>

            {isInterState ? (
              <div className="flex justify-between text-slate-600">
                <span>IGST{rateLabel}</span>
                <span className="font-semibold text-slate-900">
                  {formatCurrency(igstAmount)}
                </span>
              </div>
            ) : (
              <>
                <div className="flex justify-between text-slate-600">
                  <span>
                    CGST
                    {distinctRates.length === 1 ? ` (${distinctRates[0] / 2}%)` : ''}
                  </span>
                  <span className="font-semibold text-slate-900">
                    {formatCurrency(cgstAmount)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>
                    SGST
                    {distinctRates.length === 1 ? ` (${distinctRates[0] / 2}%)` : ''}
                  </span>
                  <span className="font-semibold text-slate-900">
                    {formatCurrency(sgstAmount)}
                  </span>
                </div>
              </>
            )}

            <div className="flex justify-between items-baseline pt-2.5 mt-2 border-t-2 border-slate-900">
              <span className="text-sm font-bold text-slate-900">Total Credit</span>
              <span className="text-lg font-bold text-slate-900">
                {formatCurrency(note.grandTotal)}
              </span>
            </div>

            <p className="text-[10px] text-slate-400 pt-1">
              This credit note reduces the balance outstanding on invoice {note.invoiceId}.
            </p>
          </div>
        </div>
      </div>

      {/* Signature */}
      <div className="px-8 py-6 border-t border-slate-200 bg-slate-50 print:bg-white grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="text-[10px] text-slate-600 leading-relaxed">
          Goods returned against this credit note are taken back into stock. Issued credit
          notes are immutable; a correction is a new credit note.
        </div>

        <div className="sm:text-right sm:self-end">
          <p className="text-[11px] text-slate-600">
            For <strong>{company.name}</strong>
          </p>
          <div className="mt-10 pt-2 border-t border-slate-400 inline-block min-w-48">
            <p className="text-[11px] font-semibold text-slate-700">Authorised Signatory</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-8 py-3 border-t border-slate-200 text-center text-[10px] text-slate-400">
        This is a computer-generated credit note and does not require a physical signature. •
        Generated by FlowPilot Sales &amp; Inventory
      </div>
    </div>
  );
}
