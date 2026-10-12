const form = document.getElementById('orderLookupForm');
const message = document.getElementById('orderLookupMessage');
const result = document.getElementById('orderResult');
const bookingIdInput = form.elements.bookingId;
let currentBooking = null;
let rentalCountdownInterval = null;

const requestedBookingId = new URLSearchParams(window.location.search).get('id');
let savedBookingId = '';
try {
  savedBookingId = localStorage.getItem('drivelink-last-booking-id') || '';
} catch (error) {
  console.error('Tidak dapat membaca ID booking yang tersimpan.', error);
}
bookingIdInput.value = requestedBookingId || savedBookingId;

function formatCurrency(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function paymentReady(booking) {
  if (booking.depositPaymentRequired) {
    return booking.depositPaymentStatus === 'Dikonfirmasi' && booking.paymentStatus === 'Dikonfirmasi';
  }
  return ['Dikonfirmasi', 'Bukti diunggah', 'Bayar ke petugas'].includes(booking.paymentStatus);
}

function rentalDurationHours(duration) {
  const value = String(duration || '').trim().toLowerCase();
  if (value === '1 bulan') return 30 * 24;
  const match = value.match(/^(\d+)\s*hari$/);
  return match ? Number(match[1]) * 24 : 0;
}

function renderRentalReceipt(booking) {
  const section = document.getElementById('orderRentalReceipt');
  if (rentalCountdownInterval) window.clearInterval(rentalCountdownInterval);
  rentalCountdownInterval = null;
  if (!booking.rentalStartedAt || booking.handoverStatus !== 'Disetujui') {
    section.hidden = true;
    return;
  }

  const details = [
    ['Kode booking', booking.id],
    ['Nama pelanggan', booking.name],
    ['Kendaraan', `${booking.carType}${booking.vehicleColor ? ` · ${booking.vehicleColor}` : ''}`],
    ['Durasi sewa', booking.duration],
    ['Layanan', booking.driverOption === 'Pakai driver' && booking.fuelPackage
      ? `${booking.driverOption} · ${booking.fuelPackage}`
      : booking.driverOption],
    ['Metode pembayaran', booking.paymentMethod],
    ['Biaya rental', formatCurrency(booking.estimatedTotal)],
    ['Deposit', booking.deposit],
    ...(booking.depositPaymentRequired ? [['Status deposit', booking.depositPaymentStatus || 'Belum dibayar']] : []),
    ['Serah-terima selesai', formatDate(booking.customerHandoverCompletedAt || booking.handoverSubmittedAt)],
    ['Waktu mulai sewa', formatDate(booking.rentalStartedAt)],
  ];
  const list = document.getElementById('orderRentalReceiptDetails');
  list.replaceChildren();
  details.forEach(([label, value]) => addDetail(list, label, value));
  section.hidden = false;

  const countdown = document.getElementById('orderRentalCountdown');
  const countdownMessage = document.getElementById('orderRentalCountdownMessage');
  const durationHours = rentalDurationHours(booking.duration);
  const startedAt = new Date(booking.rentalStartedAt).getTime();
  if (!durationHours || !Number.isFinite(startedAt)) {
    countdown.textContent = 'Tidak tersedia';
    countdownMessage.textContent = 'Durasi sewa tidak dapat dibaca. Hubungi admin untuk bantuan.';
    return;
  }
  const endsAt = startedAt + (durationHours + Math.max(0, Number(booking.rentalExtendedHours) || 0)) * 3600000;
  const updateCountdown = () => {
    if (booking.rentalReturnedAt) {
      countdown.textContent = 'Unit telah dikembalikan';
      countdownMessage.textContent = `Pengembalian dicatat ${formatDate(booking.rentalReturnedAt)}.`;
      window.clearInterval(rentalCountdownInterval);
      rentalCountdownInterval = null;
      return;
    }
    const remaining = Math.max(0, endsAt - Date.now());
    const seconds = Math.floor(remaining / 1000);
    countdown.textContent = `${Math.floor(seconds / 3600)} jam ${Math.floor((seconds % 3600) / 60)} menit ${seconds % 60} detik`;
    countdownMessage.textContent = remaining
      ? `Estimasi selesai ${formatDate(new Date(endsAt).toISOString())}.`
      : 'Waktu sewa berakhir. Silakan hubungi admin untuk proses pengembalian.';
    if (!remaining && rentalCountdownInterval) {
      window.clearInterval(rentalCountdownInterval);
      rentalCountdownInterval = null;
    }
  };
  updateCountdown();
  if (endsAt > Date.now() && !booking.rentalReturnedAt) {
    rentalCountdownInterval = window.setInterval(updateCountdown, 1000);
  }
}

function addDetail(container, label, value) {
  const row = document.createElement('div');
  const term = document.createElement('dt');
  term.textContent = label;
  const description = document.createElement('dd');
  description.textContent = value === null || value === undefined || value === '' ? '-' : String(value);
  row.append(term, description);
  container.append(row);
}

function stageState(done, waiting, blocked = false) {
  if (done) return { className: 'is-complete', label: 'Selesai' };
  if (waiting) return {
    className: /ditolak|ulang/i.test(waiting) ? 'is-rejected' : 'is-waiting',
    label: waiting,
  };
  if (blocked) return { className: 'is-blocked', label: 'Menunggu tahap sebelumnya' };
  return { className: 'is-pending', label: 'Belum dimulai' };
}

function renderStage({ key, label, state, detail, completed, current, index }) {
  const item = document.createElement('article');
  item.className = `order-stage ${state.className}${current ? ' is-current' : ''}`;
  item.style.setProperty('--stage-index', index);
  const marker = document.createElement('span');
  marker.className = 'order-stage-marker';
  marker.setAttribute('aria-hidden', 'true');
  const content = document.createElement('div');
  const title = document.createElement('h3');
  title.textContent = label;
  const status = document.createElement('span');
  status.className = 'status-pill';
  status.textContent = state.label;
  const note = document.createElement('p');
  note.textContent = detail;
  content.append(title, status, note);
  if (completed) {
    const hint = document.createElement('span');
    hint.className = 'order-stage-hint';
    hint.textContent = 'Klik untuk lihat rincian';
    content.append(hint);
  }
  const button = document.createElement('button');
  button.className = 'order-stage-button';
  button.type = 'button';
  button.dataset.orderStage = key;
  button.disabled = !completed;
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', 'orderStepDetails');
  button.setAttribute('aria-label', `${label}: ${state.label}${completed ? ', lihat rincian' : ''}`);
  button.append(marker, content);
  item.append(button);
  return item;
}

function renderOrder(booking) {
  const approval = booking.bookingApproval || 'Menunggu persetujuan';
  const payment = booking.paymentStatus || 'Belum dipilih';
  const handover = booking.handoverStatus || 'Belum dimulai';
  const approved = approval === 'Disetujui';
  const paid = paymentReady(booking);
  const inspectionDone = booking.vehicleInspectionComplete;
  const handoverDone = handover === 'Disetujui';
  const depositStatus = booking.depositPaymentStatus || '';
  const paymentWaiting = payment === 'Menunggu konfirmasi' || booking.depositPaymentRequired && depositStatus === 'Menunggu konfirmasi';
  const paymentRejected = payment === 'Ditolak' || booking.depositPaymentRequired && depositStatus === 'Ditolak';
  const completedCount = [approved, paid, inspectionDone, handoverDone].filter(Boolean).length;
  const detailPanel = document.getElementById('orderStepDetails');
  detailPanel.hidden = true;
  document.getElementById('orderStepDetailsTitle').textContent = '';
  document.getElementById('orderStepDetailsList').replaceChildren();
  document.getElementById('orderStepNextStep').replaceChildren();

  document.getElementById('orderTitle').textContent = `Booking ${booking.id}`;
  const overall = document.getElementById('orderStatus');
  overall.className = `status-pill ${handoverDone ? 'status-complete' : paid ? 'status-active' : paymentRejected || approval === 'Ditolak' ? 'status-cancelled' : 'status-pending'}`;
  overall.textContent = booking.rentalReturnedAt ? 'Dikembalikan' : handoverDone ? 'Rental berjalan' : booking.status || 'Booking';

  const stages = [
    {
      key: 'booking',
      label: 'Pengajuan booking',
      state: stageState(approved, approval === 'Menunggu persetujuan' ? 'Menunggu persetujuan admin' : approval === 'Ditolak' ? 'Ditolak admin' : ''),
      detail: approval === 'Ditolak'
        ? `Pengajuan ditolak admin${booking.bookingRejectionReason ? `: ${booking.bookingRejectionReason}` : '.'}`
        : 'Admin meninjau data dan ketersediaan kendaraan.',
      completed: approved,
    },
    {
      key: 'payment',
      label: 'Pembayaran',
      state: stageState(paid, paymentWaiting ? 'Menunggu verifikasi admin' : paymentRejected ? 'Ditolak admin' : '', !approved),
      detail: booking.depositPaymentRequired && depositStatus === 'Menunggu konfirmasi'
        ? 'Bukti deposit sudah dikirim dan menunggu verifikasi admin.'
        : booking.depositPaymentRequired && depositStatus === 'Ditolak'
          ? 'Bukti deposit ditolak. Kirim ulang bukti pembayaran deposit.'
          : booking.depositPaymentRequired && depositStatus === 'Dikonfirmasi' && payment === 'Belum dipilih'
            ? `Deposit ${formatCurrency(booking.depositAmount)} dikonfirmasi. Lanjutkan pembayaran sewa sebesar ${formatCurrency(booking.estimatedTotal)}.`
            : payment === 'Menunggu konfirmasi' && booking.depositPaymentRequired
              ? 'Bukti pembayaran sewa sudah dikirim dan menunggu verifikasi admin.'
              : payment === 'Bukti diunggah' ? 'Bukti pembayaran tersimpan; tidak perlu menunggu konfirmasi admin.'
        : payment === 'Bayar ke petugas' ? 'Bayar langsung kepada petugas saat menerima unit.'
          : payment === 'Dikonfirmasi' ? `Pembayaran dikonfirmasi${booking.paymentMethod ? ` · ${booking.paymentMethod}` : ''}.`
        : payment === 'Ditolak' ? 'Pembayaran ditolak. Hubungi admin untuk tindak lanjut.'
          : approved ? 'Booking disetujui. Selesaikan pembayaran untuk melanjutkan.' : 'Dimulai setelah booking disetujui.',
      completed: paid,
    },
    {
      key: 'inspection',
      label: 'Persiapan unit',
      state: stageState(inspectionDone, '', !paid),
      detail: inspectionDone ? `Checklist unit ${booking.vehiclePlate ? `· ${booking.vehiclePlate}` : ''} sudah disiapkan admin.`
        : paid ? 'Menunggu admin menyimpan checklist kondisi unit.' : 'Dimulai setelah pembayaran dikonfirmasi.',
      completed: inspectionDone,
    },
    {
      key: 'handover',
      label: 'Serah-terima',
      state: stageState(handoverDone, handover === 'Menunggu konfirmasi admin' ? 'Menunggu persetujuan admin' : handover === 'Ditolak' ? 'Ditolak · Perlu pengecekan ulang' : '', !inspectionDone),
      detail: handoverDone ? 'Anda sudah mengonfirmasi penerimaan unit; rental sedang berjalan.'
        : handover === 'Menunggu konfirmasi admin' ? 'Foto kondisi sudah dikirim untuk diperiksa.'
          : handover === 'Ditolak' ? `Admin meminta pengecekan ulang${booking.handoverAdminNote ? `: ${booking.handoverAdminNote}` : '.'}`
            : inspectionDone ? 'Kirim foto kondisi kendaraan untuk ditinjau admin.' : 'Dimulai setelah checklist unit selesai.',
      completed: handoverDone,
    },
  ];
  const progress = document.getElementById('orderProgress');
  progress.style.setProperty('--order-progress', `${completedCount > 1 ? (completedCount - 1) / (stages.length - 1) * 75 : 0}%`);
  const currentIndex = stages.findIndex((stage) => !stage.completed);
  progress.replaceChildren(...stages.map((stage, index) => renderStage({
    ...stage,
    index,
    current: index === currentIndex && !stage.state.className.includes('is-rejected'),
  })));
  progress.dataset.completedStages = String(completedCount);

  renderRentalReceipt(booking);
  result.hidden = false;
}

function renderNextStep(key, booking, container) {
  let url = '';
  let label = '';
  let statusMessage = '';

  if (key === 'booking' && booking.bookingApproval === 'Disetujui') {
    if (booking.paymentStatus === 'Menunggu konfirmasi' || booking.depositPaymentRequired && booking.depositPaymentStatus === 'Menunggu konfirmasi') {
      statusMessage = booking.depositPaymentStatus === 'Menunggu konfirmasi'
        ? 'Bukti deposit sudah dikirim dan sedang menunggu verifikasi admin.'
        : 'Pembayaran sewa sudah dikirim dan sedang menunggu verifikasi admin.';
    } else if (!paymentReady(booking)) {
      url = `payment.html?id=${encodeURIComponent(booking.id)}&phone=${encodeURIComponent(booking.phone)}`;
      label = 'Lanjutkan ke pembayaran';
    } else {
      statusMessage = 'Metode pembayaran sudah tersimpan. Selanjutnya admin menyiapkan unit.';
    }
  } else if (key === 'payment' && paymentReady(booking)) {
    if (!booking.vehicleInspectionComplete) {
      statusMessage = 'Menunggu admin menyelesaikan persiapan unit.';
    } else if (booking.handoverStatus === 'Menunggu konfirmasi admin') {
      statusMessage = 'Serah-terima sedang diproses.';
    } else if (booking.handoverStatus !== 'Disetujui') {
      url = `handover.html?id=${encodeURIComponent(booking.id)}&phone=${encodeURIComponent(booking.phone)}`;
      label = booking.handoverStatus === 'Ditolak' ? 'Konfirmasi ulang serah-terima' : 'Lanjutkan ke serah-terima';
    } else {
      statusMessage = 'Serah-terima selesai. Rental sedang berjalan.';
    }
  } else if (key === 'inspection' && booking.vehicleInspectionComplete && paymentReady(booking)) {
    if (booking.handoverStatus === 'Menunggu konfirmasi admin') {
      statusMessage = 'Serah-terima sedang diproses.';
    } else if (booking.handoverStatus === 'Disetujui') {
      statusMessage = 'Serah-terima selesai. Rental sedang berjalan.';
    } else {
      url = `handover.html?id=${encodeURIComponent(booking.id)}&phone=${encodeURIComponent(booking.phone)}`;
      label = booking.handoverStatus === 'Ditolak' ? 'Konfirmasi ulang serah-terima' : 'Lanjutkan ke serah-terima';
    }
  }

  if (url) {
    const link = document.createElement('a');
    link.className = 'btn btn-primary';
    link.href = url;
    link.textContent = label;
    container.append(link);
  } else if (statusMessage) {
    const message = document.createElement('p');
    message.className = 'orders-next-step-message';
    message.textContent = statusMessage;
    container.append(message);
  }
}

function showStageDetails(key) {
  const bookingId = currentBooking.id;
  const panel = document.getElementById('orderStepDetails');
  const title = document.getElementById('orderStepDetailsTitle');
  const list = document.getElementById('orderStepDetailsList');
  const stages = [...document.querySelectorAll('[data-order-stage]')];
  const selected = stages.find((stage) => stage.dataset.orderStage === key);
  if (!selected || selected.disabled) return;

  const currentlyOpen = selected.getAttribute('aria-expanded') === 'true';
  stages.forEach((stage) => {
    stage.setAttribute('aria-expanded', 'false');
    stage.closest('.order-stage').classList.remove('is-selected');
  });
  if (currentlyOpen) {
    panel.hidden = true;
    return;
  }

  const details = {
    booking: {
      title: 'Detail pengajuan booking',
      values: [
        ['ID booking', bookingId],
        ['Nama pemesan', currentBooking.name],
        ['Email', currentBooking.email],
        ['Nomor telepon', currentBooking.phone],
        ['Alamat', currentBooking.address],
        ['Tanggal pengajuan', formatDate(currentBooking.createdAt)],
        ['Persetujuan admin', currentBooking.bookingApproval],
        ['Alasan penolakan', currentBooking.bookingRejectionReason],
        ['Catatan admin pembayaran', currentBooking.paymentAdminNote],
        ['Catatan admin deposit', currentBooking.depositPaymentAdminNote],
        ['Disetujui pada', formatDate(currentBooking.bookingApprovedAt)],
        ['Jenis pemesanan', currentBooking.bookingType],
        ['Jadwal kedatangan', formatDate(currentBooking.arrivalAt)],
        ['Kendaraan', currentBooking.carType],
        ['Durasi', currentBooking.duration],
        ['Layanan', `${currentBooking.driverOption || '-'}${currentBooking.fuelPackage ? ` · ${currentBooking.fuelPackage}` : ''}`],
        ['Paket perjalanan', `${currentBooking.packageName || 'Tanpa paket'}${currentBooking.packageIncludes?.meal ? ' · Makan' : ''}${currentBooking.packageIncludes?.mineralWater ? ' · Air mineral' : ''}`],
        ['Promo', `${currentBooking.promotionName || 'Tanpa promo'}${currentBooking.freeFuelDays ? ` · BBM gratis ${currentBooking.freeFuelDays} hari` : ''}`],
        ['Tarif per hari', formatCurrency(currentBooking.ratePerDay)],
        ['Diskon promo', currentBooking.discountAmount ? formatCurrency(currentBooking.discountAmount) : 'Tidak ada'],
        ['Estimasi biaya rental', formatCurrency(currentBooking.estimatedTotal)],
        ['Deposit', currentBooking.deposit],
        ['Jenis identitas', currentBooking.identityType],
        ['Dokumen yang dikirim', currentBooking.uploadedDocuments?.join(', ') || 'Tidak ada informasi dokumen'],
        ['Asal/tempat tinggal', `${currentBooking.travelType || '-'}${currentBooking.residencyDays ? ` · ${currentBooking.residencyDays} hari` : ''}`],
      ],
    },
    payment: {
      title: 'Detail pembayaran',
      values: [
        ['Status pembayaran', currentBooking.paymentStatus],
        ['Metode pembayaran', currentBooking.paymentMethod],
        ['Estimasi biaya rental', formatCurrency(currentBooking.estimatedTotal)],
        ['Diskon promo', currentBooking.discountAmount ? formatCurrency(currentBooking.discountAmount) : 'Tidak ada'],
        ['Deposit', currentBooking.deposit],
        ['Dikirim pada', formatDate(currentBooking.paymentSubmittedAt)],
        ['Dikonfirmasi pada', formatDate(currentBooking.paymentConfirmedAt)],
      ],
    },
    inspection: {
      title: 'Detail persiapan unit',
      values: [
        ['Status checklist', currentBooking.vehicleInspectionComplete ? 'Selesai' : 'Belum dimulai'],
        ['Plat unit', currentBooking.vehicleInspection?.plate || currentBooking.vehiclePlate],
        ['Odometer', currentBooking.vehicleInspection?.odometerKm ? `${Number(currentBooking.vehicleInspection.odometerKm).toLocaleString('id-ID')} km` : ''],
        ['Kondisi bensin', currentBooking.vehicleInspection?.fuelLevel],
        ['Kondisi bodi', currentBooking.vehicleInspection?.bodyCondition],
        ['Catatan bodi', currentBooking.vehicleInspection?.bodyNotes],
        ['Interior', currentBooking.vehicleInspection?.interiorCondition],
        ['Lampu', currentBooking.vehicleInspection?.lightsCondition],
        ['Ban', currentBooking.vehicleInspection?.tiresCondition],
        ['Mesin', currentBooking.vehicleInspection?.engineCondition],
        ['Kelengkapan unit', currentBooking.vehicleInspection?.equipmentCondition],
        ['Catatan admin', currentBooking.vehicleInspection?.notes],
        ['Checklist disimpan pada', formatDate(currentBooking.vehicleInspection?.checkedAt)],
      ],
    },
    handover: {
      title: 'Detail serah-terima',
      values: [
        ['Status serah-terima', currentBooking.handoverStatus],
        ['Status pelanggan', currentBooking.customerHandoverCompletedAt ? 'Serah-terima selesai' : 'Belum selesai'],
        ['Waktu serah-terima', formatDate(currentBooking.customerHandoverCompletedAt || currentBooking.handoverSubmittedAt)],
        ['Catatan admin', currentBooking.handoverAdminNote],
        ['Waktu mulai sewa', formatDate(currentBooking.rentalStartedAt)],
        ['Status pengembalian unit', currentBooking.rentalReturnedAt ? 'Sudah dikembalikan' : 'Belum dikembalikan'],
        ['Unit dikembalikan pada', formatDate(currentBooking.rentalReturnedAt)],
        ['Plat saat kembali', currentBooking.returnInspection?.plate],
        ['Odometer saat kembali', currentBooking.returnInspection?.odometerKm === undefined ? '' : `${Number(currentBooking.returnInspection.odometerKm).toLocaleString('id-ID')} km`],
        ['Bensin saat kembali', currentBooking.returnInspection?.fuelLevel],
        ['Kondisi bodi saat kembali', currentBooking.returnInspection?.bodyCondition],
        ['Catatan bodi saat kembali', currentBooking.returnInspection?.bodyNotes],
        ['Interior saat kembali', currentBooking.returnInspection?.interiorCondition],
        ['Lampu saat kembali', currentBooking.returnInspection?.lightsCondition],
        ['Ban saat kembali', currentBooking.returnInspection?.tiresCondition],
        ['Mesin saat kembali', currentBooking.returnInspection?.engineCondition],
        ['Kelengkapan saat kembali', currentBooking.returnInspection?.equipmentCondition],
        ['Catatan pengembalian', currentBooking.returnInspection?.notes],
        ['Checklist kembali disimpan pada', formatDate(currentBooking.returnInspection?.checkedAt)],
      ],
    },
  }[key];
  if (!details) return;

  title.textContent = details.title;
  list.replaceChildren();
  details.values.forEach(([label, value]) => addDetail(list, label, value));
  const nextStep = document.getElementById('orderStepNextStep');
  nextStep.replaceChildren();
  renderNextStep(key, currentBooking, nextStep);
  panel.hidden = false;
  selected.setAttribute('aria-expanded', 'true');
  selected.closest('.order-stage').classList.add('is-selected');
  panel.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest' });
}

document.getElementById('orderProgress').addEventListener('click', (event) => {
  const button = event.target.closest('[data-order-stage]');
  if (button) showStageDetails(button.dataset.orderStage);
});

document.getElementById('closeOrderStepDetails').addEventListener('click', () => {
  document.getElementById('orderStepDetails').hidden = true;
  document.querySelectorAll('[data-order-stage]').forEach((button) => {
    button.setAttribute('aria-expanded', 'false');
    button.closest('.order-stage').classList.remove('is-selected');
  });
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const bookingId = String(formData.get('bookingId') || '').trim().toUpperCase();
  const phone = String(formData.get('phone') || '').trim();
  message.classList.remove('is-error');
  message.textContent = 'Memuat detail pesanan...';
  result.hidden = true;

  try {
    const phoneQuery = phone ? `?phone=${encodeURIComponent(phone)}` : '';
    const booking = await DriveLinkAPI.get(`/api/bookings/${encodeURIComponent(bookingId)}/details${phoneQuery}`);
    currentBooking = booking;
    renderOrder(booking);
    message.textContent = '';
  } catch (error) {
    message.textContent = error.message;
    message.classList.add('is-error');
  }
});
