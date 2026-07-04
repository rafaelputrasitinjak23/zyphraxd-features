const { targetFromContext, parseDuration } = require("../../lib/systemPluginUtils");

module.exports = {
  name: "user-administration",
  commands: ["addpremium", "delpremium", "setlimit", "ban", "unban"],
  category: "system",
  owner: true,
  limit: 0,
  cooldown: 1500,
  async run(ctx) {
    const { command, m, Rafael, args, prefix, database } = ctx;
    const target = targetFromContext(ctx);
    if (!target) return m.reply(`Tag, reply, atau masukkan nomor. Contoh: ${prefix + command} 628xxx`);

    if (command === "addpremium") {
      const durationText = m.mentionedJid?.length || m.quoted
        ? args.find((item) => /^\d+[mhd]$/i.test(item))
        : args[1];
      const duration = parseDuration(durationText || "30d");
      if (!duration) return m.reply("Durasi tidak valid. Gunakan contoh 30d, 12h, atau 60m.");
      const result = database.addPremium(target, duration);
      return Rafael.sendMessage(m.chat, { text: `@${target.split("@")[0]} menjadi premium sampai ${new Date(result.premiumUntil).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}.`, mentions: [target] }, { quoted: m });
    }
    if (command === "delpremium") {
      database.removePremium(target);
      return m.reply("Status premium berhasil dihapus.");
    }
    if (command === "setlimit") {
      const amountText = m.mentionedJid?.length || m.quoted
        ? args.find((item) => /^\d+$/.test(item))
        : args[1];
      const amount = Number(amountText);
      if (!Number.isFinite(amount)) return m.reply(`Contoh: ${prefix + command} @user 100`);
      database.setLimit(target, amount);
      return m.reply(`Limit ${target.split("@")[0]} diatur menjadi ${amount}.`);
    }
    const result = database.setBanned(target, command === "ban", args.slice(1).join(" ") || "Diblokir owner");
    return m.reply(`${result.jid.split("@")[0]} berhasil ${command === "ban" ? "diblokir" : "dibuka blokirnya"}.`);
  }
};
