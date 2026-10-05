/**
 * Dump the generated OpenAPI document to stdout (npm run openapi).
 * Useful for committing the spec or piping it into a client generator.
 */
import 'dotenv/config';
import { buildOpenApiDocument } from '../src/docs/openapi.js';

const doc = buildOpenApiDocument();
const target = process.argv[2];

if (target) {
  const { writeFile } = await import('node:fs/promises');
  await writeFile(target, JSON.stringify(doc, null, 2));
  console.log(`OpenAPI document written to ${target}`);
} else {
  console.log(JSON.stringify(doc, null, 2));
}