const queue = require('../../lib/taskQueue');
const cache = require('../../lib/cacheManager');
const { getHealth, formatBytes, formatDuration } = require('../../lib/systemHealth');
const { THUMBNAILS, sendThumbnailMessage } = require('../../lib/thumbnails');

module.exports = {
  name: 'system-health',
  commands: ['health', 'server'],
  category: 'system',
  description: 'Menampilkan status bot dan server',
  limit: 0,
  cooldown: 1500,
  async run({ Rafael, m, database }) {
    const health = await getHealth();
    const queueStatus = queue.status();
    const cacheStatus = cache.stats();
    const stats = database.snapshot().stats;

    const caption = [
      '🤖 *STATUS ZYPHRAXD*',
      '',
      `Node.js       : ${health.node}`,
      `Platform      : ${health.platform}`,
      `Uptime bot    : ${formatDuration(health.processUptime)}`,
      `Uptime server : ${formatDuration(health.systemUptime)}`,
      `RAM proses    : ${formatBytes(health.rss)}`,
      `Heap          : ${formatBytes(health.heapUsed)}/${formatBytes(health.heapTotal)}`,
      `RAM server    : ${formatBytes(health.freeMemory)} bebas / ${formatBytes(health.totalMemory)}`,
      `CPU           : ${health.cpuCount} core`,
      `Load average  : ${health.loadAverage.map((value) => value.toFixed(2)).join(' / ')}`,
      `Temporary     : ${formatBytes(health.tempSize)}`,
      `Backup        : ${formatBytes(health.backupSize)}`,
      `Database      : ${formatBytes(health.dataSize)}`,
      `Queue         : ${queueStatus.active} aktif, ${queueStatus.pending} menunggu`,
      `Cache         : ${cacheStatus.entries} entri`,
      `Pesan         : ${stats.messages}`,
      `Command       : ${stats.commands}`,
      `Error         : ${stats.errors}`
    ].join('\n');

    return sendThumbnailMessage(Rafael, m, THUMBNAILS.STATUS_BOT, caption);
  }
};
