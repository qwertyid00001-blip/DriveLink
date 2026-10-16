(() => {
  const adminUser = document.querySelector('.admin-user');
  if (!adminUser) return;

  const settingsForm = document.getElementById('rentalReminderSettingsForm');
  const settingsMessage = document.getElementById('rentalReminderSettingsMessage');
  let notificationData = { settings: { reminderCycleHours: 24 }, bookings: [], vehicleServices: [] };
  let notificationLoadError = '';

  if (settingsForm) {
    settingsForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const reminderCycleHours = Number(new FormData(settingsForm).get('reminderCycleHours'));
      if (![12, 24].includes(reminderCycleHours)) {
        settingsMessage.textContent = 'Pilih siklus pengingat 12 atau 24 jam.';
        settingsMessage.classList.add('is-error');
        return;
      }
      try {
        await DriveLinkAPI.put('/api/admin/rental-settings', { reminderCycleHours });
        notificationData.settings.reminderCycleHours = reminderCycleHours;
        settingsMessage.textContent = 'Siklus pengingat masa sewa berhasil disimpan.';
        settingsMessage.classList.remove('is-error');
        renderNotifications();
      } catch (error) {
        settingsMessage.textContent = `Pengaturan pengingat gagal disimpan: ${error.message}`;
        settingsMessage.classList.add('is-error');
      }
    });
  }

  const notificationArea = document.createElement('div');
  notificationArea.className = 'admin-notifications';
  notificationArea.innerHTML = `
    <button class="admin-notification-toggle" type="button" aria-label="Notifikasi admin" aria-expanded="false" aria-controls="adminNotificationPanel">
      <span class="admin-notification-icon" aria-hidden="true">
        <svg class="admin-notification-bell-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
        </svg>
      </span>
      <span class="admin-notification-count" hidden></span>
    </button>
    <section class="admin-notification-panel" id="adminNotificationPanel" aria-label="Notifikasi admin" hidden>
      <div class="admin-notification-heading">
        <div class="admin-notification-title-wrap">
          <strong>Notifikasi</strong>
          <span class="admin-notification-summary"></span>
        </div>
        <button type="button" class="admin-notification-close" aria-label="Tutup notifikasi">✕</button>
      </div>
      <div class="admin-notification-list"></div>
    </section>
  `;
  adminUser.prepend(notificationArea);
  const toggle = notificationArea.querySelector('.admin-notification-toggle');
  const panel = notificationArea.querySelector('.admin-notification-panel');
  const close = notificationArea.querySelector('.admin-notification-close');
  const count = notificationArea.querySelector('.admin-notification-count');
  const summary = notificationArea.querySelector('.admin-notification-summary');
  const list = notificationArea.querySelector('.admin-notification-list');

  function serviceAlertStatus(unit, now) {
    const currentKm = Number(unit.currentKm ?? unit.lastServiceKm);
    const nextKm = Number(unit.nextServiceKm);
    const hasKmSchedule = Number.isFinite(nextKm) && nextKm > 0;
    const hasDateSchedule = Boolean(unit.nextServiceDate);
    const dateDue = hasDateSchedule && new Date(`${unit.nextServiceDate}T23:59:59`).getTime() <= now;
    if (hasKmSchedule && currentKm >= nextKm || dateDue) return 'Servis jatuh tempo';
    if (hasKmSchedule && nextKm - currentKm <= 1000) return 'Servis segera';
    return '';
  }

  function durationHours(booking) {
    const duration = String(booking.duration || '');
    if (duration.includes('bulan')) return 30 * 24;
    const days = Number.parseInt(duration, 10);
    return Number.isInteger(days) && days > 0 ? days * 24 : 0;
  }

  function formatDateTime(value) {
    return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  }

  function whatsappUrl(booking, checkpointAt) {
    const phone = String(booking.phone || '').replace(/\D/g, '').replace(/^0/, '62');
    if (phone.length < 8) return '';
    const message = `Halo ${booking.name || 'Pelanggan'}, kami dari DriveLink ingin mengonfirmasi rental ${booking.id} (${booking.carType}). Waktu rental mendekati checkpoint/pengembalian ${formatDateTime(checkpointAt)}. Apakah Anda ingin lanjut sewa atau mengembalikan kendaraan?`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  }

  function getNotifications() {
    const now = Date.now();
    const notices = [];
    const units = notificationData.vehicleServices;
    units.forEach((unit) => {
      const status = serviceAlertStatus(unit, now);
      if (!status) return;
      notices.push({
        type: 'service',
        title: `${status}: ${unit.plate}`,
        detail: `${unit.carType} · ${Number(unit.currentKm ?? unit.lastServiceKm).toLocaleString('id-ID')} km · jadwal ${unit.nextServiceDate || '-'} / ${Number(unit.nextServiceKm || 0).toLocaleString('id-ID')} km`,
        href: 'admin-vehicle-service.html',
        urgent: status === 'Servis jatuh tempo',
      });
    });

    const savedBookings = notificationData.bookings;
    const cycleHours = notificationData.settings.reminderCycleHours;
    const cycleMs = cycleHours * 60 * 60 * 1000;
    const reminderWindowMs = 60 * 60 * 1000;
    savedBookings.forEach((booking) => {
      if (booking.handoverStatus !== 'Disetujui' || booking.rentalReturnedAt || !booking.rentalStartedAt) return;
      const startedAt = new Date(booking.rentalStartedAt).getTime();
      const totalMs = durationHours(booking) * 60 * 60 * 1000;
      if (!Number.isFinite(startedAt) || !totalMs) return;
      const elapsed = Math.max(0, now - startedAt);
      const extendedHours = Math.max(0, Number(booking.rentalExtendedHours) || 0);
      const currentTotalMs = totalMs + extendedHours * 60 * 60 * 1000;
      const confirmedHours = Math.max(0, Number(booking.rentalConfirmedCheckpointHours) || 0);
      const nextCycle = Math.max(
        Math.floor(elapsed / cycleMs) + 1,
        Math.floor(confirmedHours / cycleHours) + 1,
      ) * cycleMs;
      const nextCheckpoint = Math.min(nextCycle, currentTotalMs);
      const checkpointAt = startedAt + nextCheckpoint;
      const timeRemaining = checkpointAt - now;
      const currentEndsAt = startedAt + currentTotalMs;
      const isOverdue = now >= currentEndsAt;
      if (!isOverdue && (timeRemaining <= 0 || timeRemaining > reminderWindowMs)) return;
      const targetAt = isOverdue ? currentEndsAt : checkpointAt;
      const whatsapp = whatsappUrl(booking, targetAt);
      notices.push({
        type: isOverdue ? 'return' : 'rental',
        bookingId: booking.id,
        checkpointHours: (isOverdue ? currentTotalMs : nextCheckpoint) / (60 * 60 * 1000),
        cycleHours,
        title: isOverdue ? `Masa sewa terlewat: ${booking.name}` : `Konfirmasi rental: ${booking.name}`,
        detail: `${booking.id} · ${booking.carType} · ${isOverdue ? `melewati batas ${formatDateTime(currentEndsAt)}` : `checkpoint ${formatDateTime(checkpointAt)}`}`,
        href: isOverdue ? `admin-return.html?booking=${encodeURIComponent(booking.id)}` : 'admin-reservations.html',
        whatsapp: isOverdue ? '' : whatsapp,
        urgent: isOverdue || targetAt - now <= 15 * 60 * 1000,
      });
    });
    return notices;
  }

  list.addEventListener('click', async (event) => {
    const extendButton = event.target.closest('[data-rental-extend]');
    if (extendButton) {
      const cycleHours = Number(extendButton.dataset.cycleHours);
      const checkpointHours = Number(extendButton.dataset.checkpointHours);
      if (![12, 24].includes(cycleHours)
        || !Number.isFinite(checkpointHours)
        || !window.confirm(`Catat penyewa lanjut dan tambah ${cycleHours} jam pada masa sewa?`)) return;
      try {
        await DriveLinkAPI.patch(`/api/admin/bookings/${encodeURIComponent(extendButton.dataset.rentalExtend)}/rental`, {
          action: 'extend',
          hours: cycleHours,
          checkpointHours,
        });
        await loadNotificationData();
      } catch (error) {
        console.error('Tidak dapat memperpanjang masa sewa booking.', error);
        window.alert(`Perpanjangan masa sewa gagal disimpan: ${error.message}`);
      }
    }
  });

  function updatePanelPosition() {
    if (window.innerWidth <= 720) {
      const toggleRect = toggle.getBoundingClientRect();
      const topOffset = Math.max(16, Math.round(toggleRect.bottom + 8));
      panel.style.setProperty('--panel-top', `${topOffset}px`);
    } else {
      panel.style.removeProperty('--panel-top');
    }
  }

  toggle.addEventListener('click', () => {
    const open = panel.hidden;
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      updatePanelPosition();
      renderNotifications();
    }
  });

  if (close) {
    close.addEventListener('click', () => {
      panel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
    });
  }

  window.addEventListener('resize', () => {
    if (!panel.hidden) updatePanelPosition();
  });

  document.addEventListener('click', (event) => {
    if (!notificationArea.contains(event.target)) {
      panel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
    }
  });
  async function loadNotificationData() {
    try {
      notificationData = await DriveLinkAPI.get('/api/admin/notification-data');
      notificationLoadError = '';
      const selected = settingsForm?.querySelector(`[name="reminderCycleHours"][value="${notificationData.settings.reminderCycleHours}"]`);
      if (selected) selected.checked = true;
    } catch (error) {
      notificationLoadError = `Notifikasi gagal dimuat: ${error.message}`;
      console.error(notificationLoadError);
    }
    renderNotifications();
  }

  function renderNotifications() {
    if (notificationLoadError) {
      count.hidden = true;
      summary.textContent = 'Gagal dimuat';
      list.replaceChildren();
      const error = document.createElement('p');
      error.className = 'admin-notification-empty is-error';
      error.textContent = notificationLoadError;
      list.append(error);
      return;
    }
    const notices = getNotifications();
    count.hidden = notices.length === 0;
    count.textContent = notices.length > 99 ? '99+' : String(notices.length);
    summary.textContent = notices.length ? `${notices.length} perlu ditinjau` : 'Tidak ada';
    list.replaceChildren();
    if (!notices.length) {
      const empty = document.createElement('p');
      empty.className = 'admin-notification-empty';
      empty.textContent = 'Belum ada servis yang perlu ditangani atau masa sewa yang mendekati batas.';
      list.append(empty);
      return;
    }
    notices.forEach((notice) => {
      const item = document.createElement('article');
      item.className = `admin-notification-item${notice.urgent ? ' is-urgent' : ''}`;
      const title = document.createElement('strong');
      title.textContent = notice.title;
      const detail = document.createElement('p');
      detail.textContent = notice.detail;
      const actions = document.createElement('div');
      actions.className = 'admin-notification-actions';
      const open = document.createElement('a');
      open.href = notice.href;
      open.className = 'admin-notification-link';
      open.textContent = notice.type === 'service' ? 'Buka kontrol servis' : notice.type === 'return' ? 'Buka checklist pengembalian' : 'Buka booking';
      actions.append(open);
      if (notice.whatsapp && notice.type === 'rental') {
        const extend = document.createElement('button');
        extend.type = 'button';
        extend.className = 'admin-notification-extend';
        extend.dataset.rentalExtend = notice.bookingId;
        extend.dataset.checkpointHours = String(notice.checkpointHours);
        extend.dataset.cycleHours = String(notice.cycleHours);
        extend.textContent = `Konfirmasi lanjut (+${notice.cycleHours} jam)`;
        const contact = document.createElement('a');
        contact.href = notice.whatsapp;
        contact.target = '_blank';
        contact.rel = 'noopener noreferrer';
        contact.className = 'admin-notification-contact';
        contact.textContent = 'Hubungi via WhatsApp';
        actions.append(contact, extend);
      }
      item.append(title, detail, actions);
      list.append(item);
    });
  }

  DriveLinkSessionReady?.then((session) => {
    if (!session) return;
    loadNotificationData();
    window.setInterval(loadNotificationData, 60 * 1000);
  });
})();
