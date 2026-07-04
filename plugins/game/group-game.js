const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { runtimePath } = require('../../lib/paths');
const {
  generateWAMessageFromContent,
  generateWAMessageContent,
  proto
} = require('@whiskeysockets/baileys');
const { createLeaderboardCanvas } = require('../../lib/gameLeaderboardCanvas');
const { BRAND } = require('../../lib/branding');
const { THUMBNAILS } = require('../../lib/thumbnails');

const DATA_DIR = runtimePath('data');
const DATA_FILE = runtimePath('data', 'group-games.json');
const GAME_DURATION_MS = 60 * 1000;
const ANSWER_COOLDOWN_MS = 900;
const MAX_ATTEMPTS_PER_PLAYER = 15;

const activeGames = new Map();
const answerCooldowns = new Map();
let saveQueue = Promise.resolve();

const WORDS = [
  { word: 'komputer', hint: 'Perangkat elektronik untuk mengolah data' },
  { word: 'internet', hint: 'Jaringan global yang menghubungkan perangkat' },
  { word: 'pertanian', hint: 'Bidang yang mempelajari budidaya tanaman' },
  { word: 'matahari', hint: 'Bintang pusat tata surya' },
  { word: 'universitas', hint: 'Tempat pendidikan tinggi' },
  { word: 'indonesia', hint: 'Negara kepulauan di Asia Tenggara' },
  { word: 'teknologi', hint: 'Penerapan ilmu untuk memudahkan kehidupan' },
  { word: 'fotografi', hint: 'Seni mengambil gambar menggunakan kamera' },
  { word: 'persahabatan', hint: 'Hubungan dekat antara teman' },
  { word: 'lingkungan', hint: 'Segala sesuatu di sekitar makhluk hidup' },
  { word: 'kreativitas', hint: 'Kemampuan menghasilkan ide baru' },
  { word: 'komunikasi', hint: 'Proses menyampaikan informasi' },
  { word: 'petualangan', hint: 'Pengalaman menarik dan menantang' },
  { word: 'kesehatan', hint: 'Keadaan tubuh dan pikiran yang baik' },
  { word: 'pendidikan', hint: 'Proses memperoleh ilmu dan keterampilan' },
  { word: 'kebudayaan', hint: 'Hasil cipta, rasa, dan karsa masyarakat' }
];

const TRIVIA = [
  { q: 'Apa ibu kota Indonesia?', answers: ['jakarta'], hint: 'Berada di Pulau Jawa' },
  { q: 'Planet terbesar dalam tata surya?', answers: ['jupiter'], hint: 'Namanya berasal dari dewa Romawi' },
  { q: 'Hewan tercepat di darat?', answers: ['cheetah', 'citah'], hint: 'Kucing besar berbintik' },
  { q: 'Berapa jumlah hari dalam satu tahun biasa?', answers: ['365', 'tiga ratus enam puluh lima'], hint: 'Bukan tahun kabisat' },
  { q: 'Siapa pencipta lampu pijar yang paling dikenal?', answers: ['thomas alva edison', 'thomas edison', 'edison'], hint: 'Nama belakangnya Edison' },
  { q: 'Samudra terbesar di dunia?', answers: ['pasifik', 'samudra pasifik'], hint: 'Terletak di antara Asia dan Amerika' },
  { q: 'Rumus kimia air?', answers: ['h2o'], hint: 'Terdiri dari hidrogen dan oksigen' },
  { q: 'Gunung tertinggi di dunia?', answers: ['everest', 'gunung everest'], hint: 'Berada di Himalaya' },
  { q: 'Bahasa pemrograman yang berjalan di browser?', answers: ['javascript', 'java script'], hint: 'Sering disingkat JS' },
  { q: 'Benua terluas di dunia?', answers: ['asia', 'benua asia'], hint: 'Indonesia berada di benua ini' },
  { q: 'Organ tumbuhan tempat fotosintesis paling utama?', answers: ['daun'], hint: 'Biasanya berwarna hijau' },
  { q: 'Satuan arus listrik dalam SI?', answers: ['ampere', 'amper'], hint: 'Disimbolkan dengan A' },
  { q: 'Negara yang terkenal dengan Menara Eiffel?', answers: ['prancis', 'france'], hint: 'Ibu kotanya Paris' },
  { q: 'Hasil 12 x 12?', answers: ['144', 'seratus empat puluh empat'], hint: 'Lebih dari 140' },
  { q: 'Nama satelit alami Bumi?', answers: ['bulan'], hint: 'Terlihat pada malam hari' }
];

