const axios = require('axios');
const qs = require('qs');
let canvasModule = null;
function getCanvasModule() {
    if (!canvasModule) canvasModule = require('canvas');
    return canvasModule;
}
const cheerio = require('cheerio');
const path = require('path');



const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function tiktokdl2(url) {
    try {
        const headers = {
            "User-Agent": userAgent,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
        };

        const getRes = await axios.get("https://ssstik.io/id", { headers, timeout: 10000 });
        const $get = cheerio.load(getRes.data);
        
        const postEndpoint = $get("form").attr("hx-post") || "/abc?url=dl";

        let tt = "";
        const match = getRes.data.match(/tt:\s*'([^']+)'/) || 
                    getRes.data.match(/tt\s*=\s*'([^']+)'/) || 
                    getRes.data.match(/value="([^"]+)"\s*id="tt"/) || 
                    getRes.data.match(/data-tt="([^"]+)"/);
        
        if (match) tt = match[1];

        const dataRaw = qs.stringify({
            id: url,
            locale: "id",
            tt: tt
        });

        const postUrl = "https://ssstik.io" + postEndpoint;

        const postHeaders = {
            ...headers,
            "HX-Request": "true",
            "HX-Target": "target",
            "HX-Current-URL": "https://ssstik.io/id",
            "Content-Type": "application/x-www-form-urlencoded",
            "Referer": "https://ssstik.io/id"
        };

        const postRes = await axios.post(postUrl, dataRaw, { headers: postHeaders, timeout: 15000 });
        const $ = cheerio.load(postRes.data);

        const desc = $("p.maintext").text().trim() || "TikTok Download";
        const author = $("h2").text().trim() || "Unknown";
        
        const video = $("a.without_watermark").first().attr("href") || $("a.download_link").first().attr("href");
        const audio = $("a.music").first().attr("href");
        
        const images = [];
        const isSlide = $("ul.splide__list").length > 0;
        
        if (isSlide) {
            $("ul.splide__list li").each((i, el) => {
                let imgUrl = $(el).find("a").attr("href");
                if (imgUrl) images.push(imgUrl);
            });
        }

        return {
            status: true,
            author,
            description: desc,
            video,
            audio,
            images,
            isSlide
        };

    } catch (e) {
        return {
            status: false,
            message: e.message
        };
    }
}

const headers = {
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'Accept': '*/*',
    'X-Requested-With': 'XMLHttpRequest',
    'User-Agent': userAgent,
    'Referer': 'https://app.ytdown.to/en27/'
};

const findWorkerUrl = (obj, isAud) => {
    if (typeof obj === 'string') {
        if (isAud && obj.includes('/v5/audio/')) return obj;
        if (!isAud && obj.includes('/v5/video/')) return obj;
    } else if (typeof obj === 'object' && obj !== null) {
        for (let key in obj) {
            let res = findWorkerUrl(obj[key], isAud);
            if (res) return res;
        }
    }
    return null;
};

const findDownloadUrl = (obj) => {
    if (typeof obj === 'string') {
        if (obj.includes('iamworker.com') || obj.includes('googlevideo.com')) return obj;
    } else if (typeof obj === 'object' && obj !== null) {
        if (obj.url && obj.url.startsWith('http')) return obj.url;
        if (obj.downloadUrl && obj.downloadUrl.startsWith('http')) return obj.downloadUrl;
        if (obj.file && obj.file.startsWith('http')) return obj.file;
        for (let key in obj) {
            let res = findDownloadUrl(obj[key]);
            if (res) return res;
        }
    }
    return null;
};

async function youtubeDl(url, isAudio = false) {
    try {
        let initRes = await axios.post('https://app.ytdown.to/proxy.php', qs.stringify({ url: url }), { headers, timeout: 15000 });
        let data = initRes.data;

        if (typeof data === 'string') {
            try { data = JSON.parse(data); } catch (e) {}
        }

        let title = data.title || "YouTube Media";
        let thumbnail = data.thumbnail || data.thumb || "";

        let workerUrl = findWorkerUrl(data, isAudio);

        if (!workerUrl) {
            return { status: false, message: "Gagal Mengunduh." };
        }

        let finalDlUrl = "";
        
        for (let i = 0; i < 8; i++) {
            await new Promise(r => setTimeout(r, 3000));
            
            let pollRes = await axios.post('https://app.ytdown.to/proxy.php', qs.stringify({ url: workerUrl }), { headers, timeout: 15000 });
            let pollData = pollRes.data;
            
            if (typeof pollData === 'string') {
                try { pollData = JSON.parse(pollData); } catch (e) {}
            }

            finalDlUrl = findDownloadUrl(pollData);
            if (finalDlUrl && finalDlUrl !== workerUrl) {
                break;
            }
        }

        if (!finalDlUrl) {
            return { status: false, message: "Timeout)." };
        }

        return {
            status: true,
            title,
            thumbnail,
            dl_url: finalDlUrl,
            isAudio
        };

    } catch (e) {
        let errMsg = e.code === 'ECONNABORTED' ? 'Timeout' : e.message;
        return { status: false, message: errMsg };
    }
}

