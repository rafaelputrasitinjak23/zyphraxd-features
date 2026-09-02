const { MongoClient } = require('mongodb');

let client;
let db;
let promise;

function getMongoConfig() {
  const uri = process.env.MONGODB_URI || "mongodb+srv://putraarafael333:ZTpVC4DULeNZNzRa@cluster0.e8upk9f.mongodb.net/zyphra_db?retryWrites=true&w=majority";
  const dbName = process.env.MONGODB_DB || 'zyphra';
  if (!uri) throw new Error('MONGODB_URI belum diatur.');
  return { uri, dbName };
}

async function getDb() {
  if (db) return db;
  if (promise) return promise;
  const { uri, dbName } = getMongoConfig();
  client = new MongoClient(uri, { maxPoolSize: Number(process.env.MONGODB_MAX_POOL || 10) });
  promise = client.connect().then(() => {
    db = client.db(dbName);
    return db;
  }).catch((err) => {
    promise = null;
    throw err;
  });
  return promise;
}

function collections(database) {
  return {
    sessions: database.collection(process.env.MONGODB_JADIBOT_COLLECTION || 'jadibot_sessions'),
    auth: database.collection(process.env.MONGODB_JADIBOT_AUTH_COLLECTION || 'jadibot_auth'),
    commands: database.collection(process.env.MONGODB_JADIBOT_COMMAND_COLLECTION || 'jadibot_commands')
  };
}

async function ensureIndexes() {
  const database = await getDb();
  const c = collections(database);
  await Promise.all([
    c.sessions.createIndex({ phoneNumber: 1 }, { unique: true }),
    c.auth.createIndex({ sessionId: 1, type: 1, key: 1 }, { unique: true }),
    c.commands.createIndex({ status: 1, createdAt: 1 }),
    c.commands.createIndex({ requestId: 1 }, { unique: true })
  ]);
  return database;
}

async function getCollections() {
  const database = await ensureIndexes();
  return collections(database);
}

async function closeMongo() {
  if (client) await client.close();
  client = null;
  db = null;
  promise = null;
}

module.exports = { getDb, getCollections, closeMongo };
