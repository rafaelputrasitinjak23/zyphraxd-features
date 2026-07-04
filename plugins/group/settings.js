const { parseToggle } = require("../../lib/groupPluginUtils");

const SETTING_MAP = {
  welcome: "welcome",
  goodbye: "goodbye",
  antilink: "antiLink",
  antispam: "antiSpam",
  antitoxic: "antiToxic",
  mute: "muted"
};

module.exports = {
  name: "group-settings",
  commands: Object.keys(SETTING_MAP),
  category: "group",
  group: true,
  admin: true,
  limit: 0,
  cooldown: 1500,
  async run(ctx) {
    const { command, args, prefix, m, database } = ctx;
    const value = parseToggle(args[0]);
    if (value === null) return m.reply(`Gunakan: ${prefix + command} on/off`);
    database.updateGroup(m.chat, { [SETTING_MAP[command]]: value });
    return m.reply(`${command} berhasil ${value ? "diaktifkan" : "dinonaktifkan"}.`);
  }
};
