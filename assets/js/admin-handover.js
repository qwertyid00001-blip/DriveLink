const session = DriveLinkStorage.read('drivelink-session', null);
if (!session || !['admin', 'employee'].includes(session.role)) window.location.replace('auth.html');
else document.getElementById('adminName').textContent = session.name || 'Admin';

const conditionForm = document.getElementById('unitConditionForm');
const conditionMessage = document.getElementById('conditionMessage');
const conditionPhotosInput = conditionForm.elements.conditionPhotos;
const inspectionForm = document.getElementById('rentalInspectionForm');
const inspectionPhotosInput = inspectionForm.elements.inspectionPhotos;
const inspectionFrontPhotoInput = document.getElementById('inspectionFrontPhotoInput');
const inspectionFields = document.getElementById('inspectionFields');
const customInspectionFields = document.getElementById('customInspectionFields');
const inspectionCameraVideo = document.getElementById('inspectionCameraVideo');
const inspectionFrontPhotoPreview = document.getElementById('inspectionFrontPhotoPreview');
const inspectionCameraStatus = document.getElementById('inspectionCameraStatus');
const startInspectionCameraButton = document.getElementById('startInspectionCamera');
const captureInspectionFrontPhotoButton = document.getElementById('captureInspectionFrontPhoto');
const retakeInspectionFrontPhotoButton = document.getElementById('retakeInspectionFrontPhoto');
let inspectionCameraStream = null;
let inspectionFrontPhotoFile = null;
let savedInspectionFrontPhoto = '';
let inspectionFrontPhotoPreviewUrl = '';
inspectionFields.querySelectorAll('input, select, textarea, button').forEach((control) => {
  control.disabled = true;
});
let loadedInspectionBookingId = '';
let serverBookings = null;
let serverFleet = null;
let serverUnitConditions = null;
let serverChecklistDefinitions = [];
let serverVehicleUnits = null;

function paymentReady(booking) {
  return ['Dikonfirmasi', 'Bukti diunggah', 'Bayar ke petugas'].includes(booking.paymentStatus);
}

function renderCustomInspectionFields(savedChecklist = []) {
  customInspectionFields.replaceChildren();
  customInspectionFields.closest('.custom-inspection-section').hidden = serverChecklistDefinitions.length === 0;
  serverChecklistDefinitions.forEach((definition) => {
    const saved = savedChecklist.find((item) => item.id === definition.id);
    const values = saved?.values || {};
    const field = document.createElement('section');
    field.className = 'custom-inspection-card';
    field.dataset.customCategory = definition.id;
    field.dataset.required = String(definition.required);
    field.dataset.savedPhoto = values.photo || '';
    const heading = document.createElement('div');
    heading.className = 'custom-inspection-card-heading';
    const title = document.createElement('h4');
    title.textContent = definition.label;
    heading.append(title);
    if (definition.required) {
      const badge = document.createElement('span');
      badge.textContent = 'Wajib';
      heading.append(badge);
    }
    field.append(heading);
    if (definition.types.includes('check')) {
      const label = document.createElement('label');
      label.className = 'custom-inspection-check';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.dataset.customType = 'check';
      input.checked = values.checked === true;
      input.required = definition.required;
      const text = document.createElement('span');
      text.textContent = 'Sudah diperiksa';
      label.append(input, text);
      field.append(label);
    }
    if (definition.types.includes('choice')) {
      const label = document.createElement('label');
      label.textContent = 'Pilih kondisi';
      const select = document.createElement('select');
      select.dataset.customType = 'choice';
      select.required = definition.required;
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Pilih kondisi';
      select.append(placeholder);
      definition.options.forEach((optionText) => {
        const option = document.createElement('option');
        option.value = optionText;
        option.textContent = optionText;
        select.append(option);
      });
      select.value = values.choice || '';
      label.append(select);
      field.append(label);
    }
    if (definition.types.includes('note')) {
      const label = document.createElement('label');
      label.textContent = 'Catatan pemeriksaan';
      const textarea = document.createElement('textarea');
      textarea.rows = 2;
      textarea.maxLength = 500;
      textarea.dataset.customType = 'note';
      textarea.required = definition.required;
      textarea.value = values.note || '';
      label.append(textarea);
      field.append(label);
    }
    if (definition.types.includes('photo')) {
      const label = document.createElement('label');
      label.textContent = 'Foto pemeriksaan (JPG/PNG, maksimal 250 KB setelah kompresi)';
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/jpeg,image/png';
      input.dataset.customType = 'photo';
      input.required = definition.required && !values.photo;
      label.append(input);
      field.append(label);
      if (values.photo) {
        const saved = document.createElement('div');
        saved.className = 'custom-inspection-saved-photo';
        const image = document.createElement('img');
        image.src = values.photo;
        image.alt = `Foto tersimpan: ${definition.label}`;
        const remove = document.createElement('button');
        remove.className = 'btn btn-secondary';
        remove.type = 'button';
        remove.textContent = 'Ganti / hapus foto';
        remove.addEventListener('click', () => {
          field.dataset.savedPhoto = '';
          saved.remove();
          input.required = definition.required;
          input.focus();
        });
        saved.append(image, remove);
        field.append(saved);
      }
    }
    customInspectionFields.append(field);
  });
}

