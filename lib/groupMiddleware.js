const { database, normalizeJid } = require("./database");
const { createMemberCard } = require("./canvasCards");
const { BRAND } = require("./branding");

const spamState = new Map();
const TOXIC_WORDS = [
  "anjing", "bangsat", "kontol", "memek", "ngentot", "babi", "tolol", "goblok"
];

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanupSpam() {
  const cutoff = Date.now() - 60_000;
  for (const [key, value] of spamState.entries()) {
    if (!value.length || value[value.length - 1] < cutoff) spamState.delete(key);
  }
}
setInterval(cleanupSpam, 60_000).unref?.();

async function tryDelete(Rafael, m, isBotAdmin) {
  if (!isBotAdmin || !m?.key) return false;
  try {
    await Rafael.sendMessage(m.chat, { delete: m.key });
    return true;
  } catch {
    return false;
  }
}

async function applyWarning({ Rafael, m, reason, isBotAdmin }) {
  const total = database.addWarning(m.chat, m.sender, 1);
  await tryDelete(Rafael, m, isBotAdmin);
  if (total >= 3 && isBotAdmin) {
    try {
      await Rafael.groupParticipantsUpdate(m.chat, [normalizeJid(m.sender)], "remove");
      database.resetWarning(m.chat, m.sender);
      await Rafael.sendMessage(m.chat, {
        text: `@${String(m.sender).split("@")[0]} dikeluarkan setelah mencapai 3 peringatan.
Alasan terakhir: ${reason}`,
        mentions: [m.sender]
      });
      return true;
    } catch {}
  }
  await Rafael.sendMessage(m.chat, {
    text: `Peringatan untuk @${String(m.sender).split("@")[0]} (${total}/3).
Alasan: ${reason}`,
    mentions: [m.sender]
  }).catch(() => {});
  return true;
}

async function processGroupMessage({ Rafael, m, body, isGroup, isAdmin, isBotAdmin, isCreator }) {
  if (!isGroup) return { blocked: false };
  const group = database.getGroup(m.chat);
  if (!group) return { blocked: false };
  if (isAdmin || isCreator || m.fromMe) return { blocked: false, group };

  if (group.muted) return { blocked: true, group, reason: "muted" };

  const text = String(body || "").toLowerCase();
  if (group.antiLink && /(https?:\/\/|chat\.whatsapp\.com\/|wa\.me\/)/i.test(text)) {
    await applyWarning({ Rafael, m, reason: "Mengirim tautan saat anti-link aktif", isBotAdmin });
    return { blocked: true, group, reason: "antilink" };
  }

  if (group.antiToxic && TOXIC_WORDS.some((word) => new RegExp(`\\b${escapeRegex(word)}\\b`, "i").test(text))) {
    await applyWarning({ Rafael, m, reason: "Menggunakan kata yang diblokir", isBotAdmin });
    return { blocked: true, group, reason: "antitoxic" };
  }

  if (group.antiSpam) {
    const key = `${m.chat}:${m.sender}`;
    const now = Date.now();
    const history = (spamState.get(key) || []).filter((time) => now - time <= 10_000);
    history.push(now);
    spamState.set(key, history);
    if (history.length >= 7) {
      spamState.set(key, []);
      await applyWarning({ Rafael, m, reason: "Mengirim terlalu banyak pesan dalam waktu singkat", isBotAdmin });
      return { blocked: true, group, reason: "antispam" };
    }
  }

  return { blocked: false, group };
}

async function handleParticipantUpdate(Rafael, update) {
  const group = database.getGroup(update.id);
  if (!group) return;
  const isWelcome = update.action === "add" && group.welcome;
  const isGoodbye = ["remove", "leave"].includes(update.action) && group.goodbye;
  if (!isWelcome && !isGoodbye) return;

  let metadata;
  try {
    metadata = await Rafael.groupMetadata(update.id);
  } catch {
    metadata = { subject: "Grup", participants: [] };
  }

  const participantsList = Array.isArray(metadata.participants) ? metadata.participants : [];
  const memberCount = participantsList.length;
  const adminCount = participantsList.filter((participant) => participant.admin).length;

  for (const participant of update.participants || []) {
    const template = isWelcome ? group.welcomeText : group.goodbyeText;
    const text = String(template || "")
      .replace(/@user/gi, `@${participant.split("@")[0]}`)
      .replace(/@group/gi, metadata.subject || "Grup");

    let avatarUrl = null;
    try {
      avatarUrl = await Rafael.profilePictureUrl(participant, 'image');
    } catch {}

    const image = await createMemberCard({
      type: isGoodbye ? 'goodbye' : 'welcome',
      avatarUrl,
      name: `@${participant.split('@')[0]}`,
      number: participant.split('@')[0],
      groupName: metadata.subject || 'Grup',
      memberCount,
      adminCount,
      subtitle: isGoodbye ? 'Sampai jumpa lagi, semoga harimu menyenangkan 🌙' : 'Selamat datang, semoga betah bersama kami ✨',
      footerText: isGoodbye ? 'Terima kasih sudah pernah menjadi bagian dari grup ini.' : 'Jangan lupa baca rules dan kenalan dengan member lain ya!'
    });

    await Rafael.sendMessage(update.id, {
      image,
      caption: `${isGoodbye ? '👋 Goodbye' : '🌸 Welcome'}

${text}

• Group: ${metadata.subject || 'Grup'}
• Total Member: ${memberCount}
• Bot: ${BRAND.botName}`,
      mentions: [participant]
    }).catch(async () => {
      await Rafael.sendMessage(update.id, { text, mentions: [participant] }).catch(() => {});
    });
  }
}

module.exports = { processGroupMessage, handleParticipantUpdate, TOXIC_WORDS };
