module.exports = {
  name: "group-open-close",
  commands: ["open", "close"],
  category: "group",
  group: true,
  admin: true,
  botAdmin: true,
  limit: 0,
  cooldown: 1500,
  async run({ command, Rafael, m }) {
    await Rafael.groupSettingUpdate(m.chat, command === "open" ? "not_announcement" : "announcement");
    return m.reply(`Grup berhasil ${command === "open" ? "dibuka" : "ditutup"}.`);
  }
};
