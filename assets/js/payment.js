const params = new URLSearchParams(window.location.search);
const bookingId = (params.get('id') || '').trim().toUpperCase();
const phone = normalizePhone(params.get('phone') || '');
const form = document.getElementById('paymentForm');
const message = document.getElementById('paymentMessage');
const instructions = document.getElementById('paymentInstructions');
const proofWrap = document.getElementById('paymentProofWrap');
const proofInput = document.getElementById('paymentProof');
const submitButton = document.getElementById('paymentSubmit');
const refreshStatusButton = document.getElementById('refreshPaymentStatus');
const stageDetails = document.getElementById('paymentStageDetails');
let settings = {};
let currentBooking = null;
let paymentStage = 'rental';

function normalizePhone(value) {
  return String(value).replace(/\D/g, '').replace(/^62/, '0');
}

function findBooking() {
  return currentBooking;
}

function bookingApprovalStatus(booking) {
  return booking.bookingApproval || (booking.status === 'Booking' ? 'Menunggu persetujuan' : 'Disetujui');
}

function formatArrival(value) {
  if (!value) return '-';
  const arrival = new Date(value);
  return Number.isNaN(arrival.getTime())
    ? value
    : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(arrival);
}

function showBooking(booking) {
  const summary = document.getElementById('bookingSummary');
  const details = [
    ['ID booking', booking.id],
    ['Kendaraan', `${booking.carType}${booking.vehicleColor ? ` · ${booking.vehicleColor}` : ''}`],
    ...(booking.packageName ? [[
      'Paket perjalanan',
      `${booking.packageName}${booking.packageIncludes?.meal ? ' · Makan' : ''}${booking.packageIncludes?.mineralWater ? ' · Air mineral' : ''}`,
    ]] : []),
    ...(booking.promotionName ? [[
      'Promo',
      `${booking.promotionName}${booking.freeFuelDays ? ` · BBM gratis ${booking.freeFuelDays} hari` : ''}`,
    ]] : []),
    ['Durasi', booking.duration],
    ['Jenis pemesanan', booking.bookingType || 'Reservasi'],
    ['Jadwal datang ke lokasi', formatArrival(booking.arrivalAt)],
    ['Layanan', booking.driverOption === 'Pakai driver' && booking.fuelPackage
      ? `${booking.driverOption} · ${booking.fuelPackage}`
      : booking.driverOption],
    ['Tarif per hari', booking.ratePerDay ? formatCurrency(booking.ratePerDay) : '-'],
    ...(booking.discountAmount ? [['Diskon promo', `−${formatCurrency(booking.discountAmount)}`]] : []),
    ['Estimasi biaya rental', booking.estimatedTotal ? formatCurrency(booking.estimatedTotal) : '-'],
    ...(booking.depositAmount ? [['Nominal deposit', formatCurrency(booking.depositAmount)]] : []),
    ...(booking.depositPaymentRequired ? [['Status deposit', booking.depositPaymentStatus || 'Belum dibayar']] : []),
    ['Status pembayaran', booking.paymentStatus || 'Belum dipilih'],
  ];
  summary.replaceChildren();
  details.forEach(([label, value]) => {
    const item = document.createElement('div');
    const title = document.createElement('span');
    title.textContent = label;
    const detail = document.createElement('strong');
    detail.textContent = value || '-';
    item.append(title, detail);
    summary.append(item);
  });

  if (bookingApprovalStatus(booking) === 'Menunggu persetujuan') {
    form.hidden = true;
    message.textContent = 'Pengajuan booking menunggu persetujuan admin. Tekan tombol di bawah setelah admin menyetujui untuk memuat pilihan pembayaran.';
    refreshStatusButton.hidden = false;
    return;
  }
  if (bookingApprovalStatus(booking) === 'Ditolak') {
    form.hidden = true;
    message.textContent = 'Pengajuan booking ditolak admin. Silakan hubungi DriveLink untuk informasi lebih lanjut.';
    message.classList.add('is-error');
    return;
  }

  if (booking.depositPaymentRequired) {
    if (booking.depositPaymentStatus === 'Menunggu konfirmasi' || booking.paymentStatus === 'Menunggu konfirmasi') {
      const waitingForDeposit = booking.depositPaymentStatus === 'Menunggu konfirmasi';
      form.hidden = true;
      message.textContent = waitingForDeposit
        ? 'Bukti pembayaran deposit sudah dikirim dan sedang menunggu verifikasi admin. Pembayaran sewa akan dibuka setelah deposit dikonfirmasi.'
        : 'Bukti pembayaran sewa sudah dikirim dan sedang menunggu verifikasi admin. Persiapan unit dimulai setelah pembayaran disetujui.';
      refreshStatusButton.textContent = 'Periksa status verifikasi';
      refreshStatusButton.hidden = false;
      return;
    }
    if (booking.paymentStatus !== 'Dikonfirmasi') {
      paymentStage = booking.depositPaymentStatus === 'Dikonfirmasi' ? 'rental' : 'deposit';
      const amount = paymentStage === 'deposit' ? booking.depositAmount : booking.estimatedTotal;
      document.getElementById('paymentMethodLegend').textContent = paymentStage === 'deposit'
        ? 'Pilih metode pembayaran deposit'
        : 'Pilih metode pembayaran biaya sewa';
      stageDetails.hidden = false;
      stageDetails.textContent = paymentStage === 'deposit'
        ? `Tahap 1 dari 2 · Bayar deposit ${formatCurrency(amount)}. Admin harus mengonfirmasi deposit sebelum pembayaran sewa dibuka.`
        : `Tahap 2 dari 2 · Deposit telah dikonfirmasi. Bayar biaya sewa ${formatCurrency(amount)} dan tunggu verifikasi admin sebelum persiapan unit.`;
      submitButton.textContent = paymentStage === 'deposit' ? 'Kirim bukti pembayaran deposit' : 'Kirim bukti pembayaran sewa';
      if (booking.depositPaymentStatus === 'Ditolak' || booking.paymentStatus === 'Ditolak') {
        message.textContent = paymentStage === 'deposit'
          ? 'Bukti deposit ditolak admin. Periksa bukti atau metode pembayaran, lalu kirim ulang.'
          : 'Bukti pembayaran sewa ditolak admin. Periksa bukti atau metode pembayaran, lalu kirim ulang.';
        message.classList.add('is-error');
      }
    }
  }

  if (booking.paymentStatus === 'Ditolak') {
    if (!booking.depositPaymentRequired) message.textContent = 'Pembayaran ditolak admin. Periksa metode atau bukti, lalu kirim kembali.';
  } else if (['Bukti diunggah', 'Bayar ke petugas', 'Dikonfirmasi'].includes(booking.paymentStatus)) {
    if (booking.arrivalAt && !booking.vehicleInspectionComplete) {
      message.textContent = booking.paymentStatus === 'Bukti diunggah'
        ? 'Bukti pembayaran sudah tersimpan. Admin sedang menyiapkan unit; tidak perlu menunggu konfirmasi pembayaran.'
        : booking.paymentStatus === 'Bayar ke petugas'
          ? 'Pilihan tunai tersimpan. Bayar langsung kepada petugas saat serah-terima; admin sedang menyiapkan unit.'
          : 'Metode pembayaran sudah tersimpan. Admin sedang menyiapkan checklist unit.';
      refreshStatusButton.textContent = 'Periksa persiapan unit';
      refreshStatusButton.hidden = false;
      submitButton.hidden = true;
      return;
    }
    message.textContent = 'Persiapan unit selesai. Lanjutkan ke serah-terima untuk memeriksa dan mengonfirmasi penerimaan unit.';
    const handoverLink = document.createElement('a');
    handoverLink.className = 'btn btn-primary full-width';
    handoverLink.href = `handover.html?id=${encodeURIComponent(booking.id)}&phone=${encodeURIComponent(booking.phone)}`;
    handoverLink.textContent = 'Lanjutkan ke serah-terima';
    form.append(handoverLink);
    submitButton.hidden = true;
    return;
  }

  const savedMethod = paymentStage === 'deposit' ? booking.depositPaymentMethod : booking.paymentMethod;
  if (savedMethod) {
    const selected = form.querySelector(`input[name="paymentMethod"][value="${CSS.escape(savedMethod)}"]`);
    if (selected) selected.checked = true;
    updateInstructions(savedMethod);
  }
  updateSubmitAvailability();
}

