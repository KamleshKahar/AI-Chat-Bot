'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowUpRight, ArrowDownRight, CreditCard, ExternalLink } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/formatters';

export function RecentTransactions({ transactions = [] }) {
  const recent = transactions.slice(0, 5);

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs overflow-hidden">
      <div className="p-5 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Recent Transactions</h3>
          <p className="text-xs text-slate-500 mt-0.5">Latest financial payments and inventory debits</p>
        </div>
        <Link
          href="/invoices"
          className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
        >
          View Invoices <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase tracking-wider">
            <tr>
              <th className="px-5 py-3">Txn ID / Date</th>
              <th className="px-5 py-3">Type</th>
              <th className="px-5 py-3">Reference / Party</th>
              <th className="px-5 py-3">Payment Method</th>
              <th className="px-5 py-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium">
            {recent.map((txn) => {
              /*
                `direction` is the server's own IN/OUT classification.
                The previous check sniffed the label string for 'income' or
                'received', which mislabelled any payment whose type merely
                mentioned the word and could not distinguish a stock debit that
                happened to be typed 'INCOME'. `direction` is authoritative.
              */
              const isIncome = txn.direction === 'IN';

              return (
                <tr key={txn.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-5 py-3.5">
                    <span className="font-semibold text-slate-800 block">{txn.id}</span>
                    <span className="text-[11px] text-slate-400">{formatDate(txn.date)}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`inline-flex items-center gap-1 font-semibold ${
                        isIncome ? 'text-emerald-700' : 'text-slate-700'
                      }`}
                    >
                      {isIncome ? (
                        <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <ArrowDownRight className="w-3.5 h-3.5 text-slate-400" />
                      )}
                      {txn.type}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-slate-900 font-medium block">{txn.customer}</span>
                    <span className="text-[11px] text-slate-400">{txn.reference}</span>
                  </td>
                  <td className="px-5 py-3.5 text-slate-600">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                      <CreditCard className="w-3 h-3 text-slate-400" />
                      {txn.method}
                    </span>
                  </td>
                  <td className={`px-5 py-3.5 text-right font-bold text-sm ${isIncome ? 'text-emerald-600' : 'text-slate-900'}`}>
                    {isIncome ? '+' : '-'}{formatCurrency(txn.amount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
