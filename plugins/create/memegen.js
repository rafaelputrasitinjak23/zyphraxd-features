const {
  fs, path, os, crypto, util, pipeline, axios, exec, execFile, execFileAsync,
  yts, moment, wrapper, CookieJar, cheerio, youtubeDl, Smeme, audio2text,
  ChatMusicAPI, downloadInstagram, createBotBackup, deleteBotBackup,
  createTempPath, safeUnlink, runFfmpeg, withTimeout, normalizeJid,
  readAccessUsers, writeAccessUsers, checkAccess, ctext
} = require("../../lib/pluginUtils");

module.exports = {
  name: 'meme-generator',
  commands: ['memegen'],
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
        const axios = require("axios");
        const sharp = require("sharp");
        const uguu = require("../../lib/uguu");

        const q = m.quoted ? m.quoted : m;
        const mime = (q.msg || q).mimetype || "";

        if (!/(image|webp)/.test(mime)) {
          return m.reply(
            `Kirim/reply gambar atau sticker dengan caption:\n${prefix + command} teks atas|teks bawah`
          );
        }

        if (!text) {
          return m.reply(
            `Contoh:\n${prefix + command} HALO|WORLD`
          );
        }

        const [top, bottom] = text.split("|");

        m.reply("Sedang membuat sticker meme...");

        const media = await q.download();

        const imageBuffer = await sharp(media, {
          animated: false,
          limitInputPixels: 40_000_000
        })
          .rotate()
          .png()
          .toBuffer();

        const upload = await uguu(imageBuffer);

        if (!upload.Status) {
          return m.reply(`Gagal upload gambar:\n${upload.Error || upload.Result_url || "Tidak diketahui"}`);
        }

        const imageUrl = upload.Result_url;

        const topEncoded = encodeURIComponent((top || "_").trim());
        const bottomEncoded = encodeURIComponent((bottom || "_").trim());

        const apiUrl =
          `https://api.memegen.link/images/custom/${topEncoded}/${bottomEncoded}.png?background=${encodeURIComponent(imageUrl)}`;

        const response = await axios.get(apiUrl, {
          responseType: "arraybuffer",
          timeout: 60_000,
          maxContentLength: 20 * 1024 * 1024
        });

        const buffer = Buffer.from(response.data);

        await Rafael.sendImageAsSticker(
          m.chat,
          buffer,
          m,
          {
            packname: global.packname || "Sticker Bot",
            author: global.author || "RafaelXD"
          }
        );

      } catch (err) {
        console.error(err);
        m.reply("Gagal membuat sticker meme.");
      }
  }
};
