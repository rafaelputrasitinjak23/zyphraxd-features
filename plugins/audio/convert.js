const {
  fs, path, os, crypto, util, pipeline, axios, exec, execFile, execFileAsync,
  yts, moment, wrapper, CookieJar, cheerio, youtubeDl, Smeme, audio2text,
  ChatMusicAPI, downloadInstagram, createBotBackup, deleteBotBackup,
  createTempPath, safeUnlink, runFfmpeg, withTimeout, normalizeJid,
  readAccessUsers, writeAccessUsers, checkAccess, ctext
} = require("../../lib/pluginUtils");

module.exports = {
  name: 'audio-converter',
  commands: ['convert'],
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
      const mediaMessage = m.quoted || m;
      const mediaMime = (mediaMessage.msg || mediaMessage).mimetype || "";

      if (!/audio/i.test(mediaMime)) {
        return m.reply(`Balas/kirim audio dengan perintah ${prefix + command}`);
      }

      let inputPath = null;
      let outputPath = null;

      try {
        inputPath = await Rafael.downloadAndSaveMediaMessage(mediaMessage);
        outputPath = createTempPath("convert", "ogg");

        await runFfmpeg([
          "-i", inputPath,
          "-vn",
          "-c:a", "libopus",
          "-b:a", "128k",
          "-vbr", "on",
          "-ar", "48000",
          "-ac", "1",
          outputPath
        ]);

        await Rafael.sendMessage(
          m.chat,
          {
            audio: await fs.promises.readFile(outputPath),
            mimetype: "audio/ogg; codecs=opus",
            ptt: true
          },
          { quoted: m }
        );
      } catch (error) {
        console.error("Convert audio error:", error);
        const message = error.code === "ENOENT"
          ? "❌ FFmpeg tidak ditemukan. Pastikan FFmpeg sudah terpasang."
          : `❌ Gagal mengonversi audio: ${error.message}`;
        await m.reply(message);
      } finally {
        await Promise.all([safeUnlink(inputPath), safeUnlink(outputPath)]);
      }
  }
};
