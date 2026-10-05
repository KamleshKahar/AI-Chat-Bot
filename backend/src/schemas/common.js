import { z } from 'zod';
import { extendZodWithOpenApi, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

/** Shared OpenAPI document registry. Every schema module registers into this. */
export const registry = new OpenAPIRegistry();

export { z };

// ---------------------------------------------------------------------------
// Reusable primitives
// ---------------------------------------------------------------------------

/** Human-readable document code, e.g. 'PRD-101'. Returned as the API `id`. */
export const CodeSchema = z.string().min(1).openapi({ example: 'PRD-101' });

/** ISO calendar date, 'YYYY-MM-DD'. */
export const DateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a valid YYYY-MM-DD date')
  .openapi({ example: '2026-10-03' });

/** DECIMAL(14,2) as transported over JSON. */
export const MoneySchema = z.number().openapi({ example: 21635.3 });

/** GST percentage, DECIMAL(5,2). */
export const RateSchema = z.number().openapi({ example: 18 });

export const QuantitySchema = z.number().int().openapi({ example: 4 });

/** Labels exactly as the frontend renders them. */
export const PaymentStatusSchema = z
  .enum(['Pending', 'Partial', 'Paid', 'Overdue'])
  .openapi({ example: 'Paid' });

export const PaymentMethodSchema = z
  .enum(['UPI', 'Cash', 'Bank Transfer', 'Cheque', 'Credit Card', 'COD'])
  .openapi({ example: 'UPI' });

export const StockStatusSchema = z
  .enum(['in_stock', 'low_stock', 'out_of_stock'])
  .openapi({ example: 'in_stock' });

// ---------------------------------------------------------------------------
// Envelopes
// ---------------------------------------------------------------------------

export const PaginationMetaSchema = z
  .object({
    total: z.number().int().openapi({ example: 128 }),
    page: z.number().int().openapi({ example: 1 }),
    limit: z.number().int().openapi({ example: 10 }),
    totalPages: z.number().int().openapi({ example: 13 }),
  })
  .openapi('PaginationMeta');

registry.register('PaginationMeta', PaginationMetaSchema);

export const ErrorSchema = z
  .object({
    error: z.object({
      status: z.number().int().openapi({ example: 422 }),
      code: z.string().openapi({ example: 'VALIDATION_FAILED' }),
      message: z.string().openapi({ example: 'Validation failed' }),
      details: z.record(z.string(), z.string()).optional().openapi({
        example: { pincode: 'Must be exactly 6 digits' },
      }),
    }),
  })
  .openapi('Error');

registry.register('Error', ErrorSchema);

/** `{ data: [...], meta: {...} }` */
export function listEnvelope(dataSchema) {
  return z
    .object({ data: z.array(dataSchema), meta: PaginationMetaSchema })
    .openapi('PaginatedList');
}

export const errorResponse = (description, example) => ({
  description,
  content: {
    'application/json': {
      schema: ErrorSchema,
      ...(example ? { example } : {}),
    },
  },
});

export const jsonResponse = (description, schema, example) => ({
  description,
  content: {
    'application/json': {
      schema,
      ...(example ? { example } : {}),
    },
  },
});

/** Register a path with the shared error responses applied automatically. */
export function registerRoute({
  method,
  path,
  tags,
  summary,
  description,
  request,
  responses,
  security,
  open = true,
}) {
  const success = Object.fromEntries(
    Object.entries(responses).filter(([code]) => Number(code) < 400)
  );

  registry.registerPath({
    method,
    path,
    tags,
    summary,
    ...(description ? { description } : {}),
    ...(security === null ? { security: [] } : {}),
    request,
    responses: {
      ...(open ? success : {}),
      400: errorResponse('Bad request'),
      401: errorResponse('Authentication required', {
        error: { status: 401, code: 'UNAUTHORIZED', message: 'Missing bearer token' },
      }),
      403: errorResponse('Insufficient permissions'),
      404: errorResponse('Not found'),
      422: errorResponse('Validation failed'),
      500: errorResponse('Internal server error'),
      ...(responses.default ?? {}),
    },
    ...(security !== null && security !== undefined ? { security } : {}),
  });
}

/** Query param helper: an optional string that is trimmed and emptied to undefined. */
export const optionalText = (description, extra = {}) =>
  z
    .string()
    .trim()
    .optional()
    .openapi({ description, ...extra });

/**
 * Reusable query schemas.
 *
 * zod-to-openapi expects `request.query` to be a ZodObject (it reads
 * `.def.shape`), so these are objects rather than shape maps.
 */
export const PagingQuery = z
  .object({
    page: z.coerce.number().int().min(1).optional().openapi({
      description: '1-based page number',
      example: 1,
    }),
    limit: z.coerce.number().int().min(1).max(100).optional().openapi({
      description: 'Rows per page (default 10, max 100)',
      example: 10,
    }),
  })
  .openapi('PagingQuery');

export const DateRangeQuery = z
  .object({
    from: DateOnlySchema.optional().openapi({
      description: 'Inclusive start date',
      example: '2026-09-01',
    }),
    to: DateOnlySchema.optional().openapi({
      description: 'Inclusive end date',
      example: '2026-10-04',
    }),
  })
  .openapi('DateRangeQuery');