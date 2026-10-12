const session = DriveLinkStorage.read('drivelink-session', null);
if (!session || !['admin', 'employee'].includes(session.role)) window.location.replace('auth.html');
else document.getElementById('adminName').textContent = session.name || 'Admin';

const settingsForm = document.getElementById('paymentSettingsForm');
const settingsMessage = document.getElementById('settingsMessage');
const imageInput = document.getElementById('qrImageInput');
let qrImageData = DriveLinkStorage.read('drivelink-payment-settings', {}).qrImage || '';

function saveSettings(value) {
  DriveLinkStorage.write('drivelink-payment-settings', value);
}

function renderSettings() {
  const settings = DriveLinkStorage.read('drivelink-payment-settings', {});
  ['qrName', 'bankName', 'bankAccount', 'bankHolder'].forEach((name) => {
    settingsForm.elements[name].value = settings[name] || '';
  });
  qrImageData = settings.qrImage || '';
  document.getElementById('qrImageStatus').textContent = qrImageData ? 'Gambar QRIS tersimpan di browser ini.' : 'Belum ada gambar QRIS.';
}

document.getElementById('todayLabel').textContent = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
}).format(new Date());
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

imageInput.addEventListener('change', () => {
  const file = imageInput.files[0];
  if (file && (file.size > 250 * 1024 || !['image/jpeg', 'image/png'].includes(file.type))) {
    imageInput.setCustomValidity('Pilih gambar QR JPG atau PNG maksimal 250 KB.');
    document.getElementById('qrImageStatus').textContent = 'Format atau ukuran gambar tidak sesuai.';
    return;
  }
  imageInput.setCustomValidity('');
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    qrImageData = String(reader.result);
    document.getElementById('qrImageStatus').textContent = `Siap disimpan: ${file.name}`;
  });
  reader.addEventListener('error', () => {
    settingsMessage.textContent = 'Gambar QR gagal dibaca. Pilih ulang file.';
    settingsMessage.classList.add('is-error');
  });
  reader.readAsDataURL(file);
});

settingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (imageInput.files[0] && (imageInput.files[0].size > 250 * 1024 || !['image/jpeg', 'image/png'].includes(imageInput.files[0].type))) return;
  const data = new FormData(settingsForm);
  const settings = {
    qrName: String(data.get('qrName')).trim(),
    qrImage: qrImageData,
    bankName: String(data.get('bankName')).trim(),
    bankAccount: String(data.get('bankAccount')).trim(),
    bankHolder: String(data.get('bankHolder')).trim(),
  };
  try {
    if (window.DriveLinkAPI) await DriveLinkAPI.put('/api/admin/payment-settings', settings);
    else saveSettings(settings);
    settingsMessage.classList.remove('is-error');
    settingsMessage.textContent = 'Pengaturan pembayaran berhasil disimpan di server.';
  } catch (error) {
    settingsMessage.textContent = `Pengaturan gagal disimpan: ${error.message}`;
    settingsMessage.classList.add('is-error');
  }
});

renderSettings();

if (window.DriveLinkAPI) {
  Promise.all([
    DriveLinkAPI.get('/api/auth/session'),
    DriveLinkAPI.get('/api/admin/payment-settings'),
  ]).then(([admin, settings]) => {
    DriveLinkStorage.write('drivelink-session', admin);
    DriveLinkStorage.write('drivelink-payment-settings', settings);
    ['qrName', 'bankName', 'bankAccount', 'bankHolder'].forEach((name) => {
      settingsForm.elements[name].value = settings[name] || '';
    });
    qrImageData = settings.qrImage || '';
    document.getElementById('qrImageStatus').textContent = qrImageData ? 'Gambar QRIS tersimpan di server.' : 'Belum ada gambar QRIS.';
  }).catch((error) => {
    settingsMessage.textContent = `Data pembayaran tidak dapat dimuat: ${error.message}`;
    settingsMessage.classList.add('is-error');
    window.setTimeout(() => window.location.replace('auth.html'), 1200);
  });
}