function defaultData() {
  return {
    version: 1,
    groups: {}
  };
}

function loadData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    const initial = defaultData();
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return {
      ...defaultData(),
      ...parsed,
      groups: parsed.groups && typeof parsed.groups === 'object' ? parsed.groups : {}
    };
  } catch (error) {
    try {
      fs.copyFileSync(DATA_FILE, `${DATA_FILE}.corrupt-${Date.now()}`);
    } catch {}
    console.error('Database game rusak, membuat database baru:', error.message);
    return defaultData();
  }
}

const data = loadData();

function saveData() {
  const snapshot = JSON.stringify(data, null, 2);
  saveQueue = saveQueue
    .catch(() => {})
    .then(async () => {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const temporary = `${DATA_FILE}.${process.pid}.tmp`;
      await fs.promises.writeFile(temporary, snapshot);
      await fs.promises.rename(temporary, DATA_FILE);
    });
  return saveQueue;
}

function normalizeJid(value) {
  const raw = String(value || '');
  const number = raw.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
  return number ? `${number}@s.whatsapp.net` : raw;
}

function normalizeAnswer(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levelFromXp(xp) {
  return Math.max(1, Math.floor(Math.sqrt(Math.max(0, Number(xp) || 0) / 100)) + 1);
}

function xpForNextLevel(level) {
  return Math.max(100, Math.pow(Math.max(1, level), 2) * 100);
}

function getGroupRecord(groupJid, groupName = 'Grup') {
  if (!data.groups[groupJid]) {
    data.groups[groupJid] = {
      jid: groupJid,
      name: groupName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      players: {}
    };
  }
  const group = data.groups[groupJid];
  group.name = groupName || group.name || 'Grup';
  group.updatedAt = new Date().toISOString();
  return group;
}

function getPlayer(groupJid, userJid, name = 'Player', groupName = 'Grup') {
  const group = getGroupRecord(groupJid, groupName);
  const jid = normalizeJid(userJid);
  if (!group.players[jid]) {
    group.players[jid] = {
      jid,
      name,
      xp: 0,
      coins: 0,
      wins: 0,
      attempts: 0,
      wrong: 0,
      streak: 0,
      bestStreak: 0,
      gamesStarted: 0,
      lastPlayedAt: null,
      lastWinAt: null
    };
  }
  const player = group.players[jid];
  player.name = String(name || player.name || 'Player').slice(0, 80);
  return player;
}

function sortedPlayers(groupJid) {
  const group = data.groups[groupJid];
  if (!group) return [];
  return Object.values(group.players || {})
    .map((player) => ({
      ...player,
      level: levelFromXp(player.xp)
    }))
    .sort((a, b) =>
      Number(b.xp || 0) - Number(a.xp || 0) ||
      Number(b.wins || 0) - Number(a.wins || 0) ||
      Number(b.bestStreak || 0) - Number(a.bestStreak || 0)
    );
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffleWord(word) {
  const original = word.split('');
  let result = original.slice();
  let attempts = 0;
  while (result.join('') === word && attempts < 20) {
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    attempts += 1;
  }
  return result.join('');
}

function createMathGame() {
  const operations = ['+', '-', '×'];
  const operation = randomItem(operations);
  let a;
  let b;
  let answer;

  if (operation === '×') {
    a = Math.floor(Math.random() * 16) + 3;
    b = Math.floor(Math.random() * 13) + 2;
    answer = a * b;
  } else if (operation === '-') {
    a = Math.floor(Math.random() * 90) + 20;
    b = Math.floor(Math.random() * a) + 1;
    answer = a - b;
  } else {
    a = Math.floor(Math.random() * 100) + 10;
    b = Math.floor(Math.random() * 100) + 10;
    answer = a + b;
  }

  return {
    type: 'math',
    title: '🧮 Matematika Cepat',
    question: `Berapa hasil dari *${a} ${operation} ${b}*?`,
    answers: [String(answer)],
    hint: `Jawabannya adalah angka ${answer % 2 === 0 ? 'genap' : 'ganjil'}.`,
    baseReward: operation === '×' ? 45 : 35
  };
}

function createWordGame() {
  const selected = randomItem(WORDS);
  return {
    type: 'susunkata',
    title: '🔤 Susun Kata',
    question: `Susun huruf berikut menjadi kata yang benar:\n\n*${shuffleWord(selected.word).toUpperCase()}*`,
    answers: [selected.word],
    hint: selected.hint,
    baseReward: 45
  };
}

function createTriviaGame() {
  const selected = randomItem(TRIVIA);
  return {
    type: 'kuis',
    title: '🧠 Kuis Pengetahuan',
    question: selected.q,
    answers: selected.answers,
    hint: selected.hint,
    baseReward: 50
  };
}

function createNumberGame() {
  const answer = Math.floor(Math.random() * 50) + 1;
  return {
    type: 'angka',
    title: '🎯 Tebak Angka',
    question: 'Tebak satu angka rahasia dari *1 sampai 50*.',
    answers: [String(answer)],
    hint: `Angkanya ${answer <= 25 ? 'berada di antara 1–25' : 'berada di antara 26–50'}.`,
    baseReward: 40,
    numberAnswer: answer
  };
}

function buildGame(type) {
  const normalized = String(type || '').toLowerCase();
  if (['math', 'matematika', 'hitung'].includes(normalized)) return createMathGame();
  if (['susunkata', 'kata', 'word'].includes(normalized)) return createWordGame();
  if (['kuis', 'trivia'].includes(normalized)) return createTriviaGame();
  if (['angka', 'tebakangka', 'number'].includes(normalized)) return createNumberGame();
  return null;
}

function gameTypeLabel(type) {
  return {
    math: 'Matematika Cepat',
    susunkata: 'Susun Kata',
    kuis: 'Kuis Pengetahuan',
    angka: 'Tebak Angka'
  }[type] || type;
}

async function sendGameList(Rafael, m, prefix) {
  const listPayload = {
    title: 'Pilih Game',
    sections: [
      {
        title: 'Mini Game Grup',
        highlight_label: 'Pilih salah satu',
        rows: [
          {
            header: 'Matematika',
            title: 'Matematika Cepat',
            description: 'Jawab perhitungan sebelum waktu habis',
            id: `${prefix}game math`
          },
          {
            header: 'Susun Kata',
            title: 'Susun Kata Acak',
            description: 'Susun huruf menjadi kata yang benar',
            id: `${prefix}game susunkata`
          },
          {
            header: 'Kuis',
            title: 'Kuis Pengetahuan',
            description: 'Jawab pertanyaan pengetahuan umum',
            id: `${prefix}game kuis`
          },
          {
            header: 'Tebak Angka',
            title: 'Angka 1 sampai 50',
            description: 'Tebak angka rahasia secepat mungkin',
            id: `${prefix}game angka`
          }
        ]
      },
      {
        title: 'Peringkat Grup',
        rows: [
          {
            header: 'Leaderboard',
            title: 'Top Pemain Grup',
            description: 'Lihat 10 pemain terbaik dalam bentuk canvas',
            id: `${prefix}leaderboard`
          },
          {
            header: 'Rank Saya',
            title: 'Statistik Pribadi',
            description: 'Lihat XP, koin, level, dan posisi kamu',
            id: `${prefix}rank`
          }
        ]
      }
    ]
  };

  let header = {
    title: 'Game & Leaderboard',
    subtitle: BRAND.botName,
    hasMediaAttachment: false
  };

  try {
    const imageMessage = await generateWAMessageContent(
      { image: { url: THUMBNAILS.GAME_MENU } },
      { upload: Rafael.waUploadToServer }
    );

    header = {
      hasMediaAttachment: true,
      imageMessage: imageMessage.imageMessage
    };
  } catch {}

  const interactiveMessage = proto.Message.InteractiveMessage.create({
    body: proto.Message.InteractiveMessage.Body.create({
      text: [
        '🎮 *ZYPHRAXD GROUP GAMES*',
        '',
        'Pilih game dari list di bawah.',
        'Jawaban dikirim langsung sebagai chat biasa di grup.',
        '',
        'Command tambahan:',
        `• ${prefix}hintgame`,
        `• ${prefix}stopgame`,
        `• ${prefix}rank`,
        `• ${prefix}leaderboard`
      ].join('\n')
    }),
    footer: proto.Message.InteractiveMessage.Footer.create({
      text: `${BRAND.botName} • Group Games`
    }),
    header: proto.Message.InteractiveMessage.Header.create(header),
    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
      buttons: [
        {
          name: 'single_select',
          buttonParamsJson: JSON.stringify(listPayload)
        }
      ]
    })
  });

  const message = generateWAMessageFromContent(
    m.chat,
    {
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2
          },
          interactiveMessage
        }
      }
    },
    { quoted: m }
  );

  await Rafael.relayMessage(m.chat, message.message, {
    messageId: message.key.id
  });
}

