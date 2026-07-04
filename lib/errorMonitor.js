const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const { runtimePath } = require("./paths");

require("./config");

const DATA_DIR = runtimePath("data");
const DATA_FILE = runtimePath("data", "error-monitor.json");
const MAX_ERRORS = 300;
const DUPLICATE_WINDOW_MS = 60 * 1000;

let socket = null;
let saveChain = Promise.resolve();
let processHandlersInstalled = false;
let notifying = false;

function defaultData() {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    errors: []
  };
}

function ensureDataFile() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData(), null, 2));
  }
}

function loadData() {
  ensureDataFile();
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return {
      ...defaultData(),
      ...parsed,
      errors: Array.isArray(parsed.errors) ? parsed.errors : []
    };
  } catch (error) {
    try {
      fs.copyFileSync(DATA_FILE, `${DATA_FILE}.corrupt-${Date.now()}`);
    } catch {}
    const fresh = defaultData();
    fs.writeFileSync(DATA_FILE, JSON.stringify(fresh, null, 2));
    return fresh;
  }
}

const state = loadData();

function save() {
  state.updatedAt = new Date().toISOString();
  const snapshot = JSON.stringify(state, null, 2);
  saveChain = saveChain
    .catch(() => {})
    .then(async () => {
      const temporary = `${DATA_FILE}.${process.pid}.tmp`;
      await fs.promises.writeFile(temporary, snapshot);
      await fs.promises.rename(temporary, DATA_FILE);
    });
  return saveChain;
}

function normalizeJid(value) {
  const number = String(value || "")
    .split("@")[0]
    .split(":")[0]
    .replace(/[^0-9]/g, "");
  return number ? `${number}@s.whatsapp.net` : "";
}