function updateInstructions(method) {
  instructions.replaceChildren();
  instructions.hidden = false;
  proofWrap.hidden = method === 'Cash ke petugas' && !currentBooking?.depositPaymentRequired;
  proofInput.required = Boolean(currentBooking?.depositPaymentRequired) || method !== 'Cash ke petugas';
  if (currentBooking?.depositPaymentRequired) {
    const amount = paymentStage === 'deposit' ? currentBooking.depositAmount : currentBooking.estimatedTotal;
    const amountNote = document.createElement('p');
    amountNote.className = 'payment-amount-note';
    amountNote.textContent = `Nominal tahap ini: ${formatCurrency(amount)}. Bukti akan diverifikasi admin.`;
    instructions.append(amountNote);
  }

  if (method === 'QRIS') {
    const heading = document.createElement('strong');
    heading.textContent = 'Pembayaran QRIS';
    instructions.append(heading);
    if (settings.qrImage) {
      const image = document.createElement('img');
      image.src = settings.qrImage;
      image.alt = 'QRIS DriveLink';
      image.className = 'payment-qr-image';
      instructions.append(image);
    } else {
      const note = document.createElement('p');
      note.textContent = 'QRIS belum tersedia. Hubungi admin atau pilih metode pembayaran lain.';
      instructions.append(note);
    }
    const name = document.createElement('p');
    name.textContent = settings.qrName ? `Atas nama: ${settings.qrName}` : 'Admin belum mengatur nama penerima.';
    instructions.append(name);
  } else if (method === 'Transfer bank') {
    const heading = document.createElement('strong');
    heading.textContent = 'Informasi rekening';
    instructions.append(heading);
    if (settings.bankName && settings.bankAccount && settings.bankHolder) {
      const bankName = document.createElement('p');
      bankName.textContent = `Bank: ${settings.bankName}`;
      const accountHolder = document.createElement('p');
      accountHolder.textContent = `Atas nama: ${settings.bankHolder}`;
      const accountNumber = document.createElement('p');
      accountNumber.className = 'bank-account-number';
      accountNumber.textContent = settings.bankAccount;
      const copyAccountButton = document.createElement('button');
      copyAccountButton.type = 'button';
      copyAccountButton.className = 'btn btn-secondary copy-payment-button';
      copyAccountButton.dataset.copyPayment = settings.bankAccount;
      copyAccountButton.textContent = 'Salin nomor rekening';
      const copyDetailsButton = document.createElement('button');
      copyDetailsButton.type = 'button';
      copyDetailsButton.className = 'btn btn-secondary copy-payment-button';
      copyDetailsButton.dataset.copyPayment = `${settings.bankName} · ${settings.bankAccount} · a.n. ${settings.bankHolder}`;
      copyDetailsButton.textContent = 'Salin semua detail rekening';
      instructions.append(bankName, accountHolder, accountNumber, copyAccountButton, copyDetailsButton);
    } else {
      const note = document.createElement('p');
      note.textContent = 'Informasi rekening belum lengkap. Hubungi admin atau pilih metode lain.';
      instructions.append(note);
    }
  } else {
    const heading = document.createElement('strong');
    heading.textContent = currentBooking?.depositPaymentRequired
      ? 'Pembayaran tunai ke petugas'
      : 'Pembayaran cash ke petugas';
    const note = document.createElement('p');
    note.textContent = currentBooking?.depositPaymentRequired
      ? 'Bayar tunai kepada petugas DriveLink, lalu unggah foto kuitansi atau bukti penerimaan agar admin dapat memverifikasi pembayaran.'
      : 'Bayar langsung kepada petugas saat menerima unit. Setelah metode tunai dipilih, admin dapat langsung menyiapkan unit.';
    instructions.append(heading, note);
  }
}

