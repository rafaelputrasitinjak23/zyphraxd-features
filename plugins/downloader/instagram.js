const {
  fs, path, os, crypto, util, pipeline, axios, exec, execFile, execFileAsync,
  yts, moment, wrapper, CookieJar, cheerio, youtubeDl, Smeme, audio2text,
  ChatMusicAPI, downloadInstagram, createBotBackup, deleteBotBackup,
  createTempPath, safeUnlink, runFfmpeg, withTimeout, normalizeJid,
  readAccessUsers, writeAccessUsers, checkAccess, ctext
} = require("../../lib/pluginUtils");

module.exports = {
  name: 'instagram',
  commands: ['igdl', 'igdownload', 'instagram'],
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
            return m.reply('Akses ditolak. Nomor kamu tidak terdaftar dalam sistem.');
        }
        
        if (!text) {
            return m.reply(`*Format Salah!*\n\nMasukkan link Instagram (post atau video).\n\nContoh:\n${prefix + command} https://www.instagram.com/p/DYEE3mykY1S/?igsh=MTkxa2gxNmJka2dqdg==`);
        }
        
        m.reply('⏳ *Sedang download media Instagram, mohon tunggu sebentar...*');
        
        try {
            const cachedInstagram = await downloaderCache.getOrSet(
                `instagram:${text.trim()}`,
                () => withTimeout(
                    downloadInstagram(text),
                    120_000,
                    "Instagram downloader melewati batas waktu."
                ),
                10 * 60 * 1000
            );
            const result = cachedInstagram.value;
            
            if (!result.status || result.total === 0) {
                return m.reply(`❌ *Gagal Download*\n\nAlasan: ${result.error || 'Media tidak ditemukan'}\n\nPastikan link Instagram valid dan bukan profil/story.`);
            }
            
            let caption = `✅ *Download Instagram Sukses!*\n\n`;
            caption += `📊 *Total Media:* ${result.results.length}\n`;
            caption += `📎 *Link:* ${result.input}\n\n`;
            caption += `🎞️ *Daftar Media:*\n`;
            
            for (let i = 0; i < result.results.length; i++) {
                const media = result.results[i];
                caption += `${i + 1}. ${media.type.toUpperCase()}\n`;
            }
            
            // Send first media
            const firstMedia = result.results[0];
            
            if (firstMedia.type === 'video') {
                await Rafael.sendMessage(m.chat, {
                    video: { url: firstMedia.url },
                    mimetype: 'video/mp4',
                    caption: caption
                }, { quoted: m });
            } else {
                await Rafael.sendMessage(m.chat, {
                    image: { url: firstMedia.url },
                    caption: caption
                }, { quoted: m });
            }
            
            // Send remaining media
            if (result.results.length > 1) {
                for (let i = 1; i < result.results.length; i++) {
                    const media = result.results[i];
                    
                    try {
                        if (media.type === 'video') {
                            await Rafael.sendMessage(m.chat, {
                                video: { url: media.url },
                                mimetype: 'video/mp4'
                            }, { quoted: m });
                        } else {
                            await Rafael.sendMessage(m.chat, {
                                image: { url: media.url }
                            }, { quoted: m });
                        }
                        
                        // Add delay between sends
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    } catch (e) {
                        console.error(`Gagal mengirim media ${i + 1}:`, e);
                    }
                }
            }
        } catch (error) {
            console.error('Instagram Download Error:', error);
            await m.reply(`❌ *Error Download*\n\nKesalahan: ${error.message}`);
        }
  }
};
