const session = DriveLinkStorage.read('drivelink-session', null);
const currentPage = window.location.pathname.split('/').pop();
let fleetCategories = ['MPV', 'SUV', 'Electric'];
let serviceCategories = ['Oli', 'Ban', 'Cat', 'Salon mobil'];
let physicalFleetUnits = [];
let serviceQueryApplied = false;

if (!session || !['admin', 'employee'].includes(session.role)) {
  window.location.replace('auth.html');
} else {
  const adminName = session.name || 'Admin';
  const adminNameElement = document.getElementById('adminName');
  if (adminNameElement) adminNameElement.textContent = adminName;
  const welcomeNameElement = document.getElementById('welcomeName');
  if (welcomeNameElement) welcomeNameElement.textContent = adminName.split(' ')[0];
}

function readBookings() {
  const saved = DriveLinkStorage.read('drivelink-bookings', []);
  if (window.DriveLinkAPI && currentPage.startsWith('admin')) return saved;
  if (saved.length) {
    let migrated = false;
    let fleet;
    let fleetChanged = false;
    const bookings = saved.map((booking) => {
      const status = booking.status === 'Menunggu'
        ? 'Booking'
        : booking.status === 'Dikonfirmasi'
          ? 'Pembayaran'
          : booking.status;
      const bookingApproval = booking.bookingApproval || (status === 'Booking' ? 'Menunggu persetujuan' : 'Disetujui');
      const nextBooking = {
        ...booking,
        status,
        bookingApproval,
        statusHistory: booking.statusHistory || [{ status, at: booking.createdAt }],
      };
      if (nextBooking.fuelPackage === undefined && booking.driverOption === 'Pakai driver') {
        nextBooking.fuelPackage = 'Termasuk BBM';
        migrated = true;
      }
      if (!booking.stockReserved && bookingApproval === 'Disetujui' && !['Selesai', 'Dibatalkan'].includes(status)) {
        fleet = fleet || readFleet();
        const vehicle = fleet.find((item) => item.name === booking.carType);
        if (vehicle) {
          if (vehicle.availableCount > 0) vehicle.availableCount -= 1;
          nextBooking.stockReserved = true;
          fleetChanged = true;
        }
      }
      if (status !== booking.status || booking.bookingApproval !== bookingApproval || nextBooking.stockReserved !== booking.stockReserved || !booking.statusHistory) migrated = true;
      return nextBooking;
    });
    if (migrated) saveBookings(bookings);
    if (fleetChanged) saveFleet(fleet);
    return bookings;
  }
  return [
    { id: 'DL-204581', name: 'Rina Astari', email: 'rina@example.com', phone: '081234567890', carType: 'Avanza Smart', duration: '3 hari', status: 'Booking', bookingApproval: 'Menunggu persetujuan', paymentStatus: 'Belum dipilih', handoverStatus: 'Belum dimulai', createdAt: new Date().toISOString() },
    { id: 'DL-204579', name: 'Hendra Wijaya', email: 'hendra@example.com', phone: '081298765432', carType: 'BR-V Family', duration: '7 hari', status: 'Pembayaran', bookingApproval: 'Disetujui', stockReserved: true, paymentStatus: 'Menunggu konfirmasi', handoverStatus: 'Belum dimulai', createdAt: new Date(Date.now() - 86400000).toISOString() },
    { id: 'DL-204562', name: 'Fauzia Rahma', email: 'fauzia@example.com', phone: '081377788899', carType: 'EV CityX', duration: '1 hari', status: 'Selesai', bookingApproval: 'Disetujui', paymentStatus: 'Dikonfirmasi', handoverStatus: 'Disetujui', createdAt: new Date(Date.now() - 172800000).toISOString() },
  ];
}

function saveBookings(bookings) {
  DriveLinkStorage.writeBookings(bookings);
}

const DEFAULT_FLEET = [
  { id: 'avanza-smart', name: 'Avanza Smart', category: 'MPV', totalCount: 5, availableCount: 5, priceNoDriver: 420000, priceWithDriverFuel: 420000, priceWithDriverNoFuel: 420000 },
  { id: 'br-v-family', name: 'BR-V Family', category: 'SUV', totalCount: 5, availableCount: 5, priceNoDriver: 520000, priceWithDriverFuel: 520000, priceWithDriverNoFuel: 520000 },
  { id: 'ev-cityx', name: 'EV CityX', category: 'Electric', totalCount: 5, availableCount: 5, priceNoDriver: 680000, priceWithDriverFuel: 680000, priceWithDriverNoFuel: 680000 },
];

function readFleet() {
  const saved = localStorage.getItem('drivelink-fleet');
  if (saved !== null) {
    const fleet = JSON.parse(saved);
    let migrated = false;
    fleet.forEach((vehicle) => {
      if (vehicle.priceWithDriverFuel === undefined) {
        vehicle.priceWithDriverFuel = Number(vehicle.priceWithDriver) || 0;
        migrated = true;
      }
      if (vehicle.priceWithDriverNoFuel === undefined) {
        vehicle.priceWithDriverNoFuel = Number(vehicle.priceWithDriver) || vehicle.priceWithDriverFuel;
        migrated = true;
      }
      if (!vehicle.category) {
        vehicle.category = /ev|electric/i.test(vehicle.name) ? 'Electric' : /suv|br-v/i.test(vehicle.name) ? 'SUV' : 'MPV';
        migrated = true;
      }
    });
    if (migrated) saveFleet(fleet);
    return fleet;
  }
  const fleet = DEFAULT_FLEET.map((vehicle) => ({ ...vehicle }));
  const reservations = DriveLinkStorage.read('drivelink-bookings', [])
    .filter((booking) => booking.stockReserved);
  reservations.forEach((booking) => {
    const vehicle = fleet.find((item) => item.name === booking.carType);
    if (vehicle) vehicle.availableCount = Math.max(0, vehicle.availableCount - 1);
  });
  cacheFleet(fleet);
  return fleet;
}

function saveFleet(fleet) {
  cacheFleet(fleet);
}

let serverVehicleUnits = null;

