const yearElement = document.getElementById('year');
if (yearElement) yearElement.textContent = new Date().getFullYear();

const homeHeroTitle = document.getElementById('homeHeroTitle');
if (homeHeroTitle && window.DriveLinkAPI) {
  DriveLinkAPI.get('/api/site-settings/home-hero').then((hero) => {
    document.getElementById('homeHeroEyebrow').textContent = hero.eyebrow;
    document.getElementById('homeHeroDescription').textContent = hero.description;
    const track = document.createElement('span');
    track.className = 'home-hero-title-track';
    const copy = document.createElement('span');
    copy.className = 'home-hero-title-copy';
    copy.textContent = hero.title;
    track.append(copy);
    if (hero.effect === 'marquee') {
      const duplicate = copy.cloneNode(true);
      duplicate.setAttribute('aria-hidden', 'true');
      track.append(duplicate);
    }
    homeHeroTitle.dataset.effect = hero.effect;
    homeHeroTitle.replaceChildren(track);
  }).catch((error) => console.error('Teks utama beranda gagal dimuat dari server.', error));
}

const homePoster = document.getElementById('homePoster');
if (homePoster && window.DriveLinkAPI) {
  const dismissedPosterKey = 'drivelink-home-poster-dismissed';
  DriveLinkAPI.get('/api/site-settings/home-banner').then((banner) => {
    if (!banner.enabled || !banner.image) return;
    let dismissedAt = '';
    try {
      dismissedAt = localStorage.getItem(dismissedPosterKey) || '';
    } catch (error) {
      console.warn('Status tutup poster tidak dapat dibaca dari penyimpanan lokal.', error);
    }
    if (dismissedAt === banner.updatedAt) return;
    document.getElementById('homePosterImage').src = banner.image;
    homePoster.hidden = false;
    document.getElementById('homePosterDismiss').addEventListener('click', () => {
      homePoster.hidden = true;
      try {
        localStorage.setItem(dismissedPosterKey, banner.updatedAt);
      } catch (error) {
        console.warn('Status tutup poster tidak dapat disimpan di penyimpanan lokal.', error);
      }
    });
  }).catch((error) => console.error('Poster beranda gagal dimuat dari server.', error));
}

const homeOffer = document.getElementById('homeOffer');
if (homeOffer && window.DriveLinkAPI) {
  DriveLinkAPI.get('/api/site-settings/offer').then((offer) => {
    if (!offer.enabled) return;
    document.getElementById('homeOfferBadge').textContent = offer.badge;
    document.getElementById('homeOfferTitle').textContent = offer.title;
    document.getElementById('homeOfferDescription').textContent = offer.description;
    const link = document.getElementById('homeOfferLink');
    link.textContent = offer.buttonLabel;
    link.href = offer.buttonUrl;
    homeOffer.hidden = false;
  }).catch((error) => console.error('Penawaran beranda gagal dimuat dari server.', error));
}