function formatCurrency(value) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function isPaymentConfigured(method) {
  if (method === 'QRIS') return Boolean(settings.qrImage);
  if (method === 'Transfer bank') return Boolean(settings.bankName && settings.bankAccount && settings.bankHolder);
  return method === 'Cash ke petugas';
}

function updateSubmitAvailability() {
  const method = form.querySelector('input[name="paymentMethod"]:checked')?.value;
  const configured = isPaymentConfigured(method);
  const requiresProof = Boolean(currentBooking?.depositPaymentRequired) || method !== 'Cash ke petugas';
  submitButton.disabled = !method || !configured || (requiresProof && !proofInput.files[0]);
  if (method && !configured) {
    message.textContent = method === 'QRIS'
      ? 'QRIS belum diatur admin. Pilih metode lain atau hubungi admin.'
      : 'Rekening bank belum lengkap. Pilih metode lain atau hubungi admin.';
  } else if (message.textContent.includes('belum diatur admin') || message.textContent.includes('belum lengkap')) {
    message.textContent = '';
  }
}

if (!bookingId || !phone) {
  form.hidden = true;
  message.textContent = 'Booking tidak ditemukan. Kembali ke form booking dan mulai pengajuan baru.';
  message.classList.add('is-error');
} else {
  Promise.all([
    DriveLinkAPI.get(`/api/bookings/${encodeURIComponent(bookingId)}?phone=${encodeURIComponent(phone)}`),
    DriveLinkAPI.get('/api/payment-settings'),
  ]).then(([booking, paymentSettings]) => {
    currentBooking = booking;
    settings = paymentSettings;
    if (booking.paymentStatus === 'Dikonfirmasi') {
      const stage = document.querySelector('.page-hero .eyebrow');
      stage.textContent = 'Tahap 3 dari 4 · Serah-terima';
    }
    showBooking(booking);
  }).catch((error) => {
    form.hidden = true;
    message.textContent = error.message;
    message.classList.add('is-error');
  });
}

