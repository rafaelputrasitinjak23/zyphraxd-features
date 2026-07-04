const fs = require("fs");
const path = require("path");
const util = require("util");
const { execFile } = require("child_process");
const execFileAsync = util.promisify(execFile);

module.exports = {
  name: "process-management",
  commands: ["restart", "update"],
  category: "system",
  owner: true,
  limit: 0,
  cooldown: 1500,
  async run({ command, m }) {
    if (command === "restart") {
      await m.reply("Bot akan direstart. Pastikan bot dijalankan menggunakan PM2, panel, Docker restart policy, atau process manager lain.");
      setTimeout(() => process.exit(0), 1000).unref?.();
      return;
    }

    const gitDirectory = path.join(process.cwd(), ".git");
    if (!fs.existsSync(gitDirectory)) {
      return m.reply("Auto-update hanya tersedia jika bot dijalankan dari repository Git. ZIP ini dapat diperbarui dengan mengganti file secara manual.");
    }
    const status = await execFileAsync("git", ["status", "--porcelain"], {
      cwd: process.cwd(),
      timeout: 30_000,
      maxBuffer: 2 * 1024 * 1024
    });
    if (status.stdout.trim()) {
      return m.reply("Update dibatalkan karena terdapat perubahan lokal yang belum di-commit. Simpan atau commit perubahan terlebih dahulu.");
    }
    await m.reply("Memeriksa dan mengambil pembaruan Git...");
    const result = await execFileAsync("git", ["pull", "--ff-only"], {
      cwd: process.cwd(),
      timeout: 120_000,
      maxBuffer: 5 * 1024 * 1024
    });
    return m.reply(`Update selesai.\n\n${result.stdout.trim() || "Repository sudah terbaru."}\n\nJalankan .restart untuk memuat perubahan.`);
  }
};
