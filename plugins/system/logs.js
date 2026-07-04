const runtimeLogger = require("../../lib/runtimeLogger");

module.exports = {
  name: "runtime-logs",
  commands: ["logs", "clearlogs"],
  category: "system",
  owner: true,
  limit: 0,
  cooldown: 1500,
  async run({ command, args, m }) {
    if (command === "clearlogs") {
      runtimeLogger.clear();
      return m.reply("Log runtime berhasil dibersihkan.");
    }
    const amount = Math.max(1, Math.min(100, Number(args[0]) || 30));
    const lines = runtimeLogger.getRecent(amount);
    const output = (lines.length ? lines : runtimeLogger.readRecentFile(amount)).join("\n");
    if (!output) return m.reply("Belum ada log runtime.");
    const limited = output.length > 12000 ? output.slice(-12000) : output;
    return m.reply(`Log Runtime Terakhir\n\n${limited}`);
  }
};
