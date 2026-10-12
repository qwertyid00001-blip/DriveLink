const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT harus berupa nomor port yang valid.');
}

const localUrl = `http://127.0.0.1:${port}`;
const candidates = [
  process.env.CLOUDFLARED_PATH,
  path.join(os.homedir(), '.local', 'bin', 'cloudflared'),
  'cloudflared',
].filter(Boolean);
const executable = candidates.find((candidate) => {
  if (candidate === 'cloudflared') return true;
  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
});

async function startTunnel() {
  let response;
  try {
    response = await fetch(localUrl, { signal: AbortSignal.timeout(3000) });
  } catch (error) {
    throw new Error(`Server DriveLink tidak merespons di ${localUrl}. Jalankan npm start terlebih dahulu.`, { cause: error });
  }
  if (!response.ok) {
    throw new Error(`Server DriveLink mengembalikan HTTP ${response.status} di ${localUrl}.`);
  }
  console.log(`Membuka tunnel sementara ke ${localUrl}. Tekan Ctrl+C untuk menutup akses.`);
  const tunnel = spawn(executable, ['tunnel', '--no-autoupdate', '--url', localUrl], { stdio: 'inherit' });
  tunnel.once('error', (error) => {
    if (error.code === 'ENOENT') {
      console.error('cloudflared tidak ditemukan. Pasang Cloudflare Tunnel atau atur CLOUDFLARED_PATH.');
      process.exitCode = 1;
      return;
    }
    console.error(`Gagal menjalankan cloudflared: ${error.message}`);
    process.exitCode = 1;
  });
  tunnel.once('exit', (code, signal) => {
    if (signal) return;
    process.exitCode = code === 0 ? 0 : 1;
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => tunnel.kill(signal));
  }
}

startTunnel().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
