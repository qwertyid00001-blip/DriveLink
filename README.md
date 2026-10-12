# DriveLink backend

Backend Express + SQLite untuk data booking dan operasional DriveLink. Backend
menyajikan file website statis pada origin yang sama dan menyediakan API JSON
di `/api`.

Perubahan yang berhasil melalui API disimpan di database server dan disiarkan ke
perangkat lain melalui Server-Sent Events; halaman aktif memuat ulang data setelah
menerima notifikasi. Semua perangkat harus membuka URL server yang sama. Untuk
akses beda jaringan, server dan tunnel yang mengarah ke server/database yang sama
harus tetap berjalan. Jika koneksi realtime putus lalu tersambung kembali, nomor
revisi server digunakan untuk mendeteksi dan memuat perubahan yang terlewat.

## Struktur folder

- `assets/css/` dan `assets/js/`: aset frontend.
- `pages/`: halaman HTML; server tetap menyediakan halaman pada URL root yang sama.
- `docs/`: dokumen kebutuhan produk.
- `test/`: tes backend.
- `scripts/`: `online.js` (server + tunnel sekali jalan), `share.js` (tunnel saja),
  dan `cloudflared.js` (pencarian binary cloudflared).
- `server.js`, `package.json`, dan berkas konfigurasi tetap di root.
- `data/` menyimpan database lokal; jangan pindahkan atau membagikannya saat server berjalan.

## Menjalankan lokal

1. Gunakan Node.js 22.13 atau lebih baru.
2. Salin `.env.example` ke `.env`, lalu isi password admin minimal 12 karakter
   serta `SESSION_SECRET` acak minimal 32 karakter.
3. Jalankan `npm install`, lalu `npm start`.
4. Buka `http://localhost:<PORT>` sesuai nilai `PORT` di `.env` (default
   `3000` bila tidak diatur). Jangan membuka port lain yang tidak digunakan
   server.

Database otomatis dibuat di `data/drivelink.sqlite`; tiga jenis armada contoh
ditambahkan pada inisialisasi pertama. Kredensial admin dibuat dari environment
ketika database baru dibuat. Simpan cadangan database dan jangan bagikan `.env`.

## Akses sementara dari jaringan lain

Untuk membuka website dari ponsel atau perangkat lain, gunakan **satu perintah**:

```
npm run online
```

Perintah itu menjalankan server dan Cloudflare Quick Tunnel sekaligus, lalu
mencetak URL HTTPS sementara beserta kode QR. Arahkan kamera ponsel ke kode QR,
atau salin URL-nya. Hentikan dengan Ctrl+C untuk menutup tunnel dan server.
Tidak perlu dua terminal lagi.

URL tunnel berlaku dari jaringan mana pun (4G, Wi-Fi lain, kantor), tidak harus
satu Wi-Fi yang sama. Komputer harus tetap menyala dan terhubung ke internet.

Bila hanya perlu akses dari perangkat pada Wi-Fi yang sama, cukup `npm start`
lalu buka `http://<alamat-IP>:3127` yang tercetak di terminal.

### Yang dibutuhkan

`cloudflared` harus terpasang. `npm run online` dan `npm run share` sudah
mencarinya otomatis di lokasi berikut:

1. variabel `CLOUDFLARED_PATH` bila diisi
2. `~/.local/bin/cloudflared`
3. `/opt/homebrew/bin/cloudflared`
4. `/usr/local/bin/cloudflared`
5. `cloudflared` di PATH

### Peringatan keamanan

Tunnel membuat website dapat diakses publik selama aktif. Jangan membagikan URL
secara terbuka; gunakan login admin yang kuat. Halaman admin tetap memerlukan
autentikasi, tetapi halaman pelanggan dan endpoint publik dapat diakses siapa pun
yang memiliki URL. Quick Tunnel tidak menyediakan URL tetap untuk penggunaan
produksi, dan URL baru dibuat setiap kali perintah dijalankan.

### Kalau bermasalah

- **`cloudflared tidak ditemukan`** — pasang Cloudflare Tunnel, lalu ulangi.
- **Server tidak merespons** — `npm run share` memerlukan `npm start` sudah jalan.
- **Tunnel sering putus** — konektivitas ke Cloudflare sedang bermasalah; coba
  lagi. Quick Tunnel tidak punya jaminan uptime.
- **Halaman tidak terbuka di ponsel** — pastikan URL masih aktif (jendela
  terminal tidak ditutup) dan ponsel memakai jaringan seluler, bukan Wi-Fi yang
  sama dengan komputer.

