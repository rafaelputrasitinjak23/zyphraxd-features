const {
  fs, path, os, crypto, util, pipeline, axios, exec, execFile, execFileAsync,
  yts, moment, wrapper, CookieJar, cheerio, youtubeDl, Smeme, audio2text,
  ChatMusicAPI, downloadInstagram, createBotBackup, deleteBotBackup,
  createTempPath, safeUnlink, runFfmpeg, withTimeout, normalizeJid,
  readAccessUsers, writeAccessUsers, checkAccess, ctext
} = require("../../lib/pluginUtils");

module.exports = {
  name: 'music-generator',
  commands: ['musicgen', 'genmusic', 'generatemusic'],
  category: 'audio',
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
            return m.reply(`*Format Salah!*\n\nMasukkan prompt untuk generate musik.\n\nContoh:\n${prefix + command} rock music with electric guitar and drums\n${prefix + command} peaceful ambient music for relaxation\n\n*Tips:*\nSemakin detail prompt, semakin baik hasil musiknya.`);
        }
        
        m.reply('⏳ *Sedang generate musik, mohon tunggu sebentar...*\n\n(Proses ini biasanya memakan waktu 1-2 menit)');
        
        try {
            const musicAPI = new ChatMusicAPI();
            
            // Parse command parameters
            let prompt = text;
            let isInstrumental = 0;
            let modelId = 6; // default latest model
            
            // Check for instrumental flag
            if (text.includes('--instrumental')) {
                isInstrumental = 1;
                prompt = text.replace('--instrumental', '').trim();
            }
            
            // Check for model version
            const modelMatch = text.match(/--model\s+(\d+)/);
            if (modelMatch) {
                modelId = Number.parseInt(modelMatch[1], 10);
                prompt = prompt.replace(modelMatch[0], '').trim();
            }

            if (!prompt) {
                return m.reply("Prompt musik tidak boleh kosong setelah parameter dihapus.");
            }
            
            const result = await withTimeout(
                musicAPI.generate({
                    title: prompt.substring(0, 50),
                    prompt,
                    isInstrumental,
                    modelId
                }),
                240_000,
                "Generate musik melewati batas waktu."
            );
            
            if (result && result.length > 0) {
                const music = result[0];
                const musicFile = music.music_file;
                
                if (!musicFile) {
                    return m.reply('❌ *Gagal mendapatkan file musik*\n\nSilakan coba lagi nanti.');
                }
                
                // Send music as audio
                const caption = `✅ *Music Generated Sukses!*\n\n📝 *Prompt:* ${prompt}\n🎵 *Model:* v${result[0].version || '5.0'}\n⏱️ *Duration:* ${music.duration || 'Unknown'} detik`;
                
                await Rafael.sendMessage(m.chat, {
                    audio: { url: musicFile },
                    mimetype: 'audio/mpeg',
                    ptt: false
                }, { quoted: m });
                
                await m.reply(caption);
            } else {
                return m.reply('❌ *Gagal generate musik*\n\nSilakan coba dengan prompt yang berbeda.');
            }
        } catch (error) {
            console.error('Music Generation Error:', error);
            await m.reply(`❌ *Error Generate Musik*\n\nKesalahan: ${error.message}`);
        }
  }
};
