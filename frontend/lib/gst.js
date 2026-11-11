/**
 * GST place-of-supply + rate-slab constants, shared across the UI.
 *
 * `GST_SLABS` mirrors backend/src/lib/gst.js#GST_SLABS — the single source of
 * truth the server validates every product and invoice line rate against.
 * The dropdowns (ProductFormModal, CreateSaleForm) read this list so a slab
 * the server would reject can never be offered in the first place.
 *
 * Intra-state supply is split into CGST + SGST at half the rate each;
 * inter-state supply carries IGST at the full rate. The backend derives which
 * applies from the company profile's state vs the customer's state; the UI
 * just renders the `taxType` the API returns.
 */
export const GST_SLABS = [0, 5, 12, 18, 28];

/** Default slab for new products and sales, matching the backend default. */
export const DEFAULT_GST_SLAB = 18;

/** `{ value, label }` options for the slab `<Select>` dropdowns. */
export const GST_SLAB_OPTIONS = GST_SLABS.map((rate) => ({
  value: rate,
  label: `${rate}%`,
}));
