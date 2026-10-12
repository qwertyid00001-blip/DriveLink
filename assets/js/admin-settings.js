const profileForm = document.getElementById('adminProfileForm');
const profileMessage = document.getElementById('adminProfileMessage');
const themeForm = document.getElementById('adminThemeForm');
const themeMessage = document.getElementById('adminThemeMessage');
const themeColor = document.getElementById('themeColor');
const offerForm = document.getElementById('adminOfferForm');
const offerMessage = document.getElementById('adminOfferMessage');
const homeHeroForm = document.getElementById('adminHomeHeroForm');
const homeHeroMessage = document.getElementById('homeHeroMessage');
const contactForm = document.getElementById('adminContactForm');
const contactMessage = document.getElementById('adminContactMessage');
const homeBannerForm = document.getElementById('adminHomeBannerForm');
const homeBannerMessage = document.getElementById('homeBannerMessage');
const homeBannerFile = homeBannerForm.elements.image;
const homeBannerEnabled = homeBannerForm.elements.enabled;
const logoForm = document.getElementById('adminLogoForm');
const logoFile = logoForm.elements.image;
const logoMessage = document.getElementById('brandLogoMessage');
let savedHomeBannerImage = '';
let savedLogoImage = '';
let themeGradientEnd = '#476eff';
let themeGradientAngle = '135deg';

function setFormMessage(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle('is-error', isError);
}

function previewTheme(color, gradientEnd = themeGradientEnd, gradientAngle = themeGradientAngle) {
  themeGradientEnd = gradientEnd;
  themeGradientAngle = gradientAngle;
  document.documentElement.style.setProperty('--primary', color);
  document.documentElement.style.setProperty('--primary-gradient-end', gradientEnd);
  document.documentElement.style.setProperty('--primary-gradient-angle', gradientAngle);
  document.documentElement.style.setProperty('--primary-dark', `color-mix(in srgb, ${color} 78%, #000)`);
  document.documentElement.style.setProperty('--secondary', `color-mix(in srgb, ${color} 10%, #fff)`);
  document.documentElement.style.setProperty('--admin-sidebar', `color-mix(in srgb, ${color} 45%, #101b37)`);
  document.documentElement.style.setProperty('--admin-sidebar-active', `color-mix(in srgb, ${color} 25%, #101b37)`);
  document.documentElement.style.setProperty('--admin-sidebar-accent', color);
  document.querySelectorAll('.theme-swatch').forEach((swatch) => {
    swatch.classList.toggle('is-selected', swatch.dataset.themeColor === color);
  });
  document.querySelectorAll('.theme-combination').forEach((preset) => {
    const selected = preset.dataset.themePrimary === color
      && preset.dataset.themeEnd === gradientEnd
      && preset.dataset.themeAngle === gradientAngle;
    preset.classList.toggle('is-selected', selected);
    preset.setAttribute('aria-pressed', String(selected));
  });
}

function updateOfferPreview() {
  document.getElementById('offerPreviewBadge').textContent = offerForm.elements.badge.value.trim() || 'Penawaran spesial';
  document.getElementById('offerPreviewTitle').textContent = offerForm.elements.title.value.trim() || 'Judul penawaran';
  document.getElementById('offerPreviewDescription').textContent = offerForm.elements.description.value.trim()
    || 'Deskripsi penawaran akan tampil di sini.';
  document.getElementById('offerPreviewButton').textContent = offerForm.elements.buttonLabel.value.trim() || 'Lihat penawaran';
}

function renderHomeHeroTitle(element, text, effect) {
  const track = document.createElement('span');
  track.className = 'home-hero-title-track';
  const copy = document.createElement('span');
  copy.className = 'home-hero-title-copy';
  copy.textContent = text;
  track.append(copy);
  if (effect === 'marquee') {
    const duplicate = copy.cloneNode(true);
    duplicate.setAttribute('aria-hidden', 'true');
    track.append(duplicate);
  }
  element.dataset.effect = effect;
  element.replaceChildren(track);
}

function updateHomeHeroPreview() {
  document.getElementById('homeHeroPreviewEyebrow').textContent = homeHeroForm.elements.eyebrow.value.trim() || '#MobilCerdas';
  renderHomeHeroTitle(
    document.getElementById('homeHeroPreviewTitle'),
    homeHeroForm.elements.title.value.trim() || 'Judul utama beranda',
    homeHeroForm.elements.effect.value,
  );
  document.getElementById('homeHeroPreviewDescription').textContent = homeHeroForm.elements.description.value.trim()
    || 'Teks pendukung judul di beranda.';
}

