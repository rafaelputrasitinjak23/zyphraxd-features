const {
  fs, path, os, crypto, util, pipeline, axios, exec, execFile, execFileAsync,
  yts, moment, wrapper, CookieJar, cheerio, youtubeDl, Smeme, audio2text,
  ChatMusicAPI, downloadInstagram, createBotBackup, deleteBotBackup,
  createTempPath, safeUnlink, runFfmpeg, withTimeout, normalizeJid,
  readAccessUsers, writeAccessUsers, checkAccess, ctext
} = require("../../lib/pluginUtils");

module.exports = {
  name: 'ai-image',
  commands: ['aiimg', 'img', 'raphael'],
  category: 'create',
  heavy: true,
  requiresText: true,
  async run(ctx) {
    const {
      Rafael, m, command, args, text, prefix, body, budy, from, sender, pushname,
      isGroup, isCreator, isAdmin, isBotAdmin, participants, groupAdmins,
      groupMetadata, user, group, database, downloaderCache, taskQueue, pluginManager,
      mime, quoted, isMedia, isAllowed, botNumber, senderNumber, ownerJids,
      time2, ucapanWaktu, wib, wita, wit, salam2, fVerif
    } = ctx;
      try {
        const raphael = require("../../lib/raphael");

        if (!text) {
          return m.reply(`Contoh:\n${prefix + command} anime girl cyberpunk`);
        }

        m.reply("Sedang generate gambar, tunggu sebentar...");

        const result = await withTimeout(
          raphael(text, {
            aspect: "1:1",
            number_of_images: 4,
            highQuality: false,
            fastMode: false
          }),
          180_000,
          "Generate gambar melewati batas waktu."
        );

        if (!result.status) {
          return m.reply(result.error || "Gagal generate gambar");
        }

        if (!result.results || !result.results.length) {
          return m.reply("Tidak ada hasil gambar.");
        }

        for (const img of result.results) {
          await Rafael.sendMessage(
            m.chat,
            {
              image: {
                url: img.url
              },
              caption:
    `🎨 Raphael AI Image

    📝 Prompt: ${result.prompt}
    🖼️ Image: ${img.no}/${result.total}
    📐 Resolution: ${img.width || "-"}x${img.height || "-"}
    🌱 Seed: ${img.seed || "-"}`
            },
            { quoted: m }
          );
        }

      } catch (err) {
        console.error(err);
        m.reply("Terjadi error saat generate gambar.");
      }
  }
};