function cacheFleet(fleet) {
  DriveLinkStorage.write('drivelink-fleet', fleet.map(({ photos, ...vehicle }) => ({
    ...vehicle,
    photoCount: Array.isArray(photos) ? photos.length : Number(vehicle.photoCount) || 0,
  })));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function formatCurrency(value) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function renderBarChart(containerId, emptyId, entries, formatValue, color) {
  const container = document.getElementById(containerId);
  const emptyState = document.getElementById(emptyId);
  if (!container || !emptyState) return;
  container.replaceChildren();
  emptyState.hidden = entries.length > 0;
  if (!entries.length) return;
  const maxValue = Math.max(...entries.map((entry) => Number(entry.value) || 0), 1);
  entries.forEach((entry) => {
    const row = document.createElement('div');
    row.className = 'dashboard-bar-row';
    const label = document.createElement('span');
    label.className = 'dashboard-bar-label';
    label.textContent = entry.label;
    const track = document.createElement('div');
    track.className = 'dashboard-bar-track';
    const bar = document.createElement('i');
    bar.className = `dashboard-bar ${color}`;
    bar.style.width = `${Math.max(entry.value > 0 ? 4 : 0, (entry.value / maxValue) * 100)}%`;
    track.append(bar);
    const value = document.createElement('strong');
    value.className = 'dashboard-bar-value';
    value.textContent = formatValue(entry.value);
    row.append(label, track, value);
    container.append(row);
  });
}

function renderOverviewCharts(overview) {
  const revenue = (overview.revenueChart || []).map((entry) => ({
    label: new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' })
      .format(new Date(`${entry.date}T00:00:00`)),
    value: Number(entry.amount) || 0,
  }));
  renderBarChart('revenueChart', 'revenueChartEmpty', revenue, formatCurrency, 'revenue');
  const rentals = (overview.rentedVehiclesByType || []).map((entry) => ({
    label: entry.carType,
    value: Number(entry.count) || 0,
  }));
  renderBarChart('rentedVehiclesChart', 'rentedVehiclesChartEmpty', rentals,
    (value) => `${value} unit`, 'rentals');
}

function statusClass(status) {
  return ({
    'Menunggu': 'status-pending',
    Booking: 'status-pending',
    Pembayaran: 'status-payment',
    'Serah terima': 'status-active',
    Selesai: 'status-complete',
    Dikembalikan: 'status-complete',
    Dibatalkan: 'status-cancelled',
  })[status] || 'status-pending';
}

function documentSummary(booking) {
  const documents = booking.documents || {};
  const requiredDocs = ['simA', 'selfie'];
  const usesPassport = documents.identityType === 'Paspor';
  if (usesPassport) requiredDocs.push('passport');
  else requiredDocs.push('ktp');
  const residencyType = documents.residencyType || booking.travelType;
  const isOutOfTown = residencyType === 'Dari luar kota'
    || residencyType === 'Dari luar kota dan tidak menetap di kota ini'
    || residencyType === 'Dari luar kota / tidak menetap';
  const legacyTravelDocumentsRequired = booking.travelType === 'Luar negeri / transit'
    || residencyType === 'Dari luar kota dan tidak menetap di kota ini'
    || residencyType === 'Dari luar kota / tidak menetap';
  if (usesPassport || legacyTravelDocumentsRequired || (isOutOfTown && Number(documents.residencyDays) > 2)) {
    requiredDocs.push('ticket', 'hotel');
  }
  const uploadedCount = requiredDocs.filter((key) => Boolean(documents[key])).length;
  return `${uploadedCount}/${requiredDocs.length} file dipilih`;
}

function appendDetailField(list, label, value) {
  const row = document.createElement('div');
  row.className = 'customer-detail-field';
  const term = document.createElement('dt');
  term.textContent = label;
  const description = document.createElement('dd');
  description.textContent = value || '-';
  row.append(term, description);
  list.append(row);
}

async function openCustomerDetails(bookingId) {
  // Dokumen identitas/base64 tidak lagi disimpan di cache browser. Ambil dari server saat tombol ditekan.
  const cached = readBookings().find((item) => item.id === bookingId);
  let booking = cached;
  if (window.DriveLinkAPI) {
    try {
      booking = await DriveLinkAPI.get(`/api/admin/bookings/${encodeURIComponent(bookingId)}`);
    } catch (error) {
      if (!cached) return;
      console.warn('Detail booking gagal dimuat dari server, memakai cache lokal.', error);
    }
  }
  if (!booking) return;
  const dialog = document.getElementById('customerDetailsDialog');
  const content = document.getElementById('customerDetailsContent');
  const fields = document.createElement('dl');
  fields.className = 'customer-details-fields';
  [
    ['ID booking', booking.id],
    ['Nama', booking.name],
    ['Email', booking.email],
    ['Telepon', booking.phone],
    ['Alamat', booking.address],
    ['Jenis identitas', booking.documents?.identityType || (booking.documents?.ktp ? 'KTP' : '-')],
    ['Asal dan tempat tinggal', booking.documents?.residencyType || booking.travelType || '-'],
    ['Lama menetap di kota ini', booking.documents?.residencyDays ? `${booking.documents.residencyDays} hari` : '-'],
    ['Jenis pemesanan', booking.bookingType || 'Reservasi'],
    ['Jadwal datang ke lokasi', formattedArrival(booking.arrivalAt)],
    ['Kendaraan', booking.carType],
    ['Durasi', booking.duration],
    ['Layanan', `${booking.driverOption || '-'}${booking.fuelPackage ? ` · ${booking.fuelPackage}` : ''}`],
    ['Tarif per hari', booking.ratePerDay ? formatCurrency(booking.ratePerDay) : '-'],
    ['Estimasi total', booking.estimatedTotal ? formatCurrency(booking.estimatedTotal) : '-'],
    ['Pilihan deposit', booking.deposit],
    ['Persetujuan booking', booking.bookingApproval],
    ['Status pembayaran', booking.paymentStatus],
    ['Status serah-terima', booking.handoverStatus],
    ['Status pengembalian', booking.rentalReturnedAt ? 'Dikembalikan' : 'Belum dikembalikan'],
    ['Tanggal pengembalian', booking.rentalReturnedAt ? formattedDate(booking.rentalReturnedAt) : '-'],
    ['Plat saat kembali', booking.returnInspection?.plate],
    ['Odometer saat kembali', booking.returnInspection?.odometerKm === undefined ? '' : `${Number(booking.returnInspection.odometerKm).toLocaleString('id-ID')} km`],
    ['Bensin saat kembali', booking.returnInspection?.fuelLevel],
    ['Kondisi bodi saat kembali', booking.returnInspection?.bodyCondition],
    ['Catatan bodi saat kembali', booking.returnInspection?.bodyNotes],
    ['Interior saat kembali', booking.returnInspection?.interiorCondition],
    ['Lampu saat kembali', booking.returnInspection?.lightsCondition],
    ['Ban saat kembali', booking.returnInspection?.tiresCondition],
    ['Mesin saat kembali', booking.returnInspection?.engineCondition],
    ['Kelengkapan saat kembali', booking.returnInspection?.equipmentCondition],
    ['Catatan pengembalian', booking.returnInspection?.notes],
    ['Checklist kembali disimpan pada', booking.returnInspection?.checkedAt ? formattedDate(booking.returnInspection.checkedAt) : '-'],
  ].forEach(([label, value]) => appendDetailField(fields, label, value));

  const documentNames = {
    ktp: 'Foto KTP',
    simA: 'Foto SIM A',
    passport: 'Foto paspor',
    selfie: 'Selfie langsung dari kamera',
    ticket: 'Tiket pesawat',
    hotel: 'Booking hotel',
  };
  const photoGrid = document.createElement('div');
  photoGrid.className = 'customer-document-grid';
  const documents = booking.documents || {};
  Object.entries(documentNames).forEach(([key, title]) => {
    const documentValue = documents[key];
    if (!documentValue) return;
    const card = document.createElement('section');
    card.className = 'customer-document-card';
    const heading = document.createElement('h3');
    heading.textContent = title;
    card.append(heading);
    const dataUrl = typeof documentValue === 'object' ? documentValue.dataUrl : '';
    if (typeof dataUrl === 'string' && /^data:image\/(jpeg|png);base64,/.test(dataUrl)) {
      const image = document.createElement('img');
      image.src = dataUrl;
      image.alt = title;
      card.append(image);
      const fileName = document.createElement('small');
      fileName.textContent = documentValue.name || 'Foto terlampir';
      card.append(fileName);
    } else {
      const note = document.createElement('p');
      note.textContent = 'File tidak tersimpan pada versi prototipe sebelumnya.';
      card.append(note);
    }
    photoGrid.append(card);
  });
  const documentsHeading = document.createElement('h3');
  documentsHeading.className = 'customer-document-heading';
  documentsHeading.textContent = 'Dokumen persyaratan';
  content.replaceChildren(fields, documentsHeading, photoGrid);
  dialog.showModal();
}

function formattedDate(value) {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}

function formattedArrival(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function renderBookings() {
  const bookings = readBookings();
  renderPaymentReviewQueue(bookings);
  const recent = bookings.slice(0, 5);
  const totalBookings = document.getElementById('totalBookings');
  if (totalBookings) totalBookings.textContent = String(bookings.length);
  const pendingBookings = document.getElementById('pendingBookings');
  if (pendingBookings) pendingBookings.textContent = String(bookings.filter((booking) => booking.bookingApproval === 'Menunggu persetujuan').length);

  const recentBody = document.getElementById('recentBookingsBody');
  if (recentBody) {
    recentBody.innerHTML = recent.map((booking) => `
      <tr>
        <td><strong>${escapeHtml(booking.name)}</strong><small>${escapeHtml(booking.address || booking.id)}</small></td>
        <td>${escapeHtml(booking.carType)}</td>
        <td>${escapeHtml(booking.duration)}</td>
        <td>${escapeHtml(booking.driverOption || '-')}${booking.driverOption === 'Pakai driver' && booking.fuelPackage ? `<small>${escapeHtml(booking.fuelPackage)}</small>` : ''}</td>
        <td>${escapeHtml(booking.deposit || '-')}</td>
        <td>${documentSummary(booking)}</td>
        <td>${formattedDate(booking.createdAt)}</td>
        <td><span class="status-pill ${statusClass(booking.status)}">${escapeHtml(booking.status)}</span></td>
      </tr>
    `).join('');
    document.getElementById('recentEmpty').hidden = recent.length > 0;
  }

  const allBookingsBody = document.getElementById('allBookingsBody');
  if (!allBookingsBody) return;

  const query = document.getElementById('bookingSearch').value.trim().toLowerCase();
  const statusFilter = document.getElementById('statusFilter').value;
  const filtered = bookings.filter((booking) => {
    if (booking.bookingApproval === 'Ditolak') return false;
    const searchable = [booking.id, booking.name, booking.email, booking.phone, booking.address, booking.carType].join(' ').toLowerCase();
    return !booking.vehicleInspection && searchable.includes(query) && (!statusFilter || booking.status === statusFilter);
  });

  allBookingsBody.innerHTML = filtered.map((booking) => `
    <tr>
      <td><strong>${escapeHtml(booking.id)}</strong></td>
      <td><strong>${escapeHtml(booking.name)}</strong><small>${escapeHtml(booking.email)}</small><small>${escapeHtml(booking.phone || '')}</small><small>${escapeHtml(booking.address || 'Alamat belum tercatat')}</small></td>
      <td>${escapeHtml(booking.carType)}</td>
      <td>${escapeHtml(booking.duration)}</td>
      <td><strong>${escapeHtml(booking.bookingType || 'Reservasi')}</strong><small>${escapeHtml(formattedArrival(booking.arrivalAt))}</small></td>
      <td>${escapeHtml(booking.driverOption || '-')}</td>
      <td>${booking.ratePerDay ? escapeHtml(formatCurrency(booking.ratePerDay)) : '-'}</td>
      <td><span class="status-pill ${booking.bookingApproval === 'Disetujui' ? 'status-active' : booking.bookingApproval === 'Ditolak' ? 'status-cancelled' : 'status-pending'}">${escapeHtml(booking.bookingApproval || 'Menunggu persetujuan')}</span></td>
      <td>${booking.depositPaymentRequired
    ? `<strong>Deposit: ${escapeHtml(booking.depositPaymentStatus || 'Belum dibayar')}</strong><small>Sewa: ${escapeHtml(booking.paymentStatus || 'Belum dibayar')}</small>`
    : escapeHtml(booking.paymentStatus || 'Belum dipilih')}</td>
      <td>${escapeHtml(booking.handoverStatus || 'Belum dimulai')}</td>
      <td>${escapeHtml(booking.documents?.residencyType || booking.travelType || 'Menetap di kota ini')}${booking.documents?.residencyDays ? `<small>${escapeHtml(booking.documents.residencyDays)} hari</small>` : ''}</td>
      <td>${documentSummary(booking)}</td>
      <td>${formattedDate(booking.createdAt)}</td>
      <td><span class="status-pill ${statusClass(booking.status)}">${escapeHtml(booking.status)}</span></td>
      <td><div class="review-actions"><button class="btn btn-secondary" data-customer-details="${escapeHtml(booking.id)}">Detail pelanggan</button>${booking.bookingApproval === 'Menunggu persetujuan'
    ? `<button class="btn btn-primary" data-booking-action="approve" data-booking-id="${escapeHtml(booking.id)}">Setujui</button><button class="btn btn-secondary" data-booking-action="reject" data-booking-id="${escapeHtml(booking.id)}">Tolak</button>`
    : ''}</div></td>
    </tr>
  `).join('');
  document.getElementById('allEmpty').hidden = filtered.length > 0;
}

function renderPaymentReviewQueue(bookings) {
  const list = document.getElementById('bookingPaymentReviewList');
  if (!list) return;
  const pending = bookings.flatMap((booking) => {
    if (booking.depositPaymentRequired) {
      return [
        ...(booking.depositPaymentStatus === 'Menunggu konfirmasi' ? [{ booking, stage: 'deposit' }] : []),
        ...(booking.paymentStatus === 'Menunggu konfirmasi' ? [{ booking, stage: 'rental' }] : []),
      ];
    }
    return booking.paymentStatus === 'Menunggu konfirmasi' ? [{ booking, stage: 'rental' }] : [];
  });
  list.replaceChildren();
  pending.forEach(({ booking, stage }) => {
    const card = document.createElement('article');
    card.className = 'review-card';
    const heading = document.createElement('div');
    heading.className = 'review-card-heading';
    const summary = document.createElement('div');
    const customer = document.createElement('strong');
    customer.textContent = `${booking.name} · ${booking.id}`;
    const vehicle = document.createElement('small');
    vehicle.textContent = `${booking.carType} · ${booking.duration}`;
    summary.append(customer, vehicle);
    const method = document.createElement('span');
    method.className = 'status-pill status-payment';
    method.textContent = stage === 'deposit'
      ? `Deposit · ${booking.depositPaymentMethod || 'Metode tidak tercatat'}`
      : `Pembayaran sewa · ${booking.paymentMethod || 'Metode tidak tercatat'}`;
    heading.append(summary, method);
    card.append(heading);

    const amount = stage === 'deposit' ? booking.depositAmount : booking.estimatedTotal;
    if (amount) {
      const amountNote = document.createElement('p');
      amountNote.textContent = `${stage === 'deposit' ? 'Nominal deposit' : 'Nominal sewa'}: ${formatCurrency(amount)}`;
      card.append(amountNote);
    }
    const proofImage = stage === 'deposit' ? booking.depositPaymentProof : booking.paymentProof;
    if (proofImage) {
      const proof = document.createElement('img');
      proof.className = 'review-proof';
      proof.src = proofImage;
      proof.alt = `Bukti ${stage === 'deposit' ? 'deposit' : 'pembayaran sewa'} booking ${booking.id}`;
      card.append(proof);
    } else {
      const cashNote = document.createElement('p');
      cashNote.textContent = 'Pastikan pembayaran tunai sudah diterima petugas.';
      card.append(cashNote);
    }

    const actions = document.createElement('div');
    actions.className = 'review-actions';
    [
      ['approve', 'Konfirmasi diterima', 'btn btn-primary'],
      ['reject', 'Tolak / minta ulang', 'btn btn-secondary'],
    ].forEach(([action, label, className]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = className;
      button.dataset.paymentAction = action;
      button.dataset.bookingId = booking.id;
      button.dataset.paymentStage = stage;
      button.textContent = label;
      actions.append(button);
    });
    card.append(actions);
    list.append(card);
  });
  document.getElementById('bookingPaymentQueueEmpty').hidden = pending.length > 0;
}

function renderFleetInventory() {
  const fleet = readFleet();
  const body = document.getElementById('fleetInventoryBody');
  if (!body) return;
  const search = document.getElementById('fleetSearch').value.trim().toLowerCase();
  const activeFleet = fleet.filter((vehicle) => !vehicle.isArchived);
  const filtered = activeFleet.filter((vehicle) => vehicle.name.toLowerCase().includes(search));
  body.innerHTML = filtered.map((vehicle) => `
    <tr>
      <td><strong>${escapeHtml(vehicle.name)}</strong></td>
      <td><select class="inventory-category-input" aria-label="Kategori ${escapeHtml(vehicle.name)}" form="inventory-edit-${escapeHtml(vehicle.id)}" name="category" required>${fleetCategories.map((category) => `<option value="${escapeHtml(category)}" ${category === (vehicle.category || fleetCategories[0]) ? 'selected' : ''}>${escapeHtml(category)}</option>`).join('')}</select></td>
      <td><input class="inventory-count-input" type="number" min="1" max="20" step="1" value="${Number(vehicle.seats) || ''}" aria-label="Jumlah kursi ${escapeHtml(vehicle.name)}" form="inventory-edit-${escapeHtml(vehicle.id)}" name="seats" required /></td>
      <td><input class="inventory-price-input" type="number" min="1000" step="1000" value="${Number(vehicle.priceNoDriver)}" aria-label="Tarif ${escapeHtml(vehicle.name)} lepas kunci per hari" form="inventory-edit-${escapeHtml(vehicle.id)}" name="priceNoDriver" required /></td>
      <td><input class="inventory-price-input" type="number" min="1000" step="1000" value="${Number(vehicle.priceWithDriverFuel)}" aria-label="Tarif ${escapeHtml(vehicle.name)} driver termasuk BBM per hari" form="inventory-edit-${escapeHtml(vehicle.id)}" name="priceWithDriverFuel" required /></td>
      <td><input class="inventory-price-input" type="number" min="1000" step="1000" value="${Number(vehicle.priceWithDriverNoFuel)}" aria-label="Tarif ${escapeHtml(vehicle.name)} driver tanpa BBM per hari" form="inventory-edit-${escapeHtml(vehicle.id)}" name="priceWithDriverNoFuel" required /></td>
      <td>${Number(vehicle.availableCount)} unit</td>
      <td><input class="inventory-count-input" type="number" min="${Number(vehicle.totalCount) - Number(vehicle.availableCount)}" step="1" value="${Number(vehicle.totalCount)}" aria-label="Jumlah total unit ${escapeHtml(vehicle.name)}" form="inventory-edit-${escapeHtml(vehicle.id)}" name="totalCount" required /></td>
      <td><strong>${Number(vehicle.photoCount || vehicle.photos?.length || 0)} foto</strong><input class="inventory-photo-input" type="file" accept="image/jpeg,image/png" multiple aria-label="Ganti foto ${escapeHtml(vehicle.name)}" form="inventory-edit-${escapeHtml(vehicle.id)}" name="photos" /><small class="file-name" data-photo-status="${escapeHtml(vehicle.id)}">Pilih 2–6 foto untuk mengganti galeri</small></td>
      <td><div class="fleet-row-actions"><form id="inventory-edit-${escapeHtml(vehicle.id)}" class="inventory-edit-form" data-inventory-id="${escapeHtml(vehicle.id)}"><button class="btn btn-secondary" type="submit">Simpan</button></form><button class="btn btn-secondary fleet-archive-button" type="button" data-archive-fleet="${escapeHtml(vehicle.id)}">Hapus</button></div></td>
    </tr>
  `).join('');
  document.getElementById('fleetEmpty').hidden = filtered.length > 0;
  document.getElementById('fleetTotalUnits').textContent = String(activeFleet.reduce((sum, vehicle) => sum + Number(vehicle.totalCount), 0));
  document.getElementById('fleetAvailableUnits').textContent = String(activeFleet.reduce((sum, vehicle) => sum + Number(vehicle.availableCount), 0));
  document.getElementById('fleetReservedUnits').textContent = String(activeFleet.reduce((sum, vehicle) => sum + Number(vehicle.totalCount) - Number(vehicle.availableCount), 0));
  document.getElementById('fleetModelCount').textContent = String(activeFleet.length);
}

function renderPhysicalFleetUnits() {
  const body = document.getElementById('physicalFleetUnitsBody');
  if (!body) return;
  body.replaceChildren(...physicalFleetUnits.map((unit) => {
    const row = document.createElement('tr');
    const staticValues = [
      unit.plate,
      `${unit.carType}`,
      unit.category,
      unit.hasServiceHistory
        ? `${unit.serviceCount || 0} catatan${unit.nextServiceKm ? ` · ${Number(unit.nextServiceKm).toLocaleString('id-ID')} km` : ''}${unit.nextServiceDate ? ` · ${formatServiceDate(unit.nextServiceDate)}` : ''}`
        : 'Belum pernah diservis',
      unit.isReserved ? 'Dipesan' : 'Tersedia',
    ];
    staticValues.slice(0, 3).forEach((value, index) => {
      const cell = document.createElement('td');
      cell.textContent = value || '-';
      if (index === 0) {
        const plate = document.createElement('strong');
        plate.textContent = unit.plate;
        cell.replaceChildren(plate);
      }
      row.append(cell);
    });

    const colorCell = document.createElement('td');
    const colorInput = document.createElement('input');
    colorInput.type = 'text';
    colorInput.value = unit.color || '';
    colorInput.maxLength = 40;
    colorInput.setAttribute('list', 'fleetColorOptions');
    colorInput.setAttribute('aria-label', `Warna unit ${unit.plate}`);
    colorInput.disabled = unit.isReserved;
    colorCell.append(colorInput);
    row.append(colorCell);

    const transmissionCell = document.createElement('td');
    const transmissionInput = document.createElement('input');
    transmissionInput.type = 'text';
    transmissionInput.value = unit.transmission || '';
    transmissionInput.placeholder = 'Belum diisi';
    transmissionInput.maxLength = 40;
    transmissionInput.minLength = 2;
    transmissionInput.autocomplete = 'off';
    transmissionInput.setAttribute('aria-label', `Transmisi unit ${unit.plate}`);
    transmissionInput.disabled = unit.isReserved;
    transmissionCell.append(transmissionInput);
    row.append(transmissionCell);

    const odometerCell = document.createElement('td');
    const odometerInput = document.createElement('input');
    odometerInput.type = 'number';
    odometerInput.min = '0';
    odometerInput.max = '1000000000';
    odometerInput.step = '1';
    odometerInput.value = String(Number(unit.currentKm) || 0);
    odometerInput.setAttribute('aria-label', `Odometer unit ${unit.plate}`);
    odometerCell.append(odometerInput);
    row.append(odometerCell);

    staticValues.slice(3).forEach((value) => {
      const cell = document.createElement('td');
      cell.textContent = value || '-';
      row.append(cell);
    });

    const actions = document.createElement('td');
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'btn btn-secondary';
    save.textContent = 'Simpan';
    save.addEventListener('click', () => updatePhysicalFleetUnit(unit, colorInput, transmissionInput, odometerInput, save));
    const serviceLink = document.createElement('a');
    serviceLink.className = 'btn btn-secondary';
    serviceLink.href = `admin-vehicle-service.html?plate=${encodeURIComponent(unit.plate)}`;
    serviceLink.textContent = 'Catat servis';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn btn-secondary';
    remove.textContent = 'Hapus';
    remove.disabled = unit.isReserved || unit.hasServiceHistory;
    remove.setAttribute('aria-label', `Hapus unit ${unit.plate} dari inventaris`);
    if (unit.isReserved) remove.title = 'Unit sedang dialokasikan untuk booking.';
    else if (unit.hasServiceHistory) remove.title = 'Riwayat servis unit harus dipertahankan.';
    remove.disabled = unit.isReserved;
    if (unit.hasServiceHistory && !unit.isReserved) {
      remove.title = 'Riwayat servis akan disimpan dalam arsip permintaan penghapusan.';
    }
    remove.addEventListener('click', () => openPhysicalFleetDeletionRequest(unit));
    actions.append(save, serviceLink, remove);
    row.append(actions);
    return row;
  }));
  document.getElementById('physicalFleetUnitsEmpty').hidden = physicalFleetUnits.length > 0;
}

function createPhysicalFleetDraftRow() {
  const row = document.createElement('div');
  row.className = 'physical-unit-draft-row';
  [
    { name: 'plate', label: 'Plat nomor', placeholder: 'Contoh: L 1234 B', type: 'text', maxLength: '16' },
    { name: 'color', label: 'Warna kendaraan', placeholder: 'Contoh: Hitam', type: 'text', maxLength: '40', list: 'fleetColorOptions' },
    { name: 'transmission', label: 'Jenis transmisi', placeholder: 'Ketik transmisi, mis. Otomatis (CVT)', type: 'text', maxLength: '40', minLength: '2' },
    { name: 'currentKm', label: 'Odometer saat ini (km)', placeholder: '0', type: 'number', min: '0', step: '1', value: '0' },
  ].forEach((field) => {
    const label = document.createElement('label');
    label.textContent = field.label;
    const input = document.createElement('input');
    input.name = field.name;
    input.type = field.type;
    input.placeholder = field.placeholder;
    input.required = true;
    if (field.maxLength) input.maxLength = Number(field.maxLength);
    if (field.minLength) input.minLength = Number(field.minLength);
    if (field.name === 'transmission') input.autocomplete = 'off';
    if (field.list) input.setAttribute('list', field.list);
    if (field.min) input.min = field.min;
    if (field.step) input.step = field.step;
    if (field.value) input.value = field.value;
    label.append(input);
    row.append(label);
  });
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'btn btn-secondary physical-unit-draft-remove';
  remove.textContent = 'Hapus';
  remove.setAttribute('aria-label', 'Hapus baris plat ini');
  row.append(remove);
  return row;
}

function updatePhysicalDraftRemoveButtons() {
  const rows = [...document.querySelectorAll('#physicalFleetDraftRows .physical-unit-draft-row')];
  rows.forEach((row) => { row.querySelector('.physical-unit-draft-remove').disabled = rows.length <= 1; });
  document.getElementById('addPhysicalFleetRow').disabled = rows.length >= 30;
}

function renderPhysicalFleetFormOptions() {
  const form = document.getElementById('physicalFleetUnitForm');
  if (!form) return;
  const activeFleet = readFleet().filter((vehicle) => !vehicle.isArchived);
  const categorySelect = form.elements.category;
  const previousCategory = categorySelect.value;
  const categories = [...new Set(activeFleet.map((vehicle) => vehicle.category || 'MPV'))];
  categorySelect.replaceChildren(...categories.map((category) => new Option(category, category)));
  if (categories.includes(previousCategory)) categorySelect.value = previousCategory;
  const typeSelect = form.elements.carType;
  const previousType = typeSelect.value;
  const matchingTypes = activeFleet.filter((vehicle) => (vehicle.category || 'MPV') === categorySelect.value);
  typeSelect.replaceChildren(...matchingTypes.map((vehicle) => new Option(vehicle.name, vehicle.name)));
  if (matchingTypes.some((vehicle) => vehicle.name === previousType)) typeSelect.value = previousType;
}

function selectPhysicalFleetModel(name, category) {
  const form = document.getElementById('physicalFleetUnitForm');
  if (!form) return;
  const categorySelect = form.elements.category;
  if ([...categorySelect.options].some((option) => option.value === category)) {
    categorySelect.value = category;
  }
  renderPhysicalFleetFormOptions();
  const typeSelect = form.elements.carType;
  if ([...typeSelect.options].some((option) => option.value === name)) {
    typeSelect.value = name;
  }
}

async function updatePhysicalFleetUnit(unit, colorInput, transmissionInput, odometerInput, submit) {
  const color = colorInput.value.trim().replace(/\s+/g, ' ');
  const transmission = transmissionInput.value.trim().replace(/\s+/g, ' ');
  const currentKm = Number(odometerInput.value);
  if (color.length < 2 || color.length > 40 || transmission.length < 2 || transmission.length > 40 || !Number.isSafeInteger(currentKm)
    || currentKm < Number(unit.currentKm || 0) || currentKm > 1_000_000_000) {
    window.alert('Warna dan transmisi harus 2–40 karakter, serta odometer tidak boleh lebih kecil dari data tersimpan.');
    return;
  }
  submit.disabled = true;
  try {
    await DriveLinkAPI.put(`/api/admin/fleet/physical-units/${encodeURIComponent(unit.plate)}`, { color, transmission, currentKm });
    [physicalFleetUnits] = await Promise.all([
      DriveLinkAPI.get('/api/admin/fleet/physical-units'),
      DriveLinkAPI.get('/api/admin/fleet').then(cacheFleet),
    ]);
    renderPhysicalFleetUnits();
    renderFleetInventory();
  } catch (error) {
    console.error(`Unit ${unit.plate} gagal diperbarui.`, error);
    window.alert(`Unit ${unit.plate} gagal diperbarui: ${error.message}`);
    submit.disabled = false;
  }
}

function openPhysicalFleetDeletionRequest(unit) {
  if (!fleetArchiveDialog || unit.isReserved) return;
  fleetArchiveForm.dataset.targetType = 'physical-unit';
  fleetArchiveForm.dataset.targetId = unit.plate;
  fleetArchiveTitle.textContent = 'Ajukan hapus unit';
  fleetArchiveDescription.textContent = `Unit ${unit.plate} (${unit.carType}, ${unit.color}) tidak dihapus sampai admin utama menyetujui permintaan. Riwayat servis dan data unit disimpan di halaman persetujuan.`;
  fleetArchiveSubmit.textContent = 'Kirim permintaan';
  fleetArchiveDialog.showModal();
  fleetArchiveReason.focus();
}

async function addPhysicalFleetUnit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('[type="submit"]');
  const message = document.getElementById('physicalFleetUnitMessage');
  const carType = String(form.elements.carType.value || '');
  const units = [...form.querySelectorAll('.physical-unit-draft-row')].map((row) => ({
    plate: String(row.querySelector('[name="plate"]').value || '').trim().toUpperCase(),
    color: String(row.querySelector('[name="color"]').value || '').trim().replace(/\s+/g, ' '),
    transmission: String(row.querySelector('[name="transmission"]').value || '').trim().replace(/\s+/g, ' '),
    currentKm: Number(row.querySelector('[name="currentKm"]').value),
  }));
  const plates = units.map((unit) => unit.plate);
  const invalidRowIndex = units.findIndex((unit) => !/^[A-Z0-9 -]{2,16}$/.test(unit.plate)
    || unit.color.length < 2 || unit.color.length > 40 || unit.transmission.length < 2 || unit.transmission.length > 40
    || !Number.isSafeInteger(unit.currentKm) || unit.currentKm < 0 || unit.currentKm > 1_000_000_000);
  if (!carType || !units.length || invalidRowIndex >= 0 || new Set(plates).size !== plates.length) {
    const invalidRow = invalidRowIndex >= 0
      ? form.querySelectorAll('.physical-unit-draft-row')[invalidRowIndex]
      : null;
    const transmissionInput = invalidRow?.querySelector('[name="transmission"]');
    if (transmissionInput && (transmissionInput.value.trim().length < 2 || transmissionInput.value.trim().length > 40)) {
      message.textContent = `Isi jenis transmisi pada baris ${invalidRowIndex + 1} (2–40 karakter).`;
      transmissionInput.focus();
    } else {
      message.textContent = 'Periksa model, plat unik, warna, transmisi (2–40 karakter), dan odometer pada semua baris.';
    }
    message.classList.add('is-error');
    return;
  }
  submit.disabled = true;
  try {
    await DriveLinkAPI.post('/api/admin/fleet/physical-units', { carType, units });
    [physicalFleetUnits] = await Promise.all([
      DriveLinkAPI.get('/api/admin/fleet/physical-units'),
      DriveLinkAPI.get('/api/admin/fleet').then(cacheFleet),
    ]);
    form.reset();
    document.getElementById('physicalFleetDraftRows').replaceChildren(createPhysicalFleetDraftRow());
    updatePhysicalDraftRemoveButtons();
    renderPhysicalFleetFormOptions();
    renderPhysicalFleetUnits();
    message.textContent = `${units.length} unit ${carType} berhasil disimpan ke armada.`;
    message.classList.remove('is-error');
  } catch (error) {
    console.error('Unit fisik gagal ditambahkan ke armada.', error);
    message.textContent = `Unit gagal ditambahkan: ${error.message}`;
    message.classList.add('is-error');
  } finally {
    submit.disabled = false;
  }
}

function readVehicleUnits() {
  if (serverVehicleUnits) return serverVehicleUnits;
  return DriveLinkStorage.read('drivelink-vehicle-units', []);
}

function saveVehicleUnits(units) {
  serverVehicleUnits = units;
  if (window.DriveLinkAPI) return;
  DriveLinkStorage.write('drivelink-vehicle-units', units);
}

function formatServiceDate(value) {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(date);
}

function serviceStatus(unit) {
  if (!(unit.serviceHistory || []).length) {
    return { label: 'Belum pernah diservis', className: 'status-pending' };
  }
  const currentKm = Number(unit.currentKm ?? unit.lastServiceKm);
  const kmDue = Number(unit.nextServiceKm);
  const hasKmSchedule = Number.isFinite(kmDue) && kmDue > 0;
  const hasDateSchedule = Boolean(unit.nextServiceDate);
  const dateDue = hasDateSchedule && new Date(`${unit.nextServiceDate}T23:59:59`).getTime() <= Date.now();
  if (hasKmSchedule && currentKm >= kmDue || dateDue) return { label: 'Servis jatuh tempo', className: 'status-cancelled' };
  if (hasKmSchedule && kmDue - currentKm <= 1000) return { label: 'Servis segera', className: 'status-pending' };
  if (!hasKmSchedule && !hasDateSchedule) return { label: 'Jadwal belum diatur', className: 'status-pending' };
  return { label: 'Servis belum waktunya', className: 'status-active' };
}

function createServiceExpenseRow() {
  const row = document.createElement('div');
  row.className = 'service-expense-row';
  const categoryLabel = document.createElement('label');
  categoryLabel.textContent = 'Kategori servis';
  const category = document.createElement('select');
  category.name = 'serviceCategory';
  category.required = true;
  category.replaceChildren(...serviceCategories.map((item) => new Option(item, item)));
  categoryLabel.append(category);

  const partLabel = document.createElement('label');
  partLabel.textContent = 'Part / pekerjaan';
  const part = document.createElement('input');
  part.name = 'servicePart';
  part.type = 'text';
  part.maxLength = 100;
  part.placeholder = 'Contoh: Ganti oli mesin';
  part.required = true;
  partLabel.append(part);

  const costLabel = document.createElement('label');
  costLabel.textContent = 'Biaya (Rp)';
  const cost = document.createElement('input');
  cost.name = 'serviceCost';
  cost.type = 'number';
  cost.min = '0';
  cost.max = '1000000000';
  cost.step = '1';
  cost.value = '0';
  cost.required = true;
  costLabel.append(cost);

  const detailsLabel = document.createElement('label');
  detailsLabel.className = 'service-expense-details';
  detailsLabel.textContent = 'Catatan rincian';
  const details = document.createElement('input');
  details.name = 'serviceDetails';
  details.type = 'text';
  details.maxLength = 300;
  details.placeholder = 'Merek, ukuran, kondisi, atau pekerjaan';
  detailsLabel.append(details);

  const remove = document.createElement('button');
  remove.className = 'btn btn-secondary service-expense-remove';
  remove.type = 'button';
  remove.textContent = 'Hapus';
  remove.setAttribute('aria-label', 'Hapus rincian servis');
  row.append(categoryLabel, partLabel, costLabel, detailsLabel, remove);
  return row;
}

function updateServiceExpenseTotal() {
  const total = [...document.querySelectorAll('[name="serviceCost"]')]
    .reduce((sum, input) => sum + (Number(input.value) || 0), 0);
  document.getElementById('serviceExpenseTotal').textContent = formatCurrency(total);
}

function renderVehicleService() {
  const form = document.getElementById('vehicleServiceForm');
  const body = document.getElementById('vehicleServiceBody');
  if (!form || !body) return;
  const fleet = readFleet().filter((vehicle) => !vehicle.isArchived);
  const units = readVehicleUnits();
  const requestedPlate = new URLSearchParams(window.location.search).get('plate')?.toUpperCase() || '';
  const requestedUnit = !serviceQueryApplied && requestedPlate
    ? units.find((unit) => unit.plate.toUpperCase() === requestedPlate)
    : null;
  const typeSelect = form.elements.carType;
  const selectedType = requestedUnit?.carType || typeSelect.value;
  typeSelect.replaceChildren(...fleet.map((vehicle) => {
    const option = document.createElement('option');
    option.value = vehicle.name;
    option.textContent = vehicle.name;
    return option;
  }));
  if (fleet.some((vehicle) => vehicle.name === selectedType)) typeSelect.value = selectedType;

  const plateOptions = document.getElementById('vehiclePlateOptions');
  if (plateOptions) plateOptions.replaceChildren(...units.map((unit) => new Option(`${unit.plate} · ${unit.carType}`, unit.plate)));
  if (requestedUnit) {
    form.elements.plate.value = requestedUnit.plate;
    form.elements.engine.value = requestedUnit.engine || '';
    form.elements.lastServiceKm.value = String(Number(requestedUnit.currentKm) || 0);
    serviceQueryApplied = true;
  }
  body.replaceChildren();
  units.forEach((unit) => {
    const row = document.createElement('tr');
    const status = serviceStatus(unit);
    const historyEntries = unit.serviceHistory || [];
    const latestService = historyEntries.at(-1);
    const cells = [
      `${unit.plate} · ${unit.carType}`,
      unit.engine || '-',
      `${latestService ? `${Number(unit.lastServiceKm).toLocaleString('id-ID')} km terakhir · ` : ''}${Number(unit.currentKm ?? unit.lastServiceKm ?? 0).toLocaleString('id-ID')} km sekarang`,
      latestService ? `${formatServiceDate(unit.lastServiceDate)} · nota tersedia` : 'Belum pernah diservis',
      unit.workshop || '-',
      latestService ? `${Number(unit.nextServiceKm).toLocaleString('id-ID')} km · ${formatServiceDate(unit.nextServiceDate)}` : '-',
    ];
    cells.forEach((value, index) => {
      const cell = document.createElement('td');
      cell.textContent = value;
      if (index === 0) {
        const strong = document.createElement('strong');
        strong.textContent = `${unit.plate} · ${unit.carType}`;
        cell.replaceChildren(strong);
      }
      row.append(cell);
    });
    const expenseCell = document.createElement('td');
    const expenses = historyEntries.reduce((sum, item) => sum + (Number(item.totalCost) || 0), 0);
    const expenseTotal = document.createElement('strong');
    expenseTotal.textContent = formatCurrency(expenses);
    const latestExpense = latestService?.items || [];
    const expenseSummary = document.createElement('small');
    expenseSummary.textContent = latestExpense.length
      ? latestExpense.map((item) => `${item.category}: ${item.part}`).join(' · ')
      : latestService ? 'Belum ada rincian biaya' : 'Belum ada pengeluaran servis';
    expenseCell.append(expenseTotal, expenseSummary);
    row.append(expenseCell);
    const statusCell = document.createElement('td');
    const statusPill = document.createElement('span');
    statusPill.className = `status-pill ${status.className}`;
    statusPill.textContent = status.label;
    statusCell.append(statusPill);
    row.append(statusCell);
    const receiptCell = document.createElement('td');
    const history = document.createElement('details');
    const historySummary = document.createElement('summary');
    historySummary.textContent = `${unit.plate} · ${historyEntries.length} catatan servis`;
    history.append(historySummary);
    historyEntries.slice().reverse().forEach((service) => {
      const entry = document.createElement('div');
      entry.className = 'service-history-entry';
      const servicePlate = document.createElement('strong');
      servicePlate.className = 'service-history-plate';
      servicePlate.textContent = `${service.plate || unit.plate} · ${service.carType || unit.carType}`;
      const heading = document.createElement('strong');
      heading.textContent = `${formatServiceDate(service.date)} · ${formatCurrency(service.totalCost || 0)}`;
      const list = document.createElement('ul');
      (service.items || []).forEach((item) => {
        const detail = document.createElement('li');
        detail.textContent = `${item.category}: ${item.part}${item.details ? ` — ${item.details}` : ''} · ${formatCurrency(item.cost)}`;
        list.append(detail);
      });
      entry.append(servicePlate, heading);
      if (list.childElementCount) entry.append(list);
      if (typeof service.receipt === 'string' && /^data:image\/(jpeg|png);base64,/.test(service.receipt)) {
        const receiptLink = document.createElement('a');
        receiptLink.href = service.receipt;
        receiptLink.target = '_blank';
        receiptLink.rel = 'noopener noreferrer';
        receiptLink.textContent = 'Lihat nota';
        entry.append(receiptLink);
      }
      history.append(entry);
    });
    if (!historyEntries.length) {
      const notServiced = document.createElement('p');
      notServiced.className = 'service-history-empty';
      notServiced.textContent = `${unit.plate} belum memiliki riwayat servis.`;
      history.append(notServiced);
    }
    receiptCell.append(history);
    row.append(receiptCell);
    body.append(row);
  });
  document.getElementById('vehicleServiceEmpty').hidden = units.length > 0;
  if (!document.querySelector('#serviceExpenseItems .service-expense-row')) {
    document.getElementById('serviceExpenseItems').append(createServiceExpenseRow());
  }
  document.querySelectorAll('#serviceExpenseItems [name="serviceCategory"]').forEach((select) => {
    const selectedCategory = serviceCategories.includes(select.value) ? select.value : serviceCategories[0];
    select.replaceChildren(...serviceCategories.map((category) => new Option(category, category)));
    select.value = selectedCategory;
  });
  document.querySelectorAll('#serviceExpenseItems .service-expense-remove').forEach((button) => {
    button.disabled = document.querySelectorAll('#serviceExpenseItems .service-expense-row').length <= 1;
  });
  updateServiceExpenseTotal();
}

// Batas sebelum kompresi dan batas total, mengikuti validasi server.
const MAX_SERVICE_RECEIPT_INPUT_BYTES = 20 * 1024 * 1024;
const MAX_SERVICE_RECEIPT_BYTES = 300 * 1024;
const MAX_FLEET_PHOTO_INPUT_BYTES = 20 * 1024 * 1024;
const MAX_FLEET_PHOTO_BYTES = 700 * 1024;
const MAX_FLEET_PHOTO_TOTAL_BYTES = 4 * 1024 * 1024;

// Nota servis dikompresi ke 290 KB (batas server 300 KB).
function compressServiceReceipt(file) {
  return DriveLinkImages.compress(file, {
    maxBytes: 290 * 1024,
    maxEdge: 2000,
    label: 'Nota',
  });
}

// Foto armada dikompresi ke 680 KB per foto (batas server 700 KB, total 4 MB).
function compressFleetPhoto(file) {
  return DriveLinkImages.compress(file, {
    maxBytes: 680 * 1024,
    maxEdge: 2000,
    label: 'Foto armada',
  });
}

function openBookingRejectionDialog(bookingId) {
  const dialog = document.getElementById('bookingRejectionDialog');
  const form = document.getElementById('bookingRejectionForm');
  form.dataset.bookingId = bookingId;
  form.elements.reason.value = '';
  form.elements.reason.setCustomValidity('');
  dialog.showModal();
  form.elements.reason.focus();
}

async function updateBookingApproval(bookingId, action, reason = '') {
  const bookings = readBookings();
  const booking = bookings.find((item) => item.id === bookingId);
  const message = document.getElementById('bookingActionMessage');
  if (!booking || booking.bookingApproval !== 'Menunggu persetujuan') return;

  if (window.DriveLinkAPI) {
    try {
      await DriveLinkAPI.patch(`/api/admin/bookings/${encodeURIComponent(bookingId)}/approval`, {
        action,
        ...(action === 'reject' ? { reason } : {}),
      });
      const serverBookings = await DriveLinkAPI.get('/api/admin/bookings');
      DriveLinkStorage.writeBookings(serverBookings);
      if (session?.role === 'admin' || session?.permissions?.includes('fleet')) {
        const serverFleet = await DriveLinkAPI.get('/api/admin/fleet');
        cacheFleet(serverFleet);
      }
      message.classList.remove('is-error');
      message.textContent = action === 'approve'
        ? `${booking.id} disetujui dan stok armada diperbarui.`
        : `${booking.id} ditolak dan masuk ke arsip penyewaan.`;
      renderBookings();
      renderFleetInventory();
    } catch (error) {
      message.textContent = `Booking gagal diperbarui: ${error.message}`;
      message.classList.add('is-error');
    }
    return;
  }

  if (action === 'approve') {
    const fleet = readFleet();
    const vehicle = fleet.find((item) => item.name === booking.carType);
    if (!vehicle || vehicle.availableCount < 1) {
      message.textContent = 'Unit tidak tersedia. Tambahkan stok atau tolak pengajuan ini.';
      message.classList.add('is-error');
      return;
    }
    vehicle.availableCount -= 1;
    saveFleet(fleet);
    booking.stockReserved = true;
    booking.bookingApproval = 'Disetujui';
    booking.bookingApprovedAt = new Date().toISOString();
    message.textContent = `${booking.id} disetujui. Satu unit ${booking.carType} dipesan dan pelanggan dapat melanjutkan pembayaran.`;
  } else {
    booking.bookingApproval = 'Ditolak';
    booking.bookingRejectedAt = new Date().toISOString();
    booking.bookingRejectionReason = reason;
    message.textContent = `${booking.id} ditolak dan masuk ke arsip penyewaan. Jumlah unit tidak berubah.`;
  }
  message.classList.remove('is-error');
  saveBookings(bookings);
  renderBookings();
  renderFleetInventory();
}

async function updateBookingPayment(bookingId, action, stage = 'rental') {
  const bookings = readBookings();
  const booking = bookings.find((item) => item.id === bookingId);
  const message = document.getElementById('bookingActionMessage');
  const pendingStatus = booking?.depositPaymentRequired && stage === 'deposit'
    ? booking.depositPaymentStatus
    : booking?.paymentStatus;
  if (!booking || pendingStatus !== 'Menunggu konfirmasi') return;

  if (window.DriveLinkAPI) {
    try {
      await DriveLinkAPI.patch(`/api/admin/bookings/${encodeURIComponent(bookingId)}/payment`, { action, stage });
      const serverBookings = await DriveLinkAPI.get('/api/admin/bookings');
      DriveLinkStorage.writeBookings(serverBookings);
      message.classList.remove('is-error');
      const stageLabel = stage === 'deposit' ? 'deposit' : 'pembayaran sewa';
      message.textContent = action === 'approve'
        ? `${stageLabel} ${booking.id} dikonfirmasi.${stage === 'deposit' ? ' Pelanggan dapat membayar biaya sewa.' : ' Tahap persiapan unit dapat dimulai.'}`
        : `${stageLabel} ${booking.id} ditolak. Pelanggan dapat mengirim ulang bukti pembayaran.`;
      renderBookings();
    } catch (error) {
      message.textContent = `Verifikasi pembayaran gagal: ${error.message}`;
      message.classList.add('is-error');
    }
    return;
  }

  const approved = action === 'approve';
  const reviewedAt = new Date().toISOString();
  if (booking.depositPaymentRequired && stage === 'deposit') {
    booking.depositPaymentStatus = approved ? 'Dikonfirmasi' : 'Ditolak';
    booking.depositPaymentReviewedAt = reviewedAt;
    booking.depositPaymentAdminNote = approved ? '' : 'Bukti deposit ditolak; pelanggan perlu mengirim ulang.';
  } else {
    booking.paymentStatus = approved ? 'Dikonfirmasi' : 'Ditolak';
    booking.paymentReviewedAt = reviewedAt;
    booking.paymentConfirmedAt = approved ? reviewedAt : '';
    booking.paymentAdminNote = approved ? '' : 'Bukti ditolak; silakan kirim ulang bukti pembayaran.';
    if (approved) {
      booking.status = booking.depositPaymentRequired ? 'Persiapan unit' : 'Serah terima';
      booking.statusHistory = booking.statusHistory || [];
      booking.statusHistory.push({ status: booking.status, at: reviewedAt });
    }
  }
  saveBookings(bookings);
  message.classList.remove('is-error');
  const stageLabel = stage === 'deposit' ? 'deposit' : 'pembayaran sewa';
  message.textContent = approved
    ? `${stageLabel} ${booking.id} dikonfirmasi.${stage === 'deposit' ? ' Pelanggan dapat membayar biaya sewa.' : ' Tahap persiapan unit dapat dimulai.'}`
    : `${stageLabel} ${booking.id} ditolak. Pelanggan dapat mengirim ulang bukti pembayaran.`;
  renderBookings();
}

async function addFleetUnit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const name = String(data.get('name')).trim();
  const priceNoDriver = Number(data.get('priceNoDriver'));
  const priceWithDriverFuel = Number(data.get('priceWithDriverFuel'));
  const priceWithDriverNoFuel = Number(data.get('priceWithDriverNoFuel'));
  const totalCount = Number(data.get('totalCount'));
  const category = String(data.get('category') || '');
  const seats = Number(data.get('seats'));
  const message = document.getElementById('fleetFormMessage');
  const photoFiles = [...(data.getAll('photos') || [])].filter((file) => file instanceof File && file.size > 0);
  const invalidPhotoFiles = photoFiles.some((file) => (
    !['image/jpeg', 'image/png'].includes(file.type) || file.size > MAX_FLEET_PHOTO_INPUT_BYTES
  ));
  const fleet = readFleet();
  if (fleet.some((vehicle) => vehicle.name.toLowerCase() === name.toLowerCase())) {
    message.textContent = 'Nama unit sudah ada di daftar.';
    message.classList.add('is-error');
    return;
  }
  if (!name || !fleetCategories.includes(category) || !Number.isFinite(priceNoDriver) || !Number.isFinite(priceWithDriverFuel) || !Number.isFinite(priceWithDriverNoFuel) || priceNoDriver < 1000 || priceWithDriverFuel < 1000 || priceWithDriverNoFuel < 1000 || !Number.isInteger(totalCount) || totalCount < 1) {
    message.textContent = 'Periksa nama, kategori, jumlah kursi, tarif, dan jumlah unit.';
    message.classList.add('is-error');
    return;
  }
  if (!Number.isInteger(seats) || seats < 1 || seats > 20) {
    message.textContent = 'Isi jumlah kursi antara 1–20.';
    message.classList.add('is-error');
    return;
  }
  if (photoFiles.length < 2 || photoFiles.length > 6 || invalidPhotoFiles) {
    message.textContent = 'Unggah 2–6 foto JPG/PNG. Ukuran foto asli maksimal 20 MB per foto; foto akan dikompresi otomatis.';
    message.classList.add('is-error');
    return;
  }
  let photos;
  try {
    photos = await Promise.all(photoFiles.map(compressFleetPhoto));
    if (photos.reduce((sum, photo) => sum + photo.sizeBytes, 0) > MAX_FLEET_PHOTO_TOTAL_BYTES) {
      throw new Error('Ukuran total foto setelah dikompresi masih melebihi 4 MB.');
    }
  } catch (error) {
    message.textContent = `Foto kendaraan gagal dibaca: ${error.message}`;
    message.classList.add('is-error');
    return;
  }
  if (window.DriveLinkAPI) {
    DriveLinkAPI.post('/api/admin/fleet', { name, category, seats, priceNoDriver, priceWithDriverFuel, priceWithDriverNoFuel, totalCount, photos })
      .then(async () => {
        const serverFleet = await DriveLinkAPI.get('/api/admin/fleet');
        cacheFleet(serverFleet);
        selectPhysicalFleetModel(name, category);
        form.reset();
        document.getElementById('fleetPhotoPreview').replaceChildren();
        document.getElementById('fleetPhotosStatus').textContent = 'Pilih beberapa foto dari sudut yang berbeda.';
        message.classList.remove('is-error');
        message.textContent = `${name} berhasil ditambahkan.`;
        renderFleetInventory();
      })
      .catch((error) => {
        message.textContent = `Unit gagal disimpan: ${error.message}`;
        message.classList.add('is-error');
      });
    return;
  }
  const id = `unit-${Date.now()}`;
  fleet.push({ id, name, category, seats, priceNoDriver, priceWithDriverFuel, priceWithDriverNoFuel, totalCount, availableCount: totalCount, photos, photoCount: photos.length });
  saveFleet(fleet);
  selectPhysicalFleetModel(name, category);
  form.reset();
  message.classList.remove('is-error');
  message.textContent = `${name} berhasil ditambahkan.`;
  renderFleetInventory();
}

