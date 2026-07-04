const fs = require("fs");
const path = require("path");
const util = require("util");
const { runtimePath } = require("./paths");

const LOG_DIR = runtimePath("logs");
const LOG_FILE = runtimePath("logs", "bot.log");
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_RECENT = 300;

let installed = false;
const recent = [];
const originals = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console)
};

function formatValue(value) {
  if (Buffer.isBuffer(value)) return `<Buffer ${value.length} bytes>`;
  if (value instanceof Error) return value.stack || value.message;
  if (typeof value === "string") return value;
  return util.inspect(value, {
    depth: 3,
    maxArrayLength: 30,
    maxStringLength: 1500,
    breakLength: 160,
    compact: true
  });
}

function sanitize(line) {
  let result = String(line || "");
  if (/pairing\s*code/i.test(result)) return "";
  result = result.replace(/(authorization|cookie|token|secret|password)(\s*[:=]\s*)[^\s,}]+/gi, "$1$2[REDACTED]");
  return result.slice(0, 5000);
}

function rotateIfNeeded() {
  try {
    if (!fs.existsSync(LOG_FILE)) return;
    if (fs.statSync(LOG_FILE).size < MAX_FILE_SIZE) return;
    const rotated = `${LOG_FILE}.1`;
    fs.rmSync(rotated, { force: true });
    fs.renameSync(LOG_FILE, rotated);
  } catch {}
}

function write(level, args) {
  originals[level](...args);
  const formatted = sanitize(args.map(formatValue).join(" "));
  if (!formatted) return;
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${formatted}`;
  recent.push(line);
  if (recent.length > MAX_RECENT) recent.splice(0, recent.length - MAX_RECENT);
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    rotateIfNeeded();
    fs.appendFile(LOG_FILE, `${line}\n`, () => {});
  } catch {}
}

function install() {
  if (installed) return;
  installed = true;
  console.log = (...args) => write("log", args);
  console.warn = (...args) => write("warn", args);
  console.error = (...args) => write("error", args);
}

function getRecent(limit = 30) {
  const amount = Math.max(1, Math.min(100, Number(limit) || 30));
  return recent.slice(-amount);
}

function readRecentFile(limit = 30) {
  const amount = Math.max(1, Math.min(200, Number(limit) || 30));
  try {
    return fs.readFileSync(LOG_FILE, "utf8").split(/\r?\n/).filter(Boolean).slice(-amount);
  } catch {
    return [];
  }
}

function clear() {
  recent.length = 0;
  try {
    fs.rmSync(LOG_FILE, { force: true });
    fs.rmSync(`${LOG_FILE}.1`, { force: true });
  } catch {}
}

module.exports = {
  install,
  getRecent,
  readRecentFile,
  clear,
  LOG_DIR,
  LOG_FILE
};
