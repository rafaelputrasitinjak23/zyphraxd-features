const {
  fs, path, os, crypto, util, pipeline, axios, exec, execFile, execFileAsync,
  yts, moment, wrapper, CookieJar, cheerio, youtubeDl, Smeme, audio2text,
  ChatMusicAPI, downloadInstagram, createBotBackup, deleteBotBackup,
  createTempPath, safeUnlink, runFfmpeg, withTimeout, normalizeJid,
  readAccessUsers, writeAccessUsers, checkAccess, ctext
} = require("../../lib/pluginUtils");

module.exports = {
  name: 'sticker-maker',
  commands: ['sticker', 's', 'stiker'],
  category: 'sticker',
  heavy: true,
  requiresMedia: true,
  async run(ctx) {
    const {
      Rafael, m, command, args, text, prefix, body, budy, from, sender, pushname,
      isGroup, isCreator, isAdmin, isBotAdmin, participants, groupAdmins,
      groupMetadata, user, group, database, downloaderCache, taskQueue, pluginManager,
      mime, quoted, isMedia, isAllowed, botNumber, senderNumber, ownerJids,
      time2, ucapanWaktu, wib, wita, wit, salam2, fVerif
    } = ctx;
      try {
        const q = m.quoted ? m.quoted : m;
        const mime = (q.msg || q).mimetype || "";

        if (!/image|video/.test(mime)) {
          return m.reply(
            `Kirim/reply gambar atau video dengan caption ${prefix + command}`
          );
        }

        m.reply("Sedang membuat sticker...");

        const media = await q.download();

        if (/image/.test(mime)) {
          await Rafael.sendImageAsSticker(
            m.chat,
            media,
            m,
            {
              packname: global.packname || "Sticker Bot",
              author: global.author || "RafaelXD"
            }
          );
        } else if (/video/.test(mime)) {
          await Rafael.sendVideoAsSticker(
            m.chat,
            media,
            m,
            {
              packname: global.packname || "Sticker Bot",
              author: global.author || "RafaelXD"
            }
          );
        }

      } catch (err) {
        console.error(err);
        m.reply("Gagal membuat sticker.");
      }
  }
};