const socialPlatforms = [
  ['instagram', 'Instagram'],
  ['facebook', 'Facebook'],
  ['tiktok', 'TikTok'],
  ['youtube', 'YouTube'],
  ['x', 'X'],
  ['whatsapp', 'WhatsApp'],
];

function updateSocialPreview(links) {
  const preview = document.getElementById('adminSocialPreview');
  preview.replaceChildren();
  for (const { platform } of links) {
    const icon = document.createElement('span');
    icon.className = `footer-social-icon is-${platform}`;
    icon.setAttribute('aria-label', socialPlatforms.find(([key]) => key === platform)?.[1] || platform);
    icon.innerHTML = window.DriveLinkSocialIcon(platform);
    preview.append(icon);
  }
  preview.hidden = links.length === 0;
}

function readSocialRows() {
  return [...document.querySelectorAll('.social-link-row')].map((row) => ({
    platform: row.querySelector('[name="platform"]').value,
    url: row.querySelector('[name="url"]').value.trim(),
  }));
}

function addSocialRow(link = {}) {
  const container = document.getElementById('socialLinkRows');
  if (container.children.length >= socialPlatforms.length) return;
  const row = document.createElement('div');
  row.className = 'social-link-row';
  const icon = document.createElement('span');
  icon.className = 'social-row-icon';
  icon.setAttribute('aria-hidden', 'true');
  const platformLabel = document.createElement('label');
  platformLabel.append('Platform');
  const platformSelect = document.createElement('select');
  platformSelect.name = 'platform';
  platformSelect.setAttribute('aria-label', 'Pilih platform media sosial');
  for (const [value, label] of socialPlatforms) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    platformSelect.append(option);
  }
  platformSelect.value = link.platform || socialPlatforms[0][0];
  platformLabel.append(platformSelect);
  const urlLabel = document.createElement('label');
  urlLabel.append('Tautan profil');
  const urlInput = document.createElement('input');
  urlInput.name = 'url';
  urlInput.type = 'url';
  urlInput.required = true;
  urlInput.maxLength = 500;
  urlInput.placeholder = 'https://www.instagram.com/namaprofil';
  urlInput.value = link.url || '';
  urlLabel.append(urlInput);
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'btn btn-secondary social-remove-button';
  remove.textContent = 'Hapus';
  remove.setAttribute('aria-label', 'Hapus media sosial');
  row.append(icon, platformLabel, urlLabel, remove);
  container.append(row);

  const refreshIcon = () => {
    icon.innerHTML = window.DriveLinkSocialIcon(platformSelect.value);
    icon.className = `social-row-icon is-${platformSelect.value}`;
  };
  platformSelect.addEventListener('change', () => {
    refreshIcon();
    updateSocialPreview(readSocialRows());
  });
  urlInput.addEventListener('input', () => updateSocialPreview(readSocialRows()));
  remove.addEventListener('click', () => {
    row.remove();
    document.getElementById('addSocialLink').disabled = container.children.length >= socialPlatforms.length;
    updateSocialPreview(readSocialRows());
  });
  refreshIcon();
  document.getElementById('addSocialLink').disabled = container.children.length >= socialPlatforms.length;
}

document.getElementById('addSocialLink').addEventListener('click', () => addSocialRow());
contactForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submitButton = contactForm.querySelector('[type="submit"]');
  submitButton.disabled = true;
  try {
    const contact = await DriveLinkAPI.put('/api/admin/settings/contact', {
      heading: contactForm.elements.heading.value.trim(),
      phone: contactForm.elements.phone.value.trim(),
      email: contactForm.elements.email.value.trim(),
      whatsapp: contactForm.elements.whatsapp.value.trim(),
      socialLinks: readSocialRows(),
    });
    contactForm.elements.heading.value = contact.heading;
    contactForm.elements.phone.value = contact.phone;
    contactForm.elements.email.value = contact.email;
    contactForm.elements.whatsapp.value = contact.whatsapp;
    updateSocialPreview(contact.socialLinks);
    setFormMessage(contactMessage, 'Kontak dan media sosial berhasil disimpan di footer website.');
  } catch (error) {
    setFormMessage(contactMessage, `Kontak gagal disimpan: ${error.message}`, true);
  } finally {
    submitButton.disabled = false;
  }
});

