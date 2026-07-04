const {
  fs, path, os, crypto, util, pipeline, axios, exec, execFile, execFileAsync,
  yts, moment, wrapper, CookieJar, cheerio, youtubeDl, Smeme, audio2text,
  ChatMusicAPI, downloadInstagram, createBotBackup, deleteBotBackup,
  createTempPath, safeUnlink, runFfmpeg, withTimeout, normalizeJid,
  readAccessUsers, writeAccessUsers, checkAccess, ctext
} = require("../../lib/pluginUtils");

module.exports = {
  name: 'tiktok',
  commands: ['tt', 'tiktok'],
  category: 'downloader',
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
      if (!isAllowed) {
        return m.reply("Akses ditolak. Nomor kamu tidak terdaftar dalam sistem.");
      }

      const link = text.trim();
      if (!link) {
        return m.reply(`Format salah!
    Penggunaan: ${prefix + command} https://vt.tiktok.com/ZSxL6xU57/`);
      }
      if (!/^https?:\/\/(?:www\.|vm\.|vt\.)?tiktok\.com\//i.test(link)) {
        return m.reply("Pastikan link yang kamu masukkan adalah link TikTok yang valid!");
      }

      let inputPath = null;
      let outputPath = null;

      try {
        await m.reply("Sedang memproses, mohon tunggu...");
        const cachedTikTok = await downloaderCache.getOrSet(
          `tiktok:${link}`,
          async () => {
            const response = await axios.get(
              `https://api.siputzx.my.id/api/d/tiktok/v2?url=${encodeURIComponent(link)}`,
              { timeout: 60_000 }
            );
            return response.data;
          },
          10 * 60 * 1000
        );
        const result = cachedTikTok.value;

        if (!result?.status || !result?.data) {
          throw new Error(result?.message || "Gagal mengambil data dari API TikTok.");
        }

        const data = result.data;
        const captionVideo =
          `TikTok Downloader

    👤 Author: ${data.author_nickname || "Anonim"}
    ` +
          `📝 Caption: ${data.text || "-"}`;
        const videoUrl = data.no_watermark_link_hd || data.no_watermark_link;

        if (videoUrl) {
          await Rafael.sendMessage(
            m.chat,
            { video: { url: videoUrl }, caption: captionVideo },
            { quoted: m }
          );
        }

        if (data.music_link) {
          const audioResponse = await axios.get(data.music_link, {
            responseType: "arraybuffer",
            timeout: 90_000,
            maxContentLength: 100 * 1024 * 1024
          });
          inputPath = createTempPath("tiktok-audio", "bin");
          outputPath = createTempPath("tiktok-audio", "ogg");
          await fs.promises.writeFile(inputPath, Buffer.from(audioResponse.data));
          await runFfmpeg([
            "-i", inputPath,
            "-vn",
            "-c:a", "libopus",
            "-b:a", "128k",
            "-vbr", "on",
            outputPath
          ]);

          await Rafael.sendMessage(
            m.chat,
            {
              audio: await fs.promises.readFile(outputPath),
              mimetype: "audio/ogg; codecs=opus",
              ptt: false
            },
            { quoted: m }
          );
        }

        if (!videoUrl && !data.music_link) {
          throw new Error("API tidak mengembalikan media yang dapat dikirim.");
        }
      } catch (error) {
        console.error("TikTok downloader error:", error);
        await m.reply(`Terjadi kesalahan sistem: ${error.message}`);
      } finally {
        await Promise.all([safeUnlink(inputPath), safeUnlink(outputPath)]);
      }
  }
};
