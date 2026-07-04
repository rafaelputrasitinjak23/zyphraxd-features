const path = require("path");
const { formatBytes } = require("../../lib/systemHealth");
const {
  createFullBackup,
  createDatabaseBackup,
  listBackups,
  deleteBackup,
  restoreDatabase,
  restoreFullBackup
} = require("../../lib/backupManager");

module.exports = {
  name: "backup-management",
  commands: ["savebackup", "backupdb", "listbackup", "restorebackup", "restoredb", "deletebackup"],
  category: "system",
  owner: true,
  limit: 0,
  cooldown: 1500,
  async run({ command, args, prefix, m, Rafael, database }) {
    if (command === "savebackup" || command === "backupdb") {
      await m.reply("Sedang membuat backup...");
      const backup = command === "savebackup" ? await createFullBackup() : await createDatabaseBackup();
      return Rafael.sendMessage(m.chat, {
        document: { url: backup.outputPath },
        mimetype: command === "savebackup" ? "application/zip" : "application/json",
        fileName: backup.fileName,
        caption: `Backup tersimpan.\nNama: ${backup.fileName}\nUkuran: ${formatBytes(backup.size)}\nSHA-256: ${backup.checksum}`
      }, { quoted: m });
    }

    if (command === "listbackup") {
      const backups = await listBackups();
      if (!backups.length) return m.reply("Belum ada backup tersimpan.");
      return m.reply(`Daftar Backup\n\n${backups.map((item, index) => `${index + 1}. ${item.name}\n   ${formatBytes(item.size)} | ${item.mtime.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}`).join("\n")}`);
    }

    if (command === "deletebackup") {
      const name = args[0];
      if (!name) return m.reply(`Contoh: ${prefix + command} nama-backup.zip`);
      await deleteBackup(name);
      return m.reply(`Backup ${name} berhasil dihapus.`);
    }

    const name = args[0];
    if (!name || !args.includes("--confirm")) {
      return m.reply(`Perintah restore akan mengganti file aktif.\nGunakan: ${prefix + command} ${name || "nama-file"} --confirm`);
    }
    if (command === "restoredb") {
      const result = await restoreDatabase(name);
      database.reload();
      return m.reply(`Database berhasil dipulihkan dari ${result.restored}. Salinan pengaman dibuat di ${path.basename(result.safety)}.`);
    }
    const result = await restoreFullBackup(name);
    return m.reply(`Backup ${result.restored} berhasil dipulihkan. Backup pengaman: ${result.safetyBackup}. Restart bot diperlukan.`);
  }
};