function stopInspectionCamera() {
  inspectionCameraStream?.getTracks().forEach((track) => track.stop());
  inspectionCameraStream = null;
  inspectionCameraVideo.srcObject = null;
  inspectionCameraVideo.hidden = true;
  captureInspectionFrontPhotoButton.hidden = true;
}

function clearInspectionFrontPreview() {
  if (inspectionFrontPhotoPreviewUrl) URL.revokeObjectURL(inspectionFrontPhotoPreviewUrl);
  inspectionFrontPhotoPreviewUrl = '';
  inspectionFrontPhotoPreview.removeAttribute('src');
  inspectionFrontPhotoPreview.hidden = true;
}

inspectionFrontPhotoInput.addEventListener('change', () => {
  const [file] = inspectionFrontPhotoInput.files;
  if (!file) return;
  inspectionFrontPhotoFile = file;
  savedInspectionFrontPhoto = '';
  clearInspectionFrontPreview();
  inspectionFrontPhotoPreviewUrl = URL.createObjectURL(file);
  inspectionFrontPhotoPreview.src = inspectionFrontPhotoPreviewUrl;
  inspectionFrontPhotoPreview.hidden = false;
  stopInspectionCamera();
  startInspectionCameraButton.hidden = true;
  retakeInspectionFrontPhotoButton.hidden = false;
  inspectionCameraStatus.textContent = 'Foto siap. Klik “Simpan checklist kendaraan” agar foto masuk ke arsip.';
});

startInspectionCameraButton.addEventListener('click', async () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    inspectionCameraStatus.textContent = 'Kamera langsung tidak tersedia. Buka halaman admin melalui HTTPS di browser yang mendukung kamera.';
    return;
  }

  startInspectionCameraButton.disabled = true;
  inspectionCameraStatus.textContent = 'Meminta izin kamera...';
  try {
    stopInspectionCamera();
    inspectionCameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' } },
    });
    inspectionCameraVideo.srcObject = inspectionCameraStream;
    inspectionCameraVideo.hidden = false;
    await inspectionCameraVideo.play();
    captureInspectionFrontPhotoButton.hidden = false;
    inspectionCameraStatus.textContent = 'Kamera aktif. Pastikan bagian depan unit terlihat jelas.';
  } catch (error) {
    stopInspectionCamera();
    inspectionCameraStatus.textContent = `Kamera tidak dapat diakses: ${error.message}. Izinkan akses kamera lalu coba lagi.`;
  } finally {
    startInspectionCameraButton.disabled = false;
  }
});