## API utama

- `POST /api/auth/login`, `GET /api/auth/session`, `POST /api/auth/logout`
- Administrator dapat mengelola akun karyawan melalui `GET/POST /api/admin/accounts`
  dan `PUT /api/admin/accounts/:username`.
- Administrator dapat mengubah nama tampilan, username, dan password sendiri melalui
  `PUT /api/admin/settings/profile`; perubahan password memerlukan password saat ini.
- Logo navigasi seluruh website dapat dibaca melalui `GET /api/site-settings/logo`
  dan diatur administrator melalui `GET/PUT /api/admin/settings/logo`. Logo harus
  berupa JPG/PNG maksimal 1 MB; gambar kosong mengembalikan ikon bawaan.
- Tema aksen seluruh website dapat dibaca melalui `GET /api/site-settings/theme`
  dan diubah administrator melalui `PUT /api/admin/settings/theme`; pengaturan
  menyimpan warna utama, warna akhir gradasi, dan arah gradasi.
- Iklan penawaran beranda dapat dibaca publik melalui `GET /api/site-settings/offer`
  dan diatur administrator melalui `PUT /api/admin/settings/offer`.
- Label, judul, deskripsi, dan efek animasi judul beranda dapat dibaca publik melalui
  `GET /api/site-settings/home-hero` serta diatur administrator melalui
  `GET/PUT /api/admin/settings/home-hero`. Efek dibatasi ke pilihan bawaan, termasuk
  tampilan diam, muncul, geser, mesin ketik, dan teks berjalan.
- Poster gambar A4 beranda dapat dibaca publik melalui `GET /api/site-settings/home-banner`
  dan diatur administrator melalui `GET/PUT /api/admin/settings/home-banner`.
  Poster harus berupa JPG/PNG maksimal 3 MB; perubahan memerlukan sesi administrator.
- Judul kolom kontak, telepon, email, WhatsApp, serta tautan profil media sosial di footer
  dapat dibaca publik melalui `GET /api/site-settings/contact` dan diatur administrator
  melalui `GET/PUT /api/admin/settings/contact`. Tautan sosial dibatasi ke domain HTTPS
  resmi dari Instagram, Facebook, TikTok, YouTube, X, dan WhatsApp; ikon logo mengikuti
  platform yang dipilih.
- Penilaian pelanggan dapat dibaca publik melalui `GET /api/reviews` dan dikirim
  melalui `POST /api/reviews` (nama, rating 1–5, dan ulasan; langsung tampil).
  Tautan ulasan Google Maps dibaca melalui `GET /api/site-settings/review-link`
  dan dikelola bersama lokasi melalui `PUT /api/admin/location`.
- `GET /api/fleet`, `GET /api/fleet-categories`, `POST /api/bookings`
- `GET /api/bookings/:id?phone=...`
- `POST /api/bookings/:id/payment`
- `POST /api/bookings/:id/handover`
- `GET /api/payment-settings`, `GET /api/location`
- Admin (memerlukan sesi): `GET /api/admin/summary`, `GET /api/admin/bookings`,
  `PATCH /api/admin/bookings/:id/approval`,
  `PATCH /api/admin/bookings/:id/payment`,
  `PATCH /api/admin/bookings/:id/handover`,
  `GET/POST /api/admin/fleet`, `PUT /api/admin/fleet/:id`,
  `GET/POST /api/admin/fleet/physical-units`,
  `PUT/DELETE /api/admin/fleet/physical-units/:plate`,
  `DELETE /api/admin/fleet/:id`,
  `GET /api/admin/fleet/deletion-requests`,
  `PATCH /api/admin/fleet/deletion-requests/:id`,
  spesifikasi armada mencakup jumlah kursi per model, sedangkan transmisi dan warna
  tersimpan per plat kendaraan serta ditampilkan mengikuti unit yang tersedia,
  penghapusan model maupun unit fisik diajukan dengan alasan dan menunggu persetujuan
  admin utama; daftar permintaan menyimpan snapshot kendaraan/plat dan alasan, dan
  model yang disetujui langsung disembunyikan dari pelanggan. Jika masih ada booking
  aktif, unit terpesan dipertahankan sementara dan dibersihkan setelah booking selesai,
  `GET /api/travel-offers`, `GET /api/admin/travel-offers`,
  `POST/PUT/DELETE /api/admin/travel-packages`,
  `POST/PUT/DELETE /api/admin/travel-promotions`,
  `GET/PUT /api/admin/payment-settings`, dan `PUT /api/admin/location`.
