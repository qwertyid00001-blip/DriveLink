const fleetDeletionList = document.getElementById('fleetDeletionRequests');
const fleetDeletionMessage = document.getElementById('fleetDeletionMessage');
const fleetDeletionSummary = document.getElementById('fleetDeletionSummary');
const fleetDeletionEmpty = document.getElementById('fleetDeletionEmpty');
let fleetDeletionRequests = [];

function deletionDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value || 'Tidak diketahui'
    : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function fleetDeletionRequestCard(request) {
  const card = document.createElement('article');
  card.className = 'fleet-deletion-request';

  const heading = document.createElement('div');
  heading.className = 'fleet-deletion-request-heading';
  const title = document.createElement('h3');
  title.textContent = request.targetName;
  const status = document.createElement('span');
  status.className = `status-pill ${request.status === 'pending' ? 'status-pending' : request.status === 'approved' ? 'status-active' : 'status-cancelled'}`;
  status.textContent = request.status === 'pending' ? 'Menunggu persetujuan'
    : request.status === 'approved' ? 'Disetujui dan dihapus' : 'Ditolak';
  heading.append(title, status);

  const details = document.createElement('dl');
  details.className = 'fleet-deletion-request-details';
  const values = [
    ['Jenis penghapusan', request.targetType === 'fleet-model' ? 'Model armada' : 'Unit per plat'],
    ['Diminta oleh', request.requestedBy],
    ['Waktu permintaan', deletionDate(request.requestedAt)],
  ];
  if (request.reviewedAt) {
    values.push(['Ditinjau oleh', request.reviewedBy]);
    values.push(['Waktu ditinjau', deletionDate(request.reviewedAt)]);
  }
  values.forEach(([label, value]) => {
    const group = document.createElement('div');
    const term = document.createElement('dt');
    term.textContent = label;
    const description = document.createElement('dd');
    description.textContent = value || '—';
    group.append(term, description);
    details.append(group);
  });

  const reason = document.createElement('p');
  reason.className = 'fleet-deletion-reason';
  const reasonLabel = document.createElement('strong');
  reasonLabel.textContent = 'Alasan: ';
  reason.append(reasonLabel, document.createTextNode(request.reason));

  const snapshot = document.createElement('div');
  snapshot.className = 'fleet-deletion-snapshot';
  const snapshotTitle = document.createElement('strong');
  snapshotTitle.textContent = 'Data armada yang diminta untuk dihapus';
  snapshot.append(snapshotTitle);
  if (request.targetType === 'fleet-model') {
    const vehicle = request.snapshot?.vehicle || {};
    const summary = document.createElement('p');
    summary.textContent = `${vehicle.category || 'Kategori tidak diisi'} · ${Number(vehicle.seats) || '—'} kursi · ${Number(vehicle.totalCount) || 0} unit`;
    snapshot.append(summary);
    const units = Array.isArray(request.snapshot?.physicalUnits) ? request.snapshot.physicalUnits : [];
    if (units.length) {
      const unitList = document.createElement('ul');
      units.forEach((unit) => {
        const item = document.createElement('li');
        item.textContent = `${unit.plate} · ${unit.color || 'Warna belum diisi'} · ${unit.transmission || 'Transmisi belum diisi'}`;
        unitList.append(item);
      });
      snapshot.append(unitList);
    } else {
      const none = document.createElement('p');
      none.textContent = 'Belum ada plat fisik terdaftar untuk model ini.';
      snapshot.append(none);
    }
  } else {
    const unit = request.snapshot?.unit || {};
    const summary = document.createElement('p');
    summary.textContent = `Plat ${unit.plate || request.targetId} · ${unit.carType || 'Model tidak diketahui'} · ${unit.color || 'Warna belum diisi'} · ${unit.transmission || 'Transmisi belum diisi'} · Odometer ${Number(unit.currentKm) || 0} km`;
    snapshot.append(summary);
    const serviceCount = unit.serviceHistory?.length || 0;
    const serviceHistory = document.createElement('p');
    serviceHistory.textContent = serviceCount
      ? `Riwayat servis yang diarsipkan bersama permintaan: ${serviceCount} catatan.`
      : 'Tidak ada riwayat servis.';
    snapshot.append(serviceHistory);
  }

  card.append(heading, details, reason, snapshot);
  if (request.reviewNote) {
    const note = document.createElement('p');
    note.className = 'fleet-deletion-review-note';
    note.textContent = `Catatan admin: ${request.reviewNote}`;
    card.append(note);
  }
  if (request.status === 'pending') {
    const actions = document.createElement('div');
    actions.className = 'fleet-deletion-actions';
    [
      ['approve', 'Setujui dan hapus', 'btn btn-primary'],
      ['reject', 'Tolak permintaan', 'btn btn-secondary'],
    ].forEach(([action, label, className]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = className;
      button.textContent = label;
      button.addEventListener('click', () => reviewFleetDeletion(request, action, button));
      actions.append(button);
    });
    card.append(actions);
  }
  return card;
}

function renderFleetDeletionRequests() {
  const pending = fleetDeletionRequests.filter((request) => request.status === 'pending').length;
  fleetDeletionSummary.textContent = `${fleetDeletionRequests.length} permintaan tersimpan · ${pending} menunggu persetujuan`;
  fleetDeletionList.replaceChildren(...fleetDeletionRequests.map(fleetDeletionRequestCard));
  fleetDeletionEmpty.hidden = fleetDeletionRequests.length > 0;
}

async function loadFleetDeletionRequests() {
  fleetDeletionMessage.textContent = '';
  fleetDeletionMessage.classList.remove('is-error');
  try {
    fleetDeletionRequests = await DriveLinkAPI.get('/api/admin/fleet/deletion-requests');
    renderFleetDeletionRequests();
  } catch (error) {
    fleetDeletionMessage.textContent = `Permintaan penghapusan gagal dimuat: ${error.message}`;
    fleetDeletionMessage.classList.add('is-error');
  }
}

async function reviewFleetDeletion(request, action, button) {
  const actionLabel = action === 'approve' ? 'menyetujui dan menghapus' : 'menolak';
  if (!window.confirm(`Yakin ${actionLabel} ${request.targetName}?`)) return;
  button.disabled = true;
  fleetDeletionMessage.textContent = '';
  fleetDeletionMessage.classList.remove('is-error');
  try {
    await DriveLinkAPI.patch(`/api/admin/fleet/deletion-requests/${encodeURIComponent(request.id)}`, { action });
    await loadFleetDeletionRequests();
    fleetDeletionMessage.textContent = action === 'approve'
      ? `${request.targetName} disetujui dan disembunyikan dari armada aktif. Unit yang masih dipakai booking akan dibersihkan setelah booking selesai.`
      : `Permintaan penghapusan ${request.targetName} ditolak.`;
  } catch (error) {
    fleetDeletionMessage.textContent = `Permintaan gagal diproses: ${error.message}`;
    fleetDeletionMessage.classList.add('is-error');
    button.disabled = false;
  }
}

document.getElementById('refreshFleetDeletionRequests').addEventListener('click', loadFleetDeletionRequests);
window.DriveLinkSessionReady?.then((session) => {
  if (session?.role === 'admin') loadFleetDeletionRequests();
});
