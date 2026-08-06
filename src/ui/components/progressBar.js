/**
 * renderProgressBar: returns a simple text progress bar.
 * - current: number
 * - total: number
 * - length: number of characters in the bar
 */
function renderProgressBar(current, total, length = 12) {
  if (!total || total <= 0) return '▮'.repeat(0) + ' ' + '0%';
  const pct = Math.max(0, Math.min(1, current / total));
  const filled = Math.round(pct * length);
  const empty = length - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  const percent = Math.round(pct * 100);
  return `${bar} ${percent}%`;
}

module.exports = { renderProgressBar };
