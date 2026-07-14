/* eslint-disable no-console */
/**
 * @file Applies all stored procedures in `src/procedures/*.sql` to the database.
 *
 * Each `.sql` file may contain several statements separated by a `-- @sep`
 * marker; the script runs each chunk as a single query (so procedure bodies
 * with embedded semicolons work without client-side DELIMITER handling).
 * Idempotent: files use `DROP PROCEDURE IF EXISTS` before `CREATE`.
 *
 * @module scripts/apply-procedures
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import mysql from 'mysql2/promise';

import { config } from '../src/config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROC_DIR = path.resolve(__dirname, '..', 'src', 'procedures');

async function main() {
  if (!fs.existsSync(PROC_DIR)) {
    console.log('No procedures directory — nothing to apply.');
    return;
  }
  const files = fs.readdirSync(PROC_DIR).filter((f) => f.endsWith('.sql')).sort();
  if (files.length === 0) {
    console.log('No .sql procedure files found.');
    return;
  }

  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.name,
    multipleStatements: false,
  });

  try {
    for (const file of files) {
      const sql = fs.readFileSync(path.join(PROC_DIR, file), 'utf8');
      const statements = sql
        .split(/^-- @sep\s*$/m)
        .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
        .filter(Boolean);
      for (const stmt of statements) {
        await conn.query(stmt);
      }
      console.log(`Applied procedures: ${file} (${statements.length} statement(s))`);
    }
    console.log('All stored procedures applied.');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('Failed to apply procedures:', err.message);
  process.exit(1);
});
