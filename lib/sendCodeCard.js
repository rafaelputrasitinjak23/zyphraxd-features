async function sendCodeCard(Rafael, m, options = {}) {
  const { createCanvas } = require('canvas');
  const { generateWAMessageContent, generateWAMessageFromContent } = require('@whiskeysockets/baileys');

  const botName = options.botName || 'ZyphraXD';
  const title = options.title || 'JavaScript Code';
  const subtitle = options.subtitle || 'Lihat kode';
  const language = options.language || 'JavaScript';
  const footer = options.footer || `${botName} • Script Preview`;
  const code = options.code || `const greet = (name) => {\n  console.log(\`Hello, \${name}!\`);\n};\n\ngreet("ZyphraXD");`;

  function roundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
  }

  function runtime(seconds) {
    const total = Math.floor(seconds);
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    return `${days} hari, ${hours} jam, ${minutes} menit, ${secs} detik`;
  }

  function createPreview() {
    const width = 1200;
    const height = 650;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    const background = ctx.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, '#0f172a');
    background.addColorStop(0.5, '#1e293b');
    background.addColorStop(1, '#111827');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(30,41,59,0.95)';
    roundedRect(ctx, 35, 35, width - 70, height - 70, 28);
    ctx.fill();
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 3;
    ctx.stroke();

    [['#ff5f57', 78], ['#febc2e', 114], ['#28c840', 150]].forEach(([color, x]) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, 78, 11, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 31px Sans';
    ctx.fillText(title, 70, 145);
    ctx.fillStyle = '#22c55e';
    ctx.font = 'bold 23px Sans';
    ctx.fillText(subtitle, 70, 183);

    ctx.fillStyle = '#0f172a';
    roundedRect(ctx, 60, 215, width - 120, 330, 20);
    ctx.fill();

    const lines = String(code).replace(/\t/g, '  ').split('\n').slice(0, 8);
    ctx.font = '27px monospace';
    ctx.textBaseline = 'top';
    let y = 245;
    lines.forEach((line, index) => {
      ctx.fillStyle = '#64748b';
      ctx.fillText(String(index + 1).padStart(2, '0'), 85, y);
      ctx.fillStyle = '#e5e7eb';
      ctx.fillText(line.slice(0, 70), 150, y);
      y += 37;
    });

    ctx.fillStyle = '#94a3b8';
    ctx.font = '21px Sans';
    ctx.fillText(`${language} • ${botName}`, 70, 590);
    ctx.textAlign = 'right';
    ctx.fillText(`Runtime ${runtime(process.uptime())}`, width - 70, 590);
    return canvas.toBuffer('image/png');
  }

  const preview = createPreview();
  const imageMessage = await generateWAMessageContent({ image: preview }, { upload: Rafael.waUploadToServer });
  const buttons = Array.isArray(options.buttons) ? options.buttons : [
    {
      name: 'cta_copy',
      buttonParamsJson: JSON.stringify({ display_text: 'Salin Kode', copy_code: code })
    },
    {
      name: 'cta_url',
      buttonParamsJson: JSON.stringify({
        display_text: 'Saluran WhatsApp',
        url: options.channelUrl || global.saluran || '',
        merchant_url: options.channelUrl || global.saluran || ''
      })
    }
  ];

  const message = generateWAMessageFromContent(m.chat, {
    viewOnceMessage: {
      message: {
        messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
        interactiveMessage: {
          body: { text: options.body || `${botName} telah berjalan selama ${runtime(process.uptime())}` },
          footer: { text: footer },
          header: { title, subtitle, hasMediaAttachment: true, imageMessage: imageMessage.imageMessage },
          nativeFlowMessage: { buttons }
        }
      }
    }
  }, { quoted: options.quoted || m });

  await Rafael.relayMessage(m.chat, message.message, { messageId: message.key.id });
  return message;
}

module.exports = sendCodeCard;