captureInspectionFrontPhotoButton.addEventListener('click', () => {
  const videoWidth = inspectionCameraVideo.videoWidth;
  const videoHeight = inspectionCameraVideo.videoHeight;
  if (!videoWidth || !videoHeight) {
    inspectionCameraStatus.textContent = 'Kamera belum siap. Tunggu hingga gambar terlihat lalu coba lagi.';
    return;
  }

  const scale = Math.min(1, 1600 / Math.max(videoWidth, videoHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(videoWidth * scale));
  canvas.height = Math.max(1, Math.round(videoHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) {
    inspectionCameraStatus.textContent = 'Browser tidak dapat memproses hasil kamera. Coba browser lain.';
    return;
  }

  context.drawImage(inspectionCameraVideo, 0, 0, canvas.width, canvas.height);
  canvas.toBlob((blob) => {
    if (!blob) {
      inspectionCameraStatus.textContent = 'Foto langsung gagal diproses. Silakan ambil ulang.';
      return;
    }
    inspectionFrontPhotoFile = new File([blob], 'foto-depan-karyawan.jpg', {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
    savedInspectionFrontPhoto = '';
    clearInspectionFrontPreview();
    inspectionFrontPhotoPreviewUrl = URL.createObjectURL(blob);
    inspectionFrontPhotoPreview.src = inspectionFrontPhotoPreviewUrl;
    inspectionFrontPhotoPreview.hidden = false;
    stopInspectionCamera();
    startInspectionCameraButton.hidden = true;
    retakeInspectionFrontPhotoButton.hidden = false;
    inspectionFrontPhotoInput.value = '';
    inspectionCameraStatus.textContent = 'Foto siap. Klik “Simpan checklist kendaraan” agar foto masuk ke arsip.';
  }, 'image/jpeg', 0.9);
});

retakeInspectionFrontPhotoButton.addEventListener('click', () => {
  inspectionFrontPhotoFile = null;
  savedInspectionFrontPhoto = '';
  inspectionFrontPhotoInput.value = '';
  clearInspectionFrontPreview();
  retakeInspectionFrontPhotoButton.hidden = true;
  startInspectionCameraButton.hidden = false;
  inspectionCameraStatus.textContent = 'Pilih foto depan atau ambil foto langsung menggunakan kamera.';
});

window.addEventListener('pagehide', () => {
  stopInspectionCamera();
  clearInspectionFrontPreview();
});

function readBookings() {
  return serverBookings || DriveLinkStorage.read('drivelink-bookings', []);
}

function updateBodyNoteRequirement() {
  const bodyNotes = inspectionForm.elements.bodyNotes;
  const needsNote = inspectionForm.elements.bodyCondition.value === 'Ada lecet / penyok (catat lokasi)';
  bodyNotes.required = needsNote;
  bodyNotes.setCustomValidity(needsNote && !bodyNotes.value.trim() ? 'Jelaskan lokasi lecet atau penyok.' : '');
}

function saveBookings(bookings) {
  if (window.DriveLinkAPI) serverBookings = bookings;
  else DriveLinkStorage.writeBookings(bookings);
}

function saveConditions(conditions) {
  serverUnitConditions = conditions;
  if (window.DriveLinkAPI) return;
  DriveLinkStorage.write('drivelink-unit-conditions', conditions);
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

function renderInspectionHistory() {
  const container = document.getElementById('inspectionHistory');
  const bookings = readBookings().filter((booking) => booking.vehicleInspection);
  container.replaceChildren();
  if (!bookings.length) return;
  const heading = document.createElement('h3');
  heading.textContent = 'Checklist unit tersimpan';
  container.append(heading);
  bookings.slice(0, 8).forEach((booking) => {
    const record = booking.vehicleInspection;
    const card = document.createElement('article');
    card.className = 'inspection-history-card';
    const title = document.createElement('strong');
    title.textContent = booking.id;
    const timestamp = document.createElement('small');
    timestamp.textContent = `Dicek ${new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(record.checkedAt))}`;
    const view = document.createElement('button');
    view.type = 'button';
    view.className = 'btn btn-secondary inspection-history-view';
    view.dataset.inspectionHistoryView = booking.id;
    view.textContent = 'Lihat';
    card.append(title, timestamp, view);
    container.append(card);
  });
}

async function openInspectionHistory(bookingId) {
  const dialog = document.getElementById('inspectionHistoryDialog');
  const title = document.getElementById('inspectionHistoryTitle');
  const content = document.getElementById('inspectionHistoryDetails');
  title.textContent = `Checklist ${bookingId}`;
  content.innerHTML = '<p class="inspection-archive-loading">Memuat detail checklist...</p>';
  dialog.showModal();
  try {
    const booking = window.DriveLinkAPI
      ? await DriveLinkAPI.get(`/api/admin/handover/bookings/${encodeURIComponent(bookingId)}/details`)
      : readBookings().find((item) => String(item.id).toUpperCase() === String(bookingId).toUpperCase());
    if (!booking?.vehicleInspection) throw new Error('Data checklist tidak tersedia.');
    const inspection = booking.vehicleInspection;
    const rows = [
      ['Kode booking', booking.id],
      ['Pelanggan', booking.name],
      ['Kendaraan', `${booking.carType}${inspection.color || booking.vehicleColor ? ` · ${inspection.color || booking.vehicleColor}` : ''}`],
      ['Plat kendaraan', inspection.plate],
      ['Odometer saat diserahkan', `${Number(inspection.odometerKm || 0).toLocaleString('id-ID')} km`],
      ['Kondisi bensin', inspection.fuelLevel],
      ['Kondisi bodi', inspection.bodyCondition],
      ['Catatan bodi', inspection.bodyNotes],
      ['Kondisi interior', inspection.interiorCondition],
      ['Kondisi lampu', inspection.lightsCondition],
      ['Kondisi ban', inspection.tiresCondition],
      ['Kondisi mesin dan indikator', inspection.engineCondition],
      ['Kelengkapan kendaraan', inspection.equipmentCondition],
      ['Catatan tambahan', inspection.notes],
      ['Waktu checklist disimpan', inspection.checkedAt
        ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(inspection.checkedAt))
        : '-'],
    ];
    (inspection.customChecklist || []).forEach((item) => {
      const values = item.values || {};
      const details = [];
      if (item.types.includes('check')) details.push(values.checked ? 'Sudah diperiksa' : 'Belum dicentang');
      if (item.types.includes('choice') && values.choice) details.push(values.choice);
      if (item.types.includes('note') && values.note) details.push(values.note);
      if (item.types.includes('photo') && values.photo) details.push('Foto terlampir');
      rows.push([item.label, details.join(' · ') || '-']);
    });
    const photos = [
      { label: 'Foto depan unit', source: inspection.frontPhoto || inspection.photos?.[0] },
      ...(inspection.photos || []).filter((photo) => photo !== (inspection.frontPhoto || inspection.photos?.[0]))
        .map((source, index) => ({ label: `Foto kondisi tambahan ${index + 1}`, source })),
      ...(inspection.customChecklist || []).flatMap((item) => item.values?.photo
        ? [{ label: `Foto: ${item.label}`, source: item.values.photo }]
        : []),
    ].filter(({ source }) => typeof source === 'string' && /^data:image\/(jpeg|png);base64,/.test(source));
    content.innerHTML = `
      <h3 class="customer-document-heading">Data pemeriksaan unit</h3>
      <dl class="customer-details-fields">${rows.map(([label, value]) => `
        <div class="customer-detail-field"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || '-')}</dd></div>
      `).join('')}</dl>
      <h3 class="customer-document-heading">Foto checklist</h3>
      <div class="customer-document-grid">${photos.length ? photos.map(({ label, source }) => `
        <section class="customer-document-card">
          <h3>${escapeHtml(label)}</h3>
          <a href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">
            <img src="${escapeHtml(source)}" alt="${escapeHtml(label)}" loading="lazy" />
          </a>
        </section>
      `).join('') : '<p class="inspection-archive-no-photos">Belum ada foto checklist tersimpan.</p>'}</div>
    `;
  } catch (error) {
    content.innerHTML = `<p class="workflow-message is-error">${escapeHtml(`Detail checklist gagal dimuat: ${error.message}`)}</p>`;
  }
}

document.getElementById('inspectionHistory').addEventListener('click', (event) => {
  const button = event.target.closest('[data-inspection-history-view]');
  if (button) openInspectionHistory(button.dataset.inspectionHistoryView);
});
document.getElementById('closeInspectionHistory').addEventListener('click', () => {
  document.getElementById('inspectionHistoryDialog').close();
});
document.getElementById('inspectionHistoryDialog').addEventListener('click', (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});

function setInspectionMessage(text, isError = false) {
  const message = document.getElementById('inspectionVehicleMessage');
  message.textContent = text;
  message.classList.toggle('is-error', isError);
}

async function loadInspectionBooking() {
  if (window.DriveLinkAPI) {
    setInspectionMessage('Memuat data booking dari server...');
    try {
      serverBookings = await DriveLinkAPI.get('/api/admin/handover/bookings');
      [serverVehicleUnits, serverFleet, serverUnitConditions] = await Promise.all([
        DriveLinkAPI.get('/api/admin/handover/units'),
        DriveLinkAPI.get('/api/fleet'),
        DriveLinkAPI.get('/api/admin/handover/conditions'),
      ]);
      renderVehicleOptions();
      renderCondition();
      renderInspectionHistory();
    } catch (error) {
      setInspectionMessage(`Data booking gagal dimuat: ${error.message}`, true);
      return;
    }
  }
  const requestedId = String(inspectionForm.elements.bookingId.value || '').trim().toUpperCase();
  const booking = readBookings().find((item) => String(item.id).toUpperCase() === requestedId);
  const details = document.getElementById('inspectionBookingDetails');
  const fields = inspectionFields;
  const plateSelect = inspectionForm.elements.plate;
  loadedInspectionBookingId = '';
  stopInspectionCamera();
  inspectionFrontPhotoFile = null;
  inspectionFrontPhotoInput.value = '';
  savedInspectionFrontPhoto = '';
  clearInspectionFrontPreview();
  startInspectionCameraButton.hidden = false;
  retakeInspectionFrontPhotoButton.hidden = true;
  fields.hidden = true;
  fields.querySelectorAll('input, select, textarea, button').forEach((control) => {
    control.disabled = true;
  });
  details.hidden = true;
  details.replaceChildren();
  plateSelect.replaceChildren();
  document.getElementById('inspectionSavedPhotos').replaceChildren();
  if (!booking) {
    setInspectionMessage('Kode booking tidak ditemukan. Periksa kembali ID booking.');
    return;
  }
  if (!paymentReady(booking)) {
    setInspectionMessage('Checklist unit dapat dibuat setelah metode pembayaran dikirim oleh pelanggan.', true);
    return;
  }
  const allocatedColor = booking.vehicleColor || booking.allocatedColor || '';
  const assignedToOtherBookings = new Set(readBookings()
    .filter((item) => item.id !== booking.id && !['Dibatalkan', 'Dikembalikan'].includes(item.status))
    .map((item) => item.vehicleInspection?.plate)
    .filter(Boolean));
  const allModelUnits = readVehicleUnits().filter((unit) => unit.carType === booking.carType
    && (!allocatedColor || unit.color === allocatedColor)
    && (!assignedToOtherBookings.has(unit.plate) || unit.plate === booking.vehicleInspection?.plate));
  const heldColors = new Map();
  const reservedBookings = readBookings().filter((item) => item.id !== booking.id && item.carType === booking.carType
    && item.stockReserved && !item.vehicleInspection
    && !['Dibatalkan', 'Dikembalikan'].includes(item.status))
    .filter((item) => item.vehicleColor || item.allocatedColor);
  reservedBookings.forEach((item) => {
    const color = item.vehicleColor || item.allocatedColor;
    heldColors.set(color, (heldColors.get(color) || 0) + 1);
  });
  const colorStock = (serverFleet || []).find((vehicle) => vehicle.name === booking.carType)?.colors || [];
  const uncoloredReservations = readBookings().filter((item) => item.id !== booking.id
    && item.carType === booking.carType && item.stockReserved && !item.vehicleColor && !item.allocatedColor
    && !item.vehicleInspection
    && !['Dibatalkan', 'Dikembalikan'].includes(item.status)).length;
  const remainingColors = new Map(colorStock.map((color) => [
    color.name,
    Math.max(0, color.totalCount - (heldColors.get(color.name) || 0)),
  ]));
  for (let index = 0; index < uncoloredReservations; index += 1) {
    const color = [...remainingColors.keys()].find((name) => remainingColors.get(name) > 0);
    if (!color) break;
    heldColors.set(color, (heldColors.get(color) || 0) + 1);
    remainingColors.set(color, remainingColors.get(color) - 1);
  }
  const skippedByColor = new Map();
  const matchingUnits = allModelUnits.filter((unit) => {
    if (!unit.color || unit.plate === booking.vehicleInspection?.plate) return true;
    const holdCount = heldColors.get(unit.color) || 0;
    const skipped = skippedByColor.get(unit.color) || 0;
    if (skipped < holdCount) {
      skippedByColor.set(unit.color, skipped + 1);
      return false;
    }
    return true;
  });
  if (!matchingUnits.length) {
    setInspectionMessage(`Belum ada unit ${booking.carType}${allocatedColor ? ` warna ${allocatedColor}` : ''} yang tersedia. Daftarkan plat dan warna unit terlebih dahulu di menu Armada.`);
    return;
  }

  const title = document.createElement('strong');
  title.textContent = `${booking.id} · ${booking.name}`;
  const description = document.createElement('p');
  description.textContent = `${booking.carType}${allocatedColor ? ` · ${allocatedColor}` : ''} · ${booking.duration} · ${booking.driverOption || '-'} · Pembayaran ${booking.paymentStatus}`;
  details.append(title, description);
  details.hidden = false;
  plateSelect.replaceChildren(...matchingUnits.map((unit) => {
    const option = document.createElement('option');
    option.value = unit.plate;
    option.textContent = `${unit.plate} · ${unit.carType}${unit.color ? ` · ${unit.color}` : ''} · odometer ${Number(unit.currentKm ?? unit.lastServiceKm).toLocaleString('id-ID')} km`;
    return option;
  }));
  const inspection = booking.vehicleInspection;
  savedInspectionFrontPhoto = inspection?.frontPhoto || '';
  renderCustomInspectionFields(inspection?.customChecklist || []);
  if (savedInspectionFrontPhoto) {
    inspectionFrontPhotoPreview.src = savedInspectionFrontPhoto;
    inspectionFrontPhotoPreview.hidden = false;
    startInspectionCameraButton.hidden = true;
    retakeInspectionFrontPhotoButton.hidden = false;
    inspectionCameraStatus.textContent = 'Foto depan sudah tersimpan. Simpan checklist untuk memperbarui arsip atau pilih foto lain.';
  } else {
    inspectionCameraStatus.textContent = 'Pilih foto depan, lalu simpan checklist agar foto muncul di arsip.';
  }
  const unit = matchingUnits.find((item) => item.plate === inspection?.plate) || matchingUnits[0];
  plateSelect.value = unit.plate;
  inspectionForm.elements.odometerKm.value = inspection?.odometerKm ?? unit.currentKm ?? unit.lastServiceKm;
  ['fuelLevel', 'bodyCondition', 'interiorCondition', 'lightsCondition', 'tiresCondition', 'engineCondition', 'equipmentCondition', 'bodyNotes', 'notes']
    .forEach((name) => {
      inspectionForm.elements[name].value = inspection?.[name] || '';
    });
  updateBodyNoteRequirement();
  (inspection?.photos || []).forEach((photo, index) => {
    const image = document.createElement('img');
    image.src = photo;
    image.alt = `Foto checklist tersimpan ${index + 1}`;
    document.getElementById('inspectionSavedPhotos').append(image);
  });
  inspectionForm.elements.bodyNotes.required = inspectionForm.elements.bodyCondition.value === 'Ada lecet / penyok (catat lokasi)';
  fields.hidden = false;
  fields.querySelectorAll('input, select, textarea, button').forEach((control) => {
    control.disabled = false;
  });
  loadedInspectionBookingId = booking.id;
  setInspectionMessage(`Unit ${unit.plate} dipilih. Odometer terbaru tersimpan: ${Number(unit.currentKm ?? unit.lastServiceKm).toLocaleString('id-ID')} km.`);
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

const MAX_CONDITION_PHOTO_INPUT_BYTES = 20 * 1024 * 1024;

// Foto kondisi dan foto depan dikompresi ke 240 KB (batas server 250 KB).
function compressConditionPhoto(file) {
  return DriveLinkImages.compress(file, {
    maxBytes: 240 * 1024,
    maxEdge: 1600,
    label: 'Foto unit',
  });
}

function setPhotoStatus(input, text) {
  const status = input.closest('label')?.querySelector('.photo-limit-note');
  if (status) status.textContent = text;
}

function appendStatus(booking, status) {
  if (booking.status === status) return;
  booking.status = status;
  booking.statusHistory = booking.statusHistory || [];
  booking.statusHistory.push({ status, at: new Date().toISOString() });
}

function renderCondition() {
  const conditions = serverUnitConditions || DriveLinkStorage.read('drivelink-unit-conditions', {});
  const condition = conditions[conditionForm.elements.carType.value];
  conditionForm.elements.notes.value = condition?.notes || '';
  const gallery = document.getElementById('savedConditionPhotos');
  gallery.replaceChildren();
  (condition?.photos || []).forEach((photo, index) => {
    const image = document.createElement('img');
    image.src = photo;
    image.alt = `Foto kondisi tersimpan ${index + 1}`;
    gallery.append(image);
  });
}

function renderVehicleOptions() {
  const select = conditionForm.elements.carType;
  const fleet = serverFleet || DriveLinkStorage.read('drivelink-fleet', []);
  if (!fleet.length) return;
  const selected = select.value;
  select.replaceChildren(...fleet.map((vehicle) => {
    const option = document.createElement('option');
    option.value = vehicle.name;
    option.textContent = vehicle.name;
    return option;
  }));
  if (fleet.some((vehicle) => vehicle.name === selected)) select.value = selected;
}

document.getElementById('loadInspectionBooking').addEventListener('click', loadInspectionBooking);
inspectionForm.elements.bookingId.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    loadInspectionBooking();
  }
});
inspectionForm.elements.plate.addEventListener('change', () => {
  const unit = readVehicleUnits().find((item) => item.plate === inspectionForm.elements.plate.value);
  if (unit) {
    inspectionForm.elements.odometerKm.value = unit.currentKm ?? unit.lastServiceKm;
    setInspectionMessage(`Odometer terakhir untuk ${unit.plate}: ${Number(unit.currentKm ?? unit.lastServiceKm).toLocaleString('id-ID')} km.`);
  }
});
inspectionForm.elements.bodyCondition.addEventListener('change', updateBodyNoteRequirement);
inspectionForm.elements.bodyNotes.addEventListener('input', updateBodyNoteRequirement);
inspectionPhotosInput.addEventListener('change', () => {
  const files = [...inspectionPhotosInput.files];
  inspectionPhotosInput.setCustomValidity('');
  if (!files.length) {
    setPhotoStatus(inspectionPhotosInput, 'Maksimal 3 foto tambahan JPG/PNG, otomatis dikompresi maksimal 250 KB per foto.');
    return;
  }
  if (files.length > 3 || files.some((file) => file.size > MAX_CONDITION_PHOTO_INPUT_BYTES || !['image/jpeg', 'image/png'].includes(file.type))) {
    const error = 'Pilih maksimal 3 foto tambahan JPG/PNG, maksimal 20 MB per foto sebelum dikompresi.';
    inspectionPhotosInput.setCustomValidity(error);
    setPhotoStatus(inspectionPhotosInput, error);
    return;
  }
  inspectionPhotosInput.setCustomValidity('Tunggu sampai kompresi foto kondisi selesai.');
  setPhotoStatus(inspectionPhotosInput, `Mengompresi ${files.length} foto tambahan kondisi...`);
  Promise.all(files.map(compressConditionPhoto)).then((photos) => {
    if (inspectionPhotosInput.files.length !== files.length || [...inspectionPhotosInput.files].some((file, index) => file !== files[index])) return;
    inspectionPhotosInput.setCustomValidity('');
    setPhotoStatus(inspectionPhotosInput, `${photos.length} foto siap · ${Math.ceil(photos.reduce((sum, photo) => sum + photo.sizeBytes, 0) / 1024)} KB total setelah kompresi`);
  }).catch((error) => {
    if (inspectionPhotosInput.files.length !== files.length || [...inspectionPhotosInput.files].some((file, index) => file !== files[index])) return;
    inspectionPhotosInput.setCustomValidity(error.message);
    setPhotoStatus(inspectionPhotosInput, error.message);
  });
});
inspectionForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = document.getElementById('inspectionSaveMessage');
  const files = [...inspectionPhotosInput.files];
  if (!loadedInspectionBookingId) {
    message.textContent = 'Muat dan pilih booking yang valid terlebih dahulu.';
    message.classList.add('is-error');
    return;
  }
  if (files.length > 3 || files.some((file) => file.size > MAX_CONDITION_PHOTO_INPUT_BYTES || !['image/jpeg', 'image/png'].includes(file.type))) {
    message.textContent = 'Pilih maksimal 3 foto tambahan JPG/PNG, maksimal 20 MB per foto sebelum dikompresi.';
    message.classList.add('is-error');
    return;
  }
  if (!inspectionFrontPhotoFile && !savedInspectionFrontPhoto) {
    message.textContent = 'Pilih foto bagian depan unit atau ambil menggunakan kamera sebelum menyimpan checklist.';
    message.classList.add('is-error');
    return;
  }
  try {
    const bookings = readBookings();
    const booking = bookings.find((item) => item.id === loadedInspectionBookingId);
    const units = readVehicleUnits();
    const unit = units.find((item) => item.plate === inspectionForm.elements.plate.value);
    const odometerKm = Number(inspectionForm.elements.odometerKm.value);
    if (!booking || !paymentReady(booking) || !unit || !Number.isInteger(odometerKm)
      || odometerKm < Number(unit.currentKm ?? unit.lastServiceKm)) {
      message.textContent = 'Booking/unit tidak valid atau odometer lebih rendah dari catatan terakhir.';
      message.classList.add('is-error');
      return;
    }
    const newPhotos = files.length
      ? (await Promise.all(files.map(compressConditionPhoto))).map(({ dataUrl }) => dataUrl)
      : [];
    const frontPhoto = inspectionFrontPhotoFile
      ? (await compressConditionPhoto(inspectionFrontPhotoFile)).dataUrl
      : savedInspectionFrontPhoto;
    const oldInspection = booking.vehicleInspection;
    const customChecklist = await Promise.all(serverChecklistDefinitions.map(async (definition) => {
      const field = [...customInspectionFields.querySelectorAll('[data-custom-category]')]
        .find((item) => item.dataset.customCategory === definition.id);
      if (!field) throw new Error(`Kategori checklist "${definition.label}" tidak tersedia. Muat ulang halaman.`);
      const values = {};
      if (definition.types.includes('check')) {
        values.checked = field.querySelector('[data-custom-type="check"]').checked;
      }
      if (definition.types.includes('choice')) {
        values.choice = field.querySelector('[data-custom-type="choice"]').value;
      }
      if (definition.types.includes('note')) {
        values.note = field.querySelector('[data-custom-type="note"]').value.trim();
      }
      if (definition.types.includes('photo')) {
        const photoInput = field.querySelector('[data-custom-type="photo"]');
        values.photo = photoInput.files[0]
          ? (await compressConditionPhoto(photoInput.files[0])).dataUrl
          : field.dataset.savedPhoto || '';
      }
      return { id: definition.id, values };
    }));
    const inspection = {
      plate: unit.plate,
      odometerKm,
      fuelLevel: inspectionForm.elements.fuelLevel.value,
      bodyCondition: inspectionForm.elements.bodyCondition.value,
      bodyNotes: inspectionForm.elements.bodyNotes.value.trim(),
      interiorCondition: inspectionForm.elements.interiorCondition.value,
      lightsCondition: inspectionForm.elements.lightsCondition.value,
      tiresCondition: inspectionForm.elements.tiresCondition.value,
      engineCondition: inspectionForm.elements.engineCondition.value,
      equipmentCondition: inspectionForm.elements.equipmentCondition.value,
      notes: inspectionForm.elements.notes.value.trim(),
      frontPhoto,
      photos: [
        frontPhoto,
        ...(newPhotos.length ? newPhotos : oldInspection?.photos || []).filter((photo) => photo !== frontPhoto).slice(0, 3),
      ],
      customChecklist,
      checkedAt: new Date().toISOString(),
    };
    let savedBooking = booking;
    if (window.DriveLinkAPI) {
      savedBooking = await DriveLinkAPI.patch(`/api/admin/bookings/${encodeURIComponent(booking.id)}/inspection`, inspection);
      if (savedBooking.vehicleInspection?.frontPhoto !== frontPhoto
        && !savedBooking.vehicleInspection?.photos?.includes(frontPhoto)) {
        throw new Error('Foto depan tidak ikut tersimpan pada checklist. Silakan pilih ulang foto dan simpan kembali.');
      }
      const index = bookings.findIndex((item) => item.id === booking.id);
      if (index >= 0) bookings[index] = savedBooking;
      else bookings.push(savedBooking);
      serverVehicleUnits = await DriveLinkAPI.get('/api/admin/handover/units');
    } else {
      booking.vehicleInspection = inspection;
      booking.vehiclePlate = unit.plate;
    }
    unit.currentKm = odometerKm;
    unit.lastAssignedBookingId = booking.id;
    unit.lastInspectedAt = inspection.checkedAt;
    saveBookings(bookings);
    saveVehicleUnits(units);
    inspectionFrontPhotoFile = null;
    savedInspectionFrontPhoto = frontPhoto;
    if (inspectionFrontPhotoPreviewUrl) URL.revokeObjectURL(inspectionFrontPhotoPreviewUrl);
    inspectionFrontPhotoPreviewUrl = '';
    message.classList.remove('is-error');
    message.textContent = `Checklist unit ${unit.plate} tersimpan dan odometer unit diperbarui ke ${odometerKm.toLocaleString('id-ID')} km.`;
    renderInspectionHistory();
    window.location.assign(`admin-handover-archive.html?saved=${encodeURIComponent(booking.id)}`);
  } catch (error) {
    console.error('Tidak dapat menyimpan checklist kendaraan.', error);
    message.textContent = `Checklist atau foto gagal disimpan: ${error.message}`;
    message.classList.add('is-error');
  }
});

