const { createCanvas, loadImage } = require('canvas');
const axios = require('axios');
const { BRAND } = require('./branding');

async function fetchBuffer(url) {
  if (!url) return null;
  try {
    const { data } = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
    return Buffer.from(data);
  } catch {
    return null;
  }
}

function rr(ctx, x, y, w, h, r, fill = true, stroke = false) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

function drawGrid(ctx, width, height) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 50) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += 50) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSparkles(ctx, points) {
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  for (const [x, y, size] of points) {
    const s = size || 12;
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s * 0.35, y - s * 0.35);
    ctx.lineTo(x + s, y);
    ctx.lineTo(x + s * 0.35, y + s * 0.35);
    ctx.lineTo(x, y + s);
    ctx.lineTo(x - s * 0.35, y + s * 0.35);
    ctx.lineTo(x - s, y);
    ctx.lineTo(x - s * 0.35, y - s * 0.35);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawAnimeOrnaments(ctx, width, height, variant = 'profile') {
  ctx.save();
  const blobs = [
    { x: width * 0.11, y: height * 0.17, r: 120, c: 'rgba(110,231,255,0.36)' },
    { x: width * 0.87, y: height * 0.20, r: 160, c: 'rgba(255,119,200,0.28)' },
    { x: width * 0.78, y: height * 0.82, r: 140, c: 'rgba(168,85,247,0.22)' }
  ];
  for (const blob of blobs) {
    const g = ctx.createRadialGradient(blob.x, blob.y, 10, blob.x, blob.y, blob.r);
    g.addColorStop(0, blob.c);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(blob.x - blob.r, blob.y - blob.r, blob.r * 2, blob.r * 2);
  }

  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath(); ctx.arc(width - 95, 88, 42, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(width - 145, 88, 18, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(width - 171, 88, 10, 0, Math.PI * 2); ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(width - 130, height - 90, 50, Math.PI * 0.15, Math.PI * 1.2);
  ctx.stroke();

  if (variant !== 'goodbye') {
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    rr(ctx, width - 240, 54, 150, 42, 20, true, false);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px Sans';
    ctx.textAlign = 'center';
    ctx.fillText('Anime Theme', width - 165, 82);
  }
  ctx.restore();
}

function drawBackground(ctx, width, height, variant = 'profile') {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#0f172a');
  gradient.addColorStop(0.35, '#4338ca');
  gradient.addColorStop(0.68, '#7c3aed');
  gradient.addColorStop(1, variant === 'goodbye' ? '#db2777' : '#ec4899');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  drawGrid(ctx, width, height);
  drawAnimeOrnaments(ctx, width, height, variant);

  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  rr(ctx, 36, 36, width - 72, height - 72, 34, true, false);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 2;
  rr(ctx, 36, 36, width - 72, height - 72, 34, false, true);

  drawSparkles(ctx, [
    [82, 74, 14], [235, 146, 10], [1118, 110, 12], [985, 225, 10], [108, 565, 12], [1040, 560, 11]
  ]);
}

async function drawAvatar(ctx, x, y, size, avatarUrl, fallbackText = '?') {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.28)';
  ctx.shadowBlur = 20;
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2 + 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  const avatarBuffer = await fetchBuffer(avatarUrl);
  if (avatarBuffer) {
    const avatar = await loadImage(avatarBuffer);
    ctx.drawImage(avatar, x, y, size, size);
  } else {
    const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
    gradient.addColorStop(0, '#6ee7ff');
    gradient.addColorStop(0.45, '#8b5cf6');
    gradient.addColorStop(1, '#ff77c8');
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.floor(size * 0.4)}px Sans`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fallbackText.slice(0, 1).toUpperCase(), x + size / 2, y + size / 2 + 6);
  }
  ctx.restore();

  ctx.lineWidth = 7;
  ctx.strokeStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.stroke();
}

function chip(ctx, { x, y, text, color = 'rgba(255,255,255,0.14)', textColor = '#fff' }) {
  ctx.save();
  ctx.fillStyle = color;
  rr(ctx, x, y, ctx.measureText(text).width + 32, 34, 17, true, false);
  ctx.fillStyle = textColor;
  ctx.font = 'bold 18px Sans';
  ctx.fillText(text, x + 16, y + 23);
  ctx.restore();
}

function statBox(ctx, { x, y, w, h, label, value, color, icon = '✦' }) {
  ctx.save();
  ctx.fillStyle = color || 'rgba(255,255,255,0.14)';
  rr(ctx, x, y, w, h, 24, true, false);
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 1.6;
  rr(ctx, x, y, w, h, 24, false, true);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 20px Sans';
  ctx.fillText(`${icon} ${label}`, x + 20, y + 34);
  ctx.font = 'bold 29px Sans';
  ctx.fillText(String(value), x + 20, y + 76);
  ctx.restore();
}

function drawPanel(ctx, x, y, w, h) {
  ctx.save();
  ctx.fillStyle = 'rgba(10,16,32,0.18)';
  rr(ctx, x, y, w, h, 28, true, false);
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1.6;
  rr(ctx, x, y, w, h, 28, false, true);
  ctx.restore();
}

async function createProfileCard(data) {
  const width = 1280;
  const height = 720;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  drawBackground(ctx, width, height, 'profile');

  drawPanel(ctx, 54, 56, width - 108, height - 112);

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 56px Sans';
  ctx.fillText(`${BRAND.botName}`, 92, 122);
  ctx.font = '24px Sans';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillText('Profile Card • Statistik Pengguna', 95, 158);

  chip(ctx, { x: 92, y: 182, text: 'Premium Theme', color: 'rgba(255,119,200,0.25)' });
  chip(ctx, { x: 250, y: 182, text: data.premium === 'Ya' ? 'Premium User' : 'Regular User', color: 'rgba(110,231,255,0.24)' });

  await drawAvatar(ctx, 98, 250, 190, data.avatarUrl, data.name || 'U');

  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 46px Sans';
  ctx.fillText(data.name || 'Unknown User', 330, 316);
  ctx.font = '26px Sans';
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fillText(data.number || '-', 333, 358);
  ctx.fillText(`Status  : ${data.status || 'Aktif'}`, 333, 398);
  ctx.fillText(`Premium : ${data.premium || 'Tidak'}`, 333, 438);
  ctx.fillText(`Owner   : ${BRAND.ownerName} • ${BRAND.ownerNumber}`, 333, 478);

  statBox(ctx, { x: 92, y: 525, w: 250, h: 120, label: 'Limit', value: `${data.limit}/${data.dailyLimit}`, color: 'rgba(108,99,255,0.35)', icon: '🎟️' });
  statBox(ctx, { x: 364, y: 525, w: 250, h: 120, label: 'Total CMD', value: data.totalCommands || 0, color: 'rgba(255,119,200,0.30)', icon: '⚡' });
  statBox(ctx, { x: 636, y: 525, w: 250, h: 120, label: 'Terdaftar', value: data.registeredLabel || '-', color: 'rgba(110,231,255,0.28)', icon: '📅' });
  statBox(ctx, { x: 908, y: 525, w: 280, h: 120, label: 'Last Seen', value: data.lastSeenLabel || '-', color: 'rgba(255,255,255,0.18)', icon: '🕒' });

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '22px Sans';
  ctx.fillText('Terima kasih sudah menggunakan ZyphraXD ✨', 94, 680);
  ctx.textAlign = 'right';
  ctx.fillText('Anime-inspired premium card', width - 94, 680);

  return canvas.toBuffer('image/png');
}

async function createMemberCard(data) {
  const width = 1280;
  const height = 720;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  drawBackground(ctx, width, height, data.type || 'welcome');

  drawPanel(ctx, 54, 56, width - 108, height - 112);

  const title = data.type === 'goodbye' ? 'GOODBYE!' : 'WELCOME!';
  const badge = data.type === 'goodbye' ? 'See You Soon' : 'New Member Joined';
  const subtitle = data.type === 'goodbye'
    ? 'Terima kasih sudah pernah menjadi bagian grup ini'
    : 'Selamat datang, semoga betah dan aktif bersama komunitas';

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 62px Sans';
  ctx.fillText(title, 92, 122);
  ctx.font = '24px Sans';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillText(data.groupName || 'Group', 95, 158);
  chip(ctx, { x: 92, y: 184, text: badge, color: data.type === 'goodbye' ? 'rgba(255,119,200,0.23)' : 'rgba(110,231,255,0.22)' });

  await drawAvatar(ctx, 100, 252, 190, data.avatarUrl, data.name || 'U');

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 48px Sans';
  ctx.fillText(data.name || 'Member', 332, 320);
  ctx.font = '26px Sans';
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  ctx.fillText(data.number || '-', 335, 360);
  ctx.fillText(data.subtitle || subtitle, 335, 402);
  ctx.fillText(`Bot    : ${BRAND.botName}`, 335, 442);
  ctx.fillText(`Owner  : ${BRAND.ownerName}`, 335, 482);

  statBox(ctx, { x: 92, y: 525, w: 255, h: 120, label: 'Total Member', value: data.memberCount || 0, color: 'rgba(108,99,255,0.35)', icon: '👥' });
  statBox(ctx, { x: 369, y: 525, w: 220, h: 120, label: 'Admin', value: data.adminCount || 0, color: 'rgba(110,231,255,0.30)', icon: '🛡️' });
  statBox(ctx, { x: 611, y: 525, w: 260, h: 120, label: 'Group', value: (data.groupName || 'Group').slice(0, 12), color: 'rgba(255,119,200,0.28)', icon: '🌸' });
  statBox(ctx, { x: 893, y: 525, w: 295, h: 120, label: 'Message', value: data.type === 'goodbye' ? 'Sampai Jumpa' : 'Selamat Datang', color: 'rgba(255,255,255,0.18)', icon: '💌' });

  ctx.fillStyle = 'rgba(255,255,255,0.86)';
  ctx.font = '22px Sans';
  ctx.fillText(data.footerText || 'Jangan lupa baca rules dan kenalan dengan member lain ya! ✨', 94, 680);
  ctx.textAlign = 'right';
  ctx.fillText('ZyphraXD • Group Card', width - 94, 680);

  return canvas.toBuffer('image/png');
}

module.exports = { createProfileCard, createMemberCard };
