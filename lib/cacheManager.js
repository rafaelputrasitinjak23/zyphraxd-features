const fs = require("fs");
const path = require("path");
const { runtimePath } = require("./paths");
const crypto = require("crypto");

class CacheManager {
  constructor({ filePath, defaultTtlMs = 10 * 60 * 1000, maxEntries = 500 } = {}) {
    this.filePath = filePath || runtimePath("data", "downloader-cache.json");
    this.defaultTtlMs = defaultTtlMs;
    this.maxEntries = maxEntries;
    this.entries = {};
    this.pending = new Map();
    this.load();
  }

  load() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (!fs.existsSync(this.filePath)) {
      this.save();
      return;
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      this.entries = parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      this.entries = {};
      this.save();
    }
    this.cleanup();
  }

  save() {
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(this.entries, null, 2));
    fs.renameSync(temporary, this.filePath);
  }

  hash(key) {
    return crypto.createHash("sha256").update(String(key)).digest("hex");
  }

  get(key) {
    const hashed = this.hash(key);
    const entry = this.entries[hashed];
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      delete this.entries[hashed];
      this.save();
      return null;
    }
    entry.hits = (entry.hits || 0) + 1;
    entry.lastHitAt = Date.now();
    this.save();
    return entry.value;
  }

  set(key, value, ttlMs = this.defaultTtlMs) {
    const hashed = this.hash(key);
    this.entries[hashed] = {
      key: String(key).slice(0, 500),
      value,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
      hits: 0
    };
    this.trim();
    this.save();
    return value;
  }

  async getOrSet(key, producer, ttlMs = this.defaultTtlMs) {
    const cached = this.get(key);
    if (cached !== null) return { value: cached, cached: true };
    const hashed = this.hash(key);
    if (this.pending.has(hashed)) {
      return { value: await this.pending.get(hashed), cached: true };
    }
    const promise = Promise.resolve().then(producer);
    this.pending.set(hashed, promise);
    try {
      const value = await promise;
      this.set(key, value, ttlMs);
      return { value, cached: false };
    } finally {
      this.pending.delete(hashed);
    }
  }

  cleanup() {
    const now = Date.now();
    let changed = false;
    for (const [key, entry] of Object.entries(this.entries)) {
      if (!entry || entry.expiresAt <= now) {
        delete this.entries[key];
        changed = true;
      }
    }
    if (changed) this.save();
  }

  trim() {
    const list = Object.entries(this.entries);
    if (list.length <= this.maxEntries) return;
    list.sort((a, b) => (a[1].lastHitAt || a[1].createdAt) - (b[1].lastHitAt || b[1].createdAt));
    for (const [key] of list.slice(0, list.length - this.maxEntries)) delete this.entries[key];
  }

  clear() {
    const count = Object.keys(this.entries).length;
    this.entries = {};
    this.save();
    return count;
  }

  stats() {
    this.cleanup();
    return {
      entries: Object.keys(this.entries).length,
      pending: this.pending.size,
      filePath: this.filePath
    };
  }
}

module.exports = new CacheManager();
module.exports.CacheManager = CacheManager;
