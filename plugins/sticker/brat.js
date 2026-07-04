const {
  fs, path, os, crypto, util, pipeline, axios, exec, execFile, execFileAsync,
  yts, moment, wrapper, CookieJar, cheerio, youtubeDl, Smeme, audio2text,
  ChatMusicAPI, downloadInstagram, createBotBackup, deleteBotBackup,
  createTempPath, safeUnlink, runFfmpeg, withTimeout, normalizeJid,
  readAccessUsers, writeAccessUsers, checkAccess, ctext
} = require("../../lib/pluginUtils");

module.exports = {
  name: 'brat',
  commands: ['brat'],
  category: 'sticker',
  requiresText: true,
  async run(ctx) {
    const {
      Rafael, m, command, args, text, prefix, body, budy, from, sender, pushname,
      isGroup, isCreator, isAdmin, isBotAdmin, participants, groupAdmins,
      groupMetadata, user, group, database, downloaderCache, taskQueue, pluginManager,
      mime, quoted, isMedia, isAllowed, botNumber, senderNumber, ownerJids,
      time2, ucapanWaktu, wib, wita, wit, salam2, fVerif
    } = ctx;
      if (!text) return m.reply(`Contoh: ${prefix + command} hai`);

      try {
        const axios = require("axios");

        const url = `https://brat.siputzx.my.id/image?text=${encodeURIComponent(text)}`;
        const res = await axios.get(url, {
          responseType: "arraybuffer",
          timeout: 60_000,
          maxContentLength: 20 * 1024 * 1024
        });
        const buffer = Buffer.from(res.data);

        await Rafael.sendImageAsSticker(m.chat, buffer, m, {
          packname: global.packname || "Sticker Bot",
          author: global.author || "RafaelXD"
        });
      } catch (err) {
        console.error(err);
        m.reply("Gagal membuat sticker brat.");
      }
  }
};
