/**
 * @file Writes the generated OpenAPI 3.1 spec to `docs/openapi.json`.
 * Run via `npm run docs:openapi`. Consumed by CI and committed as a deliverable.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildOpenApiDocument } from '../src/openapi/build.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(__dirname, '../docs/openapi.json');
const doc = buildOpenApiDocument();

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`);

const opCount = Object.values(doc.paths).reduce((n, m) => n + Object.keys(m).length, 0);
// eslint-disable-next-line no-console
console.log(`OpenAPI written: ${outPath} — ${Object.keys(doc.paths).length} paths, ${opCount} operations.`);
