const { normalizeJid } = require("../../lib/database");
const { targetFromContext, mentionText } = require("../../lib/groupPluginUtils");

module.exports = {
  name: "group-member-admin",
  commands: ["kick", "promote", "demote"],
  category: "group",
  group: true,
  admin: true,
  botAdmin: true,
  limit: 0,
  cooldown: 1500,
  async run(ctx) {
    const { command, prefix, m, Rafael } = ctx;
    const target = targetFromContext(ctx);
    if (!target) return m.reply(`Tag atau reply pengguna. Contoh: ${prefix + command} @user`);
    if (target === normalizeJid(Rafael.user?.id)) return m.reply("Bot tidak dapat menargetkan dirinya sendiri.");
    const action = command === "kick" ? "remove" : command;
    await Rafael.groupParticipantsUpdate(m.chat, [target], action);
    return Rafael.sendMessage(m.chat, { text: `${mentionText(target)} berhasil di-${command}.`, mentions: [target] }, { quoted: m });
  }
};
