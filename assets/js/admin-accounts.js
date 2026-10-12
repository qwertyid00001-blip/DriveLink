const featureLabels = {
  overview: 'Ringkasan',
  bookings: 'Booking dan verifikasi pembayaran',
  fleet: 'Armada',
  'vehicle-service': 'Kontrol unit & servis',
  location: 'Lokasi rental',
  'rental-settings': 'Pengaturan sewa',
  'travel-packages': 'Paket perjalanan & promo',
  monitoring: 'Monitoring IoT',
  payments: 'Pembayaran',
  handover: 'Serah-terima',
  checklist: 'Atur checklist',
  'handover-archive': 'Arsip checklist',
  return: 'Pengembalian unit',
  'rental-archive': 'Arsip penyewaan',
};

const employeeForm = document.getElementById('employeeForm');
const employeeMessage = document.getElementById('employeeFormMessage');
const accountsBody = document.getElementById('employeeAccountsBody');
let employeeAccounts = [];
let editingUsername = '';

function updatePermissionSelection() {
  const permissions = employeeForm.querySelectorAll('[name="permissions"]');
  const selectedCount = [...permissions].filter((checkbox) => checkbox.checked).length;
  const selectionCount = document.getElementById('permissionSelectionCount');
  selectionCount.textContent = `${selectedCount} dari ${permissions.length} fitur dipilih`;
  document.getElementById('selectAllPermissions').disabled = selectedCount === permissions.length;
  document.getElementById('clearPermissions').disabled = selectedCount === 0;
}

function displayMessage(message, isError = false) {
  employeeMessage.textContent = message;
  employeeMessage.classList.toggle('is-error', isError);
}

function resetEmployeeForm() {
  employeeForm.reset();
  editingUsername = '';
  employeeForm.elements.username.readOnly = false;
  employeeForm.elements.password.required = true;
  employeeForm.elements.password.minLength = 12;
  document.getElementById('accountFormTitle').textContent = 'Tambah karyawan';
  document.getElementById('employeeSubmit').textContent = 'Buat akun karyawan';
  document.getElementById('employeePasswordHint').textContent = 'Minimal 12 karakter; wajib saat membuat akun baru.';
  document.getElementById('cancelEmployeeEdit').hidden = true;
  updatePermissionSelection();
}

function renderAccounts() {
  const staff = employeeAccounts.filter((account) => account.role !== 'admin');
  accountsBody.replaceChildren();
  staff.forEach((account) => {
    const row = document.createElement('tr');
    const person = document.createElement('td');
    person.className = 'account-person-cell';
    const name = document.createElement('strong');
    name.textContent = account.name;
    const username = document.createElement('small');
    username.textContent = `@${account.username}`;
    const email = document.createElement('small');
    email.textContent = account.email;
    person.append(name, username, email);

    const job = document.createElement('td');
    job.className = 'account-job-cell';
    job.textContent = [account.position, account.employeeCode].filter(Boolean).join(' · ') || '-';

    const access = document.createElement('td');
    access.className = 'account-access-cell';
    const tags = document.createElement('div');
    tags.className = 'account-permission-tags';
    account.permissions.forEach((permission) => {
      const tag = document.createElement('span');
      tag.textContent = featureLabels[permission] || permission;
      tags.append(tag);
    });
    if (!account.permissions.length) tags.textContent = 'Tidak ada akses fitur';
    access.append(tags);

    const status = document.createElement('td');
    status.className = 'account-status-cell';
    const pill = document.createElement('span');
    pill.className = `status-pill ${account.active ? 'status-active' : 'status-cancelled'}`;
    pill.textContent = account.active ? 'Aktif' : 'Nonaktif';
    status.append(pill);

    const actions = document.createElement('td');
    actions.className = 'account-actions-cell';
    const actionGroup = document.createElement('div');
    actionGroup.className = 'account-action-buttons';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'btn btn-secondary';
    edit.textContent = 'Edit';
    edit.dataset.accountAction = 'edit';
    edit.dataset.username = account.username;
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'btn btn-secondary';
    toggle.textContent = account.active ? 'Nonaktifkan' : 'Aktifkan';
    toggle.dataset.accountAction = 'toggle';
    toggle.dataset.username = account.username;
    actionGroup.append(edit, toggle);
    actions.append(actionGroup);

    row.append(person, job, access, status, actions);
    accountsBody.append(row);
  });
  document.getElementById('employeeAccountsEmpty').hidden = staff.length > 0;
}

async function loadAccounts() {
  employeeAccounts = await DriveLinkAPI.get('/api/admin/accounts');
  renderAccounts();
}