function redact(value) {
  let text = String(value ?? "");

  text = text.replace(
    /(mongodb(?:\+srv)?:\/\/)([^\s:@/]+):([^\s@/]+)@/gi,
    "$1[REDACTED]:[REDACTED]@"
  );

  text = text.replace(
    /((?:x-api-key|api[_-]?key|authorization|bearer|password|passwd|secret|token|session[_-]?key)\s*[:=]\s*)["']?[^\s,"'\]}]+/gi,
    "$1[REDACTED]"
  );

  text = text.replace(
    /Bearer\s+[A-Za-z0-9._~+\-/]+=*/gi,
    "Bearer [REDACTED]"
  );

  return text;
}

function safeString(value, maxLength = 1000) {
  const text = redact(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
}

function errorToObject(error) {
  if (error instanceof Error) {
    return {
      name: error.name || "Error",
      message: safeString(error.message || String(error), 1500),
      stack: safeString(error.stack || "", 7000),
      code: safeString(error.code || error.statusCode || "", 200)
    };
  }

  if (typeof error === "object" && error !== null) {
    let serialized = "";
    try {
      serialized = JSON.stringify(error, null, 2);
    } catch {
      serialized = String(error);
    }
    return {
      name: safeString(error.name || "UnknownError", 200),
      message: safeString(error.message || serialized, 1500),
      stack: safeString(error.stack || serialized, 7000),
      code: safeString(error.code || error.statusCode || "", 200)
    };
  }

  return {
    name: "Error",
    message: safeString(error, 1500),
    stack: "",
    code: ""
  };
}

function createId() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `ERR-${date}-${random}`;
}

function fingerprint(errorInfo, contextInfo) {
  return crypto
    .createHash("sha256")
    .update([
      errorInfo.name,
      errorInfo.message,
      contextInfo.source,
      contextInfo.plugin,
      contextInfo.command
    ].join("|"))
    .digest("hex")
    .slice(0, 24);
}

function severityFrom(errorInfo, options = {}) {
  if (options.severity) return options.severity;
  const source = String(options.source || "").toLowerCase();
  const text = `${errorInfo.name} ${errorInfo.message}`.toLowerCase();

  if (source.includes("uncaught") || source.includes("startup")) return "critical";
  if (source.includes("unhandled")) return "critical";
  if (/econnrefused|etimedout|fetch failed|network|socket hang up/.test(text)) return "warning";
  return "error";
}

function contextToObject(context = {}, options = {}) {
  const m = context.m || {};
  const chatId = context.from || m.chat || m.key?.remoteJid || "";
  const sender = context.sender || m.sender || m.key?.participant || "";
  const body = context.body || context.budy || m.body || m.text || "";

  return {
    source: safeString(options.source || "plugin", 100),
    plugin: safeString(options.plugin || context.plugin?.name || context.command || "unknown", 150),
    command: safeString(context.command || options.command || "unknown", 150),
    userJid: safeString(sender, 150),
    userName: safeString(context.pushname || m.pushName || "Unknown", 150),
    chatId: safeString(chatId, 180),
    chatType: String(chatId).endsWith("@g.us") ? "group" : "private",
    messageId: safeString(m.key?.id || "", 150),
    input: safeString(body, 700)
  };
}

function ownerJids() {
  return [...new Set((global.owner || []).map(normalizeJid).filter(Boolean))];
}

function formatOwnerNotification(entry) {
  const icon = entry.severity === "critical" ? "🆘" : entry.severity === "warning" ? "⚠️" : "🚨";
  return [
    `${icon} *ERROR MONITOR ${global.botName || "ZyphraXD"}*`,
    "",
    `ID       : ${entry.id}`,
    `Level    : ${entry.severity.toUpperCase()}`,
    `Sumber   : ${entry.source}`,
    `Plugin   : ${entry.plugin}`,
    `Command  : ${entry.command === "unknown" ? "-" : `.${entry.command}`}`,
    `User     : ${entry.userName} (${entry.userJid || "-"})`,
    `Chat     : ${entry.chatType} (${entry.chatId || "-"})`,
    `Waktu    : ${new Date(entry.lastSeen).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}`,
    `Terulang : ${entry.count}x`,
    "",
    `Error: ${entry.name}: ${entry.message}`,
    entry.input ? `\nInput: ${entry.input}` : "",
    "",
    `Gunakan *.errorinfo ${entry.id}* untuk detail.`
  ].filter(Boolean).join("\n");
}

async function notifyOwners(entry) {
  if (!socket || typeof socket.sendMessage !== "function" || notifying) return;
  const owners = ownerJids();
  if (!owners.length) return;

  notifying = true;
  try {
    const text = formatOwnerNotification(entry);
    for (const jid of owners) {
      try {
        await socket.sendMessage(jid, { text });
      } catch (error) {
        console.error("[ERROR MONITOR] Gagal mengirim notifikasi owner:", error.message);
      }
    }
  } finally {
    notifying = false;
  }
}

async function capture(error, context = {}, options = {}) {
  try {
    const errorInfo = errorToObject(error);
    const contextInfo = contextToObject(context, options);
    const fp = fingerprint(errorInfo, contextInfo);
    const now = Date.now();

    let entry = state.errors.find((item) =>
      item.fingerprint === fp &&
      now - new Date(item.lastSeen || item.createdAt).getTime() <= DUPLICATE_WINDOW_MS
    );

    let shouldNotify = true;

    if (entry) {
      entry.count = Number(entry.count || 1) + 1;
      entry.lastSeen = new Date().toISOString();
      entry.message = errorInfo.message;
      entry.stack = errorInfo.stack;
      entry.input = contextInfo.input;
      entry.resolved = false;
      entry.resolvedAt = null;
      entry.resolvedBy = null;
      shouldNotify = entry.count === 2 || entry.count % 5 === 0;
    } else {
      entry = {
        id: createId(),
        fingerprint: fp,
        severity: severityFrom(errorInfo, options),
        source: contextInfo.source,
        plugin: contextInfo.plugin,
        command: contextInfo.command,
        name: errorInfo.name,
        message: errorInfo.message,
        code: errorInfo.code,
        stack: errorInfo.stack,
        userJid: contextInfo.userJid,
        userName: contextInfo.userName,
        chatId: contextInfo.chatId,
        chatType: contextInfo.chatType,
        messageId: contextInfo.messageId,
        input: contextInfo.input,
        process: {
          pid: process.pid,
          node: process.version,
          platform: `${os.platform()} ${os.arch()}`,
          hostname: os.hostname(),
          uptime: Math.floor(process.uptime())
        },
        count: 1,
        resolved: false,
        resolvedAt: null,
        resolvedBy: null,
        createdAt: new Date().toISOString(),
        lastSeen: new Date().toISOString()
      };

      state.errors.unshift(entry);
      if (state.errors.length > MAX_ERRORS) {
        state.errors.length = MAX_ERRORS;
      }
    }

    await save();

    const consoleText = `[ERROR MONITOR] ${entry.id} | ${entry.source} | ${entry.plugin} | ${entry.message}`;
    if (entry.severity === "critical") console.error(consoleText);
    else if (entry.severity === "warning") console.warn(consoleText);
    else console.error(consoleText);

    if (options.notify !== false && shouldNotify) {
      await notifyOwners(entry);
    }

    return entry;
  } catch (monitorError) {
    console.error("[ERROR MONITOR] Monitor gagal mencatat error:", monitorError);
    return null;
  }
}

function list(limit = 20, filter = {}) {
  let result = [...state.errors];
  if (filter.unresolved) result = result.filter((item) => !item.resolved);
  if (filter.severity) result = result.filter((item) => item.severity === filter.severity);
  return result.slice(0, Math.max(1, Math.min(100, Number(limit) || 20)));
}

function get(id) {
  const search = String(id || "").trim().toUpperCase();
  return state.errors.find((item) => String(item.id).toUpperCase() === search) || null;
}

async function resolve(id, resolvedBy = "owner") {
  const entry = get(id);
  if (!entry) return null;
  entry.resolved = true;
  entry.resolvedAt = new Date().toISOString();
  entry.resolvedBy = safeString(resolvedBy, 150);
  await save();
  return entry;
}

async function remove(id) {
  const index = state.errors.findIndex((item) => String(item.id).toUpperCase() === String(id || "").toUpperCase());
  if (index < 0) return false;
  state.errors.splice(index, 1);
  await save();
  return true;
}

async function clear() {
  const total = state.errors.length;
  state.errors = [];
  await save();
  return total;
}

function stats() {
  const unresolved = state.errors.filter((item) => !item.resolved);
  return {
    total: state.errors.length,
    unresolved: unresolved.length,
    resolved: state.errors.length - unresolved.length,
    critical: unresolved.filter((item) => item.severity === "critical").length,
    error: unresolved.filter((item) => item.severity === "error").length,
    warning: unresolved.filter((item) => item.severity === "warning").length
  };
}

function setSocket(value) {
  socket = value || null;
}

function installProcessHandlers() {
  if (processHandlersInstalled) return;
  processHandlersInstalled = true;

  process.on("unhandledRejection", (reason) => {
    capture(reason, {}, {
      source: "unhandledRejection",
      plugin: "process",
      severity: "critical"
    }).catch(() => {});
  });

  process.on("uncaughtException", (error) => {
    capture(error, {}, {
      source: "uncaughtException",
      plugin: "process",
      severity: "critical"
    }).catch(() => {});
  });
}

module.exports = {
  DATA_FILE,
  capture,
  list,
  get,
  resolve,
  remove,
  clear,
  stats,
  setSocket,
  installProcessHandlers,
  formatOwnerNotification
};
