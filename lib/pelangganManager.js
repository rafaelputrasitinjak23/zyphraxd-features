const fs = require("fs");
const path = require("path");
const { runtimePath } = require("./paths");

const ROOT = runtimePath();
const DATA_FILE = runtimePath("data", "pelanggan.json");
const DEFAULT_DURATION = process.env.PELANGGAN_DEFAULT_DURATION || "30d";

function ensureDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readJson(file, fallback) {
  ensureDirectory(path.dirname(file));
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
    return clone(fallback);
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : clone(fallback);
  } catch (error) {
    console.error("pelanggan.json tidak valid:", error.message);
    return clone(fallback);
  }
}

function writeJson(file, data) {
  ensureDirectory(path.dirname(file));
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(data, null, 2));
  fs.renameSync(temporary, file);
}

function normalizePhoneNumber(input) {
  let phone = String(input || "").replace(/[^0-9]/g, "");
  if (!phone) return "";
  if (phone.startsWith("0")) phone = `62${phone.slice(1)}`;
  else if (phone.startsWith("8")) phone = `62${phone}`;
  return phone;
}

function normalizeJid(value) {
  const raw = String(value || "");
  if (raw.endsWith("@g.us") || raw.endsWith("@newsletter")) return raw;
  const userPart = raw.split("@")[0].split(":")[0];
  const number = normalizePhoneNumber(userPart);
  return number ? `${number}@s.whatsapp.net` : "";
}

function parseDuration(input = DEFAULT_DURATION) {
  const text = String(input || DEFAULT_DURATION).trim().toLowerCase();
  if (["permanent", "permanen", "perm", "selamanya", "lifetime", "unlimited"].includes(text)) {
    return { ms: null, label: "Permanent", expiresAt: null };
  }

  const match = text.match(/^(\d+)\s*(m|min|menit|h|hour|jam|d|day|hari|w|week|minggu|mo|month|bulan|y|year|tahun)$/i);
  if (!match) {
    throw new Error("Durasi tidak valid. Contoh: 1d, 7d, 30d, 1bulan, permanent");
  }

  const amount = Math.max(1, Math.floor(Number(match[1]) || 0));
  const unit = match[2].toLowerCase();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  let ms = amount * day;
  let label = `${amount} Hari`;

  if (["m", "min", "menit"].includes(unit)) {
    ms = amount * minute;
    label = `${amount} Menit`;
  } else if (["h", "hour", "jam"].includes(unit)) {
    ms = amount * hour;
    label = `${amount} Jam`;
  } else if (["w", "week", "minggu"].includes(unit)) {
    ms = amount * 7 * day;
    label = `${amount} Minggu`;
  } else if (["mo", "month", "bulan"].includes(unit)) {
    ms = amount * 30 * day;
    label = `${amount} Bulan`;
  } else if (["y", "year", "tahun"].includes(unit)) {
    ms = amount * 365 * day;
    label = `${amount} Tahun`;
  }

  return {
    ms,
    label,
    expiresAt: new Date(Date.now() + ms).toISOString()
  };
}

