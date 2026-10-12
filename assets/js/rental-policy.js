const depositOptionsElement = document.getElementById('rentalDepositOptions');
const collateralNote = document.getElementById('rentalCollateralNote');
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

window.DriveLinkRentalPolicyReady = DriveLinkAPI.get('/api/site-settings/rental-policy')
  .then((policy) => {
    depositOptionsElement.innerHTML = policy.depositOptions.map((option, index) => `
      <label class="choice-option">
        <input type="radio" name="deposit" value="${escapeRentalPolicyText(option.label)}" ${index === 0 ? 'checked' : ''} required />
        <span><strong>${escapeRentalPolicyText(option.label)}</strong><small>${escapeRentalPolicyText(option.description)}</small></span>
      </label>
    `).join('');
    collateralList.replaceChildren(...policy.collateralItems.map((item) => {
      const entry = document.createElement('li');
      entry.textContent = item;
      return entry;
    }));
    collateralNote.hidden = policy.collateralItems.length === 0;
    return policy;
  })
  .catch((error) => {
    depositOptionsElement.innerHTML = '<p class="workflow-message is-error">Pilihan deposit gagal dimuat. Muat ulang halaman sebelum mengirim booking.</p>';
    const submitButton = document.querySelector('#bookingForm button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    console.error('Ketentuan booking gagal dimuat dari server.', error);
    return null;
  });
