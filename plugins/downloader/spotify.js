const {
  fs, path, os, crypto, util, pipeline, axios, exec, execFile, execFileAsync,
  yts, moment, wrapper, CookieJar, cheerio, youtubeDl, Smeme, audio2text,
  ChatMusicAPI, downloadInstagram, createBotBackup, deleteBotBackup,
  createTempPath, safeUnlink, runFfmpeg, withTimeout, normalizeJid,
  readAccessUsers, writeAccessUsers, checkAccess, ctext
} = require("../../lib/pluginUtils");

module.exports = {
  name: 'spotify',
  commands: ['spotify', 'spdl'],
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

      const spotifyUrl = text.trim();
      if (!spotifyUrl) {
        return m.reply(
          `🎵 SPOTIFY DOWNLOADER

    Gunakan link track Spotify.

    Contoh:
    ${prefix + command} https://open.spotify.com/track/xxxx`
        );
      }

      if (!/^https?:\/\/(open\.)?spotify\.com\/track\//i.test(spotifyUrl)) {
        return m.reply("❌ URL tidak valid. Pastikan itu adalah link track Spotify.");
      }

      const baseUrl = "https://spotmate.online";
      const spotifyJar = new CookieJar();
      const spotifyClient = wrapper(axios.create({ jar: spotifyJar }));
      const headersBase = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
        Referer: "https://spotmate.online/en1",
        Origin: "https://spotmate.online"
      };

      let tempMp3 = null;
      let tempOgg = null;

      try {
        await m.reply("⏳ Sedang memproses lagu Spotify...");

        const cachedSpotify = await downloaderCache.getOrSet(
          `spotify:${spotifyUrl}`,
          async () => {
            const home = await spotifyClient.get(`${baseUrl}/en1`, {
              headers: headersBase,
              timeout: 30_000
            });
            const $ = cheerio.load(home.data);
            const csrf = $("meta[name=\"csrf-token\"]").attr("content");
            if (!csrf) throw new Error("Gagal mendapatkan token keamanan Spotify.");

            const headers = {
              ...headersBase,
              "X-CSRF-TOKEN": csrf,
              "Content-Type": "application/json"
            };

            const metaRes = await spotifyClient.post(
              `${baseUrl}/getTrackData`,
              { spotify_url: spotifyUrl },
              { headers, timeout: 30_000 }
            );
            const meta = metaRes.data || {};
            const title = meta.name || "Unknown";
            const artist = meta.artists?.[0]?.name || "Unknown Artist";

            const convertRes = await spotifyClient.post(
              `${baseUrl}/convert`,
              { urls: spotifyUrl },
              { headers, timeout: 60_000 }
            );
            const converted = convertRes.data || {};
            let downloadUrl = converted.url || converted.download;

            if (!downloadUrl && converted.task_id) {
              for (let attempt = 0; attempt < 15; attempt++) {
                await new Promise((resolve) => setTimeout(resolve, 3_000));
                const statusResponse = await spotifyClient.post(
                  `${baseUrl}/status`,
                  { taskId: converted.task_id },
                  { headers, timeout: 30_000 }
                );
                const status = statusResponse.data || {};
                if (["success", "finished"].includes(status.status)) {
                  downloadUrl = status.download || status.url || status.result;
                  if (downloadUrl) break;
                }
              }
            }

            if (!downloadUrl) {
              throw new Error("Gagal mendapatkan link download. Coba lagi nanti.");
            }

            return { title, artist, downloadUrl };
          },
          8 * 60 * 1000
        );

        const { title, artist, downloadUrl } = cachedSpotify.value;

        const audioResponse = await axios.get(downloadUrl, {
          responseType: "arraybuffer",
          timeout: 90_000,
          maxContentLength: 100 * 1024 * 1024
        });
        const audioBuffer = Buffer.from(audioResponse.data);
        if (audioBuffer.length < 10_000) throw new Error("File hasil download rusak.");

        tempMp3 = createTempPath("spotify", "mp3");
        tempOgg = createTempPath("spotify", "ogg");
        await fs.promises.writeFile(tempMp3, audioBuffer);
        await runFfmpeg([
          "-i", tempMp3,
          "-vn",
          "-c:a", "libopus",
          "-b:a", "128k",
          "-vbr", "on",
          "-ar", "48000",
          "-ac", "1",
          tempOgg
        ]);

        await Rafael.sendMessage(
          m.chat,
          {
            audio: await fs.promises.readFile(tempOgg),
            mimetype: "audio/ogg; codecs=opus",
            ptt: true
          },
          { quoted: fVerif }
        );

        console.log(`Spotify berhasil: ${artist} - ${title}`);
      } catch (error) {
        console.error("Spotify downloader error:", error);
        await m.reply(`❌ ERROR

    ${error.message}`);
      } finally {
        await Promise.all([safeUnlink(tempMp3), safeUnlink(tempOgg)]);
      }
  }
};
