# ZyphraXD Features - MongoDB Jadibot

Versi ini membuat `lib/jadibotManager.js` menyimpan auth state Baileys dan metadata Jadibot ke MongoDB.

## Environment

`MONGODB_URI`, `MONGODB_DB`, `JADIBOT_MAX_BOTS`.

## Bot induk

Bot induk memanggil `restoreSavedSessions()` setelah koneksi utama terbuka dan menjalankan `startCommandLoop()` untuk menerima command dari API melalui MongoDB.

Tidak perlu worker Jadibot terpisah.