async function updateFleetUnit(event) {
  const form = event.target.closest('form[data-inventory-id]');
  if (!form) return;
  event.preventDefault();
  const data = new FormData(form);
  const totalCount = Number(data.get('totalCount'));
  const category = String(data.get('category') || '');
  const seats = Number(data.get('seats'));
  const priceNoDriver = Number(data.get('priceNoDriver'));
  const priceWithDriverFuel = Number(data.get('priceWithDriverFuel'));
  const priceWithDriverNoFuel = Number(data.get('priceWithDriverNoFuel'));
  const photoFiles = [...(data.getAll('photos') || [])].filter((file) => file instanceof File && file.size > 0);
  const invalidPhotoFiles = photoFiles.some((file) => (
    !['image/jpeg', 'image/png'].includes(file.type) || file.size > MAX_FLEET_PHOTO_INPUT_BYTES
  ));
  const fleet = readFleet();
  const vehicle = fleet.find((item) => item.id === form.dataset.inventoryId);
  if (!vehicle || !fleetCategories.includes(category) || !Number.isInteger(seats) || seats < 1 || seats > 20
    || !Number.isInteger(totalCount) || totalCount < vehicle.totalCount - vehicle.availableCount || !Number.isFinite(priceNoDriver) || priceNoDriver < 1000 || !Number.isFinite(priceWithDriverFuel) || priceWithDriverFuel < 1000 || !Number.isFinite(priceWithDriverNoFuel) || priceWithDriverNoFuel < 1000) {
    const message = document.getElementById('fleetFormMessage');
    message.textContent = 'Jumlah unit harus mencakup unit yang sudah dipesan dan tarif harus lebih dari nol.';
    message.classList.add('is-error');
    return;
  }
  if (photoFiles.length && (photoFiles.length < 2 || photoFiles.length > 6 || invalidPhotoFiles)) {
    const message = document.getElementById('fleetFormMessage');
    message.textContent = 'Untuk mengganti galeri, pilih 2–6 foto JPG/PNG. Ukuran foto asli maksimal 20 MB per foto; foto akan dikompresi otomatis.';
    message.classList.add('is-error');
    return;
  }
  let photos;
  try {
    if (photoFiles.length) {
      photos = await Promise.all(photoFiles.map(compressFleetPhoto));
      if (photos.reduce((sum, photo) => sum + photo.sizeBytes, 0) > MAX_FLEET_PHOTO_TOTAL_BYTES) {
        throw new Error('Ukuran total foto setelah dikompresi masih melebihi 4 MB.');
      }
    }
  } catch (error) {
    const message = document.getElementById('fleetFormMessage');
    message.textContent = `Foto kendaraan gagal dibaca: ${error.message}`;
    message.classList.add('is-error');
    return;
  }
  if (window.DriveLinkAPI) {
    DriveLinkAPI.put(`/api/admin/fleet/${encodeURIComponent(vehicle.id)}`, {
      totalCount,
      category,
      seats,
      priceNoDriver,
      priceWithDriverFuel,
      priceWithDriverNoFuel,
      ...(photos ? { photos } : {}),
    }).then(async () => {
      const serverFleet = await DriveLinkAPI.get('/api/admin/fleet');
      cacheFleet(serverFleet);
      document.getElementById('fleetFormMessage').classList.remove('is-error');
      document.getElementById('fleetFormMessage').textContent = `${vehicle.name} berhasil diperbarui.`;
      renderFleetInventory();
    }).catch((error) => {
      const message = document.getElementById('fleetFormMessage');
      message.textContent = `Armada gagal diperbarui: ${error.message}`;
      message.classList.add('is-error');
    });
    return;
  }
  vehicle.availableCount += totalCount - vehicle.totalCount;
  vehicle.totalCount = totalCount;
  vehicle.category = category;
  vehicle.seats = seats;
  vehicle.priceNoDriver = priceNoDriver;
  vehicle.priceWithDriverFuel = priceWithDriverFuel;
  vehicle.priceWithDriverNoFuel = priceWithDriverNoFuel;
  if (photos) {
    vehicle.photos = photos;
    vehicle.photoCount = photos.length;
  }
  saveFleet(fleet);
  document.getElementById('fleetFormMessage').classList.remove('is-error');
  document.getElementById('fleetFormMessage').textContent = `${vehicle.name} berhasil diperbarui.`;
  renderFleetInventory();
}

