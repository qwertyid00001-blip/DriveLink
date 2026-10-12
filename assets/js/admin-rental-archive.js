const periodType = document.getElementById('rentalArchivePeriodType');
const periodInput = document.getElementById('rentalArchivePeriod');
const periodLabel = document.getElementById('rentalArchivePeriodLabel');
const searchInput = document.getElementById('rentalArchiveSearch');
const groupsContainer = document.getElementById('rentalArchiveGroups');
const rejectedGroupsContainer = document.getElementById('rejectedArchiveGroups');
const archiveDialog = document.getElementById('rentalArchiveDialog');
const archiveDetails = document.getElementById('rentalArchiveDetails');
let rentals = [];
let rejectedBookings = [];

function formatDate(value) {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta',
    }).format(date)
    : '-';
}

function jakartaDateParts(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date);
  return Object.fromEntries(parts
    .filter((part) => ['year', 'month', 'day'].includes(part.type))
    .map(({ type, value: partValue }) => [type, Number(partValue)]));
}

function formatCurrency(value) {
  return `Rp ${Number(value || 0).toLocaleString('id-ID')}`;
}

function setPeriodInput() {
  const type = periodType.value;
  const today = jakartaDateParts(new Date());
  const year = today.year;
  if (type === 'month') {
    periodLabel.firstChild.textContent = 'Pilih bulan';
    periodInput.type = 'month';
    periodInput.value = `${year}-${String(today.month).padStart(2, '0')}`;
  } else if (type === 'week') {
    periodLabel.firstChild.textContent = 'Pilih minggu';
    periodInput.type = 'week';
    const date = new Date(Date.UTC(year, today.month - 1, today.day));
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
    const weekYear = date.getUTCFullYear();
    const yearStart = new Date(Date.UTC(weekYear, 0, 1));
    const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    periodInput.value = `${weekYear}-W${String(week).padStart(2, '0')}`;
  } else {
    periodLabel.firstChild.textContent = 'Pilih tahun';
    periodInput.type = 'number';
    periodInput.min = '2000';
    periodInput.max = '2100';
    periodInput.value = String(year);
  }
}

