import { db } from '../models/index.js';

/**
 * @file Helper to invoke MySQL stored procedures that expose OUT parameters.
 * @module utils/procedures
 */

/**
 * Calls a stored procedure with OUT parameters on a single dedicated connection,
 * so the `@out` session variables set by CALL are read back on the **same**
 * connection (they are connection-scoped in MySQL). Returns the OUT values.
 *
 * @param {string} name - Procedure name.
 * @param {Array<unknown>} inValues - IN argument values (positional).
 * @param {string[]} outNames - Names of OUT parameters to read back.
 * @returns {Promise<Record<string, any>>} Map of outName → value.
 */
export async function callProcedure(name, inValues, outNames) {
  const conn = await db.sequelize.connectionManager.getConnection({ type: 'write' });
  // Sequelize hands back a raw mysql2 connection whose `.query()` is
  // callback-based; use its promise wrapper so `await` works. Both wrappers
  // share the same socket, so connection-scoped `@out` variables persist.
  const q = typeof conn.promise === 'function' ? conn.promise() : conn;
  try {
    const placeholders = [...inValues.map(() => '?'), ...outNames.map((n) => `@${n}`)].join(', ');
    await q.query(`CALL ${name}(${placeholders})`, inValues);
    if (outNames.length === 0) return {};
    const [rows] = await q.query(`SELECT ${outNames.map((n) => `@${n} AS ${n}`).join(', ')}`);
    return rows[0] || {};
  } finally {
    db.sequelize.connectionManager.releaseConnection(conn);
  }
}

export default { callProcedure };
