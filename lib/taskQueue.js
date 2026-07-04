const { EventEmitter } = require("events");

class TaskQueue extends EventEmitter {
  constructor({ concurrency = 2, maxPending = 30, maxPerUser = 2 } = {}) {
    super();
    this.concurrency = concurrency;
    this.maxPending = maxPending;
    this.maxPerUser = maxPerUser;
    this.active = 0;
    this.pending = [];
    this.userCounts = new Map();
    this.completed = 0;
    this.failed = 0;
  }

  enqueue({ userId = "unknown", label = "task" } = {}) {
    const userCount = this.userCounts.get(userId) || 0;
    if (userCount >= this.maxPerUser) {
      const error = new Error("Kamu sudah memiliki terlalu banyak proses aktif atau mengantre.");
      error.code = "QUEUE_USER_LIMIT";
      throw error;
    }
    if (this.pending.length >= this.maxPending) {
      const error = new Error("Antrean bot sedang penuh. Coba kembali setelah beberapa proses selesai.");
      error.code = "QUEUE_FULL";
      throw error;
    }

    this.userCounts.set(userId, userCount + 1);
    let resolveStart;
    let rejectStart;
    const wait = new Promise((resolve, reject) => {
      resolveStart = resolve;
      rejectStart = reject;
    });

    const ticket = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      userId,
      label,
      createdAt: Date.now(),
      resolveStart,
      rejectStart,
      released: false
    };

    this.pending.push(ticket);
    const position = this.active + this.pending.length;
    this.process();
    return { id: ticket.id, position, wait };
  }

  process() {
    while (this.active < this.concurrency && this.pending.length > 0) {
      const ticket = this.pending.shift();
      this.active += 1;
      let released = false;
      const release = (success = true) => {
        if (released) return;
        released = true;
        this.active = Math.max(0, this.active - 1);
        const count = Math.max(0, (this.userCounts.get(ticket.userId) || 1) - 1);
        if (count === 0) this.userCounts.delete(ticket.userId);
        else this.userCounts.set(ticket.userId, count);
        if (success) this.completed += 1;
        else this.failed += 1;
        this.emit("released", ticket);
        this.process();
      };
      ticket.resolveStart(release);
      this.emit("started", ticket);
    }
  }

  cancelPendingByUser(userId) {
    const kept = [];
    let removed = 0;
    for (const ticket of this.pending) {
      if (ticket.userId === userId) {
        removed += 1;
        ticket.rejectStart(new Error("Antrean dibatalkan."));
      } else {
        kept.push(ticket);
      }
    }
    this.pending = kept;
    if (removed > 0) {
      const count = Math.max(0, (this.userCounts.get(userId) || 0) - removed);
      if (count === 0) this.userCounts.delete(userId);
      else this.userCounts.set(userId, count);
    }
    return removed;
  }

  status() {
    return {
      active: this.active,
      pending: this.pending.length,
      concurrency: this.concurrency,
      maxPending: this.maxPending,
      completed: this.completed,
      failed: this.failed
    };
  }
}

module.exports = new TaskQueue({ concurrency: 2, maxPending: 30, maxPerUser: 2 });
module.exports.TaskQueue = TaskQueue;
