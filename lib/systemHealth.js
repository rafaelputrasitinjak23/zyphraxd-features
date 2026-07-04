const fs = require("fs");
const path = require("path");
const os = require("os");

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let amount = value / 1024;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }
  return `${amount.toFixed(2)} ${units[index]}`;
}

function formatDuration(seconds) {
  let value = Math.max(0, Math.floor(Number(seconds) || 0));
  const days = Math.floor(value / 86400);
  value %= 86400;
  const hours = Math.floor(value / 3600);
  value %= 3600;
  const minutes = Math.floor(value / 60);
  const secs = value % 60;
  return [days ? `${days}h` : "", `${hours}j`, `${minutes}m`, `${secs}d`].filter(Boolean).join(" ");
}

async function directorySize(directory, ignored = new Set()) {
  let total = 0;
  async function walk(current) {
    let entries;
    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (ignored.has(entry.name) || entry.name.startsWith(".")) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) {
        try {
          total += (await fs.promises.stat(full)).size;
        } catch {}
      }
    }
  }
  await walk(directory);
  return total;
}

async function cleanupDirectory(directory, olderThanMs = 60 * 60 * 1000) {
  let removed = 0;
  let freed = 0;
  const cutoff = Date.now() - olderThanMs;
  let entries = [];
  try {
    entries = await fs.promises.readdir(directory, { withFileTypes: true });
  } catch {
    return { removed, freed };
  }
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    try {
      const stat = await fs.promises.stat(full);
      if (stat.mtimeMs > cutoff) continue;
      if (entry.isDirectory()) {
        freed += await directorySize(full);
        await fs.promises.rm(full, { recursive: true, force: true });
      } else {
        freed += stat.size;
        await fs.promises.unlink(full);
      }
      removed += 1;
    } catch {}
  }
  return { removed, freed };
}

async function getHealth(rootDirectory = process.cwd()) {
  const memory = process.memoryUsage();
  const [tempSize, backupSize, dataSize] = await Promise.all([
    directorySize(path.join(rootDirectory, "tmp")),
    directorySize(path.join(rootDirectory, "backups")),
    directorySize(path.join(rootDirectory, "data"))
  ]);
  return {
    pid: process.pid,
    node: process.version,
    platform: `${os.platform()} ${os.arch()}`,
    hostname: os.hostname(),
    processUptime: process.uptime(),
    systemUptime: os.uptime(),
    rss: memory.rss,
    heapUsed: memory.heapUsed,
    heapTotal: memory.heapTotal,
    external: memory.external,
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    loadAverage: os.loadavg(),
    cpuCount: os.cpus().length,
    tempSize,
    backupSize,
    dataSize
  };
}

module.exports = {
  getHealth,
  cleanupDirectory,
  directorySize,
  formatBytes,
  formatDuration
};
