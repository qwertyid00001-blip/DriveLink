const policyForm = document.getElementById('rentalPolicyForm');
const depositOptionsContainer = document.getElementById('rentalDepositOptions');
const policyMessage = document.getElementById('rentalPolicyMessage');
const defaultRentalPolicy = {
  depositOptions: [
    { label: 'Deposit Rp1.000.000', description: 'Dibayarkan sebelum kendaraan digunakan.' },
    { label: 'Titip motor', description: 'Motor menjadi jaminan selama masa rental.' },
  ],
  collateralItems: ['Motor', 'KTP'],
};

function createDepositOption(option = {}) {
  const row = document.createElement('div');
  row.className = 'rental-policy-row rental-deposit-option';
  row.innerHTML = `
    <label>Nama pilihan<input name="depositLabel" type="text" maxlength="100" required /></label>
    <label>Keterangan<input name="depositDescription" type="text" maxlength="180" required /></label>
    <button class="rental-policy-remove" type="button" aria-label="Hapus pilihan deposit">×</button>
  `;
  row.querySelector('[name="depositLabel"]').value = option.label || '';
  row.querySelector('[name="depositDescription"]').value = option.description || '';
  row.querySelector('.rental-policy-remove').addEventListener('click', () => {
    if (depositOptionsContainer.children.length <= 1) {
      policyMessage.textContent = 'Minimal harus ada satu pilihan deposit.';
      policyMessage.classList.add('is-error');
      return;
    }
    row.remove();
    updateAddButtons();
  });
  depositOptionsContainer.append(row);
}

function updateAddButtons() {
  document.getElementById('addRentalDepositOption').disabled = depositOptionsContainer.children.length >= 6;
}

function renderRentalPolicy(policy) {
  depositOptionsContainer.replaceChildren();
  policy.depositOptions.forEach(createDepositOption);
  updateAddButtons();
}

document.getElementById('addRentalDepositOption').addEventListener('click', () => {
  createDepositOption();
  updateAddButtons();
});
policyForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const depositOptions = [...depositOptionsContainer.querySelectorAll('.rental-deposit-option')].map((row) => ({
    label: row.querySelector('[name="depositLabel"]').value.trim(),
    description: row.querySelector('[name="depositDescription"]').value.trim(),
  }));
  // Daftar jaminan kini dikelola di halaman Reservasi; kirim null agar server
  // mempertahankan daftar yang sudah tersimpan.
  const collateralItems = null;
  const uniqueDepositLabels = new Set(depositOptions.map(({ label }) => label.toLocaleLowerCase('id-ID')));
  if (!depositOptions.length || uniqueDepositLabels.size !== depositOptions.length) {
    policyMessage.textContent = 'Isi minimal satu pilihan deposit dan pastikan setiap namanya berbeda.';
    policyMessage.classList.add('is-error');
    return;
  }
  try {
    const savedPolicy = await DriveLinkAPI.put('/api/admin/rental-policy', { depositOptions, collateralItems });
    renderRentalPolicy(savedPolicy);
    policyMessage.textContent = 'Pilihan deposit dan barang jaminan berhasil disimpan.';
    policyMessage.classList.remove('is-error');
  } catch (error) {
    policyMessage.textContent = `Pengaturan deposit gagal disimpan: ${error.message}`;
    policyMessage.classList.add('is-error');
  }
});

DriveLinkAPI.get('/api/admin/rental-policy').then(renderRentalPolicy).catch((error) => {
  renderRentalPolicy(defaultRentalPolicy);
  policyForm.querySelector('[type="submit"]').disabled = true;
  policyMessage.textContent = `Pengaturan deposit gagal dimuat: ${error.message}`;
  policyMessage.classList.add('is-error');
});
