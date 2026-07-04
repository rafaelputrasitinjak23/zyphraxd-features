const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const util = require("util");
const { createBotBackup } = require("./backupBot");
const { DATABASE_FILE } = require("./database");
const { runtimePath } = require("./paths");

const execFileAsync = util.promisify(execFile);
const ROOT = runtimePath();
const BACKUP_DIR = runtimePath("backups");

function ensureBackupDirectory() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
}

function sanitizeName(name) {
  const base = path.basename(String(name || ""));
  if (!/^[a-zA-Z0-9._-]+$/.test(base)) throw new Error("Nama backup tidak valid.");
  return base;
}

async function checksum(filePath) {
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex");
}

async function createFullBackup() {
  ensureBackupDirectory();
  const result = await createBotBackup({
    rootDirectory: ROOT,
    botName: "ZyphraXD",
    outputDirectory: BACKUP_DIR,
    additionalIgnored: ["temp", "tmp", "cache", "backups", "backup", "logs", "jadibot-sessions", ".git", ".github", ".env"]
  });
  return { ...result, checksum: await checksum(result.outputPath), type: "full" };
}

async function createDatabaseBackup() {
  ensureBackupDirectory();
  const fileName = `ZyphraXD-database-${timestamp()}.json`;
  const outputPath = path.join(BACKUP_DIR, fileName);
  if (!fs.existsSync(DATABASE_FILE)) throw new Error("Database belum tersedia.");
  await fs.promises.copyFile(DATABASE_FILE, outputPath);
  return {
    outputPath,
    fileName,
    size: (await fs.promises.stat(outputPath)).size,
    checksum: await checksum(outputPath),
    type: "database"
  };
}

async function listBackups() {
  ensureBackupDirectory();
  const entries = await fs.promises.readdir(BACKUP_DIR, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/\.(zip|json)$/i.test(entry.name)) continue;
    const full = path.join(BACKUP_DIR, entry.name);
    const stat = await fs.promises.stat(full);
    result.push({ name: entry.name, path: full, size: stat.size, mtime: stat.mtime });
  }
  return result.sort((a, b) => b.mtime - a.mtime);
}

async function deleteBackup(name) {
  const safe = sanitizeName(name);
  const target = path.join(BACKUP_DIR, safe);
  if (!target.startsWith(`${BACKUP_DIR}${path.sep}`)) throw new Error("Lokasi backup tidak valid.");
  await fs.promises.unlink(target);
  return safe;
}

async function restoreDatabase(name) {
  const safe = sanitizeName(name);
  if (!safe.endsWith(".json")) throw new Error("Backup database harus berupa file JSON.");
  const source = path.join(BACKUP_DIR, safe);
  const parsed = JSON.parse(await fs.promises.readFile(source, "utf8"));
  if (!parsed || typeof parsed !== "object" || !parsed.users || !parsed.groups || !parsed.stats) {
    throw new Error("Struktur backup database tidak valid.");
  }
  const safety = `${DATABASE_FILE}.before-restore-${Date.now()}.json`;
  if (fs.existsSync(DATABASE_FILE)) await fs.promises.copyFile(DATABASE_FILE, safety);
  const temporary = `${DATABASE_FILE}.${process.pid}.restore`;
  await fs.promises.writeFile(temporary, JSON.stringify(parsed, null, 2));
  await fs.promises.rename(temporary, DATABASE_FILE);
  return { restored: safe, safety };
}

async function restoreFullBackup(name) {
  const safe = sanitizeName(name);
  if (!safe.endsWith(".zip")) throw new Error("Backup bot harus berupa file ZIP.");
  const source = path.join(BACKUP_DIR, safe);
  await fs.promises.access(source, fs.constants.R_OK);

  const { stdout } = await execFileAsync("unzip", ["-Z1", source], { timeout: 30_000, maxBuffer: 5 * 1024 * 1024 });
  const files = stdout.split(/\r?\n/).filter(Boolean);
  for (const file of files) {
    const normalized = file.replace(/\\/g, "/");
    if (normalized.startsWith("/") || normalized.includes("../")) {
      throw new Error("Backup mengandung lokasi file yang tidak aman.");
    }
    const first = normalized.split("/")[0].toLowerCase();
    if (["node_modules", "session", "sessions", "jadibot-sessions", "backups", "backup", "tmp", "temp", "cache", "logs"].includes(first) || first.startsWith(".")) {
      throw new Error(`Backup mengandung folder terlarang: ${first}`);
    }
  }

  const safetyBackup = await createFullBackup();
  await execFileAsync("unzip", ["-o", source, "-d", ROOT], { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 });
  return { restored: safe, safetyBackup: safetyBackup.fileName };
}

module.exports = {
  ROOT,
  BACKUP_DIR,
  createFullBackup,
  createDatabaseBackup,
  listBackups,
  deleteBackup,
  restoreDatabase,
  restoreFullBackup,
  checksum
};