homeHeroForm.addEventListener('input', updateHomeHeroPreview);
homeHeroForm.addEventListener('change', updateHomeHeroPreview);
homeHeroForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submitButton = homeHeroForm.querySelector('[type="submit"]');
  submitButton.disabled = true;
  try {
    const hero = await DriveLinkAPI.put('/api/admin/settings/home-hero', {
      eyebrow: homeHeroForm.elements.eyebrow.value.trim(),
      title: homeHeroForm.elements.title.value.trim(),
      description: homeHeroForm.elements.description.value.trim(),
      effect: homeHeroForm.elements.effect.value,
    });
    homeHeroForm.elements.eyebrow.value = hero.eyebrow;
    homeHeroForm.elements.title.value = hero.title;
    homeHeroForm.elements.description.value = hero.description;
    homeHeroForm.elements.effect.value = hero.effect;
    updateHomeHeroPreview();
    setFormMessage(homeHeroMessage, 'Teks dan efek beranda berhasil disimpan.');
  } catch (error) {
    setFormMessage(homeHeroMessage, `Teks beranda gagal disimpan: ${error.message}`, true);
  } finally {
    submitButton.disabled = false;
  }
});

function showHomeBannerPreview(image, fileName = '') {
  savedHomeBannerImage = image;
  const previewWrap = document.getElementById('homeBannerPreviewWrap');
  const preview = document.getElementById('homeBannerPreview');
  const removeButton = document.getElementById('removeHomeBanner');
  const name = document.getElementById('homeBannerFileName');
  preview.src = image;
  previewWrap.hidden = !image;
  removeButton.hidden = !image;
  name.textContent = fileName || (image ? 'Poster tersimpan di server.' : 'Belum ada gambar poster.');
}

function showLogoPreview(image, fileName = '') {
  const previewWrap = document.getElementById('brandLogoPreviewWrap');
  const preview = document.getElementById('brandLogoPreview');
  const removeButton = document.getElementById('removeBrandLogo');
  preview.src = image;
  previewWrap.hidden = !image;
  removeButton.hidden = !savedLogoImage;
  document.getElementById('brandLogoFileName').textContent = fileName
    || (image ? 'Logo tersimpan di server.' : 'Logo bawaan DriveLink sedang digunakan.');
}

function applyLogoToCurrentPage(image) {
  document.querySelectorAll('.brand-mark').forEach((mark) => {
    if (image) {
      const logo = document.createElement('img');
      logo.className = 'brand-mark brand-logo';
      logo.src = image;
      logo.alt = '';
      mark.replaceWith(logo);
    } else {
      const defaultMark = document.createElement('span');
      defaultMark.className = 'brand-mark';
      defaultMark.textContent = 'D';
      mark.replaceWith(defaultMark);
    }
  });
}

let pendingLogoImage = '';

logoFile.addEventListener('change', async () => {
  const file = logoFile.files[0];
  if (!file) {
    pendingLogoImage = '';
    return;
  }
  const submitButton = logoForm.querySelector('[type="submit"]');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    logoFile.value = '';
    pendingLogoImage = '';
    setFormMessage(logoMessage, 'Pilih logo JPG, PNG, atau WebP.', true);
    return;
  }
  pendingLogoImage = '';
  // Kunci tombol simpan sampai kompresi selesai, supaya logo lama tidak tersimpan
  // ketika pengguna menekan Simpan terlalu cepat.
  if (submitButton) submitButton.disabled = true;
  setFormMessage(logoMessage, 'Mengompresi logo...');
  try {
    // Logo dikompresi ke 900 KB (batas server 1 MB).
    const { dataUrl, sizeBytes } = await DriveLinkImages.compress(file, {
      maxBytes: 900 * 1024,
      maxEdge: 1200,
      label: 'Logo',
    });
    pendingLogoImage = dataUrl;
    showLogoPreview(dataUrl, file.name);
    setFormMessage(logoMessage, `Logo siap · ${Math.ceil(sizeBytes / 1024)} KB setelah kompresi`);
  } catch (error) {
    logoFile.value = '';
    setFormMessage(logoMessage, error.message, true);
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

logoForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (logoFile.files.length && !pendingLogoImage) {
    setFormMessage(logoMessage, 'Tunggu sampai kompresi logo selesai.', true);
    return;
  }
  const image = logoFile.files.length ? pendingLogoImage : savedLogoImage;
  const submitButton = logoForm.querySelector('[type="submit"]');
  submitButton.disabled = true;
  try {
    const logo = await DriveLinkAPI.put('/api/admin/settings/logo', { image });
    savedLogoImage = logo.image;
    logoFile.value = '';
    showLogoPreview(savedLogoImage);
    applyLogoToCurrentPage(savedLogoImage);
    setFormMessage(logoMessage, savedLogoImage
      ? 'Logo berhasil disimpan dan diterapkan di seluruh halaman.'
      : 'Logo bawaan DriveLink berhasil diterapkan.');
  } catch (error) {
    setFormMessage(logoMessage, `Logo gagal disimpan: ${error.message}`, true);
  } finally {
    submitButton.disabled = false;
  }
});