const todayLabel = document.getElementById('todayLabel');
if (todayLabel) todayLabel.textContent = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
}).format(new Date());

const bookingSearch = document.getElementById('bookingSearch');
if (bookingSearch) bookingSearch.addEventListener('input', renderBookings);
const statusFilter = document.getElementById('statusFilter');
if (statusFilter) statusFilter.addEventListener('change', renderBookings);
const logoutButton = document.getElementById('logoutButton');
if (logoutButton) logoutButton.addEventListener('click', async () => {
  if (window.DriveLinkAPI) {
    try {
      await DriveLinkAPI.post('/api/auth/logout', {});
    } catch (error) {
      console.error('Sesi server gagal diakhiri.', error);
    }
  }
  localStorage.removeItem('drivelink-session');
  window.location.href = 'auth.html';
});
const fleetSearch = document.getElementById('fleetSearch');
if (fleetSearch) fleetSearch.addEventListener('input', renderFleetInventory);
const allBookingsBody = document.getElementById('allBookingsBody');
if (allBookingsBody) allBookingsBody.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const detailsButton = target.closest('[data-customer-details]');
  if (detailsButton) {
    openCustomerDetails(detailsButton.dataset.customerDetails).catch(() => {});
    return;
  }
  const button = target.closest('[data-booking-action]');
  if (button) {
    if (button.dataset.bookingAction === 'reject') openBookingRejectionDialog(button.dataset.bookingId);
    else updateBookingApproval(button.dataset.bookingId, button.dataset.bookingAction);
  }
});
const bookingPaymentReviewList = document.getElementById('bookingPaymentReviewList');
if (bookingPaymentReviewList) bookingPaymentReviewList.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest('[data-payment-action]');
  if (button) updateBookingPayment(button.dataset.bookingId, button.dataset.paymentAction, button.dataset.paymentStage);
});
const customerDetailsDialog = document.getElementById('customerDetailsDialog');
const closeCustomerDetails = document.getElementById('closeCustomerDetails');
if (closeCustomerDetails && customerDetailsDialog) closeCustomerDetails.addEventListener('click', () => customerDetailsDialog.close());
if (customerDetailsDialog) customerDetailsDialog.addEventListener('click', (event) => {
  if (event.target === customerDetailsDialog) customerDetailsDialog.close();
});
const bookingRejectionDialog = document.getElementById('bookingRejectionDialog');
const bookingRejectionForm = document.getElementById('bookingRejectionForm');
if (bookingRejectionDialog && bookingRejectionForm) {
  bookingRejectionForm.elements.reason.addEventListener('input', () => {
    bookingRejectionForm.elements.reason.setCustomValidity('');
  });
  bookingRejectionForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const reason = bookingRejectionForm.elements.reason.value.trim();
    if (!reason) {
      bookingRejectionForm.elements.reason.setCustomValidity('Alasan penolakan wajib diisi.');
      bookingRejectionForm.elements.reason.reportValidity();
      return;
    }
    const bookingId = bookingRejectionForm.dataset.bookingId;
    bookingRejectionDialog.close();
    await updateBookingApproval(bookingId, 'reject', reason);
  });
  document.getElementById('cancelBookingRejection').addEventListener('click', () => bookingRejectionDialog.close());
  document.getElementById('cancelBookingRejectionAction').addEventListener('click', () => bookingRejectionDialog.close());
  bookingRejectionDialog.addEventListener('click', (event) => {
    if (event.target === bookingRejectionDialog) bookingRejectionDialog.close();
  });
}
const fleetUnitForm = document.getElementById('fleetUnitForm');
if (fleetUnitForm) fleetUnitForm.addEventListener('submit', addFleetUnit);
const fleetPhotosInput = document.getElementById('fleetPhotosInput');
if (fleetPhotosInput) fleetPhotosInput.addEventListener('change', () => {
  const files = [...fleetPhotosInput.files];
  const valid = files.length >= 2 && files.length <= 6
    && files.every((file) => file.size <= MAX_FLEET_PHOTO_INPUT_BYTES && ['image/jpeg', 'image/png'].includes(file.type));
  fleetPhotosInput.setCustomValidity(files.length && !valid
    ? 'Pilih 2–6 foto JPG/PNG, maksimal 20 MB per foto sebelum dikompresi.'
    : '');
  const status = document.getElementById('fleetPhotosStatus');
  const preview = document.getElementById('fleetPhotoPreview');
  preview.replaceChildren();
  if (!files.length) {
    status.textContent = 'Pilih beberapa foto dari sudut yang berbeda.';
    return;
  }
  status.textContent = valid ? `Mengompresi ${files.length} foto otomatis...` : 'Jumlah, format, atau ukuran foto tidak sesuai.';
  if (valid) {
    fleetPhotosInput.setCustomValidity('Tunggu sampai kompresi foto selesai.');
    Promise.all(files.map(compressFleetPhoto)).then((photos) => {
      if (fleetPhotosInput.files.length !== files.length || [...fleetPhotosInput.files].some((file, index) => file !== files[index])) return;
      if (photos.reduce((sum, photo) => sum + photo.sizeBytes, 0) > MAX_FLEET_PHOTO_TOTAL_BYTES) {
        fleetPhotosInput.setCustomValidity('Ukuran total foto setelah dikompresi maksimal 4 MB.');
        status.textContent = 'Ukuran total foto setelah dikompresi melebihi 4 MB.';
        return;
      }
      fleetPhotosInput.setCustomValidity('');
      status.textContent = `${photos.length} foto siap · ${Math.ceil(photos.reduce((sum, photo) => sum + photo.sizeBytes, 0) / 1024)} KB setelah kompresi`;
      photos.forEach((photo) => {
        const figure = document.createElement('figure');
        const image = document.createElement('img');
        image.src = photo.dataUrl;
        image.alt = photo.name;
        const caption = document.createElement('figcaption');
        caption.textContent = `${photo.name} · ${Math.ceil(photo.sizeBytes / 1024)} KB`;
        figure.append(image, caption);
        preview.append(figure);
      });
    }).catch((error) => {
      fleetPhotosInput.setCustomValidity(error.message);
      status.textContent = error.message;
    });
  }
});
const fleetInventoryBody = document.getElementById('fleetInventoryBody');
if (fleetInventoryBody) fleetInventoryBody.addEventListener('submit', updateFleetUnit);
const fleetArchiveDialog = document.getElementById('fleetArchiveDialog');
const fleetArchiveForm = document.getElementById('fleetArchiveForm');
const fleetArchiveReason = document.getElementById('fleetArchiveReason');
const fleetArchiveMessage = document.getElementById('fleetArchiveMessage');
const fleetArchiveCount = document.getElementById('fleetArchiveCount');
const fleetArchiveDescription = document.getElementById('fleetArchiveDescription');
const fleetArchiveTitle = document.getElementById('fleetArchiveTitle');
const fleetArchiveSubmit = fleetArchiveForm?.querySelector('[type="submit"]');
function closeFleetArchiveDialog() {
  if (!fleetArchiveDialog?.open) return;
  fleetArchiveDialog.close();
  fleetArchiveForm.reset();
  fleetArchiveMessage.textContent = '';
  fleetArchiveMessage.classList.remove('is-error');
  fleetArchiveReason.setCustomValidity('');
  fleetArchiveCount.textContent = '0/500';
}
if (fleetInventoryBody && fleetArchiveDialog) fleetInventoryBody.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest('[data-archive-fleet]');
  if (!button) return;
  const vehicle = readFleet().find((item) => item.id === button.dataset.archiveFleet);
  if (!vehicle || vehicle.isArchived) return;
  fleetArchiveForm.dataset.targetType = 'fleet-model';
  fleetArchiveForm.dataset.targetId = vehicle.id;
  fleetArchiveTitle.textContent = 'Ajukan hapus armada';
  fleetArchiveDescription.textContent = `Model ${vehicle.name} dan seluruh plat terdaftar hanya akan dihapus dari armada aktif setelah disetujui admin utama. Data unit beserta alasan penghapusan akan tersimpan di halaman persetujuan.`;
  fleetArchiveSubmit.textContent = 'Kirim permintaan';
  fleetArchiveDialog.showModal();
  fleetArchiveReason.focus();
});
if (fleetArchiveReason && fleetArchiveCount) fleetArchiveReason.addEventListener('input', () => {
  fleetArchiveCount.textContent = `${fleetArchiveReason.value.length}/500`;
});
document.getElementById('closeFleetArchive')?.addEventListener('click', closeFleetArchiveDialog);
document.getElementById('cancelFleetArchive')?.addEventListener('click', closeFleetArchiveDialog);
if (fleetArchiveDialog) fleetArchiveDialog.addEventListener('click', (event) => {
  if (event.target === fleetArchiveDialog) closeFleetArchiveDialog();
});
if (fleetArchiveForm) fleetArchiveForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const targetType = fleetArchiveForm.dataset.targetType;
  const targetId = fleetArchiveForm.dataset.targetId;
  const vehicle = targetType === 'fleet-model'
    ? readFleet().find((item) => item.id === targetId)
    : null;
  const reason = fleetArchiveReason.value.trim();
  if (!['fleet-model', 'physical-unit'].includes(targetType) || !targetId
    || targetType === 'fleet-model' && (!vehicle || vehicle.isArchived)) {
    fleetArchiveMessage.textContent = 'Armada atau plat kendaraan tidak ditemukan, atau sudah diarsipkan.';
    fleetArchiveMessage.classList.add('is-error');
    return;
  }
  if (!reason) {
    fleetArchiveReason.setCustomValidity('Alasan penghapusan wajib diisi.');
    fleetArchiveReason.reportValidity();
    return;
  }
  fleetArchiveReason.setCustomValidity('');
  const submitButton = fleetArchiveSubmit;
  submitButton.disabled = true;
  try {
    if (!window.DriveLinkAPI) throw new Error('Permintaan penghapusan memerlukan koneksi server.');
    const endpoint = targetType === 'fleet-model'
      ? `/api/admin/fleet/${encodeURIComponent(targetId)}`
      : `/api/admin/fleet/physical-units/${encodeURIComponent(targetId)}`;
    await DriveLinkAPI.delete(endpoint, { reason });
    fleetArchiveDialog.close();
    fleetArchiveForm.reset();
    fleetArchiveMessage.textContent = '';
    fleetArchiveMessage.classList.remove('is-error');
    fleetArchiveTitle.textContent = 'Ajukan penghapusan';
    fleetArchiveDescription.textContent = 'Permintaan akan ditinjau admin utama. Armada tetap aktif sampai disetujui.';
    fleetArchiveSubmit.textContent = 'Kirim permintaan';
    const message = document.getElementById('fleetFormMessage');
    message.classList.remove('is-error');
    message.textContent = `Permintaan penghapusan ${targetType === 'fleet-model' ? vehicle.name : `plat ${targetId}`} dikirim dan menunggu persetujuan admin utama.`;
  } catch (error) {
    fleetArchiveMessage.textContent = `Permintaan penghapusan gagal dikirim: ${error.message}`;
    fleetArchiveMessage.classList.add('is-error');
  } finally {
    submitButton.disabled = false;
  }
});
if (fleetInventoryBody) fleetInventoryBody.addEventListener('change', (event) => {
  const input = event.target.closest('input[type="file"][name="photos"]');
  if (!input) return;
  const files = [...input.files];
  const valid = files.length >= 2 && files.length <= 6
    && files.every((file) => file.size <= MAX_FLEET_PHOTO_INPUT_BYTES && ['image/jpeg', 'image/png'].includes(file.type));
  input.setCustomValidity(files.length && !valid
    ? 'Pilih 2–6 foto JPG/PNG, maksimal 20 MB per foto sebelum dikompresi.'
    : '');
  const status = document.querySelector(`[data-photo-status="${CSS.escape(input.form.dataset.inventoryId)}"]`);
  if (status && files.length) {
    status.textContent = valid ? `Mengompresi ${files.length} foto otomatis...` : 'Jumlah, format, atau ukuran foto tidak sesuai';
    if (valid) {
      input.setCustomValidity('Tunggu sampai kompresi foto selesai.');
      Promise.all(files.map(compressFleetPhoto)).then((photos) => {
        if (input.files.length !== files.length || [...input.files].some((file, index) => file !== files[index])) return;
        const totalBytes = photos.reduce((sum, photo) => sum + photo.sizeBytes, 0);
        if (totalBytes > MAX_FLEET_PHOTO_TOTAL_BYTES) {
          input.setCustomValidity('Ukuran total foto setelah dikompresi maksimal 4 MB.');
          status.textContent = 'Ukuran total foto setelah dikompresi melebihi 4 MB.';
          return;
        }
        input.setCustomValidity('');
        status.textContent = `${photos.length} foto siap · ${Math.ceil(totalBytes / 1024)} KB setelah kompresi`;
      }).catch((error) => {
        input.setCustomValidity(error.message);
        status.textContent = error.message;
      });
    }
  }
});
const vehicleServiceForm = document.getElementById('vehicleServiceForm');
if (vehicleServiceForm) {
  const receiptInput = vehicleServiceForm.elements.receipt;
  const receiptStatus = document.getElementById('serviceReceiptStatus');
  receiptInput.addEventListener('change', async () => {
    const file = receiptInput.files[0];
    receiptInput.setCustomValidity('');
    if (!file) {
      receiptStatus.textContent = 'Pilih foto nota servis. Foto akan dikompresi otomatis maksimal 300 KB.';
      return;
    }
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > MAX_SERVICE_RECEIPT_INPUT_BYTES) {
      const error = 'Pilih nota JPG/PNG maksimal 20 MB sebelum dikompresi.';
      receiptInput.setCustomValidity(error);
      receiptStatus.textContent = error;
      return;
    }

    receiptInput.setCustomValidity('Tunggu sampai kompresi foto nota selesai.');
    try {
      const { sizeBytes } = await compressServiceReceipt(file);
      if (receiptInput.files[0] !== file) return;
      receiptInput.setCustomValidity('');
      receiptStatus.textContent = `${file.name} siap · ${Math.ceil(sizeBytes / 1024)} KB setelah kompresi`;
    } catch (error) {
      if (receiptInput.files[0] !== file) return;
      receiptInput.setCustomValidity(error.message);
      receiptStatus.textContent = error.message;
    }
  });
  document.getElementById('addServiceExpense').addEventListener('click', () => {
    const list = document.getElementById('serviceExpenseItems');
    if (list.childElementCount < 20) list.append(createServiceExpenseRow());
    document.getElementById('addServiceExpense').disabled = list.childElementCount >= 20;
    list.querySelectorAll('.service-expense-remove').forEach((button) => { button.disabled = list.childElementCount <= 1; });
    updateServiceExpenseTotal();
  });
  const expenseList = document.getElementById('serviceExpenseItems');
  expenseList.addEventListener('input', updateServiceExpenseTotal);
  expenseList.addEventListener('click', (event) => {
    const removeButton = event.target.closest('.service-expense-remove');
    if (!removeButton || expenseList.childElementCount <= 1) return;
    removeButton.closest('.service-expense-row').remove();
    document.getElementById('addServiceExpense').disabled = false;
    if (expenseList.childElementCount === 1) {
      expenseList.querySelector('.service-expense-remove').disabled = true;
    }
    updateServiceExpenseTotal();
  });
  vehicleServiceForm.addEventListener('submit', saveVehicleService);
  renderVehicleService();
}

