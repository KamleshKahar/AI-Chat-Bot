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