function formatDate(value) {
  if (!value) return "Permanent";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return date.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatRemaining(expiresAt) {
  if (!expiresAt) return "Permanent";
  const end = new Date(expiresAt).getTime();
  if (!Number.isFinite(end)) return "-";
  const diff = end - Date.now();
  if (diff <= 0) return "Expired";

  const day = Math.floor(diff / 86400000);
  const hour = Math.floor((diff % 86400000) / 3600000);
  const minute = Math.floor((diff % 3600000) / 60000);
  if (day > 0) return `${day} hari ${hour} jam`;
  if (hour > 0) return `${hour} jam ${minute} menit`;
  return `${Math.max(1, minute)} menit`;
}

class PelangganManager {
  constructor(file = DATA_FILE) {
    this.file = file;
    this.ensure();
  }

  ensure() {
    ensureDirectory(path.dirname(this.file));
    if (!fs.existsSync(this.file)) {
      writeJson(this.file, { users: {}, meta: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } });
    }
  }

  readDB() {
    const data = readJson(this.file, { users: {}, meta: {} });
    if (!data.users || typeof data.users !== "object") data.users = {};
    if (!data.meta || typeof data.meta !== "object") data.meta = {};
    return data;
  }

  writeDB(data) {
    data.meta = { ...(data.meta || {}), updatedAt: new Date().toISOString() };
    writeJson(this.file, data);
  }

  cleanupExpired() {
    const data = this.readDB();
    let changed = false;
    const now = Date.now();

    for (const [jid, user] of Object.entries(data.users)) {
      if (!user?.active) continue;
      if (!user.expiresAt) continue;
      const expires = new Date(user.expiresAt).getTime();
      if (Number.isFinite(expires) && expires <= now) {
        data.users[jid] = {
          ...user,
          active: false,
          expiredAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        changed = true;
      }
    }

    if (changed) this.writeDB(data);
    return changed;
  }

  add(jidOrPhone, options = {}) {
    const jid = normalizeJid(jidOrPhone);
    if (!jid) throw new Error("Nomor/JID pelanggan tidak valid.");

    const duration = parseDuration(options.duration || DEFAULT_DURATION);
    const data = this.readDB();
    const previous = data.users[jid] || {};
    const now = new Date().toISOString();

    let expiresAt = duration.expiresAt;
    if (duration.ms && previous.active && previous.expiresAt) {
      const previousTime = new Date(previous.expiresAt).getTime();
      const base = Number.isFinite(previousTime) && previousTime > Date.now() ? previousTime : Date.now();
      expiresAt = new Date(base + duration.ms).toISOString();
    }

    data.users[jid] = {
      jid,
      number: jid.split("@")[0],
      name: String(options.name || previous.name || "Pelanggan").slice(0, 100),
      active: true,
      createdAt: previous.createdAt || now,
      updatedAt: now,
      addedBy: normalizeJid(options.addedBy || previous.addedBy || ""),
      durationLabel: duration.label,
      expiresAt,
      expiredAt: null,
      note: String(options.note || previous.note || "")
    };

    this.writeDB(data);
    return data.users[jid];
  }

  remove(jidOrPhone) {
    const jid = normalizeJid(jidOrPhone);
    if (!jid) return null;
    const data = this.readDB();
    const user = data.users[jid];
    if (!user) return null;
    data.users[jid] = {
      ...user,
      active: false,
      removedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.writeDB(data);
    return data.users[jid];
  }

  delete(jidOrPhone) {
    const jid = normalizeJid(jidOrPhone);
    if (!jid) return false;
    const data = this.readDB();
    if (!data.users[jid]) return false;
    delete data.users[jid];
    this.writeDB(data);
    return true;
  }

  get(jidOrPhone) {
    this.cleanupExpired();
    const jid = normalizeJid(jidOrPhone);
    if (!jid) return null;
    return this.readDB().users[jid] || null;
  }

  isPelanggan(jidOrPhone) {
    const user = this.get(jidOrPhone);
    return Boolean(user?.active);
  }

  list({ includeInactive = false } = {}) {
    this.cleanupExpired();
    const data = this.readDB();
    return Object.values(data.users || {})
      .filter((user) => includeInactive || user.active)
      .sort((a, b) => String(a.expiresAt || "9999").localeCompare(String(b.expiresAt || "9999")));
  }

  formatDate(value) {
    return formatDate(value);
  }

  formatRemaining(value) {
    return formatRemaining(value);
  }

  parseDuration(value) {
    return parseDuration(value);
  }

  normalizeJid(value) {
    return normalizeJid(value);
  }

  normalizePhoneNumber(value) {
    return normalizePhoneNumber(value);
  }
}

module.exports = new PelangganManager();
module.exports.PelangganManager = PelangganManager;
module.exports.normalizeJid = normalizeJid;
module.exports.normalizePhoneNumber = normalizePhoneNumber;
module.exports.parseDuration = parseDuration;
module.exports.formatDate = formatDate;
module.exports.formatRemaining = formatRemaining;