const rentalLocationForm = document.getElementById('rentalLocationForm');
if (rentalLocationForm) {
  const savedLocation = DriveLinkStorage.read('drivelink-location', null);
  rentalLocationForm.elements.address.value = window.DriveLinkAPI ? '' : savedLocation?.address || '';
  rentalLocationForm.elements.mapsUrl.value = window.DriveLinkAPI ? '' : savedLocation?.mapsUrl || '';
  rentalLocationForm.elements.reviewUrl.value = window.DriveLinkAPI ? '' : savedLocation?.reviewUrl || '';
  rentalLocationForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = document.getElementById('rentalLocationMessage');
    const address = rentalLocationForm.elements.address.value.trim();
    const mapsUrl = rentalLocationForm.elements.mapsUrl.value.trim();
    const reviewUrl = rentalLocationForm.elements.reviewUrl.value.trim();
    let parsedUrl;
    let parsedReviewUrl;
    try {
      parsedUrl = new URL(mapsUrl);
    } catch {
      message.textContent = 'Masukkan tautan Google Maps yang valid.';
      message.classList.add('is-error');
      return;
    }
    const isGoogleMapsUrl = parsedUrl.protocol === 'https:'
      && (parsedUrl.hostname === 'maps.app.goo.gl'
        || parsedUrl.hostname === 'goo.gl' && parsedUrl.pathname.startsWith('/maps')
        || parsedUrl.hostname === 'google.com'
        || parsedUrl.hostname.endsWith('.google.com'));
    let isGoogleReviewUrl = true;
    if (reviewUrl) {
      try {
        parsedReviewUrl = new URL(reviewUrl);
        isGoogleReviewUrl = parsedReviewUrl.protocol === 'https:'
          && (parsedReviewUrl.hostname === 'maps.app.goo.gl'
            || parsedReviewUrl.hostname === 'goo.gl' && parsedReviewUrl.pathname.startsWith('/maps')
            || parsedReviewUrl.hostname === 'google.com'
            || parsedReviewUrl.hostname.endsWith('.google.com'));
      } catch {
        isGoogleReviewUrl = false;
      }
    }
    if (!address || !isGoogleMapsUrl || !isGoogleReviewUrl) {
      message.textContent = 'Isi alamat dan gunakan tautan Google Maps HTTPS.';
      message.classList.add('is-error');
      return;
    }
    try {
      const location = { address, mapsUrl, reviewUrl };
      if (window.DriveLinkAPI) await DriveLinkAPI.put('/api/admin/location', location);
      else DriveLinkStorage.write('drivelink-location', location);
      message.classList.remove('is-error');
      message.textContent = 'Lokasi rental berhasil disimpan. Perubahan tampil di beranda website.';
    } catch (error) {
      console.error('Tidak dapat menyimpan lokasi rental.', error);
      message.textContent = 'Lokasi tidak dapat disimpan di browser. Coba lagi.';
      message.classList.add('is-error');
    }
  });
}

