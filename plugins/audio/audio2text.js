const {
  fs, path, os, crypto, util, pipeline, axios, exec, execFile, execFileAsync,
  yts, moment, wrapper, CookieJar, cheerio, youtubeDl, Smeme, audio2text,
  ChatMusicAPI, downloadInstagram, createBotBackup, deleteBotBackup,
  createTempPath, safeUnlink, runFfmpeg, withTimeout, normalizeJid,
  readAccessUsers, writeAccessUsers, checkAccess, ctext
} = require("../../lib/pluginUtils");

module.exports = {
  name: 'audio-to-text',
  commands: ['audio2text', 'a2t', 'transcribe'],
  category: 'audio',
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
        return m.reply(`Reply/kirim audio yang ingin dikonversi ke teks.
    Contoh: ${prefix + command}`);
      }

      let tempFile = null;
      try {
        await m.reply("⏳ Sedang mengonversi audio ke teks, mohon tunggu...");
        tempFile = createTempPath("audio2text", mediaMime.split("/")[1]?.split(";")[0] || "audio");
        const mediaBuffer = await mediaMessage.download();
        await fs.promises.writeFile(tempFile, mediaBuffer);

        const result = await withTimeout(
          audio2text(tempFile),
          180_000,
          "Proses audio ke teks melewati batas waktu."
        );

        if (result?.success && result.text) {
          await m.reply(`✅ Konversi Audio Berhasil

    📝 Hasil Transkripsi:

    ${result.text}`);
        } else if (result?.code === 401) {
          await m.reply("❌ Gagal konversi: layanan membutuhkan login. Silakan coba lagi nanti.");
        } else {
          await m.reply(`❌ Gagal konversi audio: ${result?.error || "Tidak diketahui"}`);
        }
      } catch (error) {
        console.error("Audio2Text Error:", error);
        await m.reply(`❌ Error Konversi Audio

    ${error.message}`);
      } finally {
        await safeUnlink(tempFile);
      }
  }
};
