const categoryForm = document.getElementById('checklistCategoryForm');
const categoryList = document.getElementById('checklistCategoryList');
const configMessage = document.getElementById('checklistConfigMessage');
const optionsField = document.getElementById('checklistOptionsField');
const configSaveButton = document.getElementById('saveChecklistConfig');
let checklistCategories = [];
let fleetCategories = [];
const fleetCategoryForm = document.getElementById('fleetCategoryForm');
const fleetCategoryList = document.getElementById('fleetCategoryList');
const fleetCategoryMessage = document.getElementById('fleetCategoryMessage');
const serviceCategoryForm = document.getElementById('serviceCategoryForm');
const serviceCategoryList = document.getElementById('serviceCategoryList');
const serviceCategoryMessage = document.getElementById('serviceCategoryMessage');
let serviceCategories = [];

function setFleetCategoryMessage(text, isError = false) {
  fleetCategoryMessage.textContent = text;
  fleetCategoryMessage.classList.toggle('is-error', isError);
}

function renderFleetCategories() {
  document.getElementById('fleetCategoryCount').textContent = `${fleetCategories.length} kategori`;
  fleetCategoryList.replaceChildren();
  fleetCategories.forEach((category) => {
    const form = document.createElement('form');
    form.className = 'fleet-category-row';
    form.dataset.category = category;
    const input = document.createElement('input');
    input.name = 'label';
    input.type = 'text';
    input.maxLength = 40;
    input.value = category;
    input.setAttribute('aria-label', `Nama kategori ${category}`);
    input.required = true;
    const save = document.createElement('button');
    save.className = 'btn btn-secondary';
    save.type = 'submit';
    save.textContent = 'Simpan nama';
    const remove = document.createElement('button');
    remove.className = 'btn btn-secondary checklist-remove-button';
    remove.type = 'button';
    remove.dataset.deleteCategory = category;
    remove.textContent = 'Hapus';
    remove.setAttribute('aria-label', `Hapus kategori ${category}`);
    form.append(input, save, remove);
    fleetCategoryList.append(form);
  });
}

function renderServiceCategories() {
  document.getElementById('serviceCategoryCount').textContent = `${serviceCategories.length} kategori`;
  serviceCategoryList.replaceChildren();
  serviceCategories.forEach((category, index) => {
    const row = document.createElement('form');
    row.className = 'fleet-category-row';
    row.dataset.index = String(index);
    row.dataset.originalCategory = category;
    const input = document.createElement('input');
    input.name = 'label';
    input.type = 'text';
    input.maxLength = 60;
    input.value = category;
    input.setAttribute('aria-label', `Nama kategori servis ${category}`);
    input.required = true;
    const save = document.createElement('button');
    save.className = 'btn btn-secondary';
    save.type = 'submit';
    save.textContent = 'Simpan nama';
    const remove = document.createElement('button');
    remove.className = 'btn btn-secondary checklist-remove-button';
    remove.type = 'button';
    remove.dataset.deleteServiceCategory = String(index);
    remove.textContent = 'Hapus';
    remove.disabled = serviceCategories.length <= 1;
    remove.setAttribute('aria-label', `Hapus kategori servis ${category}`);
    row.append(input, save, remove);
    serviceCategoryList.append(row);
  });
}

function setConfigMessage(text, isError = false) {
  configMessage.textContent = text;
  configMessage.classList.toggle('is-error', isError);
}

function selectedTypes() {
  return [...categoryForm.querySelectorAll('input[name="types"]:checked')].map((input) => input.value);
}

function updateOptionsVisibility() {
  optionsField.hidden = !selectedTypes().includes('choice');
}

function fieldTypeLabel(type) {
  return ({ check: 'Checklist', choice: 'Pilihan', note: 'Catatan', photo: 'Foto' })[type] || type;
}

function renderCategories() {
  const count = checklistCategories.length;
  document.getElementById('checklistCategoryCount').textContent = `${count} kategori`;
  document.getElementById('checklistCategoryEmpty').hidden = count > 0;
  categoryList.replaceChildren();
  checklistCategories.forEach((category, index) => {
    const card = document.createElement('article');
    card.className = 'checklist-category-card';
    const heading = document.createElement('div');
    heading.className = 'checklist-category-card-heading';
    const copy = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = category.label;
    const summary = document.createElement('p');
    summary.textContent = category.types.map(fieldTypeLabel).join(' · ');
    copy.append(title, summary);
    const actions = document.createElement('div');
    actions.className = 'checklist-category-actions';
    if (category.required) {
      const required = document.createElement('span');
      required.className = 'checklist-required-badge';
      required.textContent = 'Wajib';
      actions.append(required);
    }
    const remove = document.createElement('button');
    remove.className = 'btn btn-secondary checklist-remove-button';
    remove.type = 'button';
    remove.textContent = 'Hapus';
    remove.setAttribute('aria-label', `Hapus kategori ${category.label}`);
    remove.addEventListener('click', () => {
      checklistCategories.splice(index, 1);
      renderCategories();
      setConfigMessage('Kategori dihapus dari daftar. Klik “Simpan perubahan” untuk menerapkan.');
    });
    actions.append(remove);
    heading.append(copy, actions);
    card.append(heading);
    if (category.types.includes('choice')) {
      const options = document.createElement('p');
      options.className = 'checklist-option-summary';
      options.textContent = `Opsi: ${category.options.join(' · ')}`;
      card.append(options);
    }
    categoryList.append(card);
  });
}