function clearGame(groupJid) {
  const game = activeGames.get(groupJid);
  if (game?.timer) clearTimeout(game.timer);
  activeGames.delete(groupJid);
}

async function expireGame(Rafael, groupJid, gameId) {
  const game = activeGames.get(groupJid);
  if (!game || game.id !== gameId) return;
  clearGame(groupJid);
  await Rafael.sendMessage(groupJid, {
    text: [
      '⌛ *WAKTU HABIS!*',
      '',
      `Game: ${gameTypeLabel(game.type)}`,
      `Jawaban: *${game.answers[0]}*`,
      '',
      'Ketik *.game* untuk bermain lagi.'
    ].join('\n')
  }).catch(() => {});
}

async function startGame(ctx, type) {
  const { Rafael, m, sender, pushname, groupMetadata } = ctx;
  if (activeGames.has(m.chat)) {
    const active = activeGames.get(m.chat);
    return m.reply(
      `Masih ada game *${gameTypeLabel(active.type)}* yang aktif.\n` +
      'Jawab game tersebut atau gunakan *.stopgame*.'
    );
  }

  const generated = buildGame(type);
  if (!generated) {
    return m.reply('Jenis game tidak tersedia. Ketik *.game* untuk membuka pilihan game.');
  }

  const game = {
    ...generated,
    id: crypto.randomBytes(6).toString('hex'),
    groupJid: m.chat,
    groupName: groupMetadata?.subject || 'Grup',
    starter: normalizeJid(sender),
    starterName: pushname,
    createdAt: Date.now(),
    expiresAt: Date.now() + GAME_DURATION_MS,
    hintUsed: false,
    attempts: new Map(),
    timer: null
  };

  game.timer = setTimeout(() => {
    expireGame(Rafael, m.chat, game.id).catch(console.error);
  }, GAME_DURATION_MS);
  game.timer.unref?.();
  activeGames.set(m.chat, game);

  const starter = getPlayer(m.chat, sender, pushname, game.groupName);
  starter.gamesStarted = Number(starter.gamesStarted || 0) + 1;
  starter.lastPlayedAt = new Date().toISOString();
  await saveData();

  return Rafael.sendMessage(m.chat, {
    text: [
      `${game.title}`,
      '',
      game.question,
      '',
      '⏱️ Waktu: *60 detik*',
      `🎁 Hadiah dasar: *${game.baseReward} XP*`,
      `👤 Dimulai oleh: @${normalizeJid(sender).split('@')[0]}`,
      '',
      'Kirim jawaban langsung sebagai pesan biasa.',
      'Gunakan *.hintgame* jika membutuhkan petunjuk.'
    ].join('\n'),
    mentions: [normalizeJid(sender)]
  }, { quoted: m });
}

