const packageForm = document.getElementById('travelPackageForm');
const promotionForm = document.getElementById('travelPromotionForm');
const packageMessage = document.getElementById('packageMessage');
const promotionMessage = document.getElementById('promotionMessage');
let offerData = { packages: [], promotions: [], categories: [], fleet: [] };
let editingPackageId = '';
let editingPromotionId = '';

function showOfferMessage(target, text, error = false) {
  target.textContent = text;
  target.classList.toggle('is-error', error);
}

function appendTextCell(row, text, strong = false, secondary = '') {
  const cell = document.createElement('td');
  const content = strong ? document.createElement('strong') : document.createElement('span');
  content.textContent = text;
  cell.append(content);
  if (secondary) {
    const detail = document.createElement('small');
    detail.textContent = secondary;
    cell.append(detail);
  }
  row.append(cell);
  return cell;
}

function actionButton(label, action, id) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-secondary';
  button.textContent = label;
  button.dataset.offerAction = action;
  button.dataset.offerId = id;
  return button;
}

function renderCategoryChoices(selected = []) {
  const container = document.getElementById('packageCategories');
  container.replaceChildren();
  offerData.categories.forEach((category) => {
    const label = document.createElement('label');
    label.className = 'choice-option';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.name = 'categories';
    checkbox.value = category;
    checkbox.checked = selected.includes(category);
    const description = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = category;
    const fleetCount = offerData.fleet.filter((vehicle) => vehicle.category === category).length;
    const note = document.createElement('small');
    note.textContent = `${fleetCount} jenis unit tersedia`;
    description.append(title, note);
    label.append(checkbox, description);
    container.append(label);
  });
}

function fillPackageOptions(selected = []) {
  const select = document.getElementById('promotionPackages');
  select.replaceChildren();
  offerData.packages.forEach((item) => {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.name;
    option.selected = selected.includes(item.id);
    select.append(option);
  });
}

function renderPackages() {
  const body = document.getElementById('travelPackagesBody');
  body.replaceChildren();
  offerData.packages.forEach((item) => {
    const row = document.createElement('tr');
    appendTextCell(row, item.name, true, item.description || 'Tanpa detail tambahan');
    appendTextCell(row, item.categories.join(', '));
    const inclusions = [
      item.mealIncluded && 'Makan',
      item.mineralWaterIncluded && 'Air mineral',
    ].filter(Boolean);
    appendTextCell(row, inclusions.join(', ') || 'Tanpa bundling');
    const status = appendTextCell(row, item.active ? 'Aktif' : 'Nonaktif');
    status.firstChild.className = `status-pill ${item.active ? 'status-active' : 'status-cancelled'}`;
    const actions = document.createElement('td');
    actions.append(actionButton('Edit', 'edit-package', item.id), actionButton('Hapus', 'delete-package', item.id));
    row.append(actions);
    body.append(row);
  });
  document.getElementById('travelPackagesEmpty').hidden = offerData.packages.length > 0;
}

function promotionBenefit(item) {
  if (item.kind === 'discount_percent') return `Diskon ${item.value}%`;
  if (item.kind === 'discount_amount') return `Diskon ${formatCurrency(item.value)}`;
  return `BBM gratis ${item.fuelDays} hari · kredit ${formatCurrency(item.value)}/hari`;
}

