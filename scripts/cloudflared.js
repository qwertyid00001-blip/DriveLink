const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Cari cloudflared di lokasi yang paling mungkin, lalu biarkan PATH menjadi fallback.
function findCloudflared() {
  const candidates = [
    process.env.CLOUDFLARED_PATH,
    path.join(os.homedir(), '.local', 'bin', 'cloudflared'),
    '/opt/homebrew/bin/cloudflared',
    '/usr/local/bin/cloudflared',
    'cloudflared',
  ].filter(Boolean);
  return candidates.find((candidate) => {
    if (candidate === 'cloudflared') return true;
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

module.exports = { findCloudflared };