async function answerGame(ctx, game, answerText) {
  const { Rafael, m, sender, pushname, groupMetadata } = ctx;
  const senderJid = normalizeJid(sender);
  const cooldownKey = `${m.chat}:${senderJid}`;
  const now = Date.now();
  const last = answerCooldowns.get(cooldownKey) || 0;
  if (now - last < ANSWER_COOLDOWN_MS) return true;
  answerCooldowns.set(cooldownKey, now);

  const attempts = Number(game.attempts.get(senderJid) || 0);
  if (attempts >= MAX_ATTEMPTS_PER_PLAYER) return true;
  game.attempts.set(senderJid, attempts + 1);

  const normalized = normalizeAnswer(answerText);
  if (!normalized || normalized.length > 80) return false;

  const validAnswers = game.answers.map(normalizeAnswer);
  const isCorrect = validAnswers.includes(normalized);

  if (!isCorrect) {
    const player = getPlayer(m.chat, senderJid, pushname, groupMetadata?.subject || game.groupName);
    player.attempts = Number(player.attempts || 0) + 1;
    player.wrong = Number(player.wrong || 0) + 1;
    player.streak = 0;
    player.lastPlayedAt = new Date().toISOString();
    saveData().catch(() => {});

    if (game.type === 'angka' && /^\d+$/.test(normalized)) {
      const guessed = Number(normalized);
      if (guessed >= 1 && guessed <= 50) {
        const direction = guessed < game.numberAnswer ? 'terlalu kecil' : 'terlalu besar';
        await Rafael.sendMessage(m.chat, {
          text: `@${senderJid.split('@')[0]} tebakanmu *${direction}* 📉`,
          mentions: [senderJid]
        }, { quoted: m }).catch(() => {});
      }
    }
    return true;
  }

  const remainingSeconds = Math.max(0, Math.floor((game.expiresAt - now) / 1000));
  const oldPlayer = getPlayer(m.chat, senderJid, pushname, groupMetadata?.subject || game.groupName);
  const oldLevel = levelFromXp(oldPlayer.xp);
  oldPlayer.streak = Number(oldPlayer.streak || 0) + 1;
  oldPlayer.bestStreak = Math.max(Number(oldPlayer.bestStreak || 0), oldPlayer.streak);

  const timeBonus = Math.floor(remainingSeconds / 3);
  const streakBonus = Math.min(30, oldPlayer.streak * 3);
  const hintPenalty = game.hintUsed ? 10 : 0;
  const rewardXp = Math.max(10, game.baseReward + timeBonus + streakBonus - hintPenalty);
  const rewardCoins = Math.max(5, Math.floor(rewardXp / 2));

  oldPlayer.xp = Number(oldPlayer.xp || 0) + rewardXp;
  oldPlayer.coins = Number(oldPlayer.coins || 0) + rewardCoins;
  oldPlayer.wins = Number(oldPlayer.wins || 0) + 1;
  oldPlayer.attempts = Number(oldPlayer.attempts || 0) + 1;
  oldPlayer.lastPlayedAt = new Date().toISOString();
  oldPlayer.lastWinAt = new Date().toISOString();
  const newLevel = levelFromXp(oldPlayer.xp);

  clearGame(m.chat);
  await saveData();

  const leaderboard = sortedPlayers(m.chat);
  const rank = leaderboard.findIndex((item) => item.jid === senderJid) + 1;
  const levelUp = newLevel > oldLevel
    ? `\n🎊 *LEVEL UP!* ${oldLevel} ➜ ${newLevel}`
    : '';

  await Rafael.sendMessage(m.chat, {
    text: [
      '🎉 *JAWABAN BENAR!*',
      '',
      `Pemenang: @${senderJid.split('@')[0]}`,
      `Jawaban: *${game.answers[0]}*`,
      `Waktu tersisa: ${remainingSeconds} detik`,
      '',
      `+${rewardXp} XP`,
      `+${rewardCoins} Koin`,
      `🔥 Streak: ${oldPlayer.streak}`,
      `⭐ Level: ${newLevel}`,
      `🏆 Rank grup: #${rank}`,
      levelUp,
      '',
      'Ketik *.game* untuk memulai permainan baru.'
    ].filter(Boolean).join('\n'),
    mentions: [senderJid]
  }, { quoted: m });

  return true;
}