conditionForm.elements.carType.addEventListener('change', renderCondition);
conditionPhotosInput.addEventListener('change', () => {
  const files = [...conditionPhotosInput.files];
  conditionPhotosInput.setCustomValidity('');
  if (!files.length) {
    setPhotoStatus(conditionPhotosInput, 'Maksimal 2 foto JPG/PNG, otomatis dikompresi maksimal 250 KB per foto.');
    return;
  }
  if (files.length > 2 || files.some((file) => file.size > MAX_CONDITION_PHOTO_INPUT_BYTES || !['image/jpeg', 'image/png'].includes(file.type))) {
    const error = 'Pilih maksimal 2 foto JPG/PNG, maksimal 20 MB per foto sebelum dikompresi.';
    conditionPhotosInput.setCustomValidity(error);
    setPhotoStatus(conditionPhotosInput, error);
    return;
  }
  conditionPhotosInput.setCustomValidity('Tunggu sampai kompresi foto kondisi selesai.');
  setPhotoStatus(conditionPhotosInput, `Mengompresi ${files.length} foto kondisi...`);
  Promise.all(files.map(compressConditionPhoto)).then((photos) => {
    if (conditionPhotosInput.files.length !== files.length || [...conditionPhotosInput.files].some((file, index) => file !== files[index])) return;
    conditionPhotosInput.setCustomValidity('');
    setPhotoStatus(conditionPhotosInput, `${photos.length} foto siap · ${Math.ceil(photos.reduce((sum, photo) => sum + photo.sizeBytes, 0) / 1024)} KB total setelah kompresi`);
  }).catch((error) => {
    if (conditionPhotosInput.files.length !== files.length || [...conditionPhotosInput.files].some((file, index) => file !== files[index])) return;
    conditionPhotosInput.setCustomValidity(error.message);
    setPhotoStatus(conditionPhotosInput, error.message);
  });
});

conditionForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const files = [...conditionPhotosInput.files];
  if (files.length > 2 || files.some((file) => file.size > MAX_CONDITION_PHOTO_INPUT_BYTES || !['image/jpeg', 'image/png'].includes(file.type))) {
    conditionMessage.textContent = 'Pilih maksimal 2 foto JPG/PNG, maksimal 20 MB per foto sebelum dikompresi.';
    conditionMessage.classList.add('is-error');
    return;
  }
  try {
    if (window.DriveLinkAPI && !serverUnitConditions) {
      throw new Error('Data kondisi unit belum termuat dari server. Muat ulang halaman, lalu coba lagi.');
    }
    const conditions = serverUnitConditions || DriveLinkStorage.read('drivelink-unit-conditions', {});
    const carType = conditionForm.elements.carType.value;
    const oldPhotos = conditions[carType]?.photos || [];
    const photos = files.length
      ? (await Promise.all(files.map(compressConditionPhoto))).map(({ dataUrl }) => dataUrl)
      : oldPhotos;
    const condition = { notes: conditionForm.elements.notes.value.trim(), photos };
    conditions[carType] = condition;
    if (window.DriveLinkAPI) {
      await DriveLinkAPI.put(`/api/admin/handover/conditions/${encodeURIComponent(carType)}`, condition);
    }
    saveConditions(conditions);
    conditionMessage.classList.remove('is-error');
    conditionMessage.textContent = 'Catatan kondisi tersimpan dan akan ditampilkan kepada pelanggan.';
    renderCondition();
  } catch (error) {
    conditionMessage.textContent = error.message;
    conditionMessage.classList.add('is-error');
  }
});

