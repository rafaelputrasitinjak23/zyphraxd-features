const {
  fs, path, os, crypto, util, pipeline, axios, exec, execFile, execFileAsync,
  yts, moment, wrapper, CookieJar, cheerio, youtubeDl, Smeme, audio2text,
  ChatMusicAPI, downloadInstagram, createBotBackup, deleteBotBackup,
  createTempPath, safeUnlink, runFfmpeg, withTimeout, normalizeJid,
  readAccessUsers, writeAccessUsers, checkAccess, ctext
} = require("../../lib/pluginUtils");

module.exports = {
  name: 'upload-channel',
  commands: ['up'],
  category: 'channel',
  async run(ctx) {
    const {
      Rafael, m, command, args, text, prefix, body, budy, from, sender, pushname,
      isGroup, isCreator, isAdmin, isBotAdmin, participants, groupAdmins,
      groupMetadata, user, group, database, downloaderCache, taskQueue, pluginManager,
      mime, quoted, isMedia, isAllowed, botNumber, senderNumber, ownerJids,
      time2, ucapanWaktu, wib, wita, wit, salam2, fVerif
    } = ctx;
      if (!isAllowed) {
        return m.reply("Akses ditolak. Nomor kamu tidak terdaftar dalam sistem.");
      }

      const sourceMessage = m.quoted || (
        ["imageMessage", "videoMessage", "stickerMessage"].includes(m.mtype)
          ? m
          : null
      );

      if (!sourceMessage) {
        return m.reply(
          `❌ Reply pesan teks/gambar/video/sticker yang ingin dikirim.

    Contoh:
    ${prefix + command} https://whatsapp.com/channel/xxxx`
        );
      }

      const link = args[0] || "";
      const match = link.match(/^https:\/\/whatsapp\.com\/channel\/([a-zA-Z0-9_-]+)/i);
      if (!match) {
        return m.reply(`❌ Link saluran tidak valid.
    Contoh: https://whatsapp.com/channel/xxxx`);
      }

      try {
        const metadata = await Rafael.newsletterMetadata("invite", match[1]);
        const channelJid = String(metadata.id);
        const sourceContainer = sourceMessage.message || {};
        const type = sourceMessage.mtype || Object.keys(sourceContainer)[0] || "";
        const sourceText = sourceMessage === m
          ? ""
          : sourceMessage.text || sourceMessage.caption || "";

        if (["conversation", "extendedTextMessage"].includes(type)) {
          if (!sourceText) return m.reply("❌ Pesan teks yang direply tidak memiliki isi.");
          await Rafael.sendMessage(channelJid, { text: sourceText });
        } else if (type === "imageMessage") {
          await Rafael.sendMessage(channelJid, {
            image: await Rafael.downloadMediaMessage(sourceMessage),
            caption: sourceMessage === m ? "" : sourceMessage.caption || sourceText
          });
        } else if (type === "videoMessage") {
          await Rafael.sendMessage(channelJid, {
            video: await Rafael.downloadMediaMessage(sourceMessage),
            caption: sourceMessage === m ? "" : sourceMessage.caption || sourceText
          });
        } else if (type === "stickerMessage") {
          const media = await Rafael.downloadMediaMessage(sourceMessage);
          const isAnimated =
            sourceMessage.isAnimated ||
            sourceContainer.stickerMessage?.isAnimated ||
            false;

          if (isAnimated) {
            await Rafael.sendVideoAsSticker(channelJid, media, null, {
              packname: (global.packname || "Sticker Bot").trim(),
              author: (global.author || "RafaelXD").trim()
            });
          } else {
            await Rafael.sendImageAsSticker(channelJid, media, null, {
              packname: (global.packname || "Sticker Bot").trim(),
              author: (global.author || "RafaelXD").trim()
            });
          }
        } else {
          return m.reply("❌ Tipe pesan belum didukung. Hanya teks, gambar, video, dan sticker.");
        }

        await m.reply("✅ Pesan berhasil dikirim ke Channel.");
      } catch (error) {
        console.error("Error pada proses up:", error);
        await m.reply("❌ Terjadi kesalahan. Pastikan link valid dan bot merupakan admin channel.");
      }
  }
};
