module.exports = {
  name: "group-rules",
  commands: ["rules"],
  category: "group",
  group: true,
  limit: 0,
  cooldown: 1500,
  async run({ m, group, groupMetadata }) {
    return m.reply(`Peraturan ${groupMetadata?.subject || "Grup"}\n\n${group.rules}`);
  }
};
