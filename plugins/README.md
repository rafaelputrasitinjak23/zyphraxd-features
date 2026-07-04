# Plugin ZyphraXD

Setiap fitur berada di file plugin terpisah. Folder dapat dibuat bebas karena plugin manager membaca subfolder secara rekursif.

Properti yang tersedia:

- `name`: nama internal plugin.
- `commands`: command dan alias.
- `category`: kategori plugin.
- `run(ctx)`: fungsi utama command.
- `owner`, `group`, `private`, `admin`, `botAdmin`, `premium`: permission.
- `limit`: biaya limit.
- `cooldown`: cooldown dalam milidetik.
- `heavy`: memasukkan proses ke antrean.
- `requiresText`, `requiresMedia`, `requiresQuoted`: mencegah pengurangan limit saat input belum lengkap.
- `onMessage(ctx)`: hook pesan tanpa command, digunakan oleh console owner.

Jangan membuat dua plugin dengan alias command yang sama. `npm run check` akan mendeteksi duplikasi dan plugin yang gagal dimuat.