async function showLeaderboard(ctx) {
  const { Rafael, m, groupMetadata } = ctx;
  const players = sortedPlayers(m.chat);
  const generatedAt = new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const image = createLeaderboardCanvas({
    groupName: groupMetadata?.subject || data.groups[m.chat]?.name || 'Grup',
    players,
    generatedAt
  });

  const mentions = players.slice(0, 3).map((player) => player.jid);
  const podium = players.slice(0, 3).map((player, index) =>
    `${['🥇', '🥈', '🥉'][index]} @${player.jid.split('@')[0]} — ${player.xp} XP`
  ).join('\n');

  return Rafael.sendMessage(m.chat, {
    image,
    caption: [
      `🏆 *LEADERBOARD ${groupMetadata?.subject || 'GRUP'}*`,
      '',
      podium || 'Belum ada pemain. Mulai dengan .game',
      '',
      `Total pemain: ${players.length}`,
      `Bot: ${BRAND.botName}`
    ].join('\n'),
    mentions
  }, { quoted: m });
}

async function showRank(ctx) {
  const { Rafael, m, sender, pushname, groupMetadata } = ctx;
  const senderJid = normalizeJid(sender);
  const player = getPlayer(m.chat, senderJid, pushname, groupMetadata?.subject || 'Grup');
  const leaderboard = sortedPlayers(m.chat);
  const rank = leaderboard.findIndex((item) => item.jid === senderJid) + 1;
  const level = levelFromXp(player.xp);
  const nextTarget = xpForNextLevel(level);
  await saveData();

  return Rafael.sendMessage(m.chat, {
    text: [
      '🎮 *GAME PROFILE*',
      '',
      `👤 Pemain: @${senderJid.split('@')[0]}`,
      `🏆 Rank grup: #${rank || leaderboard.length + 1}`,
      `⭐ Level: ${level}`,
      `✨ XP: ${player.xp}/${nextTarget}`,
      `🪙 Koin: ${player.coins}`,
      `🥇 Menang: ${player.wins}`,
      `🎯 Percobaan: ${player.attempts}`,
      `❌ Salah: ${player.wrong}`,
      `🔥 Streak: ${player.streak}`,
      `💥 Best streak: ${player.bestStreak}`
    ].join('\n'),
    mentions: [senderJid]
  }, { quoted: m });
}

