// Memuat pilihan jenis pemesanan dari server untuk form booking.
// Daftar ini dikelola admin pada halaman Reservasi.
const bookingTypeOptions = document.getElementById('bookingTypeOptions');

function escapeBookingTypeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

// Simpan jenis pemesanan agar halaman lain (mis. draft) bisa menyesuaikan aturan jadwal.
let bookingTypeRules = [];

function renderBookingTypeOptions(types) {
  bookingTypeRules = types;
  bookingTypeOptions.innerHTML = types.map((type, index) => `
    <label class="choice-option">
      <input type="radio" name="bookingType" value="${escapeBookingTypeText(type.label)}" data-requires-future="${type.requiresFutureArrival ? 'true' : 'false'}" ${index === 0 ? 'checked' : ''} required />
      <span><strong>${escapeBookingTypeText(type.label)}</strong><small>${escapeBookingTypeText(type.description)}</small></span>
    </label>
  `).join('');
  bookingTypeOptions.querySelectorAll('input[name="bookingType"]').forEach((input) => {
    input.addEventListener('change', () => {
      if (typeof updateArrivalSchedule === 'function') updateArrivalSchedule();
    });
  });
  if (typeof updateArrivalSchedule === 'function') updateArrivalSchedule();
}

DriveLinkAPI.get('/api/site-settings/reservation-policy').then((policy) => {
  const types = Array.isArray(policy.bookingTypes) && policy.bookingTypes.length
    ? policy.bookingTypes
    : [{ label: 'Reservasi', description: 'Tentukan jadwal kedatangan.', requiresFutureArrival: true }];
  renderBookingTypeOptions(types);
}).catch((error) => {
  bookingTypeOptions.innerHTML = '<p class="workflow-message is-error">Jenis pemesanan gagal dimuat. Muat ulang halaman sebelum mengirim booking.</p>';
  const submitButton = document.querySelector('#bookingForm button[type="submit"]');
  if (submitButton) submitButton.disabled = true;
  console.error('Jenis pemesanan gagal dimuat dari server.', error);
});