function renderPromotions() {
  const body = document.getElementById('travelPromotionsBody');
  body.replaceChildren();
  offerData.promotions.forEach((item) => {
    const row = document.createElement('tr');
    appendTextCell(row, item.name, true, item.description || 'Tanpa detail tambahan');
    appendTextCell(row, promotionBenefit(item));
    appendTextCell(row, `${formatDate(item.startsAt)} – ${formatDate(item.endsAt)}`);
    const includedPackages = item.packageIds.length
      ? offerData.packages.filter((pack) => item.packageIds.includes(pack.id)).map((pack) => pack.name).join(', ') || 'Paket sudah dihapus'
      : 'Semua paket';
    appendTextCell(row, includedPackages);
    const status = appendTextCell(row, item.active ? 'Aktif' : 'Nonaktif');
    status.firstChild.className = `status-pill ${item.active ? 'status-active' : 'status-cancelled'}`;
    const actions = document.createElement('td');
    actions.append(actionButton('Edit', 'edit-promotion', item.id), actionButton('Hapus', 'delete-promotion', item.id));
    row.append(actions);
    body.append(row);
  });
  document.getElementById('travelPromotionsEmpty').hidden = offerData.promotions.length > 0;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function formatDate(value) {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${value}T00:00:00Z`));
}

async function loadOffers() {
  offerData = await DriveLinkAPI.get('/api/admin/travel-offers');
  renderCategoryChoices();
  fillPackageOptions();
  renderPackages();
  renderPromotions();
}

function resetPackageForm() {
  packageForm.reset();
  editingPackageId = '';
  renderCategoryChoices();
  document.getElementById('packageFormTitle').textContent = 'Buat paket perjalanan';
  document.getElementById('packageSubmit').textContent = 'Simpan paket';
  document.getElementById('cancelPackageEdit').hidden = true;
}

function resetPromotionForm() {
  promotionForm.reset();
  editingPromotionId = '';
  promotionForm.elements.fuelDays.value = '1';
  fillPackageOptions();
  updatePromotionKind();
  document.getElementById('promotionFormTitle').textContent = 'Buat promo event';
  document.getElementById('promotionSubmit').textContent = 'Simpan promo';
  document.getElementById('cancelPromotionEdit').hidden = true;
}

function editPackage(item) {
  editingPackageId = item.id;
  packageForm.elements.name.value = item.name;
  packageForm.elements.description.value = item.description;
  packageForm.elements.active.value = String(item.active);
  packageForm.elements.mealIncluded.checked = item.mealIncluded;
  packageForm.elements.mineralWaterIncluded.checked = item.mineralWaterIncluded;
  renderCategoryChoices(item.categories);
  document.getElementById('packageFormTitle').textContent = `Edit paket ${item.name}`;
  document.getElementById('packageSubmit').textContent = 'Simpan perubahan';
  document.getElementById('cancelPackageEdit').hidden = false;
  packageForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function editPromotion(item) {
  editingPromotionId = item.id;
  promotionForm.elements.name.value = item.name;
  promotionForm.elements.description.value = item.description;
  promotionForm.elements.active.value = String(item.active);
  promotionForm.elements.kind.value = item.kind;
  promotionForm.elements.value.value = String(item.value);
  promotionForm.elements.fuelDays.value = String(item.fuelDays || 1);
  promotionForm.elements.startsAt.value = item.startsAt;
  promotionForm.elements.endsAt.value = item.endsAt;
  fillPackageOptions(item.packageIds);
  updatePromotionKind();
  document.getElementById('promotionFormTitle').textContent = `Edit promo ${item.name}`;
  document.getElementById('promotionSubmit').textContent = 'Simpan perubahan';
  document.getElementById('cancelPromotionEdit').hidden = false;
  promotionForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function updatePromotionKind() {
  const kind = promotionForm.elements.kind.value;
  const valueInput = promotionForm.elements.value;
  const fuelDays = promotionForm.elements.fuelDays;
  const fuelDaysField = document.getElementById('fuelDaysField');
  const valueLabel = document.getElementById('promotionValueLabel');
  fuelDaysField.hidden = kind !== 'free_fuel';
  fuelDays.required = kind === 'free_fuel';
  if (kind === 'discount_percent') {
    valueLabel.firstChild.textContent = 'Persentase diskon (%)';
    valueInput.max = '100';
    valueInput.step = '1';
    document.getElementById('promotionKindHint').textContent = 'Diskon persentase dihitung dari nilai sewa sebelum promo.';
  } else {
    valueLabel.firstChild.textContent = kind === 'free_fuel' ? 'Nilai kredit BBM per hari (Rp)' : 'Nominal diskon (Rp)';
    valueInput.removeAttribute('max');
    valueInput.step = '1000';
    document.getElementById('promotionKindHint').textContent = kind === 'free_fuel'
      ? 'Promo BBM gratis berlaku untuk layanan driver tanpa BBM. Kredit per hari dipotong dari total booking.'
      : 'Potongan nominal diterapkan satu kali dan tidak melebihi nilai sewa.';
  }
}

packageForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(packageForm);
  const payload = {
    name: String(data.get('name') || '').trim(),
    description: String(data.get('description') || '').trim(),
    categories: data.getAll('categories').map(String),
    mealIncluded: data.has('mealIncluded'),
    mineralWaterIncluded: data.has('mineralWaterIncluded'),
    active: data.get('active') === 'true',
  };
  try {
    const endpoint = editingPackageId
      ? `/api/admin/travel-packages/${encodeURIComponent(editingPackageId)}`
      : '/api/admin/travel-packages';
    if (editingPackageId) await DriveLinkAPI.put(endpoint, payload);
    else await DriveLinkAPI.post(endpoint, payload);
    resetPackageForm();
    await loadOffers();
    showOfferMessage(packageMessage, 'Paket perjalanan berhasil disimpan.');
  } catch (error) {
    showOfferMessage(packageMessage, `Paket gagal disimpan: ${error.message}`, true);
  }
});

promotionForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(promotionForm);
  const payload = {
    name: String(data.get('name') || '').trim(),
    description: String(data.get('description') || '').trim(),
    kind: String(data.get('kind')),
    value: Number(data.get('value')),
    fuelDays: data.get('kind') === 'free_fuel' ? Number(data.get('fuelDays')) : 0,
    startsAt: String(data.get('startsAt')),
    endsAt: String(data.get('endsAt')),
    packageIds: data.getAll('packageIds').map(String),
    active: data.get('active') === 'true',
  };
  try {
    const endpoint = editingPromotionId
      ? `/api/admin/travel-promotions/${encodeURIComponent(editingPromotionId)}`
      : '/api/admin/travel-promotions';
    if (editingPromotionId) await DriveLinkAPI.put(endpoint, payload);
    else await DriveLinkAPI.post(endpoint, payload);
    resetPromotionForm();
    await loadOffers();
    showOfferMessage(promotionMessage, 'Promo event berhasil disimpan.');
  } catch (error) {
    showOfferMessage(promotionMessage, `Promo gagal disimpan: ${error.message}`, true);
  }
});

document.getElementById('promotionKind').addEventListener('change', updatePromotionKind);
document.getElementById('cancelPackageEdit').addEventListener('click', resetPackageForm);
document.getElementById('cancelPromotionEdit').addEventListener('click', resetPromotionForm);

document.getElementById('travelPackagesBody').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-offer-action]');
  if (!button) return;
  const item = offerData.packages.find((packageItem) => packageItem.id === button.dataset.offerId);
  if (!item) return;
  if (button.dataset.offerAction === 'edit-package') return editPackage(item);
  if (!window.confirm(`Hapus paket ${item.name}? Promo yang terkait akan diubah menjadi tidak dibatasi pada paket tersebut.`)) return;
  try {
    await DriveLinkAPI.delete(`/api/admin/travel-packages/${encodeURIComponent(item.id)}`);
    await loadOffers();
    showOfferMessage(packageMessage, 'Paket perjalanan berhasil dihapus.');
  } catch (error) {
    showOfferMessage(packageMessage, `Paket gagal dihapus: ${error.message}`, true);
  }
});

document.getElementById('travelPromotionsBody').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-offer-action]');
  if (!button) return;
  const item = offerData.promotions.find((promotion) => promotion.id === button.dataset.offerId);
  if (!item) return;
  if (button.dataset.offerAction === 'edit-promotion') return editPromotion(item);
  if (!window.confirm(`Hapus promo ${item.name}?`)) return;
  try {
    await DriveLinkAPI.delete(`/api/admin/travel-promotions/${encodeURIComponent(item.id)}`);
    await loadOffers();
    showOfferMessage(promotionMessage, 'Promo event berhasil dihapus.');
  } catch (error) {
    showOfferMessage(promotionMessage, `Promo gagal dihapus: ${error.message}`, true);
  }
});

document.getElementById('logoutButton').addEventListener('click', async () => {
  try {
    await DriveLinkAPI.post('/api/auth/logout', {});
  } catch (error) {
    console.error('Sesi server gagal diakhiri.', error);
  }
  localStorage.removeItem('drivelink-session');
  window.location.href = 'auth.html';
});

document.getElementById('todayLabel').textContent = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
}).format(new Date());

window.DriveLinkSessionReady?.then((session) => {
  if (!session) return;
  loadOffers().catch((error) => {
    showOfferMessage(packageMessage, `Data paket/promo gagal dimuat: ${error.message}`, true);
    showOfferMessage(promotionMessage, `Data paket/promo gagal dimuat: ${error.message}`, true);
  });
});