categoryForm.querySelectorAll('input[name="types"]').forEach((input) => {
  input.addEventListener('change', updateOptionsVisibility);
});

categoryForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const label = categoryForm.elements.label.value.trim();
  const types = selectedTypes();
  const options = categoryForm.elements.options.value.split('\n').map((option) => option.trim()).filter(Boolean);
  if (!types.length) {
    setConfigMessage('Pilih minimal satu jenis isian.', true);
    return;
  }
  if (types.includes('choice') && (options.length < 2 || options.length > 10
    || new Set(options.map((option) => option.toLocaleLowerCase('id-ID'))).size !== options.length)) {
    setConfigMessage('Masukkan 2–10 opsi pilihan yang berbeda, masing-masing pada baris baru.', true);
    return;
  }
  if (checklistCategories.length >= 40) {
    setConfigMessage('Maksimal 40 kategori checklist.', true);
    return;
  }
  if (types.includes('photo') && checklistCategories.filter((category) => category.types.includes('photo')).length >= 10) {
    setConfigMessage('Maksimal 10 kategori foto.', true);
    return;
  }
  if (checklistCategories.some((category) => category.label.toLocaleLowerCase('id-ID') === label.toLocaleLowerCase('id-ID'))) {
    setConfigMessage('Nama kategori tersebut sudah digunakan.', true);
    return;
  }
  checklistCategories.push({
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    label,
    types,
    options: types.includes('choice') ? options : [],
    required: categoryForm.elements.required.checked,
  });
  categoryForm.reset();
  updateOptionsVisibility();
  renderCategories();
  setConfigMessage('Kategori ditambahkan. Klik “Simpan perubahan” agar petugas dapat menggunakannya.');
});

configSaveButton.addEventListener('click', async () => {
  configSaveButton.disabled = true;
  setConfigMessage('Menyimpan pengaturan checklist...');
  try {
    checklistCategories = await DriveLinkAPI.put('/api/admin/handover/checklist-config', { items: checklistCategories });
    renderCategories();
    setConfigMessage('Pengaturan checklist tersimpan dan siap digunakan petugas.');
  } catch (error) {
    setConfigMessage(`Pengaturan checklist gagal disimpan: ${error.message}`, true);
  } finally {
    configSaveButton.disabled = false;
  }
});

updateOptionsVisibility();
fleetCategoryForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = fleetCategoryForm.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    fleetCategories = await DriveLinkAPI.post('/api/admin/fleet-categories', {
      label: fleetCategoryForm.elements.label.value.trim(),
    });
    fleetCategoryForm.reset();
    renderFleetCategories();
    setFleetCategoryMessage('Kategori kendaraan berhasil ditambahkan.');
  } catch (error) {
    setFleetCategoryMessage(`Kategori kendaraan gagal ditambahkan: ${error.message}`, true);
  } finally {
    submit.disabled = false;
  }
});

fleetCategoryList.addEventListener('submit', async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  const previous = form.dataset.category;
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    fleetCategories = await DriveLinkAPI.put(`/api/admin/fleet-categories/${encodeURIComponent(previous)}`, {
      label: form.elements.label.value.trim(),
    });
    renderFleetCategories();
    setFleetCategoryMessage('Nama kategori berhasil diperbarui pada armada dan paket terkait.');
  } catch (error) {
    setFleetCategoryMessage(`Nama kategori gagal diperbarui: ${error.message}`, true);
  } finally {
    submit.disabled = false;
  }
});

fleetCategoryList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-delete-category]');
  if (!button) return;
  const category = button.dataset.deleteCategory;
  if (!window.confirm(`Hapus kategori “${category}”? Kendaraan dan paket terkait akan dialihkan ke kategori aktif pertama.`)) return;
  button.disabled = true;
  try {
    const result = await DriveLinkAPI.delete(`/api/admin/fleet-categories/${encodeURIComponent(category)}`);
    fleetCategories = result.categories;
    renderFleetCategories();
    setFleetCategoryMessage(`Kategori dihapus. Referensi kendaraan dan paket dialihkan ke “${result.reassignedTo}”.`);
  } catch (error) {
    setFleetCategoryMessage(`Kategori kendaraan gagal dihapus: ${error.message}`, true);
  } finally {
    button.disabled = false;
  }
});

serviceCategoryForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const label = serviceCategoryForm.elements.label.value.trim().replace(/\s+/g, ' ');
  if (serviceCategories.length >= 30) {
    serviceCategoryMessage.textContent = 'Maksimal 30 kategori servis.';
    serviceCategoryMessage.classList.add('is-error');
    return;
  }
  if (serviceCategories.some((category) => category.toLocaleLowerCase('id-ID') === label.toLocaleLowerCase('id-ID'))) {
    serviceCategoryMessage.textContent = 'Nama kategori servis tersebut sudah digunakan.';
    serviceCategoryMessage.classList.add('is-error');
    return;
  }
  const submit = serviceCategoryForm.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    serviceCategories = await DriveLinkAPI.put('/api/admin/vehicle-service-categories', {
      categories: [...serviceCategories, label],
    });
    serviceCategoryForm.reset();
    renderServiceCategories();
    serviceCategoryMessage.textContent = 'Kategori servis berhasil ditambahkan.';
    serviceCategoryMessage.classList.remove('is-error');
  } catch (error) {
    serviceCategoryMessage.textContent = `Kategori servis gagal disimpan: ${error.message}`;
    serviceCategoryMessage.classList.add('is-error');
  } finally {
    submit.disabled = false;
  }
});

serviceCategoryList.addEventListener('submit', async (event) => {
  const row = event.target;
  if (!(row instanceof HTMLFormElement)) return;
  event.preventDefault();
  const index = Number(row.dataset.index);
  const label = row.elements.label.value.trim().replace(/\s+/g, ' ');
  if (serviceCategories.some((category, categoryIndex) => categoryIndex !== index
    && category.toLocaleLowerCase('id-ID') === label.toLocaleLowerCase('id-ID'))) {
    serviceCategoryMessage.textContent = 'Nama kategori servis tersebut sudah digunakan.';
    serviceCategoryMessage.classList.add('is-error');
    return;
  }
  const submit = row.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    const updated = [...serviceCategories];
    const renamedFrom = serviceCategories[index];
    updated[index] = label;
    serviceCategories = await DriveLinkAPI.put('/api/admin/vehicle-service-categories', {
      categories: updated,
      renamedFrom,
      renamedTo: label,
    });
    renderServiceCategories();
    serviceCategoryMessage.textContent = 'Nama kategori servis berhasil disimpan.';
    serviceCategoryMessage.classList.remove('is-error');
  } catch (error) {
    serviceCategoryMessage.textContent = `Kategori servis gagal disimpan: ${error.message}`;
    serviceCategoryMessage.classList.add('is-error');
  } finally {
    submit.disabled = false;
  }
});

serviceCategoryList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-delete-service-category]');
  if (!button || serviceCategories.length <= 1) return;
  const index = Number(button.dataset.deleteServiceCategory);
  const category = serviceCategories[index];
  if (!window.confirm(`Hapus kategori servis “${category}”? Rincian lama akan dialihkan ke kategori servis pertama yang tersisa.`)) return;
  button.disabled = true;
  try {
    const updated = [...serviceCategories];
    updated.splice(index, 1);
    serviceCategories = await DriveLinkAPI.put('/api/admin/vehicle-service-categories', {
      categories: updated,
      removedCategory: category,
    });
    renderServiceCategories();
    serviceCategoryMessage.textContent = 'Kategori servis dihapus dan rincian servis lama disesuaikan.';
    serviceCategoryMessage.classList.remove('is-error');
  } catch (error) {
    serviceCategoryMessage.textContent = `Kategori servis gagal dihapus: ${error.message}`;
    serviceCategoryMessage.classList.add('is-error');
  } finally {
    button.disabled = false;
  }
});

document.getElementById('todayLabel').textContent = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
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
window.DriveLinkSessionReady?.then(async (session) => {
  if (!session) return;
  const [checklistResult, categoriesResult, serviceCategoriesResult] = await Promise.allSettled([
    DriveLinkAPI.get('/api/admin/handover/checklist-config'),
    DriveLinkAPI.get('/api/admin/fleet-categories'),
    DriveLinkAPI.get('/api/admin/vehicle-service-categories'),
  ]);
  if (checklistResult.status === 'fulfilled') {
    checklistCategories = checklistResult.value;
    renderCategories();
  } else setConfigMessage(`Pengaturan checklist gagal dimuat: ${checklistResult.reason.message}`, true);
  if (categoriesResult.status === 'fulfilled') {
    fleetCategories = categoriesResult.value;
    renderFleetCategories();
  } else setFleetCategoryMessage(`Kategori kendaraan gagal dimuat: ${categoriesResult.reason.message}`, true);
  if (serviceCategoriesResult.status === 'fulfilled') {
    serviceCategories = serviceCategoriesResult.value;
    renderServiceCategories();
  } else {
    serviceCategoryMessage.textContent = `Kategori servis gagal dimuat: ${serviceCategoriesResult.reason.message}`;
    serviceCategoryMessage.classList.add('is-error');
  }
});
