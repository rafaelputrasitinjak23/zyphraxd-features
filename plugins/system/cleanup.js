const path = require("path");
const cache = require("../../lib/cacheManager");
const { cleanupDirectory, formatBytes } = require("../../lib/systemHealth");

module.exports = {
  name: "system-cleanup",
  commands: ["cleartemp", "clearcache"],
  category: "system",
  owner: true,
  limit: 0,
  cooldown: 1500,
  async run({ command, m }) {
    if (command === "clearcache") {
      const removed = cache.clear();
      return m.reply(`${removed} entri cache downloader berhasil dihapus.`);
    }
    const result = await cleanupDirectory(path.join(process.cwd(), "tmp"), 0);
    return m.reply(`Temporary dibersihkan.\nFile/folder: ${result.removed}\nRuang dibebaskan: ${formatBytes(result.freed)}`);
  }
};
