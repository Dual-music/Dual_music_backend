/**
 * @file Minimal 5-field cron matcher (dependency-free).
 *
 * Supports the standard `min hour day-of-month month day-of-week` fields with
 * wildcard, step (slash-n), list (a,b) and range (a-b) syntax plus literals. Evaluated
 * against UTC to match the DB `time_zone = '+00:00'` convention. This is the
 * fallback used by the in-process scheduler when Redis/BullMQ is unavailable;
 * BullMQ uses the same cron strings natively.
 *
 * @module jobs/cron
 */

/**
 * Parses a single cron field into a membership predicate.
 * @param {string} field
 * @param {number} min
 * @param {number} max
 * @returns {(value: number) => boolean}
 */
function fieldMatcher(field, min, max) {
  if (field === '*') return () => true;
  const allowed = new Set();
  for (const part of field.split(',')) {
    const [range, stepRaw] = part.split('/');
    const step = stepRaw ? Number(stepRaw) : 1;
    let lo = min;
    let hi = max;
    if (range !== '*') {
      const [a, b] = range.split('-');
      lo = Number(a);
      hi = b !== undefined ? Number(b) : Number(a);
    }
    for (let v = lo; v <= hi; v += step) allowed.add(v);
  }
  return (value) => allowed.has(value);
}

/**
 * Compiles a cron expression into a matcher over a `Date`.
 * @param {string} expr - `min hour dom month dow`.
 * @returns {(date: Date) => boolean}
 * @throws {Error} When the expression does not have exactly five fields.
 */
export function compileCron(expr) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`Invalid cron expression: "${expr}"`);
  const [min, hour, dom, month, dow] = parts;
  const mMin = fieldMatcher(min, 0, 59);
  const mHour = fieldMatcher(hour, 0, 23);
  const mDom = fieldMatcher(dom, 1, 31);
  const mMonth = fieldMatcher(month, 1, 12);
  const mDow = fieldMatcher(dow, 0, 6);
  return (date) =>
    mMin(date.getUTCMinutes()) &&
    mHour(date.getUTCHours()) &&
    mDom(date.getUTCDate()) &&
    mMonth(date.getUTCMonth() + 1) &&
    mDow(date.getUTCDay());
}

export default { compileCron };
