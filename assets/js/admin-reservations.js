// Modul halaman Reservasi: pengaturan jenis pemesanan, jadwal datang, dan jaminan,
// plus hitung mundur kedatangan pada tabel reservasi.
//
// Dimuat hanya oleh admin-reservations.html.
const reservationPolicyForm = document.getElementById('reservationPolicyForm');
const reservationTypeList = document.getElementById('reservationTypeList');
const reservationCollateralList = document.getElementById('reservationCollateralList');
const reservationPolicyMessage = document.getElementById('reservationPolicyMessage');
const arrivalGraceInput = document.getElementById('arrivalGraceMinutes');

let arrivalGraceMinutes = 30;
let arrivalTickInterval = null;

function createReservationTypeRow(type = {}) {
  const row = document.createElement('div');
  row.className = 'rental-policy-row rental-deposit-option';
  row.innerHTML = `
    <label>Nama jenis<input name="typeLabel" type="text" maxlength="100" required /></label>
    <label>Keterangan<input name="typeDescription" type="text" maxlength="180" required /></label>
    <label class="rental-policy-check"><input name="typeRequiresFuture" type="checkbox" /> <span>Wajib jadwal kedatangan di masa depan</span></label>
    <button class="rental-policy-remove" type="button" aria-label="Hapus jenis pemesanan">×</button>
  `;
  row.querySelector('[name="typeLabel"]').value = type.label || '';
  row.querySelector('[name="typeDescription"]').value = type.description || '';
  row.querySelector('[name="typeRequiresFuture"]').checked = Boolean(type.requiresFutureArrival);
  row.querySelector('.rental-policy-remove').addEventListener('click', () => {
    if (reservationTypeList.children.length <= 1) {
      reservationPolicyMessage.textContent = 'Minimal harus ada satu jenis pemesanan.';
      reservationPolicyMessage.classList.add('is-error');
      return;
    }
    row.remove();
  });
  reservationTypeList.append(row);
}

function createReservationCollateralRow(value = '') {
  const row = document.createElement('div');
  row.className = 'rental-policy-row rental-collateral-item';
  row.innerHTML = `
    <label>Barang jaminan<input name="collateralItem" type="text" maxlength="60" /></label>
    <button class="rental-policy-remove" type="button" aria-label="Hapus barang jaminan">×</button>
  `;
  row.querySelector('[name="collateralItem"]').value = value;
  row.querySelector('.rental-policy-remove').addEventListener('click', () => {
    row.remove();
  });
  reservationCollateralList.append(row);
}

function renderReservationPolicy(policy) {
  reservationTypeList.replaceChildren();
  reservationCollateralList.replaceChildren();
  policy.bookingTypes.forEach(createReservationTypeRow);
  (policy.collateralItems || []).forEach(createReservationCollateralRow);
  arrivalGraceInput.value = String(policy.arrivalGraceMinutes ?? 30);
  arrivalGraceMinutes = Number(policy.arrivalGraceMinutes ?? 30);
}

document.getElementById('addReservationType').addEventListener('click', () => {
  if (reservationTypeList.children.length >= 8) {
    reservationPolicyMessage.textContent = 'Maksimal delapan jenis pemesanan.';
    reservationPolicyMessage.classList.add('is-error');
    return;
  }
  createReservationTypeRow();
});
document.getElementById('addReservationCollateral').addEventListener('click', () => {
  if (reservationCollateralList.children.length >= 10) {
    reservationPolicyMessage.textContent = 'Maksimal sepuluh barang jaminan.';
    reservationPolicyMessage.classList.add('is-error');
    return;
  }
  createReservationCollateralRow();
});

reservationPolicyForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const bookingTypes = [...reservationTypeList.querySelectorAll('.rental-deposit-option')].map((row) => ({
    label: row.querySelector('[name="typeLabel"]').value.trim(),
    description: row.querySelector('[name="typeDescription"]').value.trim(),
    requiresFutureArrival: row.querySelector('[name="typeRequiresFuture"]').checked,
  }));
  const collateralItems = [...reservationCollateralList.querySelectorAll('[name="collateralItem"]')]
    .map((input) => input.value.trim())
    .filter(Boolean);
  const uniqueLabels = new Set(bookingTypes.map(({ label }) => label.toLocaleLowerCase('id-ID')));
  const uniqueCollateral = new Set(collateralItems.map((item) => item.toLocaleLowerCase('id-ID')));
  if (!bookingTypes.length || uniqueLabels.size !== bookingTypes.length
    || bookingTypes.some(({ label, description }) => !label || !description)) {
    reservationPolicyMessage.textContent = 'Isi minimal satu jenis pemesanan dengan nama dan keterangan yang berbeda.';
    reservationPolicyMessage.classList.add('is-error');
    return;
  }
  if (uniqueCollateral.size !== collateralItems.length) {
    reservationPolicyMessage.textContent = 'Nama barang jaminan harus berbeda satu sama lain.';
    reservationPolicyMessage.classList.add('is-error');
    return;
  }
  try {
    const saved = await DriveLinkAPI.put('/api/admin/reservation-policy', {
      bookingTypes,
      arrivalGraceMinutes: Number(arrivalGraceInput.value),
      collateralItems,
    });
    renderReservationPolicy(saved);
    reservationPolicyMessage.textContent = 'Pengaturan reservasi berhasil disimpan.';
    reservationPolicyMessage.classList.remove('is-error');
    updateArrivalTimers();
  } catch (error) {
    reservationPolicyMessage.textContent = `Pengaturan reservasi gagal disimpan: ${error.message}`;
    reservationPolicyMessage.classList.add('is-error');
  }
});

// --- Hitung mundur kedatangan ---

// Status kedatangan: Menunggu sebelum jadwal, Datang dalam toleransi, Terlambat,
// atau Selesai bila penyewa sudah menerima unit.
function arrivalState(booking, now = Date.now()) {
  if (!booking.arrivalAt) return { key: 'unknown', label: 'Belum diatur', tone: 'pending' };
  const arrival = new Date(booking.arrivalAt).getTime();
  if (Number.isNaN(arrival)) return { key: 'unknown', label: 'Tidak terbaca', tone: 'pending' };
  if (booking.rentalStartedAt || booking.handoverStatus === 'Disetujui') {
    return { key: 'done', label: 'Sudah datang', tone: 'complete' };
  }
  const difference = arrival - now;
  if (difference > 0) {
    const totalMinutes = Math.ceil(difference / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    const parts = [];
    if (days) parts.push(`${days} hari`);
    if (hours) parts.push(`${hours} jam`);
    parts.push(`${minutes} menit`);
    return { key: 'waiting', label: `Datang dalam ${parts.join(' ')}`, tone: 'active' };
  }
  const lateMinutes = Math.floor(-difference / 60000);
  if (lateMinutes <= arrivalGraceMinutes) {
    return { key: 'arriving', label: 'Sudah tiba', tone: 'active' };
  }
  const overdue = lateMinutes - arrivalGraceMinutes;
  return { key: 'late', label: `Terlambat ${overdue} menit`, tone: 'cancelled' };
}

// Perbarui sel `[data-arrival-cell]` yang ada di tabel reservasi.
function updateArrivalTimers() {
  const bookings = typeof readBookings === 'function' ? readBookings() : [];
  document.querySelectorAll('[data-arrival-cell]').forEach((cell) => {
    const booking = bookings.find((item) => item.id === cell.dataset.arrivalCell);
    if (!booking) return;
    const state = arrivalState(booking);
    const pill = cell.querySelector('.arrival-status');
    if (!pill) return;
    pill.textContent = state.label;
    pill.className = `arrival-status status-${state.tone}`;
  });
  if (typeof renderBookings === 'function') renderBookings();
  if (arrivalTickInterval) window.clearInterval(arrivalTickInterval);
  arrivalTickInterval = window.setInterval(() => {
    if (typeof readBookings === 'function' && document.querySelector('[data-arrival-cell]')) updateArrivalTimers();
  }, 60000);
}

if (reservationPolicyForm) {
  DriveLinkAPI.get('/api/admin/reservation-policy').then((policy) => {
    renderReservationPolicy(policy);
    updateArrivalTimers();
  }).catch((error) => {
    arrivalGraceMinutes = 30;
    renderReservationPolicy({ bookingTypes: [], arrivalGraceMinutes: 30, collateralItems: [] });
    reservationPolicyMessage.textContent = `Pengaturan reservasi gagal dimuat: ${error.message}`;
    reservationPolicyMessage.classList.add('is-error');
  });
}