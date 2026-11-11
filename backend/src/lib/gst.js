/**
 * GST place-of-supply rules.
 *
 * A GST invoice is split differently depending on whether the supplier and the
 * recipient are in the same state:
 *
 *   Intra-state  -> CGST + SGST, each at half the total rate.
 *   Inter-state  -> IGST, at the full rate.
 *
 * The frontend's PrintableInvoice hardcodes a 50/50 CGST/SGST split regardless
 * of the customer's state, which under-charges IGST on inter-state supply. The
 * backend derives this correctly from the company profile's state against the
 * customer's state.
 */

/**
 * The GST tax slabs this application supports, in percent.
 *
 * India's GST rate schedule is a short, fixed list — 0 (exempt/nil-rated),
 * 5, 12, 18 and 28 — and every rate the system accepts must be one of them.
 * This constant is the single source of truth: `schemas/validators.js`
 * validates every product and invoice line rate against it, and the frontend
 * mirrors it for its dropdowns (ProductFormModal, CreateSaleForm). A rate
 * outside the list is either a typo or a legislative change — in both cases it
 * must be added here deliberately, never accepted silently.
 */
export const GST_SLABS = [0, 5, 12, 18, 28];

/** True when `rate` is one of the supported GST slabs. */
export function isGstSlab(rate) {
  const n = Number(rate);
  return GST_SLABS.some((slab) => Number.isFinite(n) && n === slab);
}

/** Normalise a state name for comparison (trim, collapse spaces, casefold). */
function normaliseState(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * @param {{state?: string|null}} company  the seller (company profile)
 * @param {{state?: string|null}} customer the buyer
 * @returns {'CGST_SGST'|'IGST'}
 */
export function resolveTaxType(company, customer) {
  const sellerState = normaliseState(company?.state);
  const buyerState = normaliseState(customer?.state);

  // An unknown state on either side is treated as intra-state, which matches the
  // behaviour of the mock dataset and fails safe (CGST+SGST is never below IGST
  // for the same base, so it cannot silently under-collect a rate difference).
  if (!sellerState || !buyerState) return 'CGST_SGST';
  return sellerState === buyerState ? 'CGST_SGST' : 'IGST';
}