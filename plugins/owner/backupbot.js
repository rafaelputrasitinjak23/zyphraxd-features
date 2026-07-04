const {
  fs, path, os, crypto, util, pipeline, axios, exec, execFile, execFileAsync,
  yts, moment, wrapper, CookieJar, cheerio, youtubeDl, Smeme, audio2text,
  ChatMusicAPI, downloadInstagram, createBotBackup, deleteBotBackup,
  createTempPath, safeUnlink, runFfmpeg, withTimeout, normalizeJid,
  readAccessUsers, writeAccessUsers, checkAccess, ctext
} = require("../../lib/pluginUtils");
const { THUMBNAILS, sendThumbnailMessage } = require("../../lib/thumbnails");

module.exports = {
  name: 'backup-bot',
  commands: ['backupbot', 'backup', 'getscript'],
  category: 'owner',
  owner: true,
  limit: 0,
  async run(ctx) {
    const {
      Rafael, m, command, args, text, prefix, body, budy, from, sender, pushname,
      isGroup, isCreator, isAdmin, isBotAdmin, participants, groupAdmins,
      groupMetadata, user, group, database, downloaderCache, taskQueue, pluginManager,
      mime, quoted, isMedia, isAllowed, botNumber, senderNumber, ownerJids,
      time2, ucapanWaktu, wib, wita, wit, salam2, fVerif
    } = ctx;
      if (!isCreator) {
        return m.reply("Command ini hanya dapat digunakan oleh owner bot.");
      }

      let backupPath = null;

      try {
        await sendThumbnailMessage(
          Rafael,
          m,
          THUMBNAILS.BACKUP_BOT,
          "📦 *BACKUP BOT*\n\nSedang membuat backup seluruh file bot..."
        );

        const backup = await createBotBackup({
          rootDirectory: process.cwd(),
          botName: "ZyphraXD",
          additionalIgnored: [
            "temp",
            "tmp",
            "cache",
            "backup",
            "backups",
            "logs",
            "jadibot-sessions",
            ".git",
            ".github",
            ".env"
          ]
        });

        backupPath = backup.outputPath;

        const sizeMB = (
          backup.size /
          1024 /
          1024
        ).toFixed(2);

        await Rafael.sendMessage(
          m.chat,
          {
            document: {
              url: backup.outputPath
            },
            mimetype: "application/zip",
            fileName: backup.fileName,
            caption:
              `Backup bot berhasil dibuat.\n\n` +
              `Nama: ${backup.fileName}\n` +
              `Total file: ${backup.totalFiles}\n` +
              `Ukuran: ${sizeMB} MB\n\n` +
              `Folder node_modules, session, jadibot-sessions, tmp/cache/logs, .env, file tersembunyi, dan folder runtime tidak disertakan.`
          },
          {
            quoted: m
          }
        );
      } catch (error) {
        console.error("Backup bot error:", error);

        await m.reply(
          `Gagal membuat backup bot.\n\nError: ${
            error.message || String(error)
          }`
        );
      } finally {
        if (backupPath) {
          await deleteBotBackup(backupPath).catch(() => {});
        }
      }
  }
};