if (currentPage.startsWith('admin') && !window.DriveLinkAPI) {
  if (localStorage.getItem('drivelink-bookings') === null) saveBookings(readBookings());
  renderBookings();
}
if (currentPage === 'admin-fleet.html') renderFleetInventory();
const physicalFleetUnitForm = document.getElementById('physicalFleetUnitForm');
if (physicalFleetUnitForm) {
  document.getElementById('physicalFleetDraftRows').append(createPhysicalFleetDraftRow());
  updatePhysicalDraftRemoveButtons();
  renderPhysicalFleetFormOptions();
  physicalFleetUnitForm.elements.category.addEventListener('change', renderPhysicalFleetFormOptions);
  physicalFleetUnitForm.addEventListener('submit', addPhysicalFleetUnit);
  document.getElementById('addPhysicalFleetRow').addEventListener('click', () => {
    const list = document.getElementById('physicalFleetDraftRows');
    if (list.childElementCount < 30) list.append(createPhysicalFleetDraftRow());
    updatePhysicalDraftRemoveButtons();
  });
  document.getElementById('physicalFleetDraftRows').addEventListener('click', (event) => {
    const remove = event.target.closest('.physical-unit-draft-remove');
    if (!remove || document.querySelectorAll('#physicalFleetDraftRows .physical-unit-draft-row').length <= 1) return;
    remove.closest('.physical-unit-draft-row').remove();
    updatePhysicalDraftRemoveButtons();
  });
}

