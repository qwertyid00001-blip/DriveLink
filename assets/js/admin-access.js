(() => {
  const featureByPage = {
    'admin.html': 'overview',
    'admin-bookings.html': 'bookings',
    'admin-fleet.html': 'fleet',
    'admin-fleet-deletions.html': 'fleet-deletions',
    'admin-vehicle-service.html': 'vehicle-service',
    'admin-location.html': 'location',
    'admin-rental-settings.html': 'rental-settings',
    'admin-travel-packages.html': 'travel-packages',
    'admin-monitoring.html': 'monitoring',
    'admin-payments.html': 'payments',
    'admin-handover.html': 'handover',
    'admin-checklist.html': 'checklist',
    'admin-handover-archive.html': 'handover-archive',
    'admin-return.html': 'return',
    'admin-rental-archive.html': 'rental-archive',
    'admin-accounts.html': 'accounts',
    'admin-settings.html': 'settings',
  };
  const pageByFeature = {
    overview: 'admin.html',
    bookings: 'admin-bookings.html',
    fleet: 'admin-fleet.html',
    'vehicle-service': 'admin-vehicle-service.html',
    location: 'admin-location.html',
    'rental-settings': 'admin-rental-settings.html',
    'travel-packages': 'admin-travel-packages.html',
    monitoring: 'admin-monitoring.html',
    payments: 'admin-payments.html',
    handover: 'admin-handover.html',
    checklist: 'admin-checklist.html',
    'handover-archive': 'admin-handover-archive.html',
    return: 'admin-return.html',
    'rental-archive': 'admin-rental-archive.html',
    settings: 'admin-settings.html',
    'fleet-deletions': 'admin-fleet-deletions.html',
  };
  const notificationFeatureByPage = {
    'admin-bookings.html': 'bookings',
    'admin-payments.html': 'payments',
    'admin-handover.html': 'handover',
    'admin-return.html': 'returns',
    'admin-vehicle-service.html': 'vehicle-service',
  };
  const notificationLabelByFeature = {
    bookings: 'booking menunggu verifikasi',
    payments: 'pembayaran menunggu verifikasi',
    handover: 'serah-terima menunggu konfirmasi',
    returns: 'pengembalian terlambat',
    'vehicle-service': 'unit perlu servis',
  };
  const sidebarItemByPage = {
    'admin.html': { icon: '⌂', label: 'Beranda' },
    'admin-bookings.html': { icon: '≡', label: 'Pesanan' },
    'admin-fleet.html': { icon: '▣', label: 'Armada' },
    'admin-fleet-deletions.html': { icon: '×', label: 'Permintaan hapus' },
    'admin-vehicle-service.html': { icon: '⚒', label: 'Servis unit' },
    'admin-location.html': { icon: '⌖', label: 'Lokasi' },
    'admin-rental-settings.html': { icon: '◷', label: 'Pengingat sewa' },
    'admin-travel-packages.html': { icon: '✦', label: 'Paket & promo' },
    'admin-monitoring.html': { icon: '⌁', label: 'Pantau unit' },
    'admin-payments.html': { icon: '$', label: 'Pembayaran' },
    'admin-handover.html': { icon: '⇄', label: 'Serah terima' },
    'admin-checklist.html': { icon: '☑', label: 'Checklist' },
    'admin-handover-archive.html': { icon: '▦', label: 'Riwayat checklist' },
    'admin-return.html': { icon: '↩', label: 'Pengembalian' },
    'admin-rental-archive.html': { icon: '↻', label: 'Riwayat' },
    'admin-accounts.html': { icon: '♙', label: 'Tim' },
    'admin-settings.html': { icon: '⚙', label: 'Pengaturan' },
  };
  const currentPage = window.location.pathname.split('/').pop();
  const feature = featureByPage[currentPage];

  function serviceNeedsAttention(unit, now) {
    const currentKm = Number(unit.currentKm ?? unit.lastServiceKm);
    const nextKm = Number(unit.nextServiceKm);
    const hasKmSchedule = Number.isFinite(nextKm) && nextKm > 0;
    const dateDue = Boolean(unit.nextServiceDate)
      && new Date(`${unit.nextServiceDate}T23:59:59`).getTime() <= now;
    return (hasKmSchedule && (currentKm >= nextKm || nextKm - currentKm <= 1000))
      || dateDue;
  }

  async function refreshActionBadges() {
    try {
      const notificationData = await DriveLinkAPI.get('/api/admin/notification-data');
      const counts = {
        ...notificationData.actionCounts,
        'vehicle-service': notificationData.vehicleServices.filter((unit) => serviceNeedsAttention(unit, Date.now())).length,
      };
      document.querySelectorAll('.admin-nav-link').forEach((link) => {
        const targetPage = new URL(link.href).pathname.split('/').pop();
        const targetFeature = notificationFeatureByPage[targetPage];
        const count = targetFeature ? Number(counts[targetFeature]) || 0 : 0;
        let badge = link.querySelector('.admin-nav-count');
        if (!targetFeature || !count) {
          badge?.remove();
          return;
        }
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'admin-nav-count';
          link.append(badge);
        }
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.setAttribute('aria-label', `${count} ${notificationLabelByFeature[targetFeature]}`);
        badge.title = `${count} ${notificationLabelByFeature[targetFeature]}`;
      });
    } catch (error) {
      console.error('Badge tindakan admin gagal diperbarui.', error);
    }
  }

  window.DriveLinkSessionReady = DriveLinkAPI.get('/api/auth/session').then((session) => {
    DriveLinkStorage.write('drivelink-session', session);
    const sidebarLabel = document.querySelector('.sidebar-label');
    if (sidebarLabel) sidebarLabel.textContent = 'Menu';
    document.querySelectorAll('.admin-nav-link').forEach((link) => {
      const targetPage = new URL(link.href).pathname.split('/').pop();
      const sidebarItem = sidebarItemByPage[targetPage];
      if (sidebarItem) {
        const badge = link.querySelector('.admin-nav-count');
        const icon = document.createElement('span');
        icon.className = 'admin-nav-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = sidebarItem.icon;
        const label = document.createElement('span');
        label.className = 'admin-nav-label';
        label.textContent = sidebarItem.label;
        link.replaceChildren(icon, label);
        if (badge) link.append(badge);
      }
      const targetFeature = featureByPage[targetPage];
      const allowed = session.role === 'admin'
        || targetFeature !== 'fleet-deletions' && session.permissions.includes(targetFeature);
      link.hidden = !allowed;
    });
    const name = document.getElementById('adminName');
    if (name) name.textContent = session.name;
    document.querySelectorAll('.admin-user small').forEach((label) => {
      label.textContent = session.role === 'admin' ? 'Administrator' : session.position || 'Karyawan';
    });
    if (['accounts', 'settings', 'fleet-deletions'].includes(feature) && session.role !== 'admin'
      || feature && session.role !== 'admin' && !session.permissions.includes(feature)) {
      const destination = session.role === 'admin'
        ? 'admin.html'
        : pageByFeature[session.permissions.find((permission) => pageByFeature[permission])] || 'auth.html';
      window.location.replace(destination);
      return null;
    }
    refreshActionBadges();
    window.setInterval(refreshActionBadges, 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) refreshActionBadges();
    });
    return session;
  }).catch((error) => {
    localStorage.removeItem('drivelink-session');
    console.error('Sesi admin tidak tersedia.', error);
    window.location.replace('/auth.html');
    return null;
  });
})();
