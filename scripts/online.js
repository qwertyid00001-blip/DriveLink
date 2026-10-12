// Jalankan server DriveLink dan Cloudflare Quick Tunnel dalam satu perintah.
//
//   npm run online
//
// Mendapat satu URL HTTPS sementara yang bisa dibuka dari perangkat mana pun,
// selama proses ini tetap berjalan. Tekan Ctrl+C untuk menutup semuanya.
const { spawn } = require('node:child_process');
const os = require('node:os');
const { createApp } = require('../server.js');
const { findCloudflared } = require('./cloudflared');

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
const localUrl = `http://127.0.0.1:${port}`;

function localAddresses() {
  return [...new Set(Object.values(os.networkInterfaces())
    .flatMap((interfaces) => interfaces || [])
    .filter((network) => network.family === 'IPv4' && !network.internal)
    .map((network) => network.address))];
}

async function waitForServer(attempts = 40) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(localUrl, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return;
    } catch {
      // server belum siap, coba lagi
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Server tidak merespons di ${localUrl}.`);
}

async function printQrCode(url) {
  try {
    // qrcode adalah dependensi opsional: kalau belum terpasang, URL tetap ditampilkan.
    const qrcode = require('qrcode');
    const art = await qrcode.toString(url, { type: 'terminal', small: true });
    console.log(`\n${art}`);
  } catch {
    // Lewati QR code bila dependensi belum terpasang.
  }
}

function startTunnel(onUrl) {
  const executable = findCloudflared();
  const tunnel = spawn(executable, ['tunnel', '--no-autoupdate', '--url', localUrl], { stdio: ['ignore', 'pipe', 'pipe'] });
  let found = false;
  // cloudflared menulis banner URL ke stderr, bukan stdout. Kedua stream diamati,
  // lalu log stderr diteruskan ke terminal agar diagnostik cloudflared tetap terlihat.
  const scan = (chunk) => {
    const match = String(chunk).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match && !found) {
      found = true;
      onUrl(match[0]);
    }
  };
  tunnel.stdout.on('data', scan);
  tunnel.stderr.on('data', (chunk) => {
    process.stderr.write(chunk);
    scan(chunk);
  });
  tunnel.once('error', (error) => {
    if (error.code === 'ENOENT') {
      console.error('cloudflared tidak ditemukan. Pasang Cloudflare Tunnel atau atur CLOUDFLARED_PATH.');
    } else {
      console.error(`Gagal menjalankan cloudflared: ${error.message}`);
    }
    process.exitCode = 1;
  });
  tunnel.once('exit', (code, signal) => {
    if (signal) return;
    console.error(`Tunnel berhenti (kode ${code}).`);
    process.exitCode = code === 0 ? 0 : 1;
  });
  return tunnel;
}

async function main() {
  const app = createApp();
  const server = app.listen(port, host, () => {
    console.log(`DriveLink berjalan di ${localUrl}`);
    if (host === '0.0.0.0') {
      localAddresses().forEach((address) => {
        console.log(`Jaringan lokal: http://${address}:${port}`);
      });
    }
  });

  await waitForServer();
  console.log('Membuka tunnel sementara. Tekan Ctrl+C untuk menutup akses.');
  const tunnel = startTunnel(async (url) => {
    console.log('\nBuka di perangkat mana pun:\n');
    console.log(`  ${url}\n`);
    await printQrCode(url);
    console.log('\nArahkan kamera ponsel ke kode di atas. Jangan bagikan URL ini.');
    console.log('Tunnel tetap aktif selama jendela ini terbuka.\n');
  });

  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    console.log('\nMenutup tunnel dan server...');
    tunnel.kill('SIGTERM');
    server.close();
    try {
      app.locals.db.close();
    } catch {
      // database mungkin sudah tertutup
    }
    setTimeout(() => process.exit(0), 300);
  };
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, shutdown);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});