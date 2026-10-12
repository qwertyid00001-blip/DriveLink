function publicCurrency(value) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function publicDate(value) {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${value}T00:00:00Z`));
}

function appendOfferList(card, rows) {
  const list = document.createElement('ul');
  rows.forEach((text) => {
    const item = document.createElement('li');
    item.textContent = text;
    list.append(item);
  });
  card.append(list);
}

async function renderPublicOffers() {
  const status = document.getElementById('pricingLoadMessage');
  try {
    const [offers, fleet] = await Promise.all([
      DriveLinkAPI.get('/api/travel-offers'),
      DriveLinkAPI.get('/api/fleet'),
    ]);
    const packagesGrid = document.getElementById('publicTravelPackages');
    offers.packages.forEach((item, index) => {
      const card = document.createElement('article');
      card.className = `price-card${index === 1 ? ' featured-plan' : ''}`;
      const title = document.createElement('h3');
      title.textContent = item.name;
      const eligible = fleet.filter((vehicle) => item.categories.includes(vehicle.category));
      const lowestPrice = eligible.length
        ? Math.min(...eligible.map((vehicle) => Number(vehicle.priceNoDriver)))
        : 0;
      const price = document.createElement('div');
      price.className = 'price';
      price.textContent = lowestPrice ? `Mulai ${publicCurrency(lowestPrice)}` : 'Tarif sesuai unit';
      const interval = document.createElement('span');
      interval.textContent = '/hari';
      price.append(interval);
      const description = document.createElement('p');
      description.textContent = item.description || 'Paket perjalanan DriveLink.';
      const features = [
        `Kategori kendaraan: ${item.categories.join(', ')}`,
        item.mealIncluded && 'Termasuk makan',
        item.mineralWaterIncluded && 'Termasuk air mineral',
      ].filter(Boolean);
      card.append(title, price, description);
      appendOfferList(card, features);
      const link = document.createElement('a');
      link.className = index === 1 ? 'btn btn-primary' : 'btn btn-secondary';
      link.href = `booking.html?${new URLSearchParams({ package: item.id })}`;
      link.textContent = 'Pilih paket';
      card.append(link);
      packagesGrid.append(card);
    });
    document.getElementById('publicPackagesEmpty').hidden = offers.packages.length > 0;

    const promotionsGrid = document.getElementById('publicTravelPromotions');
    offers.promotions.forEach((item) => {
      const card = document.createElement('article');
      card.className = 'price-card';
      const title = document.createElement('h3');
      title.textContent = item.name;
      const benefit = document.createElement('div');
      benefit.className = 'price';
      if (item.kind === 'discount_percent') benefit.textContent = `Diskon ${item.value}%`;
      else if (item.kind === 'discount_amount') benefit.textContent = `Diskon ${publicCurrency(item.value)}`;
      else benefit.textContent = `BBM gratis ${item.fuelDays} hari · Kredit ${publicCurrency(item.value)}/hari`;
      const description = document.createElement('p');
      description.textContent = item.description || 'Promo event DriveLink.';
      const applicable = document.createElement('p');
      applicable.className = 'pricing-note';
      applicable.textContent = item.packageIds.length
        ? `Paket tertentu · ${publicDate(item.startsAt)} – ${publicDate(item.endsAt)}`
        : `Berlaku untuk semua paket · ${publicDate(item.startsAt)} – ${publicDate(item.endsAt)}`;
      card.append(title, benefit, description, applicable);
      promotionsGrid.append(card);
    });
    document.getElementById('publicPromotionsEmpty').hidden = offers.promotions.length > 0;
  } catch (error) {
    status.textContent = `Informasi paket dan promo gagal dimuat: ${error.message}`;
    status.classList.add('is-error');
  }
}

renderPublicOffers();