async function listbut2(chat, teks, listnye, jm) {
    let msg = generateWAMessageFromContent(chat, {
        viewOnceMessage: {
            message: {
                "messageContextInfo": {
                    "deviceListMetadata": {},
                    "deviceListMetadataVersion": 2
                },
                interactiveMessage: proto.Message.InteractiveMessage.create({
                    contextInfo: {
                        mentionedJid: [m.sender], 
                        forwardingScore: 999999,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: global.idsal, // pastikan idsal terbaca
                            newsletterName: `Calamary Music`,
                            serverMessageId: 145
                        },
                        externalAdReply: {
                            title: 'Calamary Community',
                            body: `Calamary Music`,
                            thumbnailUrl: 'https://www.image2url.com/r2/default/images/1777653639452-ef267157-ea9d-40be-bc2a-2f1f57272d3c.jpg',
                            sourceUrl: global.saluran || '',
                            mediaType: 1,
                            renderLargerThumbnail: true
                        }
                    },
                    body: proto.Message.InteractiveMessage.Body.create({
                        text: teks
                    }),
                    footer: proto.Message.InteractiveMessage.Footer.create({
                        text: ``
                    }),
                    header: proto.Message.InteractiveMessage.Header.create({
                        title: `Calamary Music`,
                        thumbnailUrl: "https://www.image2url.com/r2/default/images/1777653639452-ef267157-ea9d-40be-bc2a-2f1f57272d3c.jpg",
                        gifPlayback: true,
                        subtitle: "",
                        hasMediaAttachment: true,
                        ...(await prepareWAMessageMedia({
                            document: fs.readFileSync('./lib/thumb.jpg'),
                            mimetype: "image/png",
                            jpegThumbnail: fs.readFileSync('./lib/thumb.jpg'),
                            fileLength: 99999999999999,
                            fileName: `Calamary`,
                        }, {
                            upload: Rafael.waUploadToServer
                        }))
                    }),
                    gifPlayback: true,
                    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                        buttons: [
                            {
                                "name": "single_select",
                                "buttonParamsJson": JSON.stringify(listnye)
                            }
                        ],
                    }),
                })
            }
        }
    }, { quoted: jm });

    await Rafael.relayMessage(msg.key.remoteJid, msg.message, {
        messageId: msg.key.id
    });
}





async function generateImage(imageUrl, outputPath, text, textX, textY, maxWidth, lineHeight, chat) {
    try {
        const { createCanvas, loadImage } = getCanvasModule();
        const downloadImage = async (url, path) => {
            const response = await axios({ url, responseType: 'arraybuffer' })
            fs.writeFileSync(path, Buffer.from(response.data))
        }

        const wrapText = (ctx, text, maxWidth, baseX) => {
            const words = text.split(' ')
            let lines = []
            let currentLine = ''
            let xOffset = 0  

            words.forEach(word => {
                if (word.includes('\n')) {
                    let parts = word.split('\n')
                    parts.forEach((part, index) => {
                        let testLine = currentLine + (currentLine ? ' ' : '') + part
                        let testWidth = ctx.measureText(testLine).width
                        if (testWidth < maxWidth) {
                            currentLine = testLine
                        } else {
                            lines.push({ text: currentLine, x: baseX + xOffset })
                            currentLine = part
                            xOffset = 0  
                        }
                        if (index < parts.length - 1) {
                            lines.push({ text: currentLine, x: baseX + xOffset })
                            currentLine = ''
                            xOffset = 0  
                        }
                    })
                } else {
                    let testLine = currentLine + (currentLine ? ' ' : '') + word
                    let testWidth = ctx.measureText(testLine).width
                    if (testWidth < maxWidth) {
                        currentLine = testLine
                    } else {
                        lines.push({ text: currentLine, x: baseX + xOffset })
                        currentLine = word
                        xOffset = 0  
                    }
                }
            })
            lines.push({ text: currentLine, x: baseX + xOffset })
            return lines
        }

        await downloadImage(imageUrl, outputPath)

        const image = await loadImage(outputPath)
        const canvas = createCanvas(image.width, image.height)
        const ctx = canvas.getContext('2d')

        ctx.drawImage(image, 0, 0, image.width, image.height)
        ctx.font = '23px "NulisFont"'
        ctx.fillStyle = 'black'
        ctx.textAlign = 'left'

        const wrappedText = wrapText(ctx, text, maxWidth, textX)
        wrappedText.forEach((line, index) => {
            ctx.fillText(line.text, line.x, textY + index * lineHeight)
        })

        const finalImagePath = outputPath.replace('.jpg', '-output.jpg')
        fs.writeFileSync(finalImagePath, canvas.toBuffer('image/jpeg'))

        Rafael.sendMessage(chat, { image: fs.readFileSync(finalImagePath), caption: wm }, { quoted: fVerif })

        fs.unlinkSync(outputPath)
        fs.unlinkSync(finalImagePath)
    } catch (err) {
        m.reply('Terjadi kesalahan: ' + err.message)
    }
}