document.getElementById('removeBrandLogo').addEventListener('click', async () => {
  if (!window.confirm('Kembalikan logo bawaan DriveLink di seluruh halaman?')) return;
  const removeButton = document.getElementById('removeBrandLogo');
  removeButton.disabled = true;
  try {
    const logo = await DriveLinkAPI.put('/api/admin/settings/logo', { image: '' });
    savedLogoImage = logo.image;
    logoFile.value = '';
    showLogoPreview('');
    applyLogoToCurrentPage('');
    setFormMessage(logoMessage, 'Logo bawaan DriveLink berhasil diterapkan di seluruh halaman.');
  } catch (error) {
    setFormMessage(logoMessage, `Logo gagal dihapus: ${error.message}`, true);
  } finally {
    removeButton.disabled = false;
  }
});

function updateHomeBannerToggleStatus() {
  document.getElementById('homeBannerToggleStatus').textContent = homeBannerEnabled.checked
    ? 'Dipilih: poster akan ditampilkan setelah disimpan.'
    : 'Dipilih: poster disembunyikan, gambar tetap tersimpan.';
}

homeBannerEnabled.addEventListener('change', updateHomeBannerToggleStatus);

let pendingHomeBannerImage = '';

homeBannerFile.addEventListener('change', async () => {
  const file = homeBannerFile.files[0];
  if (!file) {
    pendingHomeBannerImage = '';
    return;
  }
  const submitButton = homeBannerForm.querySelector('[type="submit"]');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    homeBannerFile.value = '';
    pendingHomeBannerImage = '';
    setFormMessage(homeBannerMessage, 'Pilih poster JPG, PNG, atau WebP.', true);
    return;
  }
  pendingHomeBannerImage = '';
  // Kunci tombol simpan sampai kompresi selesai agar poster lama tidak tersimpan
  // ketika pengguna menekan Simpan sebelum kompresi selesai.
  if (submitButton) submitButton.disabled = true;
  setFormMessage(homeBannerMessage, 'Mengompresi poster...');
  try {
    // Poster dikompresi ke 2,6 MB (batas server 3 MB). Sisi terpanjang dibatasi
    // 2000 px supaya poster A4 tetap tajam saat dicetak.
    const { dataUrl, sizeBytes } = await DriveLinkImages.compress(file, {
      maxBytes: 2600 * 1024,
      maxEdge: 2000,
      label: 'Poster',
    });
    pendingHomeBannerImage = dataUrl;
    showHomeBannerPreview(dataUrl, file.name);
    setFormMessage(homeBannerMessage, `Poster siap · ${Math.ceil(sizeBytes / 1024)} KB setelah kompresi`);
  } catch (error) {
    homeBannerFile.value = '';
    setFormMessage(homeBannerMessage, error.message, true);
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

homeBannerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (homeBannerFile.files.length && !pendingHomeBannerImage) {
    setFormMessage(homeBannerMessage, 'Tunggu sampai kompresi poster selesai.', true);
    return;
  }
  const image = homeBannerFile.files.length ? pendingHomeBannerImage : savedHomeBannerImage;
  try {
    const banner = await DriveLinkAPI.put('/api/admin/settings/home-banner', {
      enabled: homeBannerEnabled.checked,
      image,
    });
    homeBannerEnabled.checked = banner.enabled;
    updateHomeBannerToggleStatus();
    homeBannerFile.value = '';
    showHomeBannerPreview(banner.image);
    setFormMessage(homeBannerMessage, banner.enabled
      ? 'Poster tersimpan dan ditampilkan di beranda.'
      : 'Poster tersimpan dalam keadaan nonaktif.');
  } catch (error) {
    setFormMessage(homeBannerMessage, `Poster gagal disimpan: ${error.message}`, true);
  }
});

