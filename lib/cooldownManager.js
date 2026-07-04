class CooldownManager {
  constructor() {
    this.entries = new Map();
    this.cleanupTimer = setInterval(() => this.cleanup(), 60_000);
    this.cleanupTimer.unref?.();
  }

  key(userJid, command) {
    return `${userJid}:${command}`;
  }

  check(userJid, command, durationMs) {
    if (!durationMs || durationMs <= 0) return { ok: true, remainingMs: 0 };
    const key = this.key(userJid, command);
    const expiresAt = this.entries.get(key) || 0;
    const remainingMs = expiresAt - Date.now();
    if (remainingMs > 0) return { ok: false, remainingMs };
    this.entries.set(key, Date.now() + durationMs);
    return { ok: true, remainingMs: 0 };
  }

  clear(userJid, command) {
    this.entries.delete(this.key(userJid, command));
  }

  cleanup() {
    const now = Date.now();
    for (const [key, expiresAt] of this.entries.entries()) {
      if (expiresAt <= now) this.entries.delete(key);
    }
  }
}

module.exports = new CooldownManager();
