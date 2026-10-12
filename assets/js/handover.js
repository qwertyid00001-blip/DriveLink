const params = new URLSearchParams(window.location.search);
const bookingId = (params.get('id') || '').trim().toUpperCase();
const phone = normalizePhone(params.get('phone') || '');
const form = document.getElementById('handoverForm');
const message = document.getElementById('handoverMessage');
const submitButton = document.getElementById('handoverSubmit');
let currentBooking = null;
let currentBookingDetails = null;
let rentalCountdownInterval = null;

function normalizePhone(value) {
  return String(value).replace(/\D/g, '').replace(/^62/, '0');
}

function paymentReady(booking) {
  return ['Dikonfirmasi', 'Bukti diunggah', 'Bayar ke petugas'].includes(booking.paymentStatus);
}

function loadBookings() {
  return DriveLinkStorage.read('drivelink-bookings', []);
}

function saveBookings(bookings) {
  DriveLinkStorage.writeBookings(bookings);
}

function findLocalBooking() {
  return loadBookings().find((booking) => (
    String(booking.id).toUpperCase() === bookingId
    && normalizePhone(booking.phone) === phone
  ));
}

function appendStatus(booking, status) {
  if (booking.status === status) return;
  booking.status = status;
  booking.statusHistory = booking.statusHistory || [];
  booking.statusHistory.push({ status, at: new Date().toISOString() });
}

function rentalDurationHours(duration) {
  const value = String(duration || '').trim().toLowerCase();
  if (value === '1 bulan') return 30 * 24;
  const match = value.match(/^(\d+)\s*hari$/);
  const days = match ? Number(match[1]) : 0;
  return Number.isSafeInteger(days) && days > 0 ? days * 24 : 0;
}

function showRentalCountdown(booking) {
  const startedAt = new Date(booking.rentalStartedAt).getTime();
  const durationHours = rentalDurationHours(booking.duration);
  const statusSection = document.getElementById('handoverRentalStatus');
  const countdown = document.getElementById('handoverCountdown');
  const countdownMessage = document.getElementById('handoverCountdownMessage');
  if (!Number.isFinite(startedAt) || !durationHours) {
    countdown.textContent = 'Tidak tersedia';
    countdownMessage.textContent = 'Durasi sewa pada booking tidak dapat dibaca. Hubungi admin untuk bantuan.';
    statusSection.hidden = false;
    return;
  }

  const endsAt = startedAt + durationHours * 60 * 60 * 1000;
  const updateCountdown = () => {
    const remaining = Math.max(0, endsAt - Date.now());
    const totalSeconds = Math.floor(remaining / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    countdown.textContent = `${hours} jam ${minutes} menit ${seconds} detik`;
    if (remaining === 0) {
      countdownMessage.textContent = 'Masa sewa sesuai durasi booking telah berakhir. Silakan hubungi admin untuk proses pengembalian.';
      if (rentalCountdownInterval) window.clearInterval(rentalCountdownInterval);
      rentalCountdownInterval = null;
    }
  };
  statusSection.hidden = false;
  updateCountdown();
  if (rentalCountdownInterval) window.clearInterval(rentalCountdownInterval);
  if (endsAt > Date.now()) rentalCountdownInterval = window.setInterval(updateCountdown, 1000);
}

function updateHandoverSideNote(status) {
  const title = document.getElementById('handoverSideTitle');
  const detail = document.getElementById('handoverSideMessage');
  if (status === 'Disetujui') {
    title.textContent = 'Serah-terima selesai';
    detail.textContent = 'Anda telah mengonfirmasi penerimaan unit. Nota dan waktu sewa tersedia di Pesanan Saya.';
  } else if (status === 'Ditolak') {
    title.textContent = 'Perlu pengecekan ulang';
    detail.textContent = 'Tinjau catatan admin dan hubungi karyawan yang melayani untuk pengecekan ulang.';
  }
}

function previewImage(container, source, alt) {
  const image = document.createElement('img');
  image.src = source;
  image.alt = alt;
  container.append(image);
}

function formatReceiptCurrency(value) {
  if (value === undefined || value === null || value === '') return '-';
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })
    .format(Number(value) || 0);
}

function formatReceiptDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(date);
}

function escapeReceiptHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function renderHandoverReceipt(booking) {
  const details = currentBookingDetails || {};
  const submittedAt = booking.handoverSubmittedAt || booking.rentalStartedAt;
  const rows = [
    ['Nomor booking', booking.id],
    ['Nama pelanggan', details.name || booking.name || 'Pelanggan'],
    ['Nomor telepon', details.phone || booking.phone || phone],
    ['Kendaraan', `${booking.carType}${booking.vehicleColor ? ` · ${booking.vehicleColor}` : ''}`],
    ['Durasi sewa', booking.duration],
    ['Layanan', booking.driverOption === 'Pakai driver' && booking.fuelPackage
      ? `${booking.driverOption} · ${booking.fuelPackage}`
      : booking.driverOption],
    ['Metode pembayaran', booking.paymentMethod || details.paymentMethod],
    ['Estimasi biaya sewa', formatReceiptCurrency(booking.estimatedTotal ?? details.estimatedTotal)],
    ['Deposit', formatReceiptCurrency(booking.deposit ?? details.deposit)],
    ['Status serah-terima', booking.handoverStatus || 'Selesai'],
    ['Waktu konfirmasi', formatReceiptDate(submittedAt)],
    ['Waktu mulai sewa', formatReceiptDate(booking.rentalStartedAt || submittedAt)],
  ];
  const receipt = document.getElementById('handoverReceipt');
  const receiptDetails = document.getElementById('handoverReceiptDetails');
  receiptDetails.replaceChildren();
  rows.forEach(([label, value]) => {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    term.textContent = label;
    const description = document.createElement('dd');
    description.textContent = value || '-';
    row.append(term, description);
    receiptDetails.append(row);
  });
  receipt.hidden = false;

  document.getElementById('downloadHandoverReceipt').onclick = () => {
    const receiptRows = rows.map(([label, value]) => (
      `<tr><th>${escapeReceiptHtml(label)}</th><td>${escapeReceiptHtml(value || '-')}</td></tr>`
    )).join('');
    const receiptHtml = `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Nota Serah-Terima ${escapeReceiptHtml(booking.id)}</title><style>body{font:16px Arial,sans-serif;color:#12223b;max-width:760px;margin:40px auto;padding:0 20px}h1{color:#1837d1}p{color:#5c6b83}table{width:100%;border-collapse:collapse;margin:24px 0}th,td{padding:12px;border-bottom:1px solid #dce4f1;text-align:left}th{width:38%;color:#5c6b83}footer{margin-top:32px;color:#5c6b83;font-size:13px}@media print{body{margin:0 auto}}</style></head><body><h1>DriveLink</h1><h2>Nota konfirmasi serah-terima</h2><p>Rincian booking dan konfirmasi serah-terima kendaraan.</p><table>${receiptRows}</table><footer>Nota ini merupakan bukti konfirmasi serah-terima, bukan bukti pembayaran.</footer></body></html>`;
    const file = new Blob([receiptHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nota-serah-terima-${booking.id}.html`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
}

function renderPage(booking) {
  updateHandoverSideNote(booking.handoverStatus);
  const staffFrontPhoto = booking.vehicleInspection?.frontPhoto || booking.vehicleInspection?.photos?.[0];
  if (staffFrontPhoto) {
    document.getElementById('handoverStaffFrontPhoto').src = staffFrontPhoto;
    document.getElementById('handoverStaffPhoto').hidden = false;
  } else {
    document.getElementById('handoverStaffFrontPhoto').removeAttribute('src');
    document.getElementById('handoverStaffPhoto').hidden = true;
  }
  const summary = document.getElementById('handoverSummary');
  [[`ID booking`, booking.id], ['Kendaraan', `${booking.carType}${booking.vehicleColor ? ` · ${booking.vehicleColor}` : ''}`], ['Layanan', booking.driverOption === 'Pakai driver' && booking.fuelPackage
    ? `${booking.driverOption} · ${booking.fuelPackage}`
    : booking.driverOption], ['Pembayaran', booking.paymentMethod]]
    .forEach(([title, value]) => {
      const item = document.createElement('div');
      const label = document.createElement('span');
      label.textContent = title;
      const detail = document.createElement('strong');
      detail.textContent = value || '-';
      item.append(label, detail);
      summary.append(item);
    });

  const condition = booking.unitCondition;
  if (booking.vehicleInspection) {
    const inspection = booking.vehicleInspection;
    const inspectionContainer = document.getElementById('bookingVehicleInspection');
    const title = document.createElement('h3');
    title.textContent = `Checklist unit ${inspection.plate}`;
    inspectionContainer.append(title);
    const checklist = document.createElement('dl');
    checklist.className = 'handover-inspection-details';
    const inspectionRows = [
      ['Odometer', `${Number(inspection.odometerKm).toLocaleString('id-ID')} km`],
      ['Bensin', inspection.fuelLevel],
      ['Kondisi bodi', inspection.bodyCondition],
      ['Lokasi lecet / catatan bodi', inspection.bodyNotes],
      ['Interior', inspection.interiorCondition],
      ['Lampu', inspection.lightsCondition],
      ['Ban', inspection.tiresCondition],
      ['Mesin dan indikator', inspection.engineCondition],
      ['Kelengkapan kendaraan', inspection.equipmentCondition],
      ['Catatan tambahan', inspection.notes],
    ];
    (inspection.customChecklist || []).forEach((item) => {
      const values = item.values || {};
      const details = [];
      if (item.types.includes('check')) details.push(values.checked ? 'Sudah diperiksa' : 'Belum dicentang');
      if (item.types.includes('choice') && values.choice) details.push(values.choice);
      if (item.types.includes('note') && values.note) details.push(values.note);
      if (item.types.includes('photo') && values.photo) details.push('Foto terlampir');
      inspectionRows.push([item.label, details.join(' · ') || '-']);
    });
    inspectionRows.forEach(([label, value]) => {
      const item = document.createElement('div');
      const term = document.createElement('dt');
      term.textContent = label;
      const description = document.createElement('dd');
      description.textContent = value || '-';
      item.append(term, description);
      checklist.append(item);
    });
    inspectionContainer.append(checklist);
    (inspection.photos || []).forEach((photo, index) => {
      previewImage(inspectionContainer, photo, `Foto checklist kendaraan ${index + 1}`);
    });
    (inspection.customChecklist || []).forEach((item) => {
      if (item.values?.photo) previewImage(inspectionContainer, item.values.photo, `Foto checklist ${item.label}`);
    });
  }
  if (condition) {
    document.getElementById('unitConditionNotes').textContent = condition.notes || 'Admin belum menambahkan catatan pemeriksaan.';
    const gallery = document.getElementById('unitConditionPhotos');
    (condition.photos || []).forEach((photo, index) => previewImage(gallery, photo, `Foto kondisi unit ${index + 1}`));
  }

  if (booking.handoverStatus === 'Disetujui') {
    form.hidden = true;
    message.textContent = 'Serah-terima telah Anda selesaikan.';
  } else if (booking.handoverStatus === 'Ditolak') {
    message.textContent = 'Admin meminta serah-terima dikonfirmasi ulang. Tinjau catatan admin lalu kirim ulang.';
    if (booking.handoverAdminNote) {
      const note = document.createElement('p');
      note.className = 'admin-feedback-note';
      note.textContent = `Catatan admin: ${booking.handoverAdminNote}`;
      message.after(note);
    }
  }

  if (booking.handoverStatus === 'Disetujui') {
    form.hidden = true;
    submitButton.disabled = true;
    document.getElementById('handoverRentalStatus').hidden = false;
    renderHandoverReceipt(booking);
  }
  const rentalStartedAt = booking.rentalStartedAt || booking.handoverSubmittedAt || booking.handoverApprovedAt;
  if (rentalStartedAt) showRentalCountdown({ ...booking, rentalStartedAt });
}

async function loadBooking() {
  if (window.DriveLinkAPI) {
    return DriveLinkAPI.get(`/api/bookings/${encodeURIComponent(bookingId)}?phone=${encodeURIComponent(phone)}`);
  }
  const booking = findLocalBooking();
  if (!booking) throw new Error('Booking tidak ditemukan. Periksa tautan serah-terima atau hubungi admin.');
  return booking;
}

async function loadBookingDetails() {
  if (!window.DriveLinkAPI) return findLocalBooking();
  return DriveLinkAPI.get(`/api/bookings/${encodeURIComponent(bookingId)}/details?phone=${encodeURIComponent(phone)}`);
}

if (!bookingId || !phone) {
  form.hidden = true;
  message.textContent = 'Booking tidak ditemukan. Periksa tautan serah-terima atau hubungi admin.';
  message.classList.add('is-error');
} else {
  loadBooking().then(async (booking) => {
    currentBooking = booking;
    try {
      currentBookingDetails = await loadBookingDetails();
    } catch (error) {
      console.error('Rincian booking untuk nota tidak dapat dimuat.', error);
      currentBookingDetails = null;
    }
    if (!paymentReady(booking)) {
      form.hidden = true;
      message.textContent = 'Serah-terima belum dapat dimulai. Pilih metode pembayaran dan kirim bukti jika membayar non-tunai.';
      message.classList.add('is-error');
    } else if (!booking.vehicleInspection) {
      form.hidden = true;
      message.textContent = 'Checklist kondisi unit belum diselesaikan admin. Silakan muat ulang setelah admin menyimpannya.';
      message.classList.add('is-error');
    } else {
      renderPage(booking);
    }
  }).catch((error) => {
    form.hidden = true;
    message.textContent = error.message;
    message.classList.add('is-error');
  });
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const staffFrontPhoto = currentBooking.vehicleInspection?.frontPhoto || currentBooking.vehicleInspection?.photos?.[0];
  if (!staffFrontPhoto) {
    message.textContent = 'Foto depan unit dari karyawan belum tersedia. Hubungi karyawan yang melayani sebelum melanjutkan.';
    message.classList.add('is-error');
    return;
  }

  submitButton.disabled = true;
  message.classList.remove('is-error');
  message.textContent = 'Mengirim konfirmasi serah-terima...';
  try {
    const photos = [];
    if (window.DriveLinkAPI) {
      currentBooking = await DriveLinkAPI.post(`/api/bookings/${encodeURIComponent(bookingId)}/handover`, {
        phone: currentBooking.phone,
        photos,
      });
      form.hidden = true;
      message.classList.remove('is-error');
      message.textContent = 'Serah-terima selesai. Nota dan hitung mundur sewa sudah tersedia di Pesanan Saya.';
      updateHandoverSideNote(currentBooking.handoverStatus);
      showRentalCountdown(currentBooking);
      renderHandoverReceipt(currentBooking);
      return;
    }
    const bookings = loadBookings();
    const booking = bookings.find((item) => String(item.id).toUpperCase() === bookingId && normalizePhone(item.phone) === phone);
    if (!booking || !paymentReady(booking)) {
      message.textContent = 'Booking tidak ditemukan atau metode pembayaran belum dipilih. Muat ulang halaman.';
      message.classList.add('is-error');
      return;
    }
    booking.handoverPhotos = photos;
    booking.handoverStatus = 'Disetujui';
    booking.handoverSubmittedAt = booking.handoverSubmittedAt || new Date().toISOString();
    booking.rentalStartedAt = booking.rentalStartedAt || booking.handoverSubmittedAt;
    booking.customerHandoverCompletedAt = booking.handoverSubmittedAt;
    booking.paymentStatus = 'Dikonfirmasi';
    booking.paymentConfirmedAt = booking.paymentConfirmedAt || booking.handoverSubmittedAt;
    booking.handoverAdminNote = '';
    appendStatus(booking, 'Rental berjalan');
    saveBookings(bookings);
    form.hidden = true;
    message.classList.remove('is-error');
    message.textContent = 'Serah-terima selesai. Nota dan hitung mundur sewa sudah tersedia di Pesanan Saya.';
    updateHandoverSideNote(booking.handoverStatus);
    showRentalCountdown(booking);
    renderHandoverReceipt(booking);
  } catch (error) {
    message.textContent = error.message;
    message.classList.add('is-error');
  } finally {
    if (!form.hidden) submitButton.disabled = false;
  }
});
