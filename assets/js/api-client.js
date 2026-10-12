(() => {
  const clientIdStorageKey = 'drivelink-client-id';
  let clientId = sessionStorage.getItem(clientIdStorageKey);
  if (!clientId) {
    clientId = globalThis.crypto?.randomUUID?.()
      || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(clientIdStorageKey, clientId);
  }

  const updates = new EventSource(`/api/events?clientId=${encodeURIComponent(clientId)}`);
  let updatePendingWhileHidden = false;
  let lastKnownInstanceId = null;
  let lastKnownRevision = null;

  function refreshForDataChange() {
    if (document.visibilityState === 'hidden') {
      updatePendingWhileHidden = true;
      return;
    }
    window.location.reload();
  }

  updates.addEventListener('connected', (event) => {
    const { instanceId, revision } = JSON.parse(event.data);
    if (lastKnownInstanceId !== null
      && (instanceId !== lastKnownInstanceId || revision > lastKnownRevision)) {
      refreshForDataChange();
    }
    lastKnownInstanceId = instanceId;
    lastKnownRevision = revision;
  });
  updates.addEventListener('data-changed', (event) => {
    const { instanceId, revision } = JSON.parse(event.data);
    lastKnownInstanceId = instanceId;
    lastKnownRevision = Math.max(lastKnownRevision ?? 0, revision);
    refreshForDataChange();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && updatePendingWhileHidden) window.location.reload();
  });

  async function request(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: {
        'X-DriveLink-Client-Id': clientId,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Permintaan gagal (${response.status}).`);
    return body;
  }

  window.DriveLinkAPI = {
    get: (url) => request(url),
    post: (url, body) => request(url, { method: 'POST', body: JSON.stringify(body) }),
    put: (url, body) => request(url, { method: 'PUT', body: JSON.stringify(body) }),
    patch: (url, body) => request(url, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (url, body) => request(url, {
      method: 'DELETE',
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  };

  // Pembacaan dan penulisan localStorage yang aman. Semua skrip adalah skrip klasik,
  // jadi satu JSON rusak di localStorage akan menghentikan seluruh file ini.
  window.DriveLinkStorage = {
    read(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        if (raw === null || raw === undefined) return fallback;
        return JSON.parse(raw);
      } catch (error) {
        console.warn(`Data local "${key}" rusak, dibersihkan.`, error);
        try { localStorage.removeItem(key); } catch { /* abaikan */ }
        return fallback;
      }
    },
    write(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (error) {
        // QuotaExceededError: cache lokal penuh. Hapus cache terbesar lalu coba lagi sekali.
        console.warn(`Cache local "${key}" gagal disimpan.`, error);
        try { localStorage.removeItem(key); } catch { /* abaikan */ }
        return false;
      }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch { /* abaikan */ }
    },
    // Cache booking hanya untuk merender tabel. Foto identitas (base64) dibuang supaya
    // cache tidak melebihi kuota localStorage browser (sekitar 5 MiB). Foto inspeksi unit
    // tetap disimpan karena dipakai halaman serah-terima, pengembalian, dan arsip.
    writeBookings(bookings) {
      const light = Array.isArray(bookings)
        ? bookings.map((booking) => {
          if (!booking?.documents) return booking;
          const documents = {};
          for (const [key, value] of Object.entries(booking.documents)) {
            documents[key] = value && typeof value === 'object' ? { name: value.name || '' } : Boolean(value);
          }
          return { ...booking, documents };
        })
        : [];
      return DriveLinkStorage.write('drivelink-bookings', light);
    },
  };

  // Kompresi gambar yang dipakai seluruh halaman: dokumen booking, bukti pembayaran,
  // foto armada, nota servis, foto kondisi unit, logo, poster beranda, dan QRIS.
  // Pendekatan: perkecil sisi terpanjang, lalu turunkan kualitas JPEG berulang kali
  // sampai ukuran byte berada di bawah batas. Hasil selalu dikembalikan sebagai data URL JPEG.
  const compressionCache = new WeakMap();
  window.DriveLinkImages = {
    blobToDataUrl(blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener('load', () => resolve(String(reader.result)));
        reader.addEventListener('error', () => reject(new Error('Foto gagal disiapkan.')));
        reader.readAsDataURL(blob);
      });
    },
    compress(file, options = {}) {
      const maxBytes = options.maxBytes || 240 * 1024;
      const maxEdge = options.maxEdge || 2000;
      const inputMaxBytes = options.inputMaxBytes || 20 * 1024 * 1024;
      const label = options.label || 'Foto';
      const cacheKey = `${label}:${maxBytes}:${maxEdge}`;
      let entry = compressionCache.get(file);
      if (!entry) {
        entry = new Map();
        compressionCache.set(file, entry);
      }
      if (!entry.has(cacheKey)) {
        const pending = run();
        // Kegagalan tidak boleh tersimpan, supaya pengguna bisa mencoba ulang berkas sama.
        pending.catch(() => entry.delete(cacheKey));
        entry.set(cacheKey, pending);
      }
      return entry.get(cacheKey);

      async function run() {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
          throw new Error(`${label} harus berupa foto JPG, PNG, atau WebP.`);
        }
        if (file.size > inputMaxBytes) {
          throw new Error(`${label} ${file.name} melebihi ${Math.round(inputMaxBytes / 1048576)} MB sebelum dikompresi.`);
        }
        let bitmap;
        try {
          bitmap = await createImageBitmap(file);
        } catch (error) {
          throw new Error(`${label} ${file.name} tidak dapat dibuka: ${error.message}`);
        }
        try {
          const canvas = document.createElement('canvas');
          const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
          let width = Math.max(1, Math.round(bitmap.width * scale));
          let height = Math.max(1, Math.round(bitmap.height * scale));
          const context = canvas.getContext('2d');
          if (!context) throw new Error(`Browser tidak dapat menyiapkan kompresi ${label.toLowerCase()}.`);

          const qualitySteps = [0.9, 0.82, 0.74, 0.66, 0.58, 0.5];
          for (let attempt = 0; attempt < 30; attempt += 1) {
            canvas.width = width;
            canvas.height = height;
            context.fillStyle = '#fff';
            context.fillRect(0, 0, width, height);
            context.drawImage(bitmap, 0, 0, width, height);
            const quality = qualitySteps[attempt % qualitySteps.length];
            const blob = await new Promise((resolve, reject) => {
              canvas.toBlob((result) => {
                if (result) resolve(result);
                else reject(new Error(`${label} ${file.name} gagal dikompresi.`));
              }, 'image/jpeg', quality);
            });
            if (blob.size <= maxBytes) {
              return { dataUrl: await window.DriveLinkImages.blobToDataUrl(blob), sizeBytes: blob.size };
            }
            if (attempt % qualitySteps.length === qualitySteps.length - 1) {
              width = Math.max(1, Math.round(width * 0.78));
              height = Math.max(1, Math.round(height * 0.78));
            }
          }
          throw new Error(`${label} ${file.name} tetap melebihi ${Math.round(maxBytes / 1024)} KB setelah dikompresi.`);
        } finally {
          bitmap.close();
        }
      }
    },
  };
})();