form.querySelectorAll('input[name="paymentMethod"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    updateInstructions(radio.value);
    updateSubmitAvailability();
  });
});
proofInput.addEventListener('change', () => {
  const file = proofInput.files[0];
  document.getElementById('paymentProofName').textContent = file?.name || 'Belum ada file dipilih';
  proofInput.setCustomValidity(file && (file.size > 400 * 1024 || !['image/jpeg', 'image/png'].includes(file.type))
    ? 'Pilih foto JPG atau PNG maksimal 400 KB.'
    : '');
  updateSubmitAvailability();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const method = form.querySelector('input[name="paymentMethod"]:checked')?.value;
  const booking = findBooking();
  if (!booking || bookingApprovalStatus(booking) !== 'Disetujui' || !method || !isPaymentConfigured(method)) {
    message.textContent = 'Booking atau metode pembayaran tidak valid. Muat ulang halaman dan coba kembali.';
    message.classList.add('is-error');
    return;
  }
  const file = proofInput.files[0];
  const requiresProof = Boolean(booking.depositPaymentRequired) || method !== 'Cash ke petugas';
  if (requiresProof && (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) {
    message.textContent = 'Pilih bukti pembayaran atau kuitansi tunai berupa foto JPG/PNG. Foto dikompresi otomatis.';
    message.classList.add('is-error');
    return;
  }

  try {
    submitButton.disabled = true;
    message.classList.remove('is-error');
    message.textContent = file ? 'Mengompresi bukti pembayaran...' : 'Menyimpan pilihan pembayaran...';
    // Bukti pembayaran dikompresi ke 360 KB (batas server 400 KB).
    const proofImage = file
      ? (await DriveLinkImages.compress(file, {
        maxBytes: 360 * 1024,
        maxEdge: 1600,
        label: 'Bukti pembayaran',
      })).dataUrl
      : '';
    currentBooking = await DriveLinkAPI.post(`/api/bookings/${encodeURIComponent(bookingId)}/payment`, {
      phone: booking.phone,
      ...(booking.depositPaymentRequired ? { stage: paymentStage } : {}),
      method,
      proof: proofImage,
    });
    form.querySelectorAll('input, button').forEach((input) => { input.disabled = true; });
    message.classList.remove('is-error');
    showBooking(currentBooking);
    message.classList.remove('is-error');
    message.textContent = method === 'Cash ke petugas'
      ? 'Pilihan tunai tersimpan. Bayar langsung kepada petugas saat menerima unit; persiapan unit dapat langsung dimulai.'
      : 'Bukti pembayaran tersimpan. Persiapan unit dapat langsung dimulai tanpa menunggu konfirmasi admin.';
  } catch (error) {
    // Aktifkan lagi tombol supaya pengguna bisa mencoba ulang berkas yang sama.
    submitButton.disabled = false;
    message.textContent = error.message;
    message.classList.add('is-error');
  }
});

refreshStatusButton.addEventListener('click', () => window.location.reload());

instructions.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-copy-payment]');
  if (!button) return;
  try {
    await navigator.clipboard.writeText(button.dataset.copyPayment);
    message.classList.remove('is-error');
    message.textContent = 'Detail rekening berhasil disalin.';
  } catch {
    message.classList.add('is-error');
    message.textContent = 'Gagal menyalin otomatis. Silakan pilih dan salin nomor rekening secara manual.';
  }
});
