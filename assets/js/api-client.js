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
})();