function editAccount(account) {
  editingUsername = account.username;
  employeeForm.elements.name.value = account.name;
  employeeForm.elements.username.value = account.username;
  employeeForm.elements.username.readOnly = true;
  employeeForm.elements.email.value = account.email;
  employeeForm.elements.phone.value = account.phone;
  employeeForm.elements.employeeCode.value = account.employeeCode;
  employeeForm.elements.position.value = account.position;
  employeeForm.elements.password.value = '';
  employeeForm.elements.password.required = false;
  employeeForm.elements.password.minLength = 0;
  employeeForm.querySelectorAll('[name="permissions"]').forEach((checkbox) => {
    checkbox.checked = account.permissions.includes(checkbox.value);
  });
  updatePermissionSelection();
  document.getElementById('accountFormTitle').textContent = `Edit akun ${account.name}`;
  document.getElementById('employeeSubmit').textContent = 'Simpan perubahan';
  document.getElementById('employeePasswordHint').textContent = 'Kosongkan jika tidak ingin mengganti password. Password baru minimal 12 karakter.';
  document.getElementById('cancelEmployeeEdit').hidden = false;
  employeeForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

employeeForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const passwordValue = employeeForm.elements.password.value;
  if ((!editingUsername || passwordValue) && passwordValue.length < 12) {
    displayMessage('Password minimal 12 karakter. Periksa kolom password di atas, lalu coba lagi.', true);
    return;
  }
  if (!employeeForm.checkValidity()) {
    const invalidField = [...employeeForm.elements].find((field) => field.willValidate && !field.validity.valid);
    if (invalidField?.name === 'password' && invalidField.validity.tooShort) {
      displayMessage('Password minimal 12 karakter. Periksa kolom password di atas, lalu coba lagi.', true);
    } else if (invalidField?.name === 'username' && invalidField.validity.patternMismatch) {
      displayMessage('Username hanya boleh berisi huruf, angka, titik, garis bawah, atau tanda hubung.', true);
    } else if (invalidField?.name === 'email' && invalidField.validity.typeMismatch) {
      displayMessage('Masukkan alamat email yang valid.', true);
    } else {
      const fieldLabel = invalidField?.closest('label')?.firstChild?.textContent?.trim().replace(/\s+/g, ' ');
      displayMessage(fieldLabel
        ? `Lengkapi atau periksa kolom “${fieldLabel}” sebelum menyimpan.`
        : 'Periksa kembali data akun sebelum menyimpan.', true);
    }
    return;
  }
  const form = new FormData(employeeForm);
  const payload = {
    name: String(form.get('name') || '').trim(),
    username: String(form.get('username') || '').trim(),
    email: String(form.get('email') || '').trim(),
    phone: String(form.get('phone') || '').trim(),
    employeeCode: String(form.get('employeeCode') || '').trim(),
    position: String(form.get('position') || '').trim(),
    password: String(form.get('password') || ''),
    permissions: form.getAll('permissions').map(String),
  };
  const submitButton = document.getElementById('employeeSubmit');
  submitButton.disabled = true;
  displayMessage(editingUsername ? 'Menyimpan perubahan akun...' : 'Membuat akun karyawan...');
  try {
    if (editingUsername) {
      await DriveLinkAPI.put(`/api/admin/accounts/${encodeURIComponent(editingUsername)}`, payload);
      displayMessage(`Akun ${payload.username} berhasil diperbarui.`);
    } else {
      await DriveLinkAPI.post('/api/admin/accounts', payload);
      displayMessage(`Akun ${payload.username} berhasil dibuat.`);
    }
    resetEmployeeForm();
    await loadAccounts();
  } catch (error) {
    displayMessage(`Akun gagal disimpan: ${error.message}`, true);
  } finally {
    submitButton.disabled = false;
  }
});

document.getElementById('cancelEmployeeEdit').addEventListener('click', resetEmployeeForm);
employeeForm.querySelectorAll('[name="permissions"]').forEach((checkbox) => {
  checkbox.addEventListener('change', updatePermissionSelection);
});
document.getElementById('selectAllPermissions').addEventListener('click', () => {
  employeeForm.querySelectorAll('[name="permissions"]').forEach((checkbox) => {
    checkbox.checked = true;
  });
  updatePermissionSelection();
});
document.getElementById('clearPermissions').addEventListener('click', () => {
  employeeForm.querySelectorAll('[name="permissions"]').forEach((checkbox) => {
    checkbox.checked = false;
  });
  updatePermissionSelection();
});
accountsBody.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-account-action]');
  if (!button) return;
  const account = employeeAccounts.find((item) => item.username === button.dataset.username);
  if (!account) return;
  if (button.dataset.accountAction === 'edit') {
    editAccount(account);
    return;
  }
  const active = !account.active;
  if (!window.confirm(`${active ? 'Aktifkan' : 'Nonaktifkan'} akun ${account.name}?`)) return;
  try {
    await DriveLinkAPI.put(`/api/admin/accounts/${encodeURIComponent(account.username)}`, {
      ...account,
      password: '',
      active,
    });
    await loadAccounts();
    displayMessage(`Akun ${account.username} ${active ? 'diaktifkan' : 'dinonaktifkan'}.`);
  } catch (error) {
    displayMessage(`Status akun gagal diubah: ${error.message}`, true);
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
updatePermissionSelection();

window.DriveLinkSessionReady?.then((session) => {
  if (!session || session.role !== 'admin') return;
  loadAccounts().catch((error) => displayMessage(`Daftar akun gagal dimuat: ${error.message}`, true));
});
