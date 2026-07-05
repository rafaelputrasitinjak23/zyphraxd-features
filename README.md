# ZyphraXD Features

Package ini berisi fitur, plugin, middleware, utility, dan dispatcher `case.js` untuk bot WhatsApp ZyphraXD.

## Cara pakai dari bot utama

```js
const caseHandler = require("zyphraxd-features/case");
```

Atau jika dependency dipasang dari GitHub:

```json
{
  "dependencies": {
    "zyphraxd-features": "github:USERNAME/zyphraxd-features"
  }
}
```

## Runtime path

Package ini membaca/menulis data runtime ke root project bot utama, bukan ke folder package. Default root adalah `process.cwd()`.

Bisa dioverride dengan environment variable:

```bash
ZYPHRA_ROOT_DIR=/path/to/main-bot
```

Folder runtime yang perlu ada di bot utama:

```txt
data/
tmp/
logs/
backups/
session/
jadibot-sessions/
```

## Catatan keamanan

Jangan upload file runtime seperti `data/*.json`, session, logs, tmp, backup, atau `.env` ke GitHub publik.

## Fitur registrasi

User baru wajib daftar sebelum memakai fitur bot umum.

Format:

```txt
.daftar nama,umur
```

Contoh:

```txt
.daftar Rafael,18
```

Bot akan mengirim gambar captcha. User cukup mengetik kode pada gambar tanpa command. Jika kode benar, akun tersimpan sebagai user terdaftar.

Setiap command yang berhasil dijalankan oleh user terdaftar akan menambah EXP. Saat EXP mencapai batas level berikutnya, level naik dan user mendapat bonus limit.