function isoWeekKey(value) {
  const parts = jakartaDateParts(value);
  if (!parts) return '';
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const year = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function periodKey(value, type) {
  const parts = jakartaDateParts(value);
  if (!parts) return '';
  if (type === 'year') return String(parts.year);
  if (type === 'week') return isoWeekKey(value);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}`;
}
function renderRejectedArchive() {
  const type = periodType.value;
  const period = periodInput.value;
  const query = searchInput.value.trim().toLocaleLowerCase('id-ID');
  const filtered = rejectedBookings.filter((booking) => {
    if (period && periodKey(booking.rejectedAt, type) !== period) return false;
    return [booking.id, booking.name, booking.carType, booking.reason]
      .some((value) => String(value || '').toLocaleLowerCase('id-ID').includes(query));
  });
  const grouped = new Map();
  filtered.forEach((booking) => {
    const key = periodKey(booking.rejectedAt, type);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(booking);
  });
  rejectedGroupsContainer.replaceChildren();
  [...grouped.entries()].sort(([first], [second]) => second.localeCompare(first)).forEach(([key, records]) => {
    const section = document.createElement('section');
    section.className = 'rental-archive-group';
    const heading = document.createElement('div');
    heading.className = 'rental-archive-group-heading';
    const title = document.createElement('h3');
    title.textContent = periodTitle(key, type);
    const total = document.createElement('span');
    total.textContent = `${records.length} pengajuan`;
    heading.append(title, total);
    const list = document.createElement('div');
    list.className = 'inspection-archive-list';
    records.forEach((booking) => {
      const card = document.createElement('article');
      card.className = 'rental-archive-record';
      const copy = document.createElement('div');
      copy.className = 'rental-archive-record-copy';
      const bookingId = document.createElement('strong');
      bookingId.textContent = booking.id;
      const customer = document.createElement('span');
      customer.textContent = `${booking.name} · ${booking.carType} · ${booking.duration}`;
      const rejectedAt = document.createElement('small');
      rejectedAt.textContent = `Ditolak ${formatDate(booking.rejectedAt)}`;
      const reason = document.createElement('p');
      reason.className = 'rental-archive-record-reason';
      reason.textContent = `Alasan: ${booking.reason || 'Tidak dicatat'}`;
      copy.append(bookingId, customer, rejectedAt, reason);
      const actions = document.createElement('div');
      actions.className = 'rental-archive-record-actions';
      const status = document.createElement('strong');
      status.textContent = 'Ditolak';
      actions.append(status);
      card.append(copy, actions);
      list.append(card);
    });
    section.append(heading, list);
    rejectedGroupsContainer.append(section);
  });
  document.getElementById('rejectedArchiveEmpty').hidden = filtered.length > 0;
  document.getElementById('rejectedArchiveSummary').textContent = `${filtered.length} ditolak · ${type === 'month' ? 'per bulan' : type === 'week' ? 'per minggu' : 'per tahun'}`;
}


function periodTitle(key, type) {
  if (type === 'year') return `Tahun ${key}`;
  if (type === 'week') {
    const [year, week] = key.split('-W');
    return `Minggu ke-${Number(week)} · ${year}`;
  }
  const [year, month] = key.split('-').map(Number);
  const label = new Intl.DateTimeFormat('id-ID', { month: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)));
  return `${label} ${year}`;
}
function createDetailRows(entries) {
  const list = document.createElement('dl');
  list.className = 'customer-details-fields';
  entries.forEach(([label, value]) => {
    const row = document.createElement('div');
    row.className = 'customer-detail-field';
    const term = document.createElement('dt');
    term.textContent = label;
    const description = document.createElement('dd');
    description.textContent = value === undefined || value === null || value === '' ? '-' : String(value);
    row.append(term, description);
    list.append(row);
  });
  return list;
}

function renderDetails(booking) {
  archiveDetails.replaceChildren();
  const rental = booking.vehicleInspection || {};
  const returned = booking.returnInspection || {};
  const handoverChecklistRows = [
    ['Odometer', rental.odometerKm === undefined ? '-' : `${Number(rental.odometerKm).toLocaleString('id-ID')} km`],
    ['Bensin', rental.fuelLevel],
    ['Kondisi bodi', rental.bodyCondition],
    ['Catatan bodi', rental.bodyNotes],
    ['Interior', rental.interiorCondition],
    ['Lampu', rental.lightsCondition],
    ['Ban', rental.tiresCondition],
    ['Mesin', rental.engineCondition],
    ['Perlengkapan', rental.equipmentCondition],
    ['Catatan petugas', rental.notes],
    ['Checklist disimpan', formatDate(rental.checkedAt)],
  ];
  (rental.customChecklist || []).forEach((item) => {
    const values = item.values || {};
    const details = [];
    if (item.types.includes('check')) details.push(values.checked ? 'Sudah diperiksa' : 'Belum dicentang');
    if (item.types.includes('choice') && values.choice) details.push(values.choice);
    if (item.types.includes('note') && values.note) details.push(values.note);
    if (item.types.includes('photo') && values.photo) details.push('Foto terlampir');
    handoverChecklistRows.push([item.label, details.join(' · ') || '-']);
  });
  const sections = [
    ['Informasi booking dan pelanggan', [
      ['Kode booking', booking.id],
      ['Nama pelanggan', booking.name],
      ['Nomor telepon', booking.phone],
      ['Email', booking.email],
      ['Alamat', booking.address],
      ['Kendaraan', booking.carType],
      ['Plat kendaraan', returned.plate || rental.plate],
      ['Jenis pemesanan', booking.bookingType],
      ['Lama sewa', booking.duration],
      ['Layanan', `${booking.driverOption || '-'}${booking.fuelPackage ? ` · ${booking.fuelPackage}` : ''}`],
      ['Paket / promo', [booking.packageName, booking.promotionName].filter(Boolean).join(' · ')],
      ['Metode pembayaran', booking.paymentMethod],
      ['Status pembayaran', booking.paymentStatus],
      ['Tarif per hari', formatCurrency(booking.ratePerDay)],
      ['Subtotal', formatCurrency(booking.baseTotal)],
      ['Potongan', formatCurrency(booking.discountAmount)],
      ['Total booking', formatCurrency(booking.estimatedTotal)],
      ['Deposit', booking.deposit],
      ['Booking dibuat', formatDate(booking.createdAt)],
      ['Mulai sewa', formatDate(booking.rentalStartedAt)],
      ['Unit dikembalikan', formatDate(booking.rentalReturnedAt)],
      ['Status akhir', booking.status],
    ]],
    ['Checklist saat unit diserahkan', handoverChecklistRows],
    ['Checklist saat unit dikembalikan', [
      ['Odometer', returned.odometerKm === undefined ? '-' : `${Number(returned.odometerKm).toLocaleString('id-ID')} km`],
      ['Bensin', returned.fuelLevel],
      ['Kondisi bodi', returned.bodyCondition],
      ['Catatan bodi', returned.bodyNotes],
      ['Interior', returned.interiorCondition],
      ['Lampu', returned.lightsCondition],
      ['Ban', returned.tiresCondition],
      ['Mesin', returned.engineCondition],
      ['Perlengkapan', returned.equipmentCondition],
      ['Catatan pengembalian', returned.notes],
      ['Pemeriksaan disimpan', formatDate(returned.checkedAt)],
    ]],
  ];
  sections.forEach(([headingText, rows]) => {
    const heading = document.createElement('h3');
    heading.className = 'customer-document-heading';
    heading.textContent = headingText;
    archiveDetails.append(heading, createDetailRows(rows));
  });

  const photos = [
    ['Foto depan unit saat diserahkan', rental.frontPhoto || rental.photos?.[0]],
    ...(rental.photos || []).filter((photo) => photo !== (rental.frontPhoto || rental.photos?.[0]))
      .map((photo, index) => [`Foto tambahan saat diserahkan ${index + 1}`, photo]),
    ...(rental.customChecklist || []).flatMap((item) => item.values?.photo
      ? [[`Foto checklist: ${item.label}`, item.values.photo]]
      : []),
  ].filter(([, photo]) => typeof photo === 'string' && /^data:image\/(jpeg|png);base64,/.test(photo));
  if (photos.length) {
    const heading = document.createElement('h3');
    heading.className = 'customer-document-heading';
    heading.textContent = 'Foto pemeriksaan';
    const grid = document.createElement('div');
    grid.className = 'customer-document-grid';
    photos.forEach(([label, source]) => {
      const card = document.createElement('section');
      card.className = 'customer-document-card';
      const title = document.createElement('h3');
      title.textContent = label;
      const link = document.createElement('a');
      link.href = source;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      const image = document.createElement('img');
      image.src = source;
      image.alt = label;
      image.loading = 'lazy';
      link.append(image);
      card.append(title, link);
      grid.append(card);
    });
    archiveDetails.append(heading, grid);
  }
}

async function openRentalDetails(id) {
  document.getElementById('rentalArchiveDialogTitle').textContent = `Detail booking ${id}`;
  archiveDetails.textContent = 'Memuat detail penyewaan...';
  archiveDialog.showModal();
  try {
    const booking = await DriveLinkAPI.get(`/api/admin/returns/archive/${encodeURIComponent(id)}`);
    renderDetails(booking);
  } catch (error) {
    archiveDetails.textContent = `Detail arsip gagal dimuat: ${error.message}`;
    archiveDetails.classList.add('workflow-message', 'is-error');
  }
}

function renderArchive() {
  const type = periodType.value;
  const period = periodInput.value;
  const query = searchInput.value.trim().toLocaleLowerCase('id-ID');
  const filtered = rentals.filter((rental) => {
    if (period && periodKey(rental.rentalReturnedAt, type) !== period) return false;
    return [rental.id, rental.name, rental.carType, rental.plate]
      .some((value) => String(value || '').toLocaleLowerCase('id-ID').includes(query));
  });
  const grouped = new Map();
  filtered.forEach((rental) => {
    const key = periodKey(rental.rentalReturnedAt, type);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(rental);
  });
  groupsContainer.replaceChildren();
  [...grouped.entries()].sort(([first], [second]) => second.localeCompare(first)).forEach(([key, records]) => {
    const section = document.createElement('section');
    section.className = 'rental-archive-group';
    const heading = document.createElement('div');
    heading.className = 'rental-archive-group-heading';
    const title = document.createElement('h3');
    title.textContent = periodTitle(key, type);
    const total = document.createElement('span');
    total.textContent = `${records.length} rental`;
    heading.append(title, total);
    const list = document.createElement('div');
    list.className = 'inspection-archive-list';
    records.forEach((rental) => {
      const card = document.createElement('article');
      card.className = 'rental-archive-record';
      const copy = document.createElement('div');
      copy.className = 'rental-archive-record-copy';
      const bookingId = document.createElement('strong');
      bookingId.textContent = rental.id;
      const customer = document.createElement('span');
      customer.textContent = `${rental.name} · ${rental.carType} · ${rental.plate || 'Plat tidak tercatat'}`;
      const returnedAt = document.createElement('small');
      returnedAt.textContent = `Dikembalikan ${formatDate(rental.rentalReturnedAt)}`;
      copy.append(bookingId, customer, returnedAt);
      const actions = document.createElement('div');
      actions.className = 'rental-archive-record-actions';
      const amount = document.createElement('strong');
      amount.textContent = formatCurrency(rental.estimatedTotal);
      const detail = document.createElement('button');
      detail.type = 'button';
      detail.className = 'btn btn-secondary';
      detail.textContent = 'Lihat detail';
      detail.addEventListener('click', () => openRentalDetails(rental.id));
      actions.append(amount, detail);
      card.append(copy, actions);
      list.append(card);
    });
    section.append(heading, list);
    groupsContainer.append(section);
  });
  document.getElementById('rentalArchiveCount').textContent = String(filtered.length);
  document.getElementById('rentalArchiveValue').textContent = formatCurrency(
    filtered.reduce((sum, rental) => sum + Number(rental.estimatedTotal || 0), 0),
  );
  document.getElementById('rentalArchiveEmpty').hidden = filtered.length > 0;
  document.getElementById('rentalArchiveSummary').textContent = `${filtered.length} rental selesai · ${type === 'month' ? 'per bulan' : type === 'week' ? 'per minggu' : 'per tahun'}`;
}

periodType.addEventListener('change', () => {
  setPeriodInput();
  renderArchive();
  renderRejectedArchive();
});
periodInput.addEventListener('input', () => {
  renderArchive();
  renderRejectedArchive();
});
searchInput.addEventListener('input', () => {
  renderArchive();
  renderRejectedArchive();
});
document.querySelectorAll('[data-rental-archive-view]').forEach((button) => {
  button.addEventListener('click', () => {
    const activeView = button.dataset.rentalArchiveView;
    document.querySelectorAll('[data-rental-archive-view]').forEach((tab) => {
      const selected = tab === button;
      tab.classList.toggle('btn-primary', selected);
      tab.classList.toggle('btn-secondary', !selected);
      tab.setAttribute('aria-pressed', String(selected));
    });
    document.getElementById('completedArchivePanel').hidden = activeView !== 'completed';
    document.getElementById('rejectedArchivePanel').hidden = activeView !== 'rejected';
  });
});
document.getElementById('closeRentalArchiveDialog').addEventListener('click', () => archiveDialog.close());
archiveDialog.addEventListener('click', (event) => {
  if (event.target === archiveDialog) archiveDialog.close();
});
document.getElementById('todayLabel').textContent = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  timeZone: 'Asia/Jakarta',
}).format(new Date());
document.getElementById('logoutButton').addEventListener('click', async () => {
  try {
    await DriveLinkAPI.post('/api/auth/logout', {});
  } catch (error) {
    console.error('Sesi admin gagal diakhiri.', error);
  }
  localStorage.removeItem('drivelink-session');
  window.location.href = 'auth.html';
});
setPeriodInput();
window.DriveLinkSessionReady?.then(async (session) => {
  if (!session) return;
  try {
    [rentals, rejectedBookings] = await Promise.all([
      DriveLinkAPI.get('/api/admin/returns/archive'),
      DriveLinkAPI.get('/api/admin/returns/archive/rejected'),
    ]);
    renderArchive();
    renderRejectedArchive();
  } catch (error) {
    document.getElementById('rentalArchiveMessage').textContent = `Arsip penyewaan gagal dimuat: ${error.message}`;
    document.getElementById('rentalArchiveMessage').classList.add('is-error');
    document.getElementById('rentalArchiveSummary').textContent = '';
  }
});
