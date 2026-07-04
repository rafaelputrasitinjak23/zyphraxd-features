const {
  fs, path, os, crypto, util, pipeline, axios, exec, execFile, execFileAsync,
  yts, moment, wrapper, CookieJar, cheerio, youtubeDl, Smeme, audio2text,
  ChatMusicAPI, downloadInstagram, createBotBackup, deleteBotBackup,
  createTempPath, safeUnlink, runFfmpeg, withTimeout, normalizeJid,
  readAccessUsers, writeAccessUsers, checkAccess, ctext
} = require("../../lib/pluginUtils");

module.exports = {
  name: 'image-enhancer',
  commands: ['remini', 'hd', 'enhance'],
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
      const enhancer = require("../../lib/winkEnhancer");
      const mediaMessage = m.quoted || m;
      const mediaMime = (mediaMessage.msg || mediaMessage).mimetype || "";

      if (!/image/i.test(mediaMime)) {
        return m.reply(`Kirim/reply gambar dengan caption ${prefix + command}`);
      }

      let inputPath = null;
      try {
        await m.reply("Sedang meningkatkan kualitas gambar...");
        inputPath = createTempPath("enhance", "jpg");
        await fs.promises.writeFile(inputPath, await mediaMessage.download());

        const result = await withTimeout(
          enhancer(inputPath),
          180_000,
          "Proses enhance melewati batas waktu."
        );

        if (!result?.Status) {
          return m.reply(`Gagal enhance gambar:
    ${result?.Error || "Tidak diketahui"}`);
        }

        await Rafael.sendMessage(
          m.chat,
          {
            image: { url: result.Result_url },
            caption: "Berhasil meningkatkan kualitas gambar."
          },
          { quoted: m }
        );
      } catch (error) {
        console.error("Enhance error:", error);
        await m.reply(`Terjadi error saat enhance gambar: ${error.message}`);
      } finally {
        await safeUnlink(inputPath);
      }
  }
};
