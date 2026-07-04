const { createCanvas } = require('canvas');
const { BRAND } = require('./branding');

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function shorten(value, max = 22) {
  const text = String(value || 'Unknown');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function drawBackground(ctx, width, height) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#0f172a');
  gradient.addColorStop(0.35, '#312e81');
  gradient.addColorStop(0.7, '#6d28d9');
  gradient.addColorStop(1, '#db2777');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const glows = [
    [150, 110, 220, 'rgba(34,211,238,0.26)'],
    [1070, 120, 240, 'rgba(244,114,182,0.22)'],
    [900, 700, 280, 'rgba(139,92,246,0.20)']
  ];

  for (const [x, y, radius, color] of glows) {
    const glow = ctx.createRadialGradient(x, y, 10, x, y, radius);
    glow.addColorStop(0, color);
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += 50) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += 50) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function drawRankBadge(ctx, rank, x, y, size) {
  const colors = {
    1: ['#fbbf24', '#f59e0b'],
    2: ['#e5e7eb', '#94a3b8'],
    3: ['#fb923c', '#b45309']
  };
  const selected = colors[rank] || ['#8b5cf6', '#6d28d9'];
  const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
  gradient.addColorStop(0, selected[0]);
  gradient.addColorStop(1, selected[1]);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.floor(size * 0.42)}px Sans`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(rank), x + size / 2, y + size / 2 + 1);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function createLeaderboardCanvas({ groupName, players, generatedAt }) {
  const width = 1280;
  const height = 900;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  drawBackground(ctx, width, height);

  ctx.fillStyle = 'rgba(15,23,42,0.52)';
  roundedRect(ctx, 42, 42, width - 84, height - 84, 34);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 2;
  roundedRect(ctx, 42, 42, width - 84, height - 84, 34);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 52px Sans';
  ctx.fillText('GROUP LEADERBOARD', 78, 110);
  ctx.font = '26px Sans';
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.fillText(shorten(groupName, 48), 80, 150);

  ctx.textAlign = 'right';
  ctx.font = 'bold 24px Sans';
  ctx.fillStyle = '#67e8f9';
  ctx.fillText(BRAND.botName, width - 80, 108);
  ctx.font = '20px Sans';
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.fillText(`Update: ${generatedAt}`, width - 80, 145);
  ctx.textAlign = 'left';

  const list = Array.isArray(players) ? players.slice(0, 10) : [];
  if (!list.length) {
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    roundedRect(ctx, 80, 230, width - 160, 430, 28);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px Sans';
    ctx.textAlign = 'center';
    ctx.fillText('Belum ada pemain di leaderboard.', width / 2, 410);
    ctx.font = '24px Sans';
    ctx.fillStyle = 'rgba(255,255,255,0.76)';
    ctx.fillText('Mulai permainan dengan .game', width / 2, 458);
    ctx.textAlign = 'left';
    return canvas.toBuffer('image/png');
  }

  const startY = 200;
  const rowHeight = 61;

  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  roundedRect(ctx, 76, startY - 28, width - 152, 42, 16);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.font = 'bold 18px Sans';
  ctx.fillText('RANK', 94, startY - 1);
  ctx.fillText('PEMAIN', 178, startY - 1);
  ctx.fillText('LEVEL', 630, startY - 1);
  ctx.fillText('MENANG', 760, startY - 1);
  ctx.fillText('STREAK', 900, startY - 1);
  ctx.fillText('XP', 1055, startY - 1);

  list.forEach((player, index) => {
    const rank = index + 1;
    const y = startY + 18 + index * rowHeight;
    const isTop = rank <= 3;
    ctx.fillStyle = isTop
      ? 'rgba(255,255,255,0.16)'
      : 'rgba(255,255,255,0.075)';
    roundedRect(ctx, 76, y, width - 152, 50, 17);
    ctx.fill();

    drawRankBadge(ctx, rank, 90, y + 6, 38);

    ctx.fillStyle = '#ffffff';
    ctx.font = isTop ? 'bold 22px Sans' : '21px Sans';
    ctx.fillText(shorten(player.name, 28), 178, y + 32);

    ctx.fillStyle = '#c4b5fd';
    ctx.font = 'bold 21px Sans';
    ctx.fillText(String(player.level), 650, y + 32);

    ctx.fillStyle = '#67e8f9';
    ctx.fillText(String(player.wins), 790, y + 32);

    ctx.fillStyle = '#f9a8d4';
    ctx.fillText(String(player.bestStreak), 930, y + 32);

    ctx.fillStyle = '#fde68a';
    ctx.fillText(String(player.xp), 1055, y + 32);
  });

  const footerY = height - 72;
  ctx.fillStyle = 'rgba(255,255,255,0.80)';
  ctx.font = '21px Sans';
  ctx.fillText('Menangkan game untuk mendapatkan XP, koin, level, dan streak.', 80, footerY);
  ctx.textAlign = 'right';
  ctx.fillText(`Owner: ${BRAND.ownerName}`, width - 80, footerY);
  ctx.textAlign = 'left';

  return canvas.toBuffer('image/png');
}

module.exports = { createLeaderboardCanvas };