const rentalLocationLink = document.getElementById('rentalLocationLink');
if (rentalLocationLink) {
  const mapHint = document.getElementById('rentalLocationMapHint');
  const footerLocation = document.getElementById('rentalFooterLocation');
  function renderRentalLocation(locationSettings) {
    const address = locationSettings?.address || 'Alamat belum diatur';
    const mapsUrl = locationSettings?.mapsUrl
      || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationSettings?.address || 'DriveLink rental mobil')}`;
    document.getElementById('rentalLocationAddress').textContent = address;
    rentalLocationLink.href = mapsUrl;
    rentalLocationLink.target = '_blank';
    rentalLocationLink.rel = 'noopener noreferrer';
    rentalLocationLink.setAttribute('aria-label', `Buka lokasi rental di Google Maps: ${address}`);
    mapHint.textContent = 'Buka di Google Maps ↗';
    if (footerLocation) {
      footerLocation.textContent = address;
      footerLocation.href = mapsUrl;
      footerLocation.target = '_blank';
      footerLocation.rel = 'noopener noreferrer';
    }
  }
  const cachedLocation = DriveLinkStorage.read('drivelink-location', null);
  renderRentalLocation(cachedLocation);
  if (window.DriveLinkAPI) {
    DriveLinkAPI.get('/api/location').then((location) => {
      renderRentalLocation(location);
      if (location) DriveLinkStorage.write('drivelink-location', location);
    }).catch((error) => console.error('Lokasi rental gagal dimuat dari server.', error));
  }
}

function cacheFleetMetadata(fleet) {
  DriveLinkStorage.write('drivelink-fleet', fleet.map(({ photos, ...vehicle }) => ({
    ...vehicle,
    photoCount: Array.isArray(photos) ? photos.length : Number(vehicle.photoCount) || 0,
  })));
}

function createVehicleCarousel(container, photos, vehicleName) {
  if (!Array.isArray(photos) || !photos.length) return;
  container.classList.add('vehicle-gallery');
  container.style.backgroundImage = 'none';
  container.replaceChildren();
  let index = 0;
  const image = document.createElement('img');
  image.className = 'vehicle-gallery-image';
  image.alt = vehicleName;
  const controls = document.createElement('div');
  controls.className = 'vehicle-gallery-controls';
  const previous = document.createElement('button');
  previous.type = 'button';
  previous.className = 'vehicle-gallery-arrow';
  previous.setAttribute('aria-label', `Foto ${vehicleName} sebelumnya`);
  previous.textContent = '‹';
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'vehicle-gallery-arrow';
  next.setAttribute('aria-label', `Foto ${vehicleName} berikutnya`);
  next.textContent = '›';
  const dots = document.createElement('div');
  dots.className = 'vehicle-gallery-dots';

  function showPhoto(nextIndex) {
    index = (nextIndex + photos.length) % photos.length;
    const photo = photos[index];
    image.classList.add('is-transitioning');
    window.setTimeout(() => {
      image.src = typeof photo === 'string' ? photo : photo.dataUrl;
      image.alt = `${vehicleName} — ${typeof photo === 'object' && photo.name ? photo.name : `foto ${index + 1}`}`;
      image.classList.remove('is-transitioning');
    }, 120);
    [...dots.children].forEach((dot, dotIndex) => {
      dot.classList.toggle('is-active', dotIndex === index);
      dot.setAttribute('aria-current', dotIndex === index ? 'true' : 'false');
    });
  }

  photos.forEach((photo, photoIndex) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'vehicle-gallery-dot';
    dot.setAttribute('aria-label', `Tampilkan foto ${photoIndex + 1} dari ${photos.length} — ${vehicleName}`);
    dot.addEventListener('click', () => showPhoto(photoIndex));
    dots.append(dot);
  });
  previous.addEventListener('click', () => showPhoto(index - 1));
  next.addEventListener('click', () => showPhoto(index + 1));
  controls.append(previous, dots, next);
  container.append(image, controls);
  showPhoto(0);

  if (photos.length > 1 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    let timer;
    const start = () => {
      window.clearInterval(timer);
      timer = window.setInterval(() => showPhoto(index + 1), 4000);
    };
    container.addEventListener('mouseenter', () => window.clearInterval(timer));
    container.addEventListener('mouseleave', start);
    container.addEventListener('focusin', () => window.clearInterval(timer));
    container.addEventListener('focusout', start);
    start();
  }
}

function appendPublicVehicleSpecs(details, vehicle) {
  details.querySelector('.fleet-public-specs')?.remove();
  const specs = document.createElement('div');
  specs.className = 'fleet-public-specs';
  const availableColors = (vehicle.colors || []).filter((item) => Number(item.availableCount) > 0);

  function appendSpecRow(label, entries, fallback) {
    const row = document.createElement('div');
    row.className = 'fleet-public-spec-row';
    const heading = document.createElement('span');
    heading.className = 'fleet-public-spec-label';
    heading.textContent = label;
    const values = document.createElement('div');
    values.className = 'fleet-public-spec-values';
    if (entries.length) {
      entries.forEach((entry) => {
        const chip = document.createElement('span');
        chip.className = 'fleet-public-spec-chip';
        chip.textContent = entry;
        values.append(chip);
      });
    } else {
      const empty = document.createElement('span');
      empty.className = 'fleet-public-spec-empty';
      empty.textContent = fallback;
      values.append(empty);
    }
    row.append(heading, values);
    specs.append(row);
  }

  appendSpecRow(
    'Kapasitas',
    Number(vehicle.seats) > 0 ? [`${Number(vehicle.seats)} orang`] : [],
    'Belum diinformasikan',
  );
  appendSpecRow(
    'Warna tersedia',
    availableColors.map((item) => `${item.name} · ${item.availableCount} unit`),
    (vehicle.colors || []).length ? 'Sedang tidak tersedia' : 'Belum ada warna yang didaftarkan',
  );
  const transmissionOptions = availableColors.flatMap((item) => (item.transmissions || [])
    .filter((option) => Number(option.availableCount) > 0)
    .map((option) => `${item.name}: ${option.name} · ${option.availableCount} unit`));
  appendSpecRow(
    'Transmisi',
    transmissionOptions,
    availableColors.length
      ? 'Belum ada informasi transmisi untuk unit yang tersedia'
      : (vehicle.colors || []).length
        ? 'Informasi transmisi tampil saat unit tersedia'
        : 'Informasi tampil setelah unit didaftarkan',
  );
  if (availableColors.length) {
    const note = document.createElement('p');
    note.className = 'fleet-public-spec-note';
    note.textContent = 'Transmisi mengikuti unit dengan warna yang dipilih saat booking.';
    specs.append(note);
  }
  details.append(specs);
}

function renderPublicFleet(publicFleet) {
  document.querySelectorAll('[data-fleet-price]').forEach((priceLabel) => {
    const vehicle = publicFleet.find((item) => item.name === priceLabel.dataset.fleetName);
    if (!vehicle) return;
    const price = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(vehicle.priceNoDriver) || 0);
    priceLabel.textContent = `${price} / hari · ${Number(vehicle.availableCount) || 0} tersedia`;
  });
  const fleetGrid = document.getElementById('publicFleetGrid');
  const shownCards = [...document.querySelectorAll('.car-card')];
  shownCards.forEach((card) => {
    const name = card.querySelector('.car-details h3')?.textContent;
    const vehicle = publicFleet.find((item) => item.name === name);
    if (!vehicle) {
      card.remove();
      return;
    }
    const image = card.querySelector('.image-wrap');
    if (image && vehicle.photos?.length) createVehicleCarousel(image, vehicle.photos, vehicle.name);
    const details = card.querySelector('.car-details');
    if (details) appendPublicVehicleSpecs(details, vehicle);
  });
  if (!fleetGrid) return;
  const shownNames = new Set([...fleetGrid.querySelectorAll('.car-card .car-details h3')]
    .map((heading) => heading.textContent));
  publicFleet.filter((vehicle) => !shownNames.has(vehicle.name)).forEach((vehicle) => {
    const card = document.createElement('article');
    card.className = 'car-card';
    const art = document.createElement('div');
    art.className = 'image-wrap image-1';
    createVehicleCarousel(art, vehicle.photos, vehicle.name);
    const details = document.createElement('div');
    details.className = 'car-details';
    const topline = document.createElement('div');
    topline.className = 'card-topline';
    const name = document.createElement('h3');
    name.textContent = vehicle.name;
    const price = document.createElement('span');
    price.textContent = `${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(vehicle.priceNoDriver) || 0)} / hari`;
    topline.append(name, price);
    const availability = document.createElement('p');
    availability.textContent = `${Number(vehicle.availableCount) || 0} unit tersedia`;
    details.append(topline, availability);
    appendPublicVehicleSpecs(details, vehicle);
    if (Number(vehicle.availableCount) > 0) {
      const bookingLink = document.createElement('a');
      bookingLink.className = 'text-link';
      bookingLink.href = `booking.html?${new URLSearchParams({ car: vehicle.name })}`;
      bookingLink.textContent = 'Pesan mobil →';
      details.append(bookingLink);
    } else {
      const unavailable = document.createElement('span');
      unavailable.className = 'admin-muted';
      unavailable.textContent = 'Unit tidak tersedia';
      details.append(unavailable);
    }
    card.append(art, details);
    fleetGrid.append(card);
  });
}

if (window.DriveLinkAPI) {
  DriveLinkAPI.get('/api/fleet').then((publicFleet) => {
    cacheFleetMetadata(publicFleet);
    renderPublicFleet(publicFleet);
  }).catch((error) => {
    const target = document.getElementById('publicFleetGrid') || document.querySelector('[data-fleet-price]')?.closest('section');
    if (target) {
      const notice = document.createElement('p');
      notice.className = 'workflow-message is-error';
      notice.textContent = `Data armada tidak dapat dimuat: ${error.message}`;
      target.prepend(notice);
    }
  });
} else {
  const publicFleet = DriveLinkStorage.read('drivelink-fleet', null);
  if (Array.isArray(publicFleet)) renderPublicFleet(publicFleet);
}

const bookingForm = document.getElementById('bookingForm');

if (bookingForm) {
  const arrivalInput = bookingForm.querySelector('[name="arrivalAt"]');
  const arrivalField = document.getElementById('arrivalScheduleField');
  const arrivalHeading = document.getElementById('arrivalScheduleHeading');
  function localDateTimeValue(timestamp) {
    const localDate = new Date(timestamp - new Date().getTimezoneOffset() * 60000);
    return localDate.toISOString().slice(0, 16);
  }
  // Aturan jenis pemesanan diisi oleh assets/js/booking-types.js. Halaman seperti
// beranda dan daftar armada memakai script.js tanpa modul itu, jadi nilainya
// dibaca secara aman dan jatuh ke perilaku bawaan bila modul belum termuat.
function knownBookingTypes() {
  return Array.isArray(window.bookingTypeRules) ? window.bookingTypeRules : [];
}

function updateArrivalSchedule() {
    const selected = bookingForm.querySelector('[name="bookingType"]:checked');
    const label = selected?.value || 'Reservasi';
    const rule = knownBookingTypes().find((type) => type.label === label) || null;
    const requiresFuture = rule ? Boolean(rule.requiresFutureArrival) : label === 'Reservasi';
    if (arrivalField) arrivalField.hidden = !requiresFuture;
    if (arrivalHeading) arrivalHeading.hidden = !requiresFuture;
    if (arrivalInput) {
      arrivalInput.required = requiresFuture;
      if (requiresFuture) {
        arrivalInput.min = localDateTimeValue(Date.now() + 60000);
        if (!arrivalInput.value || new Date(arrivalInput.value).getTime() <= Date.now()) {
          arrivalInput.value = arrivalInput.min;
        }
      } else {
        arrivalInput.removeAttribute('min');
        arrivalInput.value = localDateTimeValue(Date.now());
      }
    }
  }
  updateArrivalSchedule();
  const initialFleet = [
    { name: 'Avanza Smart', category: 'MPV', totalCount: 5, availableCount: 5, priceNoDriver: 420000, priceWithDriverFuel: 420000, priceWithDriverNoFuel: 420000 },
    { name: 'BR-V Family', category: 'SUV', totalCount: 5, availableCount: 5, priceNoDriver: 520000, priceWithDriverFuel: 520000, priceWithDriverNoFuel: 520000 },
    { name: 'EV CityX', category: 'Electric', totalCount: 5, availableCount: 5, priceNoDriver: 680000, priceWithDriverFuel: 680000, priceWithDriverNoFuel: 680000 },
  ];
  let fleet = DriveLinkStorage.read('drivelink-fleet', null);
  let fleetLoaded = false;
  if (!Array.isArray(fleet)) {
    fleet = initialFleet;
    DriveLinkStorage.write('drivelink-fleet', fleet);
  }
  const carSelect = bookingForm.elements.carType;
  const colorSelect = bookingForm.elements.vehicleColor;
  const packageSelect = bookingForm.elements.packageId;
  const promotionSelect = bookingForm.elements.promotionId;
  const driverFuelOptions = document.getElementById('driverFuelOptions');
  let travelOffers = { packages: [], promotions: [] };
  const selectedCar = new URLSearchParams(window.location.search).get('car');
  const selectedPackageId = new URLSearchParams(window.location.search).get('package');
  const availableVehicles = fleet.filter((vehicle) => Number(vehicle.availableCount) > 0);
  carSelect.replaceChildren(...availableVehicles.map((vehicle) => {
    const option = document.createElement('option');
    option.value = vehicle.name;
    option.textContent = `${vehicle.name} · ${vehicle.availableCount} tersedia`;
    return option;
  }));
  if (availableVehicles.some((vehicle) => vehicle.name === selectedCar)) carSelect.value = selectedCar;

  function renderVehicleColors() {
    if (!colorSelect) return;
    const vehicle = fleet.find((item) => item.name === carSelect.value);
    const colors = (vehicle?.colors || []).filter((item) => Number(item.availableCount) > 0);
    const field = document.getElementById('bookingColorField');
    const availability = document.getElementById('bookingColorAvailability');
    field.hidden = !vehicle;
    colorSelect.required = colors.length > 0;
    colorSelect.disabled = !colors.length;
    const previous = colorSelect.value;
    colorSelect.replaceChildren(new Option(
      colors.length ? 'Pilih warna kendaraan' : 'Warna belum tersedia',
      '',
    ));
    colors.forEach((item) => colorSelect.add(new Option(`${item.name} · ${item.availableCount} unit tersedia`, item.name)));
    if (colors.some((item) => item.name === previous)) colorSelect.value = previous;
    else if (colors.length === 1) colorSelect.value = colors[0].name;
    const selectedColor = colors.find((item) => item.name === colorSelect.value);
    const availableTransmissions = (selectedColor?.transmissions || [])
      .filter((item) => Number(item.availableCount) > 0)
      .map((item) => `${item.name} (${item.availableCount})`);
    availability.textContent = !colors.length
      ? 'Admin belum mendaftarkan unit berplat dan warna untuk model ini; warna akan dikonfirmasi petugas.'
      : selectedColor && availableTransmissions.length
        ? `Transmisi yang tersedia untuk warna ${selectedColor.name}: ${availableTransmissions.join(', ')}.`
        : selectedColor
          ? `Jenis transmisi untuk warna ${selectedColor.name} belum didaftarkan.`
          : `Warna tersedia untuk ${vehicle.name}; transmisi mengikuti unit berplat yang dipilih admin.`;
  }

  function updatePackageOptions() {
    if (!packageSelect) return;
    const vehicle = fleet.find((item) => item.name === carSelect.value);
    const previous = packageSelect.value;
    const compatible = travelOffers.packages.filter((item) => item.categories.includes(vehicle?.category));
    packageSelect.replaceChildren(new Option('Tanpa paket', ''));
    compatible.forEach((item) => packageSelect.add(new Option(item.name, item.id)));
    if (compatible.some((item) => item.id === previous)) packageSelect.value = previous;
    const selectedPackage = compatible.find((item) => item.id === packageSelect.value);
    const details = document.getElementById('bookingPackageDetails');
    if (!compatible.length) {
      details.textContent = 'Belum ada paket aktif untuk kategori kendaraan ini.';
    } else if (selectedPackage) {
      const included = [
        selectedPackage.mealIncluded && 'makan',
        selectedPackage.mineralWaterIncluded && 'air mineral',
      ].filter(Boolean);
      details.textContent = `${selectedPackage.description || selectedPackage.categories.join(', ')}${included.length ? ` · Termasuk ${included.join(' dan ')}` : ''}`;
    } else {
      details.textContent = 'Tarif mengikuti unit dan layanan yang dipilih.';
    }
  }

  function updatePromotionOptions() {
    if (!promotionSelect) return;
    const selectedPackage = packageSelect.value;
    const arrivalDate = arrivalInput.value
      ? new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date(arrivalInput.value))
      : '';
    const withDriver = bookingForm.elements.driverOption?.value === 'Pakai driver';
    const fuelPackage = bookingForm.elements.fuelPackage?.value || 'Termasuk BBM';
    const previous = promotionSelect.value;
    const compatible = travelOffers.promotions.filter((item) => (
      item.active && arrivalDate && item.startsAt <= arrivalDate && item.endsAt >= arrivalDate
      && (!item.packageIds.length || selectedPackage && item.packageIds.includes(selectedPackage))
      && (item.kind !== 'free_fuel' || withDriver && fuelPackage === 'Belum termasuk BBM')
    ));
    promotionSelect.replaceChildren(new Option('Tanpa promo', ''));
    compatible.forEach((item) => {
      const benefit = item.kind === 'discount_percent' ? `Diskon ${item.value}%`
        : item.kind === 'discount_amount' ? `Diskon ${formatCurrency(item.value)}`
          : `BBM gratis ${item.fuelDays} hari`;
      promotionSelect.add(new Option(`${item.name} · ${benefit}`, item.id));
    });
    if (compatible.some((item) => item.id === previous)) promotionSelect.value = previous;
    document.getElementById('bookingPromotionDetails').textContent = compatible.length
      ? 'Promo yang tersedia mengikuti tanggal, paket, dan layanan rental.'
      : 'Tidak ada promo aktif yang cocok untuk tanggal, paket, dan layanan ini.';
  }

  function updatePriceQuote() {
    if (!window.DriveLinkAPI) {
      const currentFleet = DriveLinkStorage.read('drivelink-fleet', []);
      if (Array.isArray(currentFleet)) fleet = currentFleet;
    }
    renderVehicleColors();
    updatePackageOptions();
    updatePromotionOptions();
    const vehicle = fleet.find((item) => item.name === carSelect.value);
    const quote = document.getElementById('bookingPriceQuote');
    if (vehicle && Number(vehicle.availableCount) < 1) {
      if (quote) quote.textContent = 'Unit ini baru saja habis dibooking. Pilih unit lain yang tersedia.';
      return null;
    }
    if (vehicle?.colors?.length && !colorSelect?.value) {
      if (quote) quote.textContent = 'Pilih warna kendaraan yang tersedia untuk melanjutkan.';
      return null;
    }
    const duration = String(bookingForm.elements.duration.value);
    const days = duration === '1 bulan' ? 30 : Number.parseInt(duration, 10);
    const withDriver = bookingForm.elements.driverOption?.value === 'Pakai driver';
    const fuelPackage = bookingForm.elements.fuelPackage?.value || 'Termasuk BBM';
    const rate = Number(withDriver
      ? fuelPackage === 'Termasuk BBM'
        ? vehicle?.priceWithDriverFuel ?? vehicle?.priceWithDriver
        : vehicle?.priceWithDriverNoFuel ?? vehicle?.priceWithDriver
      : vehicle?.priceNoDriver);
    if (!vehicle || !Number.isFinite(rate) || rate < 1000) {
      if (quote) quote.textContent = 'Tarif unit belum tersedia. Hubungi admin.';
      return null;
    }
    const baseTotal = rate * days;
    const selectedPromotion = travelOffers.promotions.find((item) => item.id === (promotionSelect?.value || ''));
    let discountAmount = 0;
    if (selectedPromotion?.kind === 'discount_percent') discountAmount = Math.floor(baseTotal * selectedPromotion.value / 100);
    if (selectedPromotion?.kind === 'discount_amount') discountAmount = Math.min(baseTotal, selectedPromotion.value);
    if (selectedPromotion?.kind === 'free_fuel') {
      discountAmount = Math.min(baseTotal, selectedPromotion.value * Math.min(days, selectedPromotion.fuelDays));
    }
    const total = Math.max(0, baseTotal - discountAmount);
    const service = withDriver ? `Dengan driver (${fuelPackage.toLowerCase()})` : 'Lepas kunci';
    const packageName = travelOffers.packages.find((item) => item.id === (packageSelect?.value || ''))?.name;
    const promoText = discountAmount ? ` · Diskon ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(discountAmount)}` : '';
    if (quote) quote.textContent = `${service}${packageName ? ` · ${packageName}` : ''}: ${formatCurrency(rate)} / hari · Estimasi ${formatCurrency(total)}${promoText}`;
    return { rate, baseTotal, discountAmount, total };
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value) || 0);
  }

  const fleetReady = DriveLinkAPI.get('/api/fleet').then((serverFleet) => {
    fleet = serverFleet;
    fleetLoaded = true;
    cacheFleetMetadata(serverFleet);
    const available = serverFleet.filter((vehicle) => Number(vehicle.availableCount) > 0);
    carSelect.replaceChildren(...available.map((vehicle) => {
      const option = document.createElement('option');
      option.value = vehicle.name;
      option.textContent = `${vehicle.name} · ${vehicle.availableCount} tersedia`;
      return option;
    }));
    if (available.some((vehicle) => vehicle.name === selectedCar)) carSelect.value = selectedCar;
    renderVehicleColors();
    updatePriceQuote();
  }).catch((error) => {
    const message = document.getElementById('bookingSubmitMessage');
    if (message) {
      message.textContent = `Tidak dapat memuat armada dari server: ${error.message}`;
      message.classList.add('is-error');
    }
  });
  const offersReady = DriveLinkAPI.get('/api/travel-offers').then((offers) => {
    travelOffers = offers;
    updatePackageOptions();
    if (packageSelect && travelOffers.packages.some((item) => item.id === selectedPackageId
      && item.categories.includes(fleet.find((vehicle) => vehicle.name === carSelect.value)?.category))) {
      packageSelect.value = selectedPackageId;
    }
    updatePriceQuote();
  }).catch((error) => {
    const message = document.getElementById('bookingSubmitMessage');
    if (message) {
      message.textContent = `Paket dan promo tidak dapat dimuat dari server: ${error.message}`;
      message.classList.add('is-error');
    }
  });

  bookingForm.querySelectorAll('[name="carType"], [name="vehicleColor"], [name="duration"], [name="driverOption"], [name="arrivalAt"]').forEach((field) => {
    field.addEventListener('change', updatePriceQuote);
  });
  bookingForm.querySelectorAll('[name="fuelPackage"], [name="packageId"], [name="promotionId"]').forEach((field) => {
    field.addEventListener('change', updatePriceQuote);
  });
  function updateFuelPackageVisibility() {
    const withDriver = bookingForm.elements.driverOption?.value === 'Pakai driver';
    if (driverFuelOptions) driverFuelOptions.hidden = !withDriver;
    bookingForm.querySelectorAll('[name="fuelPackage"]').forEach((field) => {
      field.required = withDriver;
    });
    updatePriceQuote();
  }
  bookingForm.querySelectorAll('[name="driverOption"]').forEach((field) => {
    field.addEventListener('change', updateFuelPackageVisibility);
  });
  updateFuelPackageVisibility();
  updatePriceQuote();

  function readImageFile(file) {
    // Dokumen pelanggan dikompresi ke 360 KB (batas server 400 KB).
    return DriveLinkImages.compress(file, {
      maxBytes: 360 * 1024,
      maxEdge: 1600,
      label: 'Dokumen',
    }).then(({ dataUrl }) => dataUrl);
  }

  bookingForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await fleetReady;
    await offersReady;
    const rentalPolicy = await window.DriveLinkRentalPolicyReady;
    if (!rentalPolicy) {
      const message = document.getElementById('bookingSubmitMessage');
      if (message) {
        message.textContent = 'Ketentuan deposit gagal dimuat. Muat ulang halaman sebelum mengirim booking.';
        message.classList.add('is-error');
      }
      return;
    }
    if (!fleetLoaded) return;

    const bookingType = bookingForm.elements.bookingType?.value || 'Reservasi';
    if (bookingType === 'Sewa langsung hari ini' && arrivalInput) {
      arrivalInput.value = localDateTimeValue(Date.now());
    }
    const formData = new FormData(bookingForm);
    const createdAt = new Date().toISOString();
    const price = updatePriceQuote();
    if (!price) {
      return;
    }
    const message = document.getElementById('bookingSubmitMessage');
    const arrivalAt = String(formData.get('arrivalAt') || '');
    const arrivalTime = new Date(arrivalAt);
    const selectedTypeRule = knownBookingTypes()
      .find((type) => type.label === bookingType) || null;
    const arrivalMustBeFuture = selectedTypeRule
      ? Boolean(selectedTypeRule.requiresFutureArrival)
      : bookingType === 'Reservasi';
    if (!arrivalAt || Number.isNaN(arrivalTime.getTime())
      || (arrivalMustBeFuture && arrivalTime.getTime() <= Date.now())) {
      if (message) {
        message.textContent = arrivalMustBeFuture
          ? 'Pilih tanggal dan waktu kedatangan yang masih akan datang.'
          : 'Pilih tanggal dan waktu kedatangan yang valid.';
        message.classList.add('is-error');
      }
      return;
    }
    if (!bookingForm.querySelector('[name="identityType"]')) {
      const draft = Object.fromEntries(['name', 'email', 'phone', 'carType', 'duration', 'arrivalAt', 'bookingType']
        .map((name) => [name, formData.get(name)]));
      try {
        sessionStorage.setItem('drivelink-booking-draft', JSON.stringify(draft));
      } catch (error) {
        console.error('Tidak dapat menyimpan jadwal booking sementara.', error);
        if (message) {
          message.textContent = 'Data reservasi sementara tidak dapat disimpan. Coba lagi atau lanjutkan melalui halaman booking.';
          message.classList.add('is-error');
        }
        return;
      }
      window.location.href = 'booking.html';
      return;
    }
    const usesPassport = formData.get('identityType') === 'Paspor';
    const residencyType = String(formData.get('residencyType') || '');
    const isOutOfTown = residencyType === 'Dari luar kota';
    const residencyDays = Number(formData.get('residencyDays'));
    if (isOutOfTown && (!Number.isInteger(residencyDays) || residencyDays < 1 || residencyDays > 365)) {
      message.textContent = 'Masukkan lama menetap di kota ini antara 1 sampai 365 hari.';
      message.classList.add('is-error');
      return;
    }
    const imageFields = ['ktp', 'simA', 'passport', 'ticket', 'hotel', 'selfie'];
    const documents = {
      identityType: formData.get('identityType'),
      residencyType,
      residencyDays: isOutOfTown ? residencyDays : null,
    };
    try {
      for (const fieldName of imageFields) {
        const file = formData.get(fieldName);
        if (file instanceof File && file.size > 0) {
          documents[fieldName] = await readImageFile(file);
          const status = document.querySelector(`[data-file-for="${fieldName}"]`);
          if (status) status.textContent = `${file.name} · dikompresi ${Math.ceil(documents[fieldName].sizeBytes / 1024)} KB`;
        }
      }
    } catch (error) {
      message.textContent = error.message;
      message.classList.add('is-error');
      return;
    }
    const booking = {
      name: formData.get('name'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      address: formData.get('address'),
      bookingType,
      arrivalAt: arrivalTime.toISOString(),
      carType: formData.get('carType'),
      vehicleColor: formData.get('vehicleColor') || '',
      duration: formData.get('duration'),
      driverOption: formData.get('driverOption'),
      fuelPackage: formData.get('driverOption') === 'Pakai driver' ? formData.get('fuelPackage') : '',
      ratePerDay: price.rate,
      estimatedTotal: price.total,
      packageId: formData.get('packageId'),
      promotionId: formData.get('promotionId'),
      deposit: formData.get('deposit'),
      collateralItems: typeof readSelectedCollateral === 'function' ? readSelectedCollateral() : [],
      travelType: residencyType,
      documents,
      status: 'Booking',
      bookingApproval: 'Menunggu persetujuan',
      paymentStatus: 'Belum dipilih',
      handoverStatus: 'Belum dimulai',
      statusHistory: [{ status: 'Booking', at: createdAt }],
      createdAt,
    };
    try {
      const createdBooking = await DriveLinkAPI.post('/api/bookings', booking);
      sessionStorage.removeItem('drivelink-booking-draft');
      try {
        localStorage.setItem('drivelink-last-booking-id', createdBooking.id);
      } catch (error) {
        console.error('Tidak dapat menyimpan ID booking untuk pencarian pesanan.', error);
      }
      window.location.href = `payment.html?id=${encodeURIComponent(createdBooking.id)}&phone=${encodeURIComponent(formData.get('phone'))}`;
    } catch (error) {
      message.textContent = `Booking gagal dikirim ke server: ${error.message}`;
      message.classList.add('is-error');
    }
  });
}
