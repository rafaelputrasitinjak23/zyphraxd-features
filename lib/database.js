const fs = require("fs");
const path = require("path");
const { runtimePath } = require("./paths");

const DATA_DIR = runtimePath("data");
const DATABASE_FILE = runtimePath("data", "database.json");
const ACCESS_FILE = runtimePath("users.json");

const FREE_DAILY_LIMIT = 25;
const PREMIUM_DAILY_LIMIT = 100;
const EXP_PER_COMMAND = 10;
const LEVEL_UP_LIMIT_BONUS = 5;

function normalizeJid(value) {
  const raw = String(value || "");
  if (raw.endsWith("@g.us") || raw.endsWith("@newsletter")) return raw;
  const userPart = raw.split("@")[0].split(":")[0];
  const number = userPart.replace(/[^0-9]/g, "");
  return number ? `${number}@s.whatsapp.net` : "";
}

function jakartaDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function createDefaultDatabase() {
  return {
    meta: {
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    users: {},
    groups: {},
    stats: {
      messages: 0,
      commands: 0,
      errors: 0,
      commandUsage: {},
      startedAt: new Date().toISOString()
    }
  };
}

function defaultUser(jid, name = "Unknown") {
  const now = new Date().toISOString();
  return {
    jid,
    name: String(name || "Unknown").slice(0, 100),
    createdAt: now,
    registered: false,
    registeredAt: null,
    profileName: "",
    age: null,
    lastSeen: now,
    premium: false,
    premiumUntil: null,
    limit: FREE_DAILY_LIMIT,
    dailyLimit: FREE_DAILY_LIMIT,
    lastLimitReset: jakartaDateKey(),
    exp: 0,
    level: 1,
    lastLevelUpAt: null,
    totalCommands: 0,
    banned: false,
    banReason: "",
    warnings: 0
  };
}

function expRequiredForLevel(level) {
  const target = Math.max(1, Math.floor(Number(level) || 1));
  return Math.floor(((target - 1) * target / 2) * 100);
}

function levelFromExp(exp) {
  const value = Math.max(0, Math.floor(Number(exp) || 0));
  let level = 1;
  while (value >= expRequiredForLevel(level + 1)) level += 1;
  return level;
}

function nextLevelExp(level) {
  return expRequiredForLevel(Math.max(1, Math.floor(Number(level) || 1)) + 1);
}

function defaultGroup(jid) {
  const now = new Date().toISOString();
  return {
    jid,
    createdAt: now,
    updatedAt: now,
    welcome: false,
    goodbye: false,
    antiLink: false,
    antiSpam: false,
    antiToxic: false,
    muted: false,
    welcomeText: "Selamat datang @user di @group!",
    goodbyeText: "Selamat tinggal @user dari @group.",
    rules: "Belum ada peraturan grup.",
    warnings: {}
  };
}

class JsonDatabase {
  constructor(filePath = DATABASE_FILE) {
    this.filePath = filePath;
    this.data = createDefaultDatabase();
    this.ensure();
  }

  ensure() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (!fs.existsSync(this.filePath)) {
      this.save();
      return;
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      this.data = {
        ...createDefaultDatabase(),
        ...parsed,
        meta: { ...createDefaultDatabase().meta, ...(parsed.meta || {}) },
        users: parsed.users && typeof parsed.users === "object" ? parsed.users : {},
        groups: parsed.groups && typeof parsed.groups === "object" ? parsed.groups : {},
        stats: { ...createDefaultDatabase().stats, ...(parsed.stats || {}) }
      };
    } catch (error) {
      const corrupt = `${this.filePath}.corrupt-${Date.now()}`;
      try {
        fs.copyFileSync(this.filePath, corrupt);
      } catch {}
      console.error("Database rusak, database baru dibuat:", error.message);
      this.data = createDefaultDatabase();
      this.save();
    }

    this.migrateAccessUsers();
  }

  migrateAccessUsers() {
    if (!fs.existsSync(ACCESS_FILE)) return;
    try {
      const users = JSON.parse(fs.readFileSync(ACCESS_FILE, "utf8"));
      if (!Array.isArray(users)) return;
      let changed = false;
      for (const value of users) {
        const jid = normalizeJid(value);
        if (!jid || this.data.users[jid]) continue;
        this.data.users[jid] = defaultUser(jid, "Access User");
        changed = true;
      }
      if (changed) this.save();
    } catch {}
  }

  save() {
    this.data.meta.updatedAt = new Date().toISOString();
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(this.data, null, 2));
    fs.renameSync(temporary, this.filePath);
  }

  reload() {
    this.ensure();
    return this.data;
  }

  getUser(jid, name = "Unknown") {
    const id = normalizeJid(jid);
    if (!id) return null;
    if (!this.data.users[id]) {
      this.data.users[id] = defaultUser(id, name);
      this.save();
    }

    const user = this.data.users[id];
    this.normalizeUser(user);
    user.name = String(name || user.name || "Unknown").slice(0, 100);
    user.lastSeen = new Date().toISOString();
    this.refreshPremium(user);
    this.resetDailyLimit(user);
    return user;
  }

  normalizeUser(user) {
    if (!user || typeof user !== "object") return user;
    if (typeof user.registered !== "boolean") {
      user.registered = Boolean(user.registeredAt);
    }
    if (!Object.prototype.hasOwnProperty.call(user, "createdAt")) {
      user.createdAt = user.registeredAt || new Date().toISOString();
    }
    if (!Object.prototype.hasOwnProperty.call(user, "registeredAt")) {
      user.registeredAt = user.registered ? user.createdAt : null;
    }
    if (!Object.prototype.hasOwnProperty.call(user, "profileName")) {
      user.profileName = user.registered ? user.name || "" : "";
    }
    if (!Object.prototype.hasOwnProperty.call(user, "age")) user.age = null;
    if (!Number.isFinite(Number(user.exp))) user.exp = 0;
    user.exp = Math.max(0, Math.floor(Number(user.exp) || 0));
    user.level = Math.max(1, Math.floor(Number(user.level) || levelFromExp(user.exp)));
    if (user.level !== levelFromExp(user.exp)) user.level = levelFromExp(user.exp);
    if (!Object.prototype.hasOwnProperty.call(user, "lastLevelUpAt")) user.lastLevelUpAt = null;
    if (!Number.isFinite(Number(user.limit))) user.limit = FREE_DAILY_LIMIT;
    if (!Number.isFinite(Number(user.dailyLimit))) user.dailyLimit = FREE_DAILY_LIMIT;
    if (!user.lastLimitReset) user.lastLimitReset = jakartaDateKey();
    return user;
  }

  registerUser(jid, profile = {}, name = "Unknown") {
    const user = this.getUser(jid, name);
    if (!user) throw new Error("JID user tidak valid.");

    const profileName = String(profile.name || "").trim().replace(/\s+/g, " ").slice(0, 60);
    const age = Math.floor(Number(profile.age) || 0);

    if (!profileName) throw new Error("Nama pendaftaran wajib diisi.");
    if (age < 5 || age > 120) throw new Error("Umur harus berupa angka 5 sampai 120.");

    user.registered = true;
    user.registeredAt = user.registeredAt || new Date().toISOString();
    user.profileName = profileName;
    user.age = age;
    user.level = Math.max(1, Math.floor(Number(user.level) || 1));
    user.exp = Math.max(0, Math.floor(Number(user.exp) || 0));
    this.save();
    return user;
  }

  isRegistered(jid) {
    const user = this.getUser(jid);
    return Boolean(user?.registered);
  }

  refreshPremium(user) {
    if (!user?.premium) return false;
    if (!user.premiumUntil) return true;
    if (Date.now() < new Date(user.premiumUntil).getTime()) return true;
    user.premium = false;
    user.premiumUntil = null;
    user.dailyLimit = FREE_DAILY_LIMIT;
    user.limit = Math.min(user.limit, FREE_DAILY_LIMIT);
    return false;
  }

  resetDailyLimit(user) {
    const today = jakartaDateKey();
    if (user.lastLimitReset === today) return false;
    const premium = this.refreshPremium(user);
    user.dailyLimit = premium ? PREMIUM_DAILY_LIMIT : FREE_DAILY_LIMIT;
    user.limit = user.dailyLimit;
    user.lastLimitReset = today;
    this.save();
    return true;
  }

  touchUser(jid, name) {
    const user = this.getUser(jid, name);
    this.data.stats.messages += 1;
    this.save();
    return user;
  }

  recordCommand(jid, command, name) {
    const user = this.getUser(jid, name);
    if (!user) return null;
    user.totalCommands += 1;
    user.lastCommand = command;
    user.lastCommandAt = new Date().toISOString();
    this.data.stats.commands += 1;
    this.data.stats.commandUsage[command] = (this.data.stats.commandUsage[command] || 0) + 1;
    this.save();
    return user;
  }

  addExperience(jid, command = "", name = "Unknown", amount = EXP_PER_COMMAND) {
    const user = this.getUser(jid, name);
    if (!user || !user.registered) {
      return { user, gained: 0, oldLevel: user?.level || 1, newLevel: user?.level || 1, levelUp: false };
    }

    const gained = Math.max(0, Math.floor(Number(amount) || 0));
    const oldLevel = Math.max(1, Math.floor(Number(user.level) || levelFromExp(user.exp)));
    user.exp = Math.max(0, Math.floor(Number(user.exp) || 0)) + gained;
    user.level = levelFromExp(user.exp);
    user.lastExpCommand = command;
    user.lastExpAt = new Date().toISOString();

    const levelUp = user.level > oldLevel;
    if (levelUp) {
      user.lastLevelUpAt = new Date().toISOString();
      user.limit = Math.min(user.dailyLimit + LEVEL_UP_LIMIT_BONUS, user.limit + LEVEL_UP_LIMIT_BONUS);
    }

    this.save();
    return {
      user,
      gained,
      oldLevel,
      newLevel: user.level,
      levelUp,
      nextLevelExp: nextLevelExp(user.level)
    };
  }

  recordError() {
    this.data.stats.errors += 1;
    this.save();
  }

  consumeLimit(jid, amount = 1, name = "Unknown", unlimited = false) {
    const user = this.getUser(jid, name);
    if (!user || unlimited || amount <= 0) {
      return { ok: true, user, remaining: user?.limit ?? Infinity };
    }
    if (user.limit < amount) {
      return { ok: false, user, remaining: user.limit };
    }
    user.limit -= amount;
    this.save();
    return { ok: true, user, remaining: user.limit };
  }

  refundLimit(jid, amount = 1) {
    const user = this.getUser(jid);
    if (!user || amount <= 0) return;
    user.limit = Math.min(user.dailyLimit, user.limit + amount);
    this.save();
  }

  addPremium(jid, durationMs = 30 * 24 * 60 * 60 * 1000, name = "Premium User") {
    const user = this.getUser(jid, name);
    if (!user) throw new Error("JID premium tidak valid.");
    const currentExpiry = user.premiumUntil ? new Date(user.premiumUntil).getTime() : Date.now();
    const base = Number.isFinite(currentExpiry) && currentExpiry > Date.now() ? currentExpiry : Date.now();
    user.premium = true;
    user.premiumUntil = new Date(base + durationMs).toISOString();
    user.dailyLimit = PREMIUM_DAILY_LIMIT;
    user.limit = Math.max(user.limit, PREMIUM_DAILY_LIMIT);
    this.save();
    return user;
  }

  removePremium(jid) {
    const user = this.getUser(jid);
    if (!user) return null;
    user.premium = false;
    user.premiumUntil = null;
    user.dailyLimit = FREE_DAILY_LIMIT;
    user.limit = Math.min(user.limit, FREE_DAILY_LIMIT);
    this.save();
    return user;
  }

  setLimit(jid, amount) {
    const user = this.getUser(jid);
    if (!user) throw new Error("JID tidak valid.");
    const value = Math.max(0, Math.floor(Number(amount) || 0));
    user.limit = value;
    user.dailyLimit = Math.max(user.dailyLimit, value);
    this.save();
    return user;
  }

  setBanned(jid, banned, reason = "") {
    const user = this.getUser(jid);
    if (!user) throw new Error("JID tidak valid.");
    user.banned = Boolean(banned);
    user.banReason = banned ? String(reason || "Diblokir owner") : "";
    this.save();
    return user;
  }

  getGroup(jid) {
    const id = String(jid || "");
    if (!id.endsWith("@g.us")) return null;
    if (!this.data.groups[id]) {
      this.data.groups[id] = defaultGroup(id);
      this.save();
    }
    return this.data.groups[id];
  }

  updateGroup(jid, patch = {}) {
    const group = this.getGroup(jid);
    if (!group) throw new Error("JID grup tidak valid.");
    Object.assign(group, patch, { updatedAt: new Date().toISOString() });
    this.save();
    return group;
  }

  addWarning(groupJid, userJid, amount = 1) {
    const group = this.getGroup(groupJid);
    const user = normalizeJid(userJid);
    if (!group || !user) throw new Error("Data peringatan tidak valid.");
    group.warnings[user] = Math.max(0, (group.warnings[user] || 0) + amount);
    this.save();
    return group.warnings[user];
  }

  resetWarning(groupJid, userJid) {
    const group = this.getGroup(groupJid);
    const user = normalizeJid(userJid);
    if (!group || !user) return 0;
    delete group.warnings[user];
    this.save();
    return 0;
  }

  getWarning(groupJid, userJid) {
    const group = this.getGroup(groupJid);
    const user = normalizeJid(userJid);
    return group?.warnings?.[user] || 0;
  }

  snapshot() {
    return JSON.parse(JSON.stringify(this.data));
  }
}

const database = new JsonDatabase();

module.exports = {
  database,
  JsonDatabase,
  normalizeJid,
  jakartaDateKey,
  FREE_DAILY_LIMIT,
  PREMIUM_DAILY_LIMIT,
  EXP_PER_COMMAND,
  LEVEL_UP_LIMIT_BONUS,
  expRequiredForLevel,
  levelFromExp,
  nextLevelExp,
  DATABASE_FILE,
  DATA_DIR
};
