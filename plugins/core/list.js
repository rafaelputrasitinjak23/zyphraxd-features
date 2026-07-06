const {
  fs, path, os, crypto, util, pipeline, axios, exec, execFile, execFileAsync,
  yts, moment, wrapper, CookieJar, cheerio, youtubeDl, Smeme, audio2text,
  ChatMusicAPI, downloadInstagram, createBotBackup, deleteBotBackup,
  createTempPath, safeUnlink, runFfmpeg, withTimeout, normalizeJid,
  readAccessUsers, writeAccessUsers, checkAccess, ctext
} = require("../../lib/pluginUtils");

module.exports = {
  name: 'list-channel',
  commands: ['list', 'list-ch'],
  category: 'main',
  limit: 0,
  cooldown: 1000,
  async run(ctx) {
    const {
      Rafael, m, command, args, text, prefix, body, budy, from, sender, pushname,
      isGroup, isCreator, isAdmin, isBotAdmin, participants, groupAdmins,
      groupMetadata, user, group, database, downloaderCache, taskQueue, pluginManager,
      mime, quoted, isMedia, isAllowed, botNumber, senderNumber, ownerJids,
      time2, ucapanWaktu, wib, wita, wit, salam2, fVerif
    } = ctx;
        const { generateWAMessageFromContent, generateWAMessageContent } = require('@whiskeysockets/baileys');


        let imageMsg = await generateWAMessageContent(
            { image: { url: 'https://nayaara.my.id/f/ke9DSKzwJCR5' } },
            { upload: Rafael.waUploadToServer }
        );

        let msg = generateWAMessageFromContent(m.chat, {
            viewOnceMessage: {
                message: {
                    interactiveMessage: {
                        body: {
                            text: 'Katalog & Informasi Layanan ZyphraXD'
                        },
                        footer: {
                            text: 'ZyphraXD'
                        },
                        header: {
                            hasMediaAttachment: true,
                            imageMessage: imageMsg.imageMessage
                        },
                        nativeFlowMessage: {
                            buttons: [
                                {
                                    name: 'cta_url',
                                    buttonParamsJson: JSON.stringify({
                                        display_text: 'Beli',
                                        url: 'https://wa.me/6285123202331?text=kak mau sewa bot wa nya'
                                    })
                                },
                                {
                                    name: 'cta_catalog',
                                    buttonParamsJson: JSON.stringify({
                                        business_phone_number: '6285123202331',
                                        catalog_product_id: '26803622992655633'
                                    })
                                }
                            ]
                        }
                    }
                }
            }
        }, { quoted: m });

        await Rafael.relayMessage(m.chat, msg.message, {
            messageId: msg.key.id
        });
  }
};
