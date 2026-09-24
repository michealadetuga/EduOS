/**
 * Common validation and transformation utilities for admin routes
 */

/**
 * Create a 400 Bad Request response
 * @param {import('express').Response} res - The response object
 * @param {string} msg - Error message
 * @returns {import('express').Response}
 */
function badRequest(res, msg) {
  return res.status(400).json({ error: msg });
}

/**
 * Convert value to number or return null if invalid
 * @param {*} v - Value to convert
 * @returns {number|null}
 */
function toNumber(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Convert value to trimmed string or return empty string if not a string
 * @param {*} v - Value to convert
 * @returns {string}
 */
function toString(v) {
  if (typeof v !== 'string') return '';
  return v.trim();
}

/**
 * Build SQL UPDATE SET clause and values array from request body
 * @param {Object} body - Request body
 * @param {Object.<string, function>} fields - Map of field names to transform functions
 * @returns {{ sets: string[], vals: any[] }}
 */
function buildPatchQuery(body, fields) {
  const sets = [];
  const vals = [];
  
  for (const [key, transform] of Object.entries(fields)) {
    if (!(key in body)) continue;
    sets.push(`${key} = ?`);
    vals.push(transform(body[key]));
  }
  
  return { sets, vals };
}

/**
 * Get a record owned by a specific school
 * @param {import('node:sqlite').DatabaseSync} db - Database instance
 * @param {string} table - Table name
 * @param {string|number} id - Record ID
 * @param {string|number} schoolId - School ID
 * @returns {Object|undefined}
 */
function getOwnedRecord(db, table, id, schoolId) {
  return db.prepare(`SELECT * FROM ${table} WHERE id = ? AND school_id = ?`).get(id, schoolId);
}

module.exports = {
  badRequest,
  toNumber,
  toString,
  buildPatchQuery,
  getOwnedRecord,
};
