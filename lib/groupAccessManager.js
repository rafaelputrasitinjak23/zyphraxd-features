const fs = require("fs");
const path = require("path");
const { normalizeJid } = require("./database");
const { runtimePath } = require("./paths");

const DATA_FILE = runtimePath("data", "group-access.json");

function ensureDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function normalizeGroupJid(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.endsWith("@g.us")) return raw;
  const numbers = raw.replace(/[^0-9-]/g, "");
  return numbers ? `${numbers}@g.us` : "";
}

function createDefaultData() {
  return {
    meta: {
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    // true = bot hanya merespon grup yang sudah di-add.
    defaultEnabled: true,
    bots: {}
  };
}

function readJson() {
  ensureDirectory(path.dirname(DATA_FILE));
  if (!fs.existsSync(DATA_FILE)) {
    const fresh = createDefaultData();
    fs.writeFileSync(DATA_FILE, JSON.stringify(fresh, null, 2));
    return fresh;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return {
      ...createDefaultData(),
      ...parsed,
      meta: { ...createDefaultData().meta, ...(parsed.meta || {}) },
      bots: parsed.bots && typeof parsed.bots === "object" ? parsed.bots : {}
    };
  } catch (error) {
    const corrupt = `${DATA_FILE}.corrupt-${Date.now()}`;
    try { fs.copyFileSync(DATA_FILE, corrupt); } catch {}
    const fresh = createDefaultData();
    fs.writeFileSync(DATA_FILE, JSON.stringify(fresh, null, 2));
    return fresh;
  }
}

function writeJson(data) {
  ensureDirectory(path.dirname(DATA_FILE));
  data.meta = data.meta || {};
  data.meta.updatedAt = new Date().toISOString();
  const temporary = `${DATA_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(data, null, 2));
  fs.renameSync(temporary, DATA_FILE);
}

function getBotKey(botJid) {
  const normalized = normalizeJid(botJid);
  return normalized || "main";
}

function ensureBot(data, botJid) {
  const key = getBotKey(botJid);
  if (!data.bots[key]) {
    data.bots[key] = {
      botJid: key,
      enabled: Boolean(data.defaultEnabled),
      groups: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }
  return data.bots[key];
}

function getConfig(botJid) {
  const data = readJson();
  const config = ensureBot(data, botJid);
  writeJson(data);
  return { key: getBotKey(botJid), ...config };
}

function isEnabled(botJid) {
  return Boolean(getConfig(botJid).enabled);
}

function canRespond(botJid, groupJid) {
  const group = normalizeGroupJid(groupJid);
  if (!group) return true;

  const config = getConfig(botJid);
  if (!config.enabled) return true;
  return Boolean(config.groups?.[group]);
}

function addGroup(botJid, groupJid, options = {}) {
  const group = normalizeGroupJid(groupJid);
  if (!group) throw new Error("JID grup tidak valid.");

  const data = readJson();
  const config = ensureBot(data, botJid);
  config.groups[group] = {
    jid: group,
    subject: String(options.subject || "").slice(0, 120),
    addedBy: normalizeJid(options.addedBy) || String(options.addedBy || ""),
    addedAt: new Date().toISOString()
  };
  config.updatedAt = new Date().toISOString();
  writeJson(data);
  return config.groups[group];
}

function removeGroup(botJid, groupJid) {
  const group = normalizeGroupJid(groupJid);
  if (!group) throw new Error("JID grup tidak valid.");

  const data = readJson();
  const config = ensureBot(data, botJid);
  const removed = config.groups[group] || null;
  delete config.groups[group];
  config.updatedAt = new Date().toISOString();
  writeJson(data);
  return removed;
}

function listGroups(botJid) {
  const config = getConfig(botJid);
  return Object.values(config.groups || {}).sort((a, b) => String(a.subject || a.jid).localeCompare(String(b.subject || b.jid)));
}

function setEnabled(botJid, enabled) {
  const data = readJson();
  const config = ensureBot(data, botJid);
  config.enabled = Boolean(enabled);
  config.updatedAt = new Date().toISOString();
  writeJson(data);
  return { key: getBotKey(botJid), ...config };
}

function status(botJid, groupJid = "") {
  const config = getConfig(botJid);
  const group = normalizeGroupJid(groupJid);
  return {
    botJid: getBotKey(botJid),
    enabled: Boolean(config.enabled),
    totalGroups: Object.keys(config.groups || {}).length,
    groupJid: group,
    allowed: group ? Boolean(config.groups?.[group]) : false,
    canRespond: group ? canRespond(botJid, group) : true
  };
}

module.exports = {
  DATA_FILE,
  normalizeGroupJid,
  getConfig,
  isEnabled,
  canRespond,
  addGroup,
  removeGroup,
  listGroups,
  setEnabled,
  status
};
