/**
 * Simple debouncer/coalescer to avoid rapid repeated work.
 * Usage:
 * const d = createDebouncer();
 * d.schedule('dashboard', () => { ... }, 2000);
 */
function createDebouncer() {
  const timers = new Map();

  function schedule(key, fn, delay = 2000) {
    if (timers.has(key)) {
      clearTimeout(timers.get(key));
    }
    const id = setTimeout(() => {
      timers.delete(key);
      try {
        fn();
      } catch (e) {
        // swallow; caller should handle/log errors
        console.error('Debouncer scheduled function failed', e);
      }
    }, delay);
    timers.set(key, id);
  }

  function cancel(key) {
    if (timers.has(key)) {
      clearTimeout(timers.get(key));
      timers.delete(key);
    }
  }

  return { schedule, cancel };
}

module.exports = { createDebouncer };