- Admin dengan izin **Atur checklist** dapat mengelola kategori kendaraan melalui
  `GET/POST /api/admin/fleet-categories`, `PUT/DELETE /api/admin/fleet-categories/:category`.
- Ringkasan admin mengambil metrik dan data grafik dari `GET /api/admin/overview`:
  pendapatan dihitung dari booking dengan pembayaran terkonfirmasi berdasarkan waktu
  konfirmasi, grafik pendapatan menampilkan tujuh hari terakhir, dan grafik tipe
  kendaraan menghitung rental yang mulai berjalan pada periode yang sama.
- Admin dengan izin **Kontrol unit & servis** dapat melihat kategori melalui
  `GET /api/admin/vehicle-service-categories` dan menyimpan rincian pekerjaan/part,
  kategori, catatan, serta biaya per rincian melalui `POST /api/admin/vehicle-services`.
  Unit fisik didaftarkan pada Armada melalui `GET/POST /api/admin/fleet/physical-units`
  (dapat menerima beberapa plat sekaligus) dengan plat, model, warna, dan odometer;
  `PUT /api/admin/fleet/physical-units/:plate` memperbarui warna dan odometer tanpa
  menghapus riwayat servis per plat. Booking menyimpan pilihan warna dan serah-terima
  hanya menawarkan plat yang cocok. Daftar servis menandai unit yang belum memiliki
  riwayat servis.
  Admin dengan izin **Atur checklist** dapat menambah, mengganti nama, dan menghapus
  kategori servis melalui `PUT /api/admin/vehicle-service-categories`; perubahan
  nama mengikuti rincian riwayat dan kategori yang dihapus dialihkan ke kategori aktif
  pertama. Pengeluaran servis pada Ringkasan dijumlahkan dari seluruh riwayat servis.
- Detail satu booking untuk halaman admin dibaca melalui `GET /api/admin/bookings/:id`.
  Daftar `GET /api/admin/bookings` tetap mengembalikan seluruh isi booking, tetapi
  dokumen identitas (base64) tidak lagi disimpan di cache browser: cache lokal hanya
  menyimpan metadata dokumen, sedangkan foto aslinya diambil dari server saat tombol
  detail diklik. Ini menjaga cache tetap di bawah kuota localStorage browser (±5 MiB).
- Pengelolaan foto armada: unggah 2–6 gambar JPG/PNG saat menambah kendaraan atau
  mengganti galeri armada. Foto ditampilkan sebagai slideshow pada kartu armada di
  halaman pelanggan.
- **Seluruh unggah foto dikompresi otomatis di perangkat.** Satu helper bersama
  (`DriveLinkImages.compress` di `assets/js/api-client.js`) dipakai untuk dokumen
  booking, bukti pembayaran, foto armada, nota servis, foto kondisi dan serah-terima,
  logo, poster beranda, serta gambar QRIS. Foto diperkecil lalu kualitas JPEG
  diturunkan berulang kali sampai ukurannya di bawah batas server, sehingga pengguna
  dapat memilih foto beresolusi tinggi langsung dari kamera ponsel:

  | Unggahan | Target kompresi | Batas server |
  |---|---|---|
  | Dokumen identitas | 360 KB | 400 KB |
  | Bukti pembayaran | 360 KB | 400 KB |
  | Foto armada | 680 KB/foto, total 4 MB | 700 KB/foto |
  | Nota servis | 290 KB | 300 KB |
  | Foto kondisi & serah-terima | 240 KB | 250 KB |
  | Gambar QRIS | 240 KB | 250 KB |
  | Logo navigasi | 900 KB | 1 MB |
  | Poster beranda | 2,6 MB | 3 MB |

  Foto dengan transparansi (PNG) disimpan sebagai JPEG dengan latar putih. Ukuran
  sebelum kompresi dibatasi 20 MB per berkas.
- Kategori armada bawaan (MPV, SUV, Electric) dapat ditambah, diganti nama, dan
  dihapus di halaman Atur checklist. Perubahan nama mengikuti data kendaraan dan
  paket; penghapusan mengalihkan referensi ke kategori aktif pertama. Kategori
  digunakan untuk mencocokkan kendaraan dengan paket perjalanan. Admin mengelola
  paket, bundling makan/air mineral, dan promo bertanggal pada halaman Paket
  perjalanan & promo.
- Booking pelanggan dapat memilih paket dan promo yang cocok. Server memeriksa
  kategori unit, masa promo, dan menghitung ulang potongan persen/nominal atau
  kredit BBM gratis sebelum menyimpan total booking.

