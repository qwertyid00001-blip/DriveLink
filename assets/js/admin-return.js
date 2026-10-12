const lookupForm = document.getElementById('returnLookupForm');
const inspectionForm = document.getElementById('returnInspectionForm');
const lookupMessage = document.getElementById('returnLookupMessage');
const comparisonMessage = document.getElementById('returnComparisonStatus');
const summary = document.getElementById('returnBookingSummary');
const inspectionPanel = document.getElementById('returnInspectionPanel');
const comparisonBody = document.getElementById('returnComparisonBody');
const submitButton = document.getElementById('returnInspectionSubmit');
let currentBooking = null;

const inspectionFields = [
  ['plate', 'Plat kendaraan'],
  ['odometerKm', 'Odometer'],
  ['fuelLevel', 'Kondisi bensin'],
  ['bodyCondition', 'Kondisi bodi'],
  ['bodyNotes', 'Catatan bodi'],
  ['interiorCondition', 'Kondisi interior'],
  ['lightsCondition', 'Kondisi lampu'],
  ['tiresCondition', 'Kondisi ban'],
  ['engineCondition', 'Kondisi mesin dan indikator'],
  ['equipmentCondition', 'Kelengkapan kendaraan'],
  ['notes', 'Catatan tambahan'],
];

function displayDate(value) {
  if (!value) return 'Belum dicatat';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Belum dicatat'
    : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function fieldValue(record, key) {
  if (!record || record[key] === undefined || record[key] === null || record[key] === '') return '-';
  if (key === 'odometerKm') return `${Number(record[key]).toLocaleString('id-ID')} km`;
  return String(record[key]);
}

function setMessage(element, text, isError = false) {
  element.textContent = text;
  element.classList.toggle('is-error', isError);
}

function renderSummary(booking) {
  summary.replaceChildren();
  const title = document.createElement('strong');
  title.textContent = `${booking.id} · ${booking.name}`;
  const detail = document.createElement('p');
  detail.textContent = `${booking.carType} · ${booking.duration} · Mulai sewa ${displayDate(booking.rentalStartedAt)}`;
  const status = document.createElement('p');
  status.className = 'return-booking-status';
  status.textContent = booking.rentalReturnedAt
    ? `Dikembalikan pada ${displayDate(booking.rentalReturnedAt)}`
    : `Status saat ini: ${booking.status}`;
  summary.append(title, detail, status);
  summary.hidden = false;
}

function renderComparison(booking) {
  const original = booking.vehicleInspection || {};
  const returned = booking.returnInspection || {};
  comparisonBody.replaceChildren(...inspectionFields.map(([key, label]) => {
    const before = fieldValue(original, key);
    const after = fieldValue(returned, key);
    const hasReturnValue = Boolean(booking.returnInspection);
    const matches = hasReturnValue && before === after;
    const row = document.createElement('tr');
    const labelCell = document.createElement('th');
    labelCell.scope = 'row';
    labelCell.textContent = label;
    const beforeCell = document.createElement('td');
    beforeCell.textContent = before;
    const afterCell = document.createElement('td');
    afterCell.textContent = after;
    const resultCell = document.createElement('td');
    const result = document.createElement('span');
    result.className = `return-match-pill ${!hasReturnValue ? 'is-pending' : matches ? 'is-match' : 'is-different'}`;
    result.textContent = !hasReturnValue ? 'Belum dicek' : matches ? 'Sesuai' : 'Berbeda';
    resultCell.append(result);
    row.append(labelCell, beforeCell, afterCell, resultCell);
    return row;
  }));
}

function showBooking(booking) {
  currentBooking = booking;
  renderSummary(booking);
  inspectionPanel.hidden = false;
  if (!booking.vehicleInspection) {
    inspectionPanel.hidden = true;
    inspectionForm.hidden = true;
    setMessage(lookupMessage, 'Checklist kondisi awal belum tersedia. Lengkapi persiapan unit terlebih dahulu.', true);
    return;
  }
  if (booking.returnInspection) {
    renderComparison(booking);
    inspectionForm.hidden = true;
    setMessage(comparisonMessage, `Checklist pengembalian tersimpan pada ${displayDate(booking.returnInspection.checkedAt)}.`);
    return;
  }
  if (booking.handoverStatus !== 'Disetujui') {
    inspectionPanel.hidden = true;
    inspectionForm.hidden = true;
    setMessage(lookupMessage, 'Unit belum diserahkan kepada pelanggan. Checklist pengembalian belum dapat dibuat.', true);
    return;
  }

  inspectionForm.reset();
  inspectionForm.elements.plate.value = booking.vehicleInspection.plate || '';
  inspectionForm.elements.odometerKm.value = booking.vehicleInspection.odometerKm ?? '';
  renderComparison(booking);
  inspectionForm.hidden = false;
  setMessage(comparisonMessage, 'Isi kondisi aktual saat kendaraan kembali. Checklist awal tidak akan ditimpa.');
  setMessage(lookupMessage, 'Booking ditemukan. Periksa kondisi unit, lalu simpan checklist pengembalian.');
}

lookupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const bookingId = String(lookupForm.elements.bookingId.value || '').trim().toUpperCase();
  if (!bookingId) return;
  lookupForm.querySelector('button[type="submit"]').disabled = true;
  currentBooking = null;
  inspectionPanel.hidden = true;
  summary.hidden = true;
  setMessage(lookupMessage, 'Memuat booking...');
  try {
    const booking = await DriveLinkAPI.get(`/api/admin/bookings/${encodeURIComponent(bookingId)}/return`);
    setMessage(lookupMessage, '');
    showBooking(booking);
  } catch (error) {
    setMessage(lookupMessage, `Booking gagal dimuat: ${error.message}`, true);
  } finally {
    lookupForm.querySelector('button[type="submit"]').disabled = false;
  }
});

inspectionForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!currentBooking || !inspectionForm.reportValidity()) return;
  const payload = Object.fromEntries(new FormData(inspectionForm));
  payload.odometerKm = Number(payload.odometerKm);
  submitButton.disabled = true;
  setMessage(comparisonMessage, 'Menyimpan checklist pengembalian...');
  try {
    const result = await DriveLinkAPI.patch(`/api/admin/bookings/${encodeURIComponent(currentBooking.id)}/return`, payload);
    currentBooking.status = result.status;
    currentBooking.rentalReturnedAt = result.rentalReturnedAt;
    currentBooking.returnInspection = result.returnInspection;
    renderSummary(currentBooking);
    renderComparison(currentBooking);
    inspectionForm.hidden = true;
    setMessage(comparisonMessage, `Booking ditandai sudah dikembalikan pada ${displayDate(result.rentalReturnedAt)}.`);
  } catch (error) {
    setMessage(comparisonMessage, `Checklist pengembalian gagal disimpan: ${error.message}`, true);
  } finally {
    submitButton.disabled = false;
  }
});

document.getElementById('todayLabel').textContent = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
}).format(new Date());
document.getElementById('logoutButton').addEventListener('click', () => {
  localStorage.removeItem('drivelink-session');
  window.location.href = 'auth.html';
});

const requestedBookingId = new URLSearchParams(window.location.search).get('booking');
if (requestedBookingId) {
  lookupForm.elements.bookingId.value = requestedBookingId;
  lookupForm.requestSubmit();
}
