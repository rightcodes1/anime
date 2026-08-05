// In-memory preview cache used to avoid repeated provider calls during an interaction.
// Key format: `${userId}:${providerId}`
// TTL default: 5 minutes
class PreviewCache {
  constructor(ttlMs = 5 * 60 * 1000) {
    this.ttl = ttlMs;
    this.map = new Map(); // key -> { value, expiresAt }
  }

  set(key, value) {
    this.map.set(key, { value, expiresAt: Date.now() + this.ttl });
  }

  get(key) {
    const rec = this.map.get(key);
    if (!rec) return null;
    if (Date.now() > rec.expiresAt) {
      this.map.delete(key);
      return null;
    }
    return rec.value;
  }

  delete(key) {
    this.map.delete(key);
  }
}

module.exports = new PreviewCache();
