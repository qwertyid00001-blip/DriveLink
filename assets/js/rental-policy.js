const depositOptionsElement = document.getElementById('rentalDepositOptions');
const collateralFieldset = document.getElementById('rentalCollateralNote');
const collateralList = document.getElementById('rentalCollateralItems');

function escapeRentalPolicyText(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

// Daftar barang jaminan dari pengaturan admin, untuk checkbox di form booking.
function buildCollateralCheckboxes(items) {
  collateralList.replaceChildren(...items.map((item, index) => {
    const label = document.createElement('label');
    label.className = 'choice-option';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = 'collateralItem';
    input.value = item;
    // Barang pertama dicentang sebagai pilihan awal agar pelanggan tidak lupa.
    if (index === 0) input.checked = true;
    const span = document.createElement('span');
    const strong = document.createElement('strong');
    strong.textContent = item;
    span.append(strong);
    label.append(input, span);
    return label;
  }));
}

// Kembalikan daftar jaminan yang dicentang, untuk dikirim bersama booking.
function readSelectedCollateral() {
  return [...collateralList.querySelectorAll('input[name="collateralItem"]:checked')].map((input) => input.value);
}

window.DriveLinkRentalPolicyReady = DriveLinkAPI.get('/api/site-settings/rental-policy')
  .then((policy) => {
    depositOptionsElement.innerHTML = policy.depositOptions.map((option, index) => `
      <label class="choice-option">
        <input type="radio" name="deposit" value="${escapeRentalPolicyText(option.label)}" ${index === 0 ? 'checked' : ''} required />
        <span><strong>${escapeRentalPolicyText(option.label)}</strong><small>${escapeRentalPolicyText(option.description)}</small></span>
      </label>
    `).join('');
    buildCollateralCheckboxes(policy.collateralItems);
    collateralFieldset.hidden = policy.collateralItems.length === 0;
    return policy;
  })
  .catch((error) => {
    depositOptionsElement.innerHTML = '<p class="workflow-message is-error">Pilihan deposit gagal dimuat. Muat ulang halaman sebelum mengirim booking.</p>';
    const submitButton = document.querySelector('#bookingForm button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    console.error('Ketentuan booking gagal dimuat dari server.', error);
    return null;
  });