document.getElementById('removeHomeBanner').addEventListener('click', async () => {
  if (!window.confirm('Hapus poster beranda yang tersimpan?')) return;
  try {
    const banner = await DriveLinkAPI.put('/api/admin/settings/home-banner', {
      enabled: false,
      image: '',
    });
    homeBannerEnabled.checked = false;
    updateHomeBannerToggleStatus();
    homeBannerFile.value = '';
    showHomeBannerPreview(banner.image);
    setFormMessage(homeBannerMessage, 'Poster beranda berhasil dihapus.');
  } catch (error) {
    setFormMessage(homeBannerMessage, `Poster gagal dihapus: ${error.message}`, true);
  }
});

offerForm.addEventListener('input', updateOfferPreview);
offerForm.addEventListener('change', updateOfferPreview);
offerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(offerForm);
  try {
    const offer = await DriveLinkAPI.put('/api/admin/settings/offer', {
      enabled: form.has('enabled'),
      badge: String(form.get('badge') || ''),
      title: String(form.get('title') || ''),
      description: String(form.get('description') || ''),
      buttonLabel: String(form.get('buttonLabel') || ''),
      buttonUrl: String(form.get('buttonUrl') || ''),
    });
    offerForm.elements.enabled.checked = offer.enabled;
    offerForm.elements.badge.value = offer.badge;
    offerForm.elements.title.value = offer.title;
    offerForm.elements.description.value = offer.description;
    offerForm.elements.buttonLabel.value = offer.buttonLabel;
    offerForm.elements.buttonUrl.value = offer.buttonUrl;
    updateOfferPreview();
    setFormMessage(offerMessage, offer.enabled
      ? 'Iklan berhasil disimpan dan ditampilkan di beranda.'
      : 'Iklan disimpan dalam keadaan nonaktif.');
  } catch (error) {
    setFormMessage(offerMessage, `Iklan gagal disimpan: ${error.message}`, true);
  }
});

themeColor.addEventListener('input', () => previewTheme(themeColor.value));
document.querySelectorAll('.theme-swatch').forEach((swatch) => {
  swatch.style.setProperty('--swatch-color', swatch.dataset.themeColor);
  swatch.addEventListener('click', () => {
    themeColor.value = swatch.dataset.themeColor;
    previewTheme(themeColor.value, '#476eff', '135deg');
  });
});

document.querySelectorAll('.theme-combination').forEach((preset) => {
  const preview = preset.querySelector('.theme-combination-preview');
  preview.style.setProperty('--preset-start', preset.dataset.themePrimary);
  preview.style.setProperty('--preset-end', preset.dataset.themeEnd);
  preview.style.setProperty('--preset-angle', preset.dataset.themeAngle);
  preset.addEventListener('click', () => {
    themeColor.value = preset.dataset.themePrimary;
    previewTheme(preset.dataset.themePrimary, preset.dataset.themeEnd, preset.dataset.themeAngle);
  });
});

themeForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const theme = await DriveLinkAPI.put('/api/admin/settings/theme', {
      primary: themeColor.value,
      gradientEnd: themeGradientEnd,
      gradientAngle: themeGradientAngle,
    });
    themeColor.value = theme.primary;
    previewTheme(theme.primary, theme.gradientEnd, theme.gradientAngle);
    setFormMessage(themeMessage, 'Tema berhasil diterapkan ke seluruh halaman.');
  } catch (error) {
    setFormMessage(themeMessage, `Tema gagal disimpan: ${error.message}`, true);
  }
});

profileForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(profileForm);
  const newPassword = String(form.get('newPassword') || '');
  if (newPassword !== String(form.get('confirmPassword') || '')) {
    setFormMessage(profileMessage, 'Konfirmasi password baru tidak sama.', true);
    return;
  }
  try {
    const session = await DriveLinkAPI.put('/api/admin/settings/profile', {
      name: String(form.get('name') || '').trim(),
      username: String(form.get('username') || '').trim(),
      currentPassword: String(form.get('currentPassword') || ''),
      newPassword,
    });
    DriveLinkStorage.write('drivelink-session', session);
    document.getElementById('adminName').textContent = session.name;
    profileForm.elements.name.value = session.name;
    profileForm.elements.username.value = session.username;
    profileForm.elements.currentPassword.value = '';
    profileForm.elements.newPassword.value = '';
    profileForm.elements.confirmPassword.value = '';
    setFormMessage(profileMessage, 'Akun berhasil diperbarui. Sesi perangkat lain telah diakhiri.');
  } catch (error) {
    setFormMessage(profileMessage, `Akun gagal disimpan: ${error.message}`, true);
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

window.DriveLinkSessionReady?.then(async (session) => {
  if (!session || session.role !== 'admin') return;
  profileForm.elements.name.value = session.name;
  profileForm.elements.username.value = session.username;
  const results = await Promise.allSettled([
    DriveLinkAPI.get('/api/site-settings/theme'),
    DriveLinkAPI.get('/api/site-settings/offer'),
    DriveLinkAPI.get('/api/admin/settings/home-banner'),
    DriveLinkAPI.get('/api/admin/settings/logo'),
    DriveLinkAPI.get('/api/admin/settings/home-hero'),
    DriveLinkAPI.get('/api/admin/settings/contact'),
  ]);
  if (results[0].status === 'fulfilled') {
    themeColor.value = results[0].value.primary;
    previewTheme(
      results[0].value.primary,
      results[0].value.gradientEnd,
      results[0].value.gradientAngle,
    );
  } else {
    setFormMessage(themeMessage, `Tema gagal dimuat: ${results[0].reason.message}`, true);
  }
  if (results[1].status === 'fulfilled') {
    const offer = results[1].value;
    offerForm.elements.enabled.checked = Boolean(offer.enabled);
    offerForm.elements.badge.value = offer.badge || '';
    offerForm.elements.title.value = offer.title || '';
    offerForm.elements.description.value = offer.description || '';
    offerForm.elements.buttonLabel.value = offer.buttonLabel || '';
    offerForm.elements.buttonUrl.value = offer.buttonUrl || 'booking.html';
    updateOfferPreview();
  } else {
    setFormMessage(offerMessage, `Pengaturan iklan gagal dimuat: ${results[1].reason.message}`, true);
  }
  if (results[2].status === 'fulfilled') {
    homeBannerEnabled.checked = Boolean(results[2].value.enabled);
    updateHomeBannerToggleStatus();
    showHomeBannerPreview(results[2].value.image || '');
  } else {
    setFormMessage(homeBannerMessage, `Poster gagal dimuat: ${results[2].reason.message}`, true);
  }
  if (results[3].status === 'fulfilled') {
    savedLogoImage = results[3].value.image || '';
    showLogoPreview(savedLogoImage);
  } else {
    showLogoPreview('');
    setFormMessage(logoMessage, `Logo gagal dimuat: ${results[3].reason.message}`, true);
  }
  if (results[4].status === 'fulfilled') {
    const hero = results[4].value;
    homeHeroForm.elements.eyebrow.value = hero.eyebrow;
    homeHeroForm.elements.title.value = hero.title;
    homeHeroForm.elements.description.value = hero.description;
    homeHeroForm.elements.effect.value = hero.effect;
    updateHomeHeroPreview();
  } else {
    setFormMessage(homeHeroMessage, `Teks beranda gagal dimuat: ${results[4].reason.message}`, true);
  }
  if (results[5].status === 'fulfilled') {
    const contact = results[5].value;
    contactForm.elements.heading.value = contact.heading;
    contactForm.elements.phone.value = contact.phone;
    contactForm.elements.email.value = contact.email;
    contactForm.elements.whatsapp.value = contact.whatsapp;
    document.getElementById('socialLinkRows').replaceChildren();
    contact.socialLinks.forEach((link) => addSocialRow(link));
    updateSocialPreview(contact.socialLinks);
  } else {
    setFormMessage(contactMessage, `Kontak gagal dimuat: ${results[5].reason.message}`, true);
  }
});
