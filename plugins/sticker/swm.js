const {
  fs, path, os, crypto, util, pipeline, axios, exec, execFile, execFileAsync,
  yts, moment, wrapper, CookieJar, cheerio, youtubeDl, Smeme, audio2text,
  ChatMusicAPI, downloadInstagram, createBotBackup, deleteBotBackup,
  createTempPath, safeUnlink, runFfmpeg, withTimeout, normalizeJid,
  readAccessUsers, writeAccessUsers, checkAccess, ctext
} = require("../../lib/pluginUtils");

module.exports = {
  name: 'sticker-watermark',
  commands: ['swm', 'stickerwm', 'stikerwm'],
  category: 'sticker',
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

        if (!/webp/.test(mime)) {
          return m.reply(
            `Reply sticker dengan caption:\n${prefix + command} packname|author`
          );
        }

        if (!text) {
          return m.reply(
            `Contoh:\n${prefix + command} Rafael Bot|RafaelXD`
          );
        }

        const [packname, author] = text.split("|");

        m.reply("Sedang mengubah watermark sticker...");

        const media = await q.download();

        if (q.msg?.isAnimated || q.message?.stickerMessage?.isAnimated) {

          await Rafael.sendVideoAsSticker(
            m.chat,
            media,
            m,
            {
              packname: (packname || global.packname || "Sticker Bot").trim(),
              author: (author || global.author || "RafaelXD").trim()
            }
          );

        } else {

          await Rafael.sendImageAsSticker(
            m.chat,
            media,
            m,
            {
              packname: (packname || global.packname || "Sticker Bot").trim(),
              author: (author || global.author || "RafaelXD").trim()
            }
          );

        }

      } catch (err) {
        console.error(err);
        m.reply("Gagal mengubah watermark sticker.");
      }
  }
};