if (window.DriveLinkAPI && currentPage.startsWith('admin')) {
  window.DriveLinkSessionReady?.then(async (session) => {
    if (!session) return;
    try {
      if (currentPage === 'admin.html') {
        const overview = await DriveLinkAPI.get('/api/admin/overview');
        DriveLinkStorage.writeBookings(overview.bookings);
        renderBookings();
        document.getElementById('totalBookings').textContent = String(overview.totalBookings);
        document.getElementById('pendingBookings').textContent = String(overview.pendingBookings);
        document.getElementById('availableVehicles').textContent = String(overview.availableVehicles);
        document.getElementById('fleetTotalVehicles').textContent = String(overview.totalVehicles);
        document.getElementById('monthlyRevenue').textContent = formatCurrency(overview.monthlyRevenue);
        document.getElementById('dailyRevenue').textContent = formatCurrency(overview.dailyRevenue);
        document.getElementById('serviceExpenses').textContent = formatCurrency(overview.totalServiceExpenses);
        renderOverviewCharts(overview);
      } else if (currentPage === 'admin-bookings.html') {
        const bookings = await DriveLinkAPI.get('/api/admin/bookings');
        DriveLinkStorage.writeBookings(bookings);
        renderBookings();
      } else if (currentPage === 'admin-fleet.html') {
        const [fleet, categories] = await Promise.all([
          DriveLinkAPI.get('/api/admin/fleet'),
          DriveLinkAPI.get('/api/fleet-categories'),
        ]);
        fleetCategories = categories;
        const categorySelect = document.getElementById('fleetCategorySelect');
        categorySelect.replaceChildren(...categories.map((category) => new Option(category, category)));
        cacheFleet(fleet);
        renderFleetInventory();
        physicalFleetUnits = await DriveLinkAPI.get('/api/admin/fleet/physical-units');
        renderPhysicalFleetFormOptions();
        renderPhysicalFleetUnits();
      } else if (currentPage === 'admin-vehicle-service.html') {
        const [fleet, services, categories] = await Promise.all([
          DriveLinkAPI.get('/api/fleet'),
          DriveLinkAPI.get('/api/admin/vehicle-services'),
          DriveLinkAPI.get('/api/admin/vehicle-service-categories'),
        ]);
        serviceCategories = categories;
        cacheFleet(fleet);
        serverVehicleUnits = services;
        renderVehicleService();
      } else if (currentPage === 'admin-location.html') {
        const location = await DriveLinkAPI.get('/api/location');
        rentalLocationForm.elements.address.value = location?.address || '';
        rentalLocationForm.elements.mapsUrl.value = location?.mapsUrl || '';
        rentalLocationForm.elements.reviewUrl.value = location?.reviewUrl || '';
      }
    } catch (error) {
      const notice = currentPage === 'admin-location.html'
        ? document.getElementById('rentalLocationMessage')
        : document.createElement('p');
      notice.className = 'workflow-message is-error';
      notice.textContent = `Data halaman gagal dimuat: ${error.message}`;
      if (currentPage !== 'admin-location.html') document.querySelector('.admin-main')?.prepend(notice);
    }
  });
}
