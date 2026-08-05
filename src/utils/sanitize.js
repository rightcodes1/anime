// Recursively convert undefined values to null to avoid DB binding issues.
function sanitizeBindings(input) {
  if (input === undefined) return null;
  if (input === null) return null;
  if (Array.isArray(input)) return input.map(sanitizeBindings);
  if (typeof input === 'object') {
    const out = {};
    for (const k of Object.keys(input)) {
      out[k] = sanitizeBindings(input[k]);
    }
    return out;
  }
  return input;
}

module.exports = { sanitizeBindings };
