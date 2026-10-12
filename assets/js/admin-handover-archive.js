const archiveList = document.getElementById('inspectionArchiveList');
const archiveMessage = document.getElementById('archiveMessage');
const archiveDialog = document.getElementById('inspectionArchiveDialog');
const archiveDetails = document.getElementById('inspectionArchiveDetails');
const archiveTitle = document.getElementById('inspectionArchiveTitle');
const localArchiveRecords = new Map();

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function imageSource(value) {
  const source = typeof value === 'object' && value ? value.dataUrl : value;
  return typeof source === 'string' && /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+=*$/.test(source)
    ? source
    : '';
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function detailRows(entries) {
  return `<dl class="customer-details-fields">${entries.map(([label, value]) => `
    <div class="customer-detail-field"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || '-')}</dd></div>
  `).join('')}</dl>`;
}

function renderImageCards(title, images) {
  const cards = images.map(({ label, value }) => {
    const source = imageSource(value);
    return `
      <section class="customer-document-card">
        <h3>${escapeHtml(label)}</h3>
        ${source
    ? `<a href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer"><img src="${escapeHtml(source)}" alt="${escapeHtml(label)}" loading="lazy" /></a>`
    : '<p>Foto tidak tersedia pada arsip ini.</p>'}
      </section>
    `;
  }).join('');
  return `<h3 class="customer-document-heading">${escapeHtml(title)}</h3><div class="customer-document-grid">${cards || '<p class="inspection-archive-no-photos">Tidak ada foto pada bagian ini.</p>'}</div>`;
}

function renderDetails(booking) {
  const inspection = booking.vehicleInspection || {};
  const documents = booking.documents || {};
  const identityImages = [
    ['ktp', 'Foto KTP'],
    ['passport', 'Foto paspor'],
    ['simA', 'Foto SIM A'],
    ['selfie', 'Foto selfie'],
    ['ticket', 'Tiket perjalanan'],
    ['hotel', 'Bukti penginapan'],
  ].filter(([key]) => documents[key]).map(([key, label]) => ({ label, value: documents[key] }));
  const frontPhoto = inspection.frontPhoto || inspection.photos?.[0];
  const checklistPhotos = [
    { label: 'Foto depan unit', value: frontPhoto },
    ...(inspection.photos || []).filter((photo) => photo !== frontPhoto).map((value, index) => ({
      label: `Foto kondisi unit ${index + 1}`,
      value,
    })),
  ].filter(({ value }) => value);
  const unitConditionPhotos = booking.unitCondition?.photos || [];
  const handoverPhotos = booking.handoverPhotos || [];
  const packageIncludes = booking.packageIncludes
    ? [
      booking.packageIncludes.meal ? 'Makan termasuk' : '',
      booking.packageIncludes.mineralWater ? 'Air mineral termasuk' : '',
    ].filter(Boolean).join(' · ')
    : '';
  const detailHtml = [
    '<h3 class="customer-document-heading">Informasi booking dan pelanggan</h3>',
    detailRows([
      ['Kode booking', booking.id],
      ['Nama pelanggan', booking.name],
      ['Email', booking.email],
      ['Nomor telepon', booking.phone],
      ['Alamat', booking.address],
      ['Jenis identitas', documents.identityType || (documents.ktp ? 'KTP' : documents.passport ? 'Paspor' : '-')],
      ['Asal perjalanan', documents.residencyType || booking.travelType],
      ['Lama menetap di kota ini', documents.residencyDays ? `${documents.residencyDays} hari` : '-'],
      ['Jenis pemesanan', booking.bookingType],
      ['Jadwal datang', formatDate(booking.arrivalAt)],
      ['Kendaraan', booking.carType],
      ['Plat kendaraan', inspection.plate],
      ['Durasi', booking.duration],
      ['Layanan', `${booking.driverOption || '-'}${booking.fuelPackage ? ` · ${booking.fuelPackage}` : ''}`],
      ['Paket perjalanan', booking.packageName],
      ['Fasilitas paket', packageIncludes],
      ['Promo', booking.promotionName],
      ['Tarif per hari', booking.ratePerDay ? `Rp ${Number(booking.ratePerDay).toLocaleString('id-ID')}` : '-'],
      ['Subtotal sebelum diskon', booking.baseTotal ? `Rp ${Number(booking.baseTotal).toLocaleString('id-ID')}` : '-'],
      ['Potongan promo', booking.discountAmount ? `Rp ${Number(booking.discountAmount).toLocaleString('id-ID')}` : '-'],
      ['BBM gratis', booking.freeFuelDays ? `${Number(booking.freeFuelDays)} hari` : '-'],
      ['Estimasi total', booking.estimatedTotal ? `Rp ${Number(booking.estimatedTotal).toLocaleString('id-ID')}` : '-'],
      ['Deposit', booking.deposit],
      ['Status booking', booking.status],
      ['Persetujuan booking', booking.bookingApproval],
      ['Status pembayaran', booking.paymentStatus],
      ['Metode pembayaran', booking.paymentMethod],
      ['Status serah-terima', booking.handoverStatus],
      ['Checklist disimpan', formatDate(inspection.checkedAt)],
      ['Konfirmasi serah-terima pelanggan', formatDate(booking.handoverSubmittedAt)],
      ['Booking dibuat', formatDate(booking.createdAt)],
    ]),
    renderImageCards('Foto identitas dan dokumen pelanggan', identityImages),
    renderImageCards('Bukti pembayaran', booking.paymentProof ? [{ label: 'Bukti pembayaran', value: booking.paymentProof }] : []),
    '<h3 class="customer-document-heading">Detail checklist unit saat diserahkan</h3>',
    detailRows([
      ['Odometer', inspection.odometerKm === undefined ? '-' : `${Number(inspection.odometerKm).toLocaleString('id-ID')} km`],
      ['Kondisi bensin', inspection.fuelLevel],
      ['Kondisi bodi', inspection.bodyCondition],
      ['Catatan bodi', inspection.bodyNotes],
      ['Kondisi interior', inspection.interiorCondition],
      ['Kondisi lampu', inspection.lightsCondition],
      ['Kondisi ban', inspection.tiresCondition],
      ['Kondisi mesin', inspection.engineCondition],
      ['Kelengkapan kendaraan', inspection.equipmentCondition],
      ['Catatan karyawan', inspection.notes],
      ['Catatan kondisi unit', booking.unitCondition?.notes],
      ['Catatan konfirmasi serah-terima', booking.handoverAdminNote],
    ]),
    renderImageCards('Foto checklist kendaraan', checklistPhotos),
    renderImageCards('Foto kondisi unit dari arsip', unitConditionPhotos.map((value, index) => ({
      label: `Foto kondisi unit ${index + 1}`,
      value,
    }))),
    renderImageCards('Foto konfirmasi pelanggan', handoverPhotos.map((value, index) => ({
      label: `Foto serah-terima pelanggan ${index + 1}`,
      value,
    }))),
  ];
  if (booking.returnInspection) {
    const returned = booking.returnInspection;
    detailHtml.push(
      '<h3 class="customer-document-heading">Checklist pengembalian unit</h3>',
      detailRows([
        ['Tanggal pengembalian', formatDate(booking.rentalReturnedAt)],
        ['Plat kendaraan', returned.plate],
        ['Odometer', returned.odometerKm === undefined ? '-' : `${Number(returned.odometerKm).toLocaleString('id-ID')} km`],
        ['Kondisi bensin', returned.fuelLevel],
        ['Kondisi bodi', returned.bodyCondition],
        ['Catatan bodi', returned.bodyNotes],
        ['Kondisi interior', returned.interiorCondition],
        ['Kondisi lampu', returned.lightsCondition],
        ['Kondisi ban', returned.tiresCondition],
        ['Kondisi mesin', returned.engineCondition],
        ['Kelengkapan kendaraan', returned.equipmentCondition],
        ['Catatan pengembalian', returned.notes],
        ['Checklist pengembalian disimpan', formatDate(returned.checkedAt)],
      ]),
    );
  }
  archiveDetails.innerHTML = detailHtml.join('');
}

function renderArchive(bookings) {
  const records = bookings
    .filter((booking) => booking?.id)
    .sort((first, second) => new Date(second.checkedAt || second.vehicleInspection?.checkedAt || 0)
      - new Date(first.checkedAt || first.vehicleInspection?.checkedAt || 0));
  records.forEach((booking) => localArchiveRecords.set(String(booking.id).toUpperCase(), booking));
  document.getElementById('archiveCount').textContent = `${records.length} checklist tersimpan`;
  document.getElementById('inspectionArchiveEmpty').hidden = records.length > 0;
  archiveList.innerHTML = records.map((booking) => `
    <article class="inspection-archive-record">
      <strong>${escapeHtml(booking.id)}</strong>
      <button class="btn btn-secondary" type="button" data-archive-detail="${escapeHtml(booking.id)}">Detail</button>
    </article>
  `).join('');
}

async function openArchiveDetails(bookingId) {
  archiveTitle.textContent = `Detail booking ${bookingId}`;
  archiveDetails.innerHTML = '<p class="inspection-archive-loading">Memuat detail dan foto...</p>';
  archiveDialog.showModal();
  try {
    const booking = window.DriveLinkAPI
      ? await DriveLinkAPI.get(`/api/admin/handover/bookings/${encodeURIComponent(bookingId)}/details`)
      : localArchiveRecords.get(String(bookingId).toUpperCase());
    if (!booking) throw new Error('Data detail booking tidak tersedia.');
    renderDetails(booking);
  } catch (error) {
    archiveDetails.innerHTML = `<p class="workflow-message is-error">${escapeHtml(`Detail booking gagal dimuat: ${error.message}`)}</p>`;
  }
}

async function loadArchive() {
  try {
    const bookings = window.DriveLinkAPI
      ? await DriveLinkAPI.get('/api/admin/handover/archive')
      : DriveLinkStorage.read('drivelink-bookings', []);
    renderArchive(bookings);
  } catch (error) {
    archiveMessage.textContent = `Arsip checklist gagal dimuat: ${error.message}`;
    archiveMessage.classList.add('is-error');
    document.getElementById('archiveCount').textContent = '';
  }
}

archiveList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-archive-detail]');
  if (button) openArchiveDetails(button.dataset.archiveDetail);
});

document.getElementById('closeInspectionArchive').addEventListener('click', () => archiveDialog.close());
archiveDialog.addEventListener('click', (event) => {
  if (event.target === archiveDialog) archiveDialog.close();
});

document.getElementById('todayLabel').textContent = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
}).format(new Date());
document.getElementById('logoutButton').addEventListener('click', async () => {
  try {
    await DriveLinkAPI.post('/api/auth/logout', {});
  } finally {
    localStorage.removeItem('drivelink-session');
    window.location.href = 'auth.html';
  }
});

const savedBookingId = new URLSearchParams(window.location.search).get('saved');
if (savedBookingId) {
  archiveMessage.textContent = `Checklist booking ${savedBookingId} berhasil disimpan dan masuk ke arsip. Pelanggan sekarang dapat menyelesaikan konfirmasi serah-terima.`;
}

window.DriveLinkSessionReady?.then((session) => {
  if (session) loadArchive();
});