Permintaan admin memakai cookie sesi HttpOnly selama delapan jam. Harga booking
dihitung ulang di server, approval stok dilakukan dalam transaksi SQLite, dan
lookup status booking biasa memerlukan ID serta nomor telepon yang cocok.
Kode booking baru berisi token acak 96-bit dan dapat digunakan sendiri untuk
membuka progres, nota, serta sisa waktu rental di Pesanan Saya. Simpan kode itu
secara pribadi; booking lama tetap memerlukan nomor telepon. Setelah booking
disetujui, pilihan deposit Rp1.000.000 mewajibkan pelanggan membayar deposit
terlebih dahulu dan mengirim bukti untuk diverifikasi admin. Setelah disetujui,
pelanggan mengirim bukti pembayaran biaya sewa (QRIS, transfer, atau tunai
dengan foto kuitansi); admin memverifikasi pembayaran sewa sebelum persiapan unit.
Pilihan jaminan selain deposit Rp1.000.000 tetap memakai alur pembayaran lama.
Checklist petugas menuntaskan persiapan unit, lalu pelanggan memulai waktu sewa
saat menekan Selesai pada serah-terima. Tidak ada lagi tahap persetujuan
serah-terima oleh admin: setelah checklist unit selesai, konfirmasi pelanggan
langsung memulai hitung sewa. Pelanggan yang ditolak admin melihat alasannya di
Pesanan Saya.

> Keamanan: `ADMIN_USERNAME` hanya dipakai saat database masih kosong untuk membuat
> admin pertama. Nilai di environment tidak pernah menaikkan role atau mengubah
> akun mana pun. Batas satu ulasan per IP memakai `cf-connecting-ip`/`x-forwarded-for`
> sehingga hanya berlaku bila server diakses lewat Cloudflare Tunnel.
Untuk deployment gunakan HTTPS dan `NODE_ENV=production`. Unggahan bukti tidak
memvalidasi transaksi bank secara otomatis; admin memeriksa bukti secara manual.
Gateway pembayaran dan kontrol/telemetri IoT belum diimplementasikan oleh MVP ini.

Setiap akun karyawan menggunakan username dan password sendiri. Administrator
memilih izin per fitur; izin diperiksa saat server menyajikan halaman dan pada
endpoint admin yang terkait. Password awal minimal 12 karakter, disimpan dalam
bentuk hash, dan akun dapat dinonaktifkan untuk mencabut sesi aktif.
Izin **Serah-terima**, **Atur checklist**, **Arsip checklist**, **Pengembalian
unit**, dan **Arsip penyewaan** dapat dipilih secara terpisah; akun lama yang
memiliki izin Serah-terima atau Pengembalian unit tetap mempertahankan akses
sebelumnya melalui migrasi izin otomatis.
Pengaturan admin dapat mengganti kredensial administrator utama dan warna aksen
global; perubahan akun mengakhiri sesi lama di perangkat lain.

## Integrasi halaman

Login admin, booking, pembayaran, armada, paket/promo, lokasi, data servis unit,
pengingat rental, catatan kondisi unit, checklist serah-terima, dan pengembalian
menggunakan API server serta database SQLite. Catatan kondisi ditampilkan pada
booking pelanggan terkait. Checklist serah-terima dan pengembalian memperbarui
odometer unit servis yang plat nomornya cocok. Kategori checklist tambahan dapat
diatur pada halaman admin **Atur checklist** dengan satu atau beberapa jenis isian
(centang, pilihan, catatan, dan foto); hasilnya tersimpan pada checklist booking,
arsip, serta detail serah-terima pelanggan. Sewa yang sudah memiliki tanggal
pengembalian dan checklist akhir otomatis muncul pada **Arsip penyewaan**,
dengan pengelompokan bulan kalender, minggu ISO, atau tahun serta ringkasan nilai
booking. Deposit dan daftar barang jaminan yang tampil pada formulir booking
pelanggan dapat diatur dari **Pengaturan sewa**; nilai deposit yang dikirim
pelanggan divalidasi terhadap pilihan aktif di server. Detail arsip dibaca dari
data booking tersimpan di SQLite. Monitoring IoT masih menunggu
perangkat GPS/sensor dan protokol integrasi; halaman tidak menampilkan angka
telemetri contoh. Data prototipe lama di `localStorage` tidak otomatis diimpor
ke database server.

## Tes

`npm test` menjalankan tes alur booking, persetujuan admin, persediaan armada,
dan pembayaran dengan database sementara.
