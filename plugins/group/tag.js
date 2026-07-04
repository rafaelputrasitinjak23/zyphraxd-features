const { mentionText } = require("../../lib/groupPluginUtils");

module.exports = {
  name: "group-tag",
  commands: ["tagall", "hidetag"],
  category: "group",
  group: true,
  admin: true,
  limit: 0,
  cooldown: 1500,
  async run({ command, text, m, Rafael, participants }) {
    const mentions = (participants || [])
      .map((item) => item.phoneNumber || item.id || item.jid || item.lid)
      .filter(Boolean);
    if (!mentions.length) return m.reply("Daftar anggota grup tidak tersedia.");
    const messageText = text || "Pesan untuk seluruh anggota grup.";
    if (command === "hidetag") {
      return Rafael.sendMessage(m.chat, { text: messageText, mentions }, { quoted: m });
    }
    const list = mentions.map((jid, index) => `${index + 1}. ${mentionText(jid)}`).join("\n");
    return Rafael.sendMessage(m.chat, { text: `${messageText}\n\n${list}`, mentions }, { quoted: m });
  }
};
