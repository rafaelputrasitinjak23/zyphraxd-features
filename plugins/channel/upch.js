const {
  fs, path, os, crypto, util, pipeline, axios, exec, execFile, execFileAsync,
  yts, moment, wrapper, CookieJar, cheerio, youtubeDl, Smeme, audio2text,
  ChatMusicAPI, downloadInstagram, createBotBackup, deleteBotBackup,
  createTempPath, safeUnlink, runFfmpeg, withTimeout, normalizeJid,
  readAccessUsers, writeAccessUsers, checkAccess, ctext
} = require("../../lib/pluginUtils");

module.exports = {
  name: 'upload-channel-audio',
  commands: ['upch'],
  category: 'channel',
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
      if (!isAllowed) {
        return m.reply("Akses ditolak. Nomor kamu tidak terdaftar dalam sistem.");
      }

      const mediaMessage = m.quoted || m;
      const mediaMime = (mediaMessage.msg || mediaMessage).mimetype || "";
      if (!/audio/i.test(mediaMime)) {
        return m.reply(`Balas/kirim audio dengan perintah:
    ${prefix + command} https://whatsapp.com/channel/xxxx`);
      }

      const link = args[0] || "";
      const match = link.match(/^https:\/\/whatsapp\.com\/channel\/([a-zA-Z0-9_-]+)/i);
      if (!match) {
        return m.reply(`❌ Link saluran tidak valid.
    Contoh: https://whatsapp.com/channel/xxxx`);
      }

      let mediaPath = null;
      let outputPath = null;

      try {
        const metadata = await Rafael.newsletterMetadata("invite", match[1]);
        const channelJid = String(metadata.id);
        mediaPath = await Rafael.downloadAndSaveMediaMessage(mediaMessage);
        outputPath = createTempPath("upch", "ogg");

        await runFfmpeg([
          "-i", mediaPath,
          "-vn",
          "-c:a", "libopus",
          "-b:a", "128k",
          "-vbr", "on",
          "-ar", "48000",
          "-ac", "1",
          outputPath
        ]);

        await Rafael.sendMessage(channelJid, {
          audio: await fs.promises.readFile(outputPath),
          mimetype: "audio/ogg; codecs=opus",
          ptt: true
        });

        await m.reply("✅ Voice Note berhasil dikirim ke Channel.");
      } catch (error) {
        console.error("Error upch:", error);
        const message = error.code === "ENOENT"
          ? "❌ FFmpeg tidak ditemukan. Pastikan FFmpeg sudah terpasang."
          : "❌ Terjadi kesalahan. Pastikan link valid dan bot merupakan admin Channel.";
        await m.reply(message);
      } finally {
        await Promise.all([safeUnlink(mediaPath), safeUnlink(outputPath)]);
      }
  }
};
