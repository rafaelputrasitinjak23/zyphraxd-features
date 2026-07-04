const queue = require("../../lib/taskQueue");

module.exports = {
  name: "queue-management",
  commands: ["queue", "cancelqueue"],
  category: "system",
  limit: 0,
  cooldown: 1500,
  async run({ command, m }) {
    if (command === "cancelqueue") {
      const removed = queue.cancelPendingByUser(m.sender);
      return m.reply(`${removed} proses yang masih mengantre berhasil dibatalkan.`);
    }
    const status = queue.status();
    return m.reply(`Status Antrean

Aktif     : ${status.active}/${status.concurrency}
Menunggu  : ${status.pending}/${status.maxPending}
Selesai   : ${status.completed}
Gagal     : ${status.failed}`);
  }
};
