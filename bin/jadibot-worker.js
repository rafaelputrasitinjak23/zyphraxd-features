#!/usr/bin/env node
require('dotenv').config();
const jadibotManager = require('../lib/jadibotManager');
const { getCollections } = require('../lib/mongoStore');

const POLL_MS = Number(process.env.JADIBOT_WORKER_POLL_MS || 750);
const CLAIM_MS = Number(process.env.JADIBOT_COMMAND_CLAIM_MS || 120000);
const WORKER_ID = `${process.env.JADIBOT_WORKER_ID || 'worker'}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
let stopped = false;

async function claimNext() {
  const { commands } = await getCollections();
  const now = new Date();
  const stale = new Date(Date.now() - CLAIM_MS);
  return commands.findOneAndUpdate(
    {
      $or: [
        { status: 'pending' },
        { status: 'processing', claimedAt: { $lt: stale } }
      ]
    },
    {
      $set: { status: 'processing', workerId: WORKER_ID, claimedAt: now, updatedAt: now }
    },
    { sort: { createdAt: 1 }, returnDocument: 'after' }
  );
}

async function finish(request, result) {
  const { commands } = await getCollections();
  await commands.updateOne(
    { requestId: request.requestId },
    { $set: { status: 'done', result, updatedAt: new Date() }, $unset: { error: '', claimedAt: '' } }
  );
}

async function fail(request, error) {
  const { commands } = await getCollections();
  await commands.updateOne(
    { requestId: request.requestId },
    { $set: { status: 'error', error: error?.message || String(error), updatedAt: new Date() }, $unset: { claimedAt: '' } }
  );
}

async function processRequest(request) {
  const phoneNumber = request.phoneNumber;
  if (request.type === 'start') {
    return jadibotManager.startSession({
      phoneNumber,
      ownerJid: request.payload?.ownerJid,
      ownerName: request.payload?.ownerName,
      forceNewPairing: Boolean(request.payload?.forceNewPairing),
      requestPairing: request.payload?.requestPairing !== false
    });
  }
  if (request.type === 'stop') {
    await jadibotManager.stopSession(phoneNumber, { deleteSession: false });
    return { phoneNumber, status: 'stopped', message: 'Jadibot dihentikan.' };
  }
  if (request.type === 'delete') {
    await jadibotManager.deleteSession(phoneNumber);
    return { phoneNumber, status: 'deleted', message: 'Session Jadibot dihapus.' };
  }
  throw new Error(`Command tidak dikenal: ${request.type}`);
}

async function loop() {
  while (!stopped) {
    try {
      const request = await claimNext();
      if (!request?.requestId) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        continue;
      }
      try {
        const result = await processRequest(request);
        await finish(request, result);
      } catch (error) {
        console.error(`[JADIBOT WORKER] ${request.type} ${request.phoneNumber}:`, error.message);
        await fail(request, error);
      }
    } catch (error) {
      console.error('[JADIBOT WORKER] Mongo/worker error:', error.message);
      await new Promise((r) => setTimeout(r, Math.max(POLL_MS, 3000)));
    }
  }
}

async function main() {
  await getCollections();
  const restored = await jadibotManager.restoreSavedSessions();
  console.log('[JADIBOT WORKER] restored:', restored);
  await loop();
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => { stopped = true; });
}

main().catch((error) => {
  console.error('[JADIBOT WORKER] fatal:', error);
  process.exit(1);
});