document.getElementById('todayLabel').textContent = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
}).format(new Date());
const requestedInspectionBooking = new URLSearchParams(window.location.search).get('booking');
if (requestedInspectionBooking) {
  inspectionForm.elements.bookingId.value = requestedInspectionBooking.trim().toUpperCase();
}
document.getElementById('logoutButton').addEventListener('click', async () => {
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
renderVehicleOptions();
renderCondition();
renderInspectionHistory();

if (window.DriveLinkAPI) {
  window.DriveLinkSessionReady?.then(async (session) => {
    if (!session) return;
    try {
      serverBookings = await DriveLinkAPI.get('/api/admin/handover/bookings');
      [serverVehicleUnits, serverFleet, serverUnitConditions, serverChecklistDefinitions] = await Promise.all([
        DriveLinkAPI.get('/api/admin/handover/units'),
        DriveLinkAPI.get('/api/fleet'),
        DriveLinkAPI.get('/api/admin/handover/conditions'),
        DriveLinkAPI.get('/api/admin/handover/checklist-config'),
      ]);
      renderVehicleOptions();
      renderCondition();
      renderInspectionHistory();
      if (requestedInspectionBooking) await loadInspectionBooking();
    } catch (error) {
      setInspectionMessage(`Data serah-terima gagal dimuat: ${error.message}`, true);
    }
  });
} else if (requestedInspectionBooking) {
  loadInspectionBooking();
}