async function webp2mp4File(url) {
  try {
    const res = await axios.get(`https://ezgif.com/webp-to-mp4?url=${url}`)
    const $ = cheerio.load(res.data)
    const file = $('input[name="file"]').attr('value')

    if (!file) {
      throw new Error('Gagal mendapatkan file dari respon pertama.')
    }

    const data = new URLSearchParams({
      file: file,
      convert: 'Convert WebP to MP4!'
    })

    const res2 = await axios.post(`https://ezgif.com/webp-to-mp4/${file}`, data)
    const $2 = cheerio.load(res2.data)
    const link = $2('div#output > p.outfile > video > source').attr('src')

    if (!link) {
      throw new Error('Gagal mendapatkan link hasil konversi.')
    }

    return `https:${link}`
  } catch (error) {
    console.error('Terjadi kesalahan:', error.message)
    throw error
  }
}

async function Smeme(teksAtas = '', teksBawah = '', imageUrl) {
  const { createCanvas, loadImage } = getCanvasModule();
  let img = await loadImage(imageUrl)
  let canvas = createCanvas(img.width, img.height)
  let ctx = canvas.getContext('2d')

  ctx.drawImage(img, 0, 0, img.width, img.height)

  function tulisTeks(teks, x, y) {
    teks = teks.toUpperCase()
    
    let maxWidth = img.width * 0.85
    let baseFontSize = Math.floor(img.width / 6) 
    let fontSize = Math.max(baseFontSize - (teks.length * 0.5), Math.floor(img.width / 10))

    ctx.font = `bold ${fontSize}px Impact`
    ctx.textAlign = 'center'
    ctx.fillStyle = 'white'
    ctx.strokeStyle = 'black'
    
    ctx.lineWidth = Math.floor(fontSize / 8)
    ctx.lineJoin = 'round' 


    let lineHeight = fontSize * 1.1
    let lines = []
    let words = teks.split(' ')
    let line = ''

    for (let word of words) {
      let testLine = line + word + ' '
      let metrics = ctx.measureText(testLine)
      if (metrics.width > maxWidth && line !== '') {
        lines.push(line.trim())
        line = word + ' '
      } else {
        line = testLine
      }
    }
    lines.push(line.trim())

    let totalHeight = lines.length * lineHeight
    let startY
    if (y === 'top') {
      startY = fontSize + (totalHeight / 2)
    } else {
      startY = img.height - totalHeight
    }

    lines.forEach((line, index) => {
      let lineY = startY + (index * lineHeight)
      ctx.strokeText(line, x, lineY)
      ctx.fillText(line, x, lineY)
    })
  }

  if (teksAtas) tulisTeks(teksAtas, img.width / 2, 'top')
  if (teksBawah) tulisTeks(teksBawah, img.width / 2, 'bottom')

  let buffer = canvas.toBuffer()
  return buffer
}

async function runtime(seconds) {
    seconds = Number(seconds);
    var d = Math.floor(seconds / (3600 * 24));
    var h = Math.floor(seconds % (3600 * 24) / 3600);
    var m = Math.floor(seconds % 3600 / 60);
    var s = Math.floor(seconds % 60);
    
    var dDisplay = d > 0 ? d + (d == 1 ? " Day, " : " day, ") : "";
    var hDisplay = h > 0 ? h + (h == 1 ? " Hour, " : " hour, ") : "";
    var mDisplay = m > 0 ? m + (m == 1 ? " Minute, " : " minute, ") : "";
    var sDisplay = s > 0 ? s + (s == 1 ? " Second" : " second") : "";
    
    return dDisplay + hDisplay + mDisplay + sDisplay;
}



module.exports = { youtubeDl, webp2mp4File, generateImage, Smeme, tiktokdl2, runtime };