module.exports = {
  name: 'group-games',
  commands: [
    'game',
    'games',
    'gamemenu',
    'hintgame',
    'stopgame',
    'leaderboard',
    'topgame',
    'rank',
    'gameprofile',
    'resetleaderboard'
  ],
  category: 'game',
  description: 'Mini game, XP, level, streak, dan leaderboard grup',
  group: true,
  limit: 0,
  cooldown: 1200,

  async run(ctx) {
    const {
      Rafael,
      m,
      command,
      args,
      prefix,
      sender,
      isAdmin,
      isCreator,
      groupMetadata
    } = ctx;

    if (['game', 'games', 'gamemenu'].includes(command)) {
      if (!args[0]) return sendGameList(Rafael, m, prefix);
      return startGame(ctx, args[0]);
    }

    if (command === 'hintgame') {
      const game = activeGames.get(m.chat);
      if (!game) return m.reply('Tidak ada game yang sedang aktif. Ketik *.game* untuk memulai.');
      if (game.hintUsed) return m.reply('Petunjuk untuk game ini sudah digunakan.');
      game.hintUsed = true;
      return m.reply(`💡 *PETUNJUK*\n\n${game.hint}\n\nHadiah akan dikurangi 10 XP.`);
    }

    if (command === 'stopgame') {
      const game = activeGames.get(m.chat);
      if (!game) return m.reply('Tidak ada game yang sedang aktif.');
      const senderJid = normalizeJid(sender);
      if (!isCreator && !isAdmin && game.starter !== senderJid) {
        return m.reply('Hanya pembuat game, admin, atau owner yang dapat menghentikan game.');
      }
      clearGame(m.chat);
      return Rafael.sendMessage(m.chat, {
        text: [
          '🛑 *GAME DIHENTIKAN*',
          '',
          `Game: ${gameTypeLabel(game.type)}`,
          `Jawaban: *${game.answers[0]}*`,
          `Dihentikan oleh: @${senderJid.split('@')[0]}`
        ].join('\n'),
        mentions: [senderJid]
      }, { quoted: m });
    }

    if (['leaderboard', 'topgame'].includes(command)) {
      return showLeaderboard(ctx);
    }

    if (['rank', 'gameprofile'].includes(command)) {
      return showRank(ctx);
    }

    if (command === 'resetleaderboard') {
      if (!isCreator && !isAdmin) {
        return m.reply('Hanya admin grup atau owner yang dapat mereset leaderboard.');
      }
      if (args[0] !== '--confirm') {
        return m.reply(`Perintah ini akan menghapus semua statistik game grup.\n\nGunakan: ${prefix}resetleaderboard --confirm`);
      }
      data.groups[m.chat] = {
        jid: m.chat,
        name: groupMetadata?.subject || 'Grup',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        players: {}
      };
      clearGame(m.chat);
      await saveData();
      return m.reply('Leaderboard dan seluruh statistik game grup berhasil direset.');
    }
  },

  async onMessage(ctx) {
    const {
      m,
      body,
      isGroup,
      isCmd
    } = ctx;

    if (!isGroup || isCmd || m.key?.fromMe) return false;
    const game = activeGames.get(m.chat);
    if (!game) return false;

    const answer = String(body || '').trim();
    if (!answer || answer.length > 100) return false;

    return answerGame(ctx, game, answer);
  }
};
