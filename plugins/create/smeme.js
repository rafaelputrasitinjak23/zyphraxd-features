const {
  fs, path, os, crypto, util, pipeline, axios, exec, execFile, execFileAsync,
  yts, moment, wrapper, CookieJar, cheerio, youtubeDl, Smeme, audio2text,
  ChatMusicAPI, downloadInstagram, createBotBackup, deleteBotBackup,
  createTempPath, safeUnlink, runFfmpeg, withTimeout, normalizeJid,
  readAccessUsers, writeAccessUsers, checkAccess, ctext
} = require("../../lib/pluginUtils");

module.exports = {
  name: 'smeme',
  commands: ['smeme'],
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
      const [topText = "", bottomText = ""] = text.split("|");
      const mediaMessage = m.quoted || m;
      const mediaMime = (mediaMessage.msg || mediaMessage).mimetype || "";

      if (!/(image|webp|video)/i.test(mediaMime)) {
        return m.reply(
          `Kirim/reply gambar, stiker, atau video dengan caption ${prefix + command} teks atas|teks bawah`
        );
      }

      let sourcePath = null;
      let imagePath = null;

      try {
        await m.reply("Sedang membuat sticker meme...");
        sourcePath = await Rafael.downloadAndSaveMediaMessage(mediaMessage);

        if (/image/i.test(mediaMime) && !/webp/i.test(mediaMime)) {
          imagePath = sourcePath;
        } else {
          imagePath = createTempPath("smeme-frame", "jpg");
          const ffmpegArgs = ["-i", sourcePath];
          if (/video/i.test(mediaMime)) {
            ffmpegArgs.push("-ss", "00:00:00", "-vframes", "1");
          }
          ffmpegArgs.push(imagePath);
          await runFfmpeg(ffmpegArgs);
        }

        const result = await Smeme(topText.trim(), bottomText.trim(), imagePath);
        await Rafael.sendImageAsSticker(m.chat, result, m, {
          packname: global.packname || "Sticker Bot",
          author: global.author || "RafaelXD"
        });
      } catch (error) {
        console.error("Smeme error:", error);
        await m.reply("Gagal membuat sticker meme.");
      } finally {
        const files = new Set([sourcePath, imagePath]);
        await Promise.all([...files].map(safeUnlink));
      }
  }
};
