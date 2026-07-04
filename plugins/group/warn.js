const { targetFromContext, mentionText } = require("../../lib/groupPluginUtils");

module.exports = {
  name: "group-warning",
  commands: ["warn", "warnings", "resetwarn"],
  category: "group",
  group: true,
  limit: 0,
  cooldown: 1500,
  async run(ctx) {
    const { command, prefix, m, Rafael, database, isAdmin, isCreator, isBotAdmin } = ctx;
    if (["warn", "resetwarn"].includes(command) && !isAdmin && !isCreator) {
      return m.reply("Command ini hanya dapat digunakan oleh admin grup.");
    }
    const target = targetFromContext(ctx);
    if (!target) return m.reply(`Tag atau reply pengguna. Contoh: ${prefix + command} @user`);

    if (command === "warnings") {
      const total = database.getWarning(m.chat, target);
      return Rafael.sendMessage(m.chat, { text: `${mentionText(target)} memiliki ${total}/3 peringatan.`, mentions: [target] }, { quoted: m });
    }
    if (command === "resetwarn") {
      database.resetWarning(m.chat, target);
      return Rafael.sendMessage(m.chat, { text: `Peringatan ${mentionText(target)} berhasil direset.`, mentions: [target] }, { quoted: m });
    }

    const total = database.addWarning(m.chat, target, 1);
    await Rafael.sendMessage(m.chat, { text: `${mentionText(target)} mendapat peringatan (${total}/3).`, mentions: [target] }, { quoted: m });
    if (total >= 3 && isBotAdmin) {
      await Rafael.groupParticipantsUpdate(m.chat, [target], "remove");
      database.resetWarning(m.chat, target);
    }
  }
};
