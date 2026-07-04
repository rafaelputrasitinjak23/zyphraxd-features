module.exports = {
  name: "group-custom-text",
  commands: ["setwelcome", "setgoodbye", "setrules"],
  category: "group",
  group: true,
  admin: true,
  limit: 0,
  requiresText: true,
  cooldown: 1500,
  async run({ command, text, prefix, m, database }) {
    if (!text) return m.reply(`Masukkan teks. Contoh: ${prefix + command} Selamat datang @user di @group`);
    const key = command === "setwelcome" ? "welcomeText" : command === "setgoodbye" ? "goodbyeText" : "rules";
    database.updateGroup(m.chat, { [key]: text.slice(0, 4000) });
    return m.reply(`${command} berhasil diperbarui.`);
  }
};
