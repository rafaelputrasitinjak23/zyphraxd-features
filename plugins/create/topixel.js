const {
  fs, path, os, crypto, util, pipeline, axios, exec, execFile, execFileAsync,
  yts, moment, wrapper, CookieJar, cheerio, youtubeDl, Smeme, audio2text,
  ChatMusicAPI, downloadInstagram, createBotBackup, deleteBotBackup,
  createTempPath, safeUnlink, runFfmpeg, withTimeout, normalizeJid,
  readAccessUsers, writeAccessUsers, checkAccess, ctext
} = require("../../lib/pluginUtils");

module.exports = {
  name: 'to-pixel',
  commands: ['topixel'],
  category: 'create',
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
        const { toPixel } = require("../../lib/topixel");

        const q = m.quoted ? m.quoted : m;
        const mime = (q.msg || q).mimetype || "";

        if (!/image/.test(mime)) {
          return m.reply(`Reply/kirim gambar dengan caption ${prefix + command}`);
        }

        m.reply("Processing image...");

        const media = await q.download();
        const result = await toPixel(media, 30);

        await Rafael.sendMessage(
          m.chat,
          {
            image: result,
            caption: "Berhasil convert ke pixel art"
          },
          { quoted: m }
        );
      } catch (err) {
        console.error(err);
        m.reply("Gagal convert image ke pixel.");
      }
  }
};
