const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const test = require('node:test');
const { createApp } = require('../server');

const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/s0cAAAAASUVORK5CYII=';

test('existing admin database is migrated for employee accounts', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'drivelink-legacy-'));
  const databasePath = path.join(directory, 'legacy.sqlite');
  const legacyDb = new DatabaseSync(databasePath);
  legacyDb.exec(`
    CREATE TABLE admins (username TEXT PRIMARY KEY, password_hash TEXT NOT NULL, name TEXT NOT NULL);
    CREATE TABLE fleet (
      id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE, total_count INTEGER NOT NULL,
      available_count INTEGER NOT NULL, price_no_driver INTEGER NOT NULL,
      price_driver_fuel INTEGER NOT NULL, price_driver_no_fuel INTEGER NOT NULL
    );
  `);
  const salt = 'legacy-admin-salt';
  const hash = crypto.scryptSync('legacy-admin-password', salt, 64).toString('hex');
  legacyDb.prepare('INSERT INTO admins (username, password_hash, name) VALUES (?, ?, ?)')
    .run('admin', `${salt}:${hash}`, 'Admin DriveLink');
  const insertFleet = legacyDb.prepare('INSERT INTO fleet VALUES (?, ?, 2, 2, 100000, 120000, 110000)');
  insertFleet.run('avanza-smart', 'Avanza Smart');
  insertFleet.run('br-v-family', 'BR-V Family');
  insertFleet.run('ev-cityx', 'EV CityX');
  legacyDb.close();

  const app = createApp({
    databasePath,
    adminUsername: 'admin',
    adminPassword: 'legacy-admin-password',
    sessionSecret: 'legacy-test-session-secret-long-enough',
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  t.after(() => {
    server.close();
    app.locals.db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'legacy-admin-password' }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const accounts = await fetch(`${baseUrl}/api/admin/accounts`, { headers: { cookie } });
  assert.equal(accounts.status, 200);
  assert.equal((await accounts.json())[0].role, 'admin');
  const fleet = await (await fetch(`${baseUrl}/api/fleet`)).json();
  assert.equal(fleet.find((vehicle) => vehicle.name === 'Avanza Smart').category, 'MPV');
  assert.equal(fleet.find((vehicle) => vehicle.name === 'BR-V Family').category, 'SUV');
  assert.equal(fleet.find((vehicle) => vehicle.name === 'EV CityX').category, 'Electric');

  app.locals.db.prepare(`
    INSERT INTO admins
      (username, password_hash, name, role, email, permissions_json)
    VALUES (?, ?, ?, 'employee', ?, ?)
  `).run('petugaslama', `${salt}:${hash}`, 'Petugas Lama', 'petugaslama@example.com', '["handover"]');
  app.locals.db.prepare("DELETE FROM settings WHERE key = 'employee-checklist-permissions-v1'").run();
  app.locals.db.prepare("DELETE FROM settings WHERE key = 'employee-rental-archive-permissions-v1'").run();
  const migratedApp = createApp({
    databasePath,
    adminUsername: 'admin',
    adminPassword: 'legacy-admin-password',
    sessionSecret: 'legacy-test-session-secret-long-enough',
  });
  assert.deepEqual(
    JSON.parse(migratedApp.locals.db.prepare('SELECT permissions_json FROM admins WHERE username = ?').get('petugaslama').permissions_json),
    ['handover', 'return', 'checklist', 'handover-archive', 'rental-archive'],
  );
  migratedApp.locals.db.prepare('UPDATE admins SET permissions_json = ? WHERE username = ?')
    .run(JSON.stringify(['handover', 'return']), 'petugaslama');
  const restartedApp = createApp({
    databasePath,
    adminUsername: 'admin',
    adminPassword: 'legacy-admin-password',
    sessionSecret: 'legacy-test-session-secret-long-enough',
  });
  assert.deepEqual(
    JSON.parse(restartedApp.locals.db.prepare('SELECT permissions_json FROM admins WHERE username = ?').get('petugaslama').permissions_json),
    ['handover', 'return'],
  );
  restartedApp.locals.db.close();
  migratedApp.locals.db.close();
});

test('rental deposit policy is configurable and enforced for customer bookings', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'drivelink-policy-'));
  const app = createApp({
    databasePath: path.join(directory, 'policy.sqlite'),
    adminUsername: 'admin',
    adminPassword: 'a-long-test-password',
    sessionSecret: 'a-test-session-secret-that-is-long-enough',
  });

  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  t.after(() => {
    server.close();
    app.locals.db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const defaultPolicy = await (await fetch(`${baseUrl}/api/site-settings/rental-policy`)).json();
  assert.deepEqual(defaultPolicy.collateralItems, ['Motor', 'KTP']);
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'a-long-test-password' }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const policy = {
    depositOptions: [{ label: 'Jaminan KTP', description: 'KTP asli dititipkan selama masa sewa.' }],
    collateralItems: ['KTP', 'SIM A'],
  };
  const savePolicy = await fetch(`${baseUrl}/api/admin/rental-policy`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(policy),
  });
  assert.equal(savePolicy.status, 200);
  assert.deepEqual(await (await fetch(`${baseUrl}/api/site-settings/rental-policy`)).json(), policy);

  const bookingInput = {
    name: 'Pelanggan Policy',
    email: 'policy@example.com',
    phone: '081234567891',
    address: 'Jakarta',
    carType: 'Avanza Smart',
    duration: '1 hari',
    bookingType: 'Reservasi',
    arrivalAt: new Date(Date.now() + 86400000).toISOString(),
    driverOption: 'Lepas kunci',
    deposit: 'Jaminan KTP',
    documents: { identityType: 'KTP', ktp: image, simA: image, selfie: { dataUrl: image } },
  };
  const acceptedBooking = await fetch(`${baseUrl}/api/bookings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(bookingInput),
  });
  assert.equal(acceptedBooking.status, 201);
  assert.equal((await acceptedBooking.json()).deposit, 'Jaminan KTP');
  const rejectedBooking = await fetch(`${baseUrl}/api/bookings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...bookingInput, deposit: 'Deposit lama yang sudah dinonaktifkan' }),
  });
  assert.equal(rejectedBooking.status, 400);
});

test('Rp1.000.000 deposit and rental payments require separate admin verification', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'drivelink-staged-payment-'));
  const app = createApp({
    databasePath: path.join(directory, 'staged-payment.sqlite'),
    adminUsername: 'admin',
    adminPassword: 'a-long-test-password',
    sessionSecret: 'a-test-session-secret-that-is-long-enough',
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  t.after(() => {
    server.close();
    app.locals.db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const bookingResponse = await fetch(`${baseUrl}/api/bookings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Pelanggan Deposit',
      email: 'deposit@example.com',
      phone: '081234567891',
      address: 'Jakarta',
      carType: 'Avanza Smart',
      duration: '1 hari',
      bookingType: 'Reservasi',
      arrivalAt: new Date(Date.now() + 86400000).toISOString(),
      driverOption: 'Lepas kunci',
      documents: { identityType: 'KTP', ktp: image, simA: image, selfie: { dataUrl: image } },
    }),
  });
  assert.equal(bookingResponse.status, 201);
  const booking = await bookingResponse.json();
  assert.equal(booking.depositAmount, 1_000_000);
  assert.equal(booking.depositPaymentRequired, true);
  assert.equal(booking.depositPaymentStatus, 'Belum dibayar');

  const customerPayment = (stage, method = 'QRIS', proof = image) => fetch(`${baseUrl}/api/bookings/${booking.id}/payment`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: booking.phone, stage, method, proof }),
  });
  assert.equal((await customerPayment('deposit')).status, 409);

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'a-long-test-password' }),
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const adminHeaders = { 'content-type': 'application/json', cookie };
  assert.equal((await fetch(`${baseUrl}/api/admin/bookings/${booking.id}/approval`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ action: 'approve' }),
  })).status, 200);

  assert.equal((await customerPayment('rental')).status, 409);
  assert.equal((await customerPayment('deposit', 'QRIS', '')).status, 400);
  const depositSubmit = await customerPayment('deposit');
  assert.equal(depositSubmit.status, 200);
  const depositPending = await depositSubmit.json();
  assert.equal(depositPending.depositPaymentStatus, 'Menunggu konfirmasi');
  assert.equal(depositPending.paymentStatus, 'Belum dipilih');
  const depositQueueCount = (await (await fetch(`${baseUrl}/api/admin/notification-data`, { headers: { cookie } })).json()).actionCounts.payments;
  assert.equal(depositQueueCount, 1);
  assert.equal((await customerPayment('deposit')).status, 409);
  assert.equal((await customerPayment('rental')).status, 409);
  assert.equal((await (await fetch(`${baseUrl}/api/bookings/${booking.id}/details?phone=${booking.phone}`)).json()).depositPaymentProof, undefined);

  const approveDeposit = async (action) => fetch(`${baseUrl}/api/admin/bookings/${booking.id}/payment`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ action, stage: 'deposit' }),
  });
  assert.equal((await approveDeposit('reject')).status, 200);
  assert.equal((await (await fetch(`${baseUrl}/api/bookings/${booking.id}?phone=${booking.phone}`)).json()).depositPaymentStatus, 'Ditolak');
  assert.equal((await customerPayment('deposit')).status, 200);
  assert.equal((await approveDeposit('approve')).status, 200);
  assert.equal((await (await fetch(`${baseUrl}/api/bookings/${booking.id}?phone=${booking.phone}`)).json()).depositPaymentStatus, 'Dikonfirmasi');

  assert.equal((await customerPayment('rental', 'Cash ke petugas', '')).status, 400);
  const rentalSubmit = await customerPayment('rental', 'Cash ke petugas');
  assert.equal(rentalSubmit.status, 200);
  const rentalPending = await rentalSubmit.json();
  assert.equal(rentalPending.paymentStatus, 'Menunggu konfirmasi');
  assert.equal(rentalPending.status, 'Pembayaran');
  const adminBooking = (await (await fetch(`${baseUrl}/api/admin/bookings`, { headers: { cookie } })).json())
    .find((item) => item.id === booking.id);
  assert.equal(adminBooking.depositPaymentProof, image);
  assert.equal(adminBooking.paymentProof, image);
  assert.equal((await fetch(`${baseUrl}/api/admin/bookings/${booking.id}/payment`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ action: 'approve', stage: 'deposit' }),
  })).status, 409);
  const approveRental = await fetch(`${baseUrl}/api/admin/bookings/${booking.id}/payment`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ action: 'approve', stage: 'rental' }),
  });
  assert.equal(approveRental.status, 200);
  const approvedBooking = await approveRental.json();
  assert.equal(approvedBooking.paymentStatus, 'Dikonfirmasi');
  assert.equal(approvedBooking.status, 'Persiapan unit');
  assert.equal(approvedBooking.depositPaymentStatus, 'Dikonfirmasi');
  const finalPaymentQueueCount = (await (await fetch(`${baseUrl}/api/admin/notification-data`, { headers: { cookie } })).json()).actionCounts.payments;
  assert.equal(finalPaymentQueueCount, 0);
  const finalOrder = await (await fetch(`${baseUrl}/api/bookings/${booking.id}/details?phone=${booking.phone}`)).json();
  assert.equal(finalOrder.depositPaymentStatus, 'Dikonfirmasi');
  assert.equal(finalOrder.paymentStatus, 'Dikonfirmasi');
});

test('vehicle categories can be managed and references stay consistent', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'drivelink-categories-'));
  const app = createApp({
    databasePath: path.join(directory, 'categories.sqlite'),
    adminUsername: 'admin',
    adminPassword: 'a-long-test-password',
    sessionSecret: 'a-test-session-secret-that-is-long-enough',
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  t.after(() => {
    server.close();
    app.locals.db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'a-long-test-password' }),
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const adminHeaders = { 'content-type': 'application/json', cookie };
  const initialCategories = await (await fetch(`${baseUrl}/api/fleet-categories`)).json();
  assert.deepEqual(initialCategories, ['MPV', 'SUV', 'Electric']);
  assert.equal((await fetch(`${baseUrl}/api/admin/fleet-categories`)).status, 401);

  const salt = 'category-employee-salt';
  const employeeHash = crypto.scryptSync('category-employee-password', salt, 64).toString('hex');
  app.locals.db.prepare(`
    INSERT INTO admins (username, password_hash, name, role, email, permissions_json)
    VALUES (?, ?, ?, 'employee', ?, ?)
  `).run('categoryemployee', `${salt}:${employeeHash}`, 'Karyawan Kategori', 'categoryemployee@example.com', '[]');
  const employeeLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'categoryemployee', password: 'category-employee-password' }),
  });
  const employeeCookie = employeeLogin.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(`${baseUrl}/api/admin/fleet-categories`, {
    headers: { cookie: employeeCookie },
  })).status, 403);

  const addCategory = await fetch(`${baseUrl}/api/admin/fleet-categories`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ label: 'SUV Premium' }),
  });
  assert.equal(addCategory.status, 201);
  assert.deepEqual(await addCategory.json(), [...initialCategories, 'SUV Premium']);
  assert.equal((await fetch(`${baseUrl}/api/admin/travel-packages`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      name: 'Paket SUV',
      description: 'Paket kategori SUV.',
      categories: ['SUV'],
      mealIncluded: false,
      mineralWaterIncluded: false,
      active: true,
    }),
  })).status, 201);

  const renameCategory = await fetch(`${baseUrl}/api/admin/fleet-categories/SUV`, {
    method: 'PUT',
    headers: adminHeaders,
    body: JSON.stringify({ label: 'SUV Keluarga' }),
  });
  assert.equal(renameCategory.status, 200);
  const renamedFleet = await (await fetch(`${baseUrl}/api/fleet`)).json();
  assert.equal(renamedFleet.find((vehicle) => vehicle.name === 'BR-V Family').category, 'SUV Keluarga');
  const renamedOffers = await (await fetch(`${baseUrl}/api/travel-offers`)).json();
  assert.equal(renamedOffers.categories.includes('SUV Keluarga'), true);
  assert.deepEqual(renamedOffers.packages.find((item) => item.name === 'Paket SUV').categories, ['SUV Keluarga']);

  const deleteCategory = await fetch(`${baseUrl}/api/admin/fleet-categories/SUV%20Keluarga`, {
    method: 'DELETE',
    headers: { cookie },
  });
  assert.equal(deleteCategory.status, 200);
  const deletionResult = await deleteCategory.json();
  assert.equal(deletionResult.reassignedTo, 'MPV');
  assert.equal((await (await fetch(`${baseUrl}/api/fleet`)).json())
    .find((vehicle) => vehicle.name === 'BR-V Family').category, 'MPV');
  const reassignedOffers = await (await fetch(`${baseUrl}/api/travel-offers`)).json();
  assert.deepEqual(reassignedOffers.packages.find((item) => item.name === 'Paket SUV').categories, ['MPV']);

  for (const category of deletionResult.categories.slice(0, -1)) {
    const response = await fetch(`${baseUrl}/api/admin/fleet-categories/${encodeURIComponent(category)}`, {
      method: 'DELETE',
      headers: { cookie },
    });
    assert.equal(response.status, 200);
  }
  const remainingCategories = await (await fetch(`${baseUrl}/api/fleet-categories`)).json();
  const lastCategoryDelete = await fetch(`${baseUrl}/api/admin/fleet-categories/${encodeURIComponent(remainingCategories[0])}`, {
    method: 'DELETE',
    headers: { cookie },
  });
  assert.equal(lastCategoryDelete.status, 409);
});

test('admin can set a site-wide logo and restore the default mark', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'drivelink-logo-'));
  const app = createApp({
    databasePath: path.join(directory, 'logo.sqlite'),
    adminUsername: 'admin',
    adminPassword: 'a-long-test-password',
    sessionSecret: 'a-test-session-secret-that-is-long-enough',
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  t.after(() => {
    server.close();
    app.locals.db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  assert.deepEqual(await (await fetch(`${baseUrl}/api/site-settings/logo`)).json(), { image: '' });
  assert.equal((await fetch(`${baseUrl}/api/admin/settings/logo`)).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/admin/settings/logo`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image }),
  })).status, 401);

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'a-long-test-password' }),
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const adminSettingsHeaders = { 'content-type': 'application/json', cookie };

  const invalidLogo = await fetch(`${baseUrl}/api/admin/settings/logo`, {
    method: 'PUT',
    headers: adminSettingsHeaders,
    body: JSON.stringify({ image: 'data:image/png;base64,Zm9v' }),
  });
  assert.equal(invalidLogo.status, 400);

  const savedLogo = await fetch(`${baseUrl}/api/admin/settings/logo`, {
    method: 'PUT',
    headers: adminSettingsHeaders,
    body: JSON.stringify({ image }),
  });
  assert.equal(savedLogo.status, 200);
  assert.deepEqual(await savedLogo.json(), { image });
  assert.deepEqual(await (await fetch(`${baseUrl}/api/site-settings/logo`)).json(), { image });
  const brandedPage = await (await fetch(`${baseUrl}/fleet.html`)).text();
  assert.ok(brandedPage.includes(`<img class="brand-mark brand-logo" src="${image}" alt="" />`));
  assert.doesNotMatch(brandedPage, /<span class="brand-mark">D<\/span>/);

  const restoredLogo = await fetch(`${baseUrl}/api/admin/settings/logo`, {
    method: 'PUT',
    headers: adminSettingsHeaders,
    body: JSON.stringify({ image: '' }),
  });
  assert.equal(restoredLogo.status, 200);
  assert.deepEqual(await restoredLogo.json(), { image: '' });
  const defaultBrandedPage = await (await fetch(`${baseUrl}/fleet.html`)).text();
  assert.match(defaultBrandedPage, /<span class="brand-mark">D<\/span>/);
});

test('booking flow skips payment and handover admin confirmations and exposes rental status by booking code', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'drivelink-test-'));
  const app = createApp({
    databasePath: path.join(directory, 'test.sqlite'),
    adminUsername: 'admin',
    adminPassword: 'a-long-test-password',
    sessionSecret: 'a-test-session-secret-that-is-long-enough',
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  t.after(() => {
    server.close();
    app.locals.db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const homeResponse = await fetch(baseUrl);
  assert.equal(homeResponse.status, 200);
  const homeHtml = await homeResponse.text();
  assert.match(homeHtml, /DriveLink/);
  for (const vehicleType of ['sedan', 'suv', 'mpv', 'city']) {
    assert.match(homeHtml, new RegExp(`fleet-car-${vehicleType}`));
  }
  for (const model of ['CAMRY', 'PAJERO', 'AVANZA', 'BRIO']) {
    assert.match(homeHtml, new RegExp(`aria-label="Ilustrasi .*${model}`, 'i'));
  }
  assert.doesNotMatch(homeHtml, /vehicle-type-label|CAMRY · SEDAN|PAJERO · SUV|AVANZA · MPV|BRIO · CITY CAR/);
  const homeStyles = await (await fetch(`${baseUrl}/assets/css/styles.css`)).text();
  assert.match(homeStyles, /\.home-page main > section:not\(\.hero\):not\(\.partners\):not\(\.booking-block\):not\(\.home-offer-section\):not\(\.home-poster-section\)/);
  assert.match(homeStyles, /@keyframes fleet-car-drive/);
  assert.match(homeStyles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.fleet-car-sedan/);
  const pagesDirectory = path.join(__dirname, '..', 'pages');
  const pageNames = fs.readdirSync(pagesDirectory).filter((name) => name.endsWith('.html'));
  assert.equal(pageNames.length, 27);
  for (const pageName of pageNames) {
    const pageResponse = await fetch(`${baseUrl}/${pageName}`);
    assert.equal(pageResponse.status, 200, `/${pageName} should keep its existing URL`);
  }
  for (const assetPath of [
    '/assets/css/styles.css',
    '/assets/js/api-client.js',
    '/assets/js/admin.js',
    '/assets/js/admin-access.js',
    '/assets/js/admin-accounts.js',
    '/assets/js/admin-settings.js',
    '/assets/js/script.js',
    '/assets/js/admin-handover-archive.js',
    '/assets/js/admin-handover.js',
    '/assets/js/admin-notifications.js',
    '/assets/js/admin-payments.js',
    '/assets/js/admin-rental-policy.js',
    '/assets/js/admin-return.js',
    '/assets/js/admin-rental-archive.js',
    '/assets/js/admin-travel-packages.js',
    '/assets/js/auth.js',
    '/assets/js/customer-animations.js',
    '/assets/js/customer-reviews.js',
    '/assets/js/handover.js',
    '/assets/js/orders.js',
    '/assets/js/payment.js',
    '/assets/js/pricing.js',
    '/assets/js/rental-policy.js',
    '/assets/js/responsive-nav.js',
  ]) {
    const assetResponse = await fetch(`${baseUrl}${assetPath}`);
    assert.equal(assetResponse.status, 200, `${assetPath} should be served`);
  }
  assert.equal((await fetch(`${baseUrl}/data/drivelink.sqlite`)).status, 404);
  const bookingPageResponse = await fetch(`${baseUrl}/booking.html`);
  assert.equal(bookingPageResponse.status, 200);
  const bookingPage = await bookingPageResponse.text();
  assert.match(bookingPage, /name="selfie" accept="image\/jpeg,image\/png" capture="user" required/);
  assert.doesNotMatch(bookingPage, /getUserMedia/);
  const reviewsPage = await (await fetch(`${baseUrl}/reviews.html`)).text();
  assert.match(reviewsPage, /Bagaimana perjalanan Anda/);
  assert.match(reviewsPage, /Nilai juga di Google Maps/);

  const fleetResponse = await fetch(`${baseUrl}/api/fleet`);
  assert.equal(fleetResponse.status, 200);
  const initialFleet = await fleetResponse.json();
  assert.equal(initialFleet.length, 3);
  assert.equal(Object.hasOwn(initialFleet.find((vehicle) => vehicle.name === 'Avanza Smart'), 'transmission'), false);
  assert.equal(initialFleet.find((vehicle) => vehicle.name === 'Avanza Smart').seats, 7);
  assert.equal((await fetch(`${baseUrl}/api/admin/bookings`)).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/admin/travel-offers`)).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/admin/settings/theme`, { method: 'PUT' })).status, 401);
  const defaultHomeBanner = await (await fetch(`${baseUrl}/api/site-settings/home-banner`)).json();
  assert.deepEqual(defaultHomeBanner, { enabled: false, image: '', updatedAt: '' });
  assert.equal((await fetch(`${baseUrl}/api/admin/settings/home-banner`)).status, 401);
  assert.deepEqual(await (await fetch(`${baseUrl}/api/reviews`)).json(), []);
  assert.deepEqual(await (await fetch(`${baseUrl}/api/site-settings/review-link`)).json(), { reviewUrl: '' });
  const defaultHomeOffer = await (await fetch(`${baseUrl}/api/site-settings/offer`)).json();
  assert.equal(defaultHomeOffer.enabled, true);
  assert.equal(defaultHomeOffer.buttonUrl, 'fleet.html');
  assert.equal((await fetch(`${baseUrl}/api/admin/settings/offer`, { method: 'PUT' })).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/admin/settings/home-banner`, { method: 'PUT' })).status, 401);
  assert.equal((await fetch(`${baseUrl}/server.js`)).status, 404);

  const bookingResponse = await fetch(`${baseUrl}/api/bookings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Pelanggan Uji',
      email: 'test@example.com',
      phone: '081234567890',
      address: 'Jakarta',
      carType: 'Avanza Smart',
      duration: '1 hari',
      bookingType: 'Reservasi',
      arrivalAt: new Date(Date.now() + 86400000).toISOString(),
      driverOption: 'Lepas kunci',
      deposit: 'Titip motor',
      documents: { identityType: 'KTP', ktp: image, simA: image, selfie: { dataUrl: image } },
    }),
  });
  assert.equal(bookingResponse.status, 201);
  const booking = await bookingResponse.json();
  assert.match(booking.id, /^DL-[A-F0-9]{24}$/);
  assert.equal(booking.ratePerDay, 420000);
  assert.equal(booking.estimatedTotal, 420000);
  assert.equal(booking.bookingApproval, 'Menunggu persetujuan');
  assert.equal(booking.documents, undefined);

  const customerLookup = await fetch(`${baseUrl}/api/bookings/${booking.id}?phone=${booking.phone}`);
  assert.equal(customerLookup.status, 200);
  assert.equal((await customerLookup.json()).documents, undefined);

  const orderDetailsResponse = await fetch(`${baseUrl}/api/bookings/${booking.id}/details?phone=${booking.phone}`);
  assert.equal(orderDetailsResponse.status, 200);
  const orderDetails = await orderDetailsResponse.json();
  assert.equal(orderDetails.name, 'Pelanggan Uji');
  assert.equal(orderDetails.email, 'test@example.com');
  assert.equal(orderDetails.address, 'Jakarta');
  assert.equal(orderDetails.carType, 'Avanza Smart');
  assert.equal(orderDetails.bookingApproval, 'Menunggu persetujuan');
  assert.equal(orderDetails.identityType, 'KTP');
  assert.deepEqual(orderDetails.uploadedDocuments, ['KTP', 'SIM A', 'Selfie']);
  assert.equal(orderDetails.vehicleInspection, null);
  assert.equal(orderDetails.documents, undefined);
  assert.equal(orderDetails.paymentProof, undefined);
  assert.equal(JSON.stringify(orderDetails).includes(image), false);
  assert.equal((await fetch(`${baseUrl}/api/bookings/${booking.id}/details?phone=081200000000`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/api/bookings/${booking.id}/details`)).status, 200);

  const updateStreamResponse = await fetch(`${baseUrl}/api/events?clientId=watcher-client-01`);
  assert.equal(updateStreamResponse.status, 200);
  assert.match(updateStreamResponse.headers.get('content-type'), /text\/event-stream/);
  const updateStreamReader = updateStreamResponse.body.getReader();
  const connectedEvent = await updateStreamReader.read();
  assert.match(new TextDecoder().decode(connectedEvent.value), /event: connected/);
  assert.match(new TextDecoder().decode(connectedEvent.value), /id: \d+/);
  const updateEventPromise = updateStreamReader.read();

  const secondBookingResponse = await fetch(`${baseUrl}/api/bookings`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-DriveLink-Client-Id': 'writer-client-02',
    },
    body: JSON.stringify({
      name: 'Pelanggan Kedua',
      email: 'second@example.com',
      phone: '081234567899',
      address: 'Bandung',
      carType: 'Avanza Smart',
      duration: '1 hari',
      bookingType: 'Reservasi',
      arrivalAt: new Date(Date.now() + 86400000).toISOString(),
      driverOption: 'Lepas kunci',
      deposit: 'Titip motor',
      documents: { identityType: 'KTP', ktp: image, simA: image, selfie: { dataUrl: image } },
    }),
  });
  assert.equal(secondBookingResponse.status, 201);
  const secondBooking = await secondBookingResponse.json();
  const updateEvent = await updateEventPromise;
  assert.match(new TextDecoder().decode(updateEvent.value), /event: data-changed/);
  assert.match(new TextDecoder().decode(updateEvent.value), /id: \d+/);
  assert.notEqual(secondBooking.id, booking.id);
  await updateStreamReader.cancel();

  const deniedPayment = await fetch(`${baseUrl}/api/bookings/${booking.id}/payment`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: booking.phone, method: 'Cash ke petugas' }),
  });
  assert.equal(deniedPayment.status, 409);

  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'a-long-test-password' }),
  });
  assert.equal(loginResponse.status, 200);
  const cookie = loginResponse.headers.get('set-cookie').split(';')[0];
  const initialActionCounts = (await (await fetch(`${baseUrl}/api/admin/notification-data`, {
    headers: { cookie },
  })).json()).actionCounts;
  assert.equal(initialActionCounts.bookings, 2);
  const onlineBookingApproval = await fetch(`${baseUrl}/api/admin/bookings/${secondBooking.id}/approval`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ action: 'approve' }),
  });
  assert.equal(onlineBookingApproval.status, 200);
  const rejectedBookingResponse = await fetch(`${baseUrl}/api/bookings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Pelanggan Ditolak',
      email: 'rejected@example.com',
      phone: '081234567880',
      address: 'Jakarta',
      carType: 'Avanza Smart',
      duration: '1 hari',
      bookingType: 'Reservasi',
      arrivalAt: new Date(Date.now() + 86400000).toISOString(),
      driverOption: 'Lepas kunci',
      deposit: 'Titip motor',
      documents: { identityType: 'KTP', ktp: image, simA: image, selfie: { dataUrl: image } },
    }),
  });
  assert.equal(rejectedBookingResponse.status, 201);
  const rejectedBooking = await rejectedBookingResponse.json();
  const rejectionWithoutReason = await fetch(`${baseUrl}/api/admin/bookings/${rejectedBooking.id}/approval`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ action: 'reject' }),
  });
  assert.equal(rejectionWithoutReason.status, 400);
  const rejectionResponse = await fetch(`${baseUrl}/api/admin/bookings/${rejectedBooking.id}/approval`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ action: 'reject', reason: 'Unit tidak tersedia pada tanggal pilihan.' }),
  });
  assert.equal(rejectionResponse.status, 200);
  assert.equal((await rejectionResponse.json()).bookingRejectionReason, 'Unit tidak tersedia pada tanggal pilihan.');
  const rejectedArchiveResponse = await fetch(`${baseUrl}/api/admin/returns/archive/rejected`, { headers: { cookie } });
  assert.equal(rejectedArchiveResponse.status, 200);
  const rejectedArchive = await rejectedArchiveResponse.json();
  assert.ok(rejectedArchive.some((record) => record.id === rejectedBooking.id
    && record.reason === 'Unit tidak tersedia pada tanggal pilihan.'));
  const onlinePaymentCountsBefore = (await (await fetch(`${baseUrl}/api/admin/notification-data`, {
    headers: { cookie },
  })).json()).actionCounts;
  const onlinePaymentResponse = await fetch(`${baseUrl}/api/bookings/${secondBooking.id}/payment`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: secondBooking.phone, method: 'QRIS', proof: image }),
  });
  assert.equal(onlinePaymentResponse.status, 200);
  assert.equal((await onlinePaymentResponse.json()).paymentStatus, 'Bukti diunggah');
  const onlinePaymentCountsAfter = (await (await fetch(`${baseUrl}/api/admin/notification-data`, {
    headers: { cookie },
  })).json()).actionCounts;
  assert.equal(onlinePaymentCountsAfter.payments, onlinePaymentCountsBefore.payments);
  assert.equal((await fetch(`${baseUrl}/api/admin/bookings/${secondBooking.id}/payment`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ action: 'approve' }),
  })).status, 409);
  const adminSettingsPage = await fetch(`${baseUrl}/admin-settings.html`, { headers: { cookie } });
  assert.equal(adminSettingsPage.status, 200);
  const adminSettingsHtml = await adminSettingsPage.text();
  assert.match(adminSettingsHtml, /Username dan keamanan/);
  assert.match(adminSettingsHtml, /Iklan penawaran beranda/);
  assert.match(adminSettingsHtml, /Poster beranda ukuran A4/);
  assert.match(adminSettingsHtml, /Teks utama beranda/);
  assert.match(adminSettingsHtml, /value="marquee">Teks berjalan/);
  assert.match(adminSettingsHtml, /Kontak dan media sosial/);
  assert.match(adminSettingsHtml, /Tambah media sosial/);
  for (const page of [
    'index.html', 'fleet.html', 'features.html', 'pricing.html', 'booking.html',
    'reviews.html', 'orders.html', 'handover.html', 'payment.html',
  ]) {
    const pageResponse = await fetch(`${baseUrl}/${page}`);
    assert.equal(pageResponse.status, 200, `${page} should be publicly available`);
    const pageHtml = await pageResponse.text();
    assert.match(pageHtml, /id="rentalFooterPhone"/, `${page} should render editable footer contacts`);
    assert.match(pageHtml, /id="footerSocialLinks"/, `${page} should render social media icons`);
    assert.match(pageHtml, /assets\/js\/site-contact\.js/, `${page} should load saved footer settings`);
    assert.match(pageHtml, /href="fleet\.html"[^>]*>Harga Unit<\/a>/, `${page} should label the customer fleet page Harga Unit`);
    assert.match(pageHtml, /href="pricing\.html"[^>]*>Paket Perjalanan<\/a>/, `${page} should label the customer packages page Paket Perjalanan`);
  }
  assert.match(adminSettingsHtml, /class="choice-option permission-option poster-toggle-option"/);
  assert.match(adminSettingsHtml, /name="enabled"/);
  assert.match(adminSettingsHtml, /homeBannerToggleStatus/);
  assert.equal([...adminSettingsHtml.matchAll(/class="theme-swatch"/g)].length, 16);
  assert.equal([...adminSettingsHtml.matchAll(/class="theme-combination"/g)].length, 16);
  const adminSettingsStyles = await (await fetch(`${baseUrl}/assets/css/styles.css`)).text();
  assert.match(adminSettingsStyles, /#adminHomeBannerForm \.poster-toggle-option:has\(input:focus-visible\)/);
  const invalidHomeBanner = await fetch(`${baseUrl}/api/admin/settings/home-banner`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ enabled: true, image: 'data:image/png;base64,Zm9v' }),
  });
  assert.equal(invalidHomeBanner.status, 400);
  const savedHomeBanner = await fetch(`${baseUrl}/api/admin/settings/home-banner`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ enabled: true, image }),
  });
  assert.equal(savedHomeBanner.status, 200);
  const homeBanner = await savedHomeBanner.json();
  assert.equal(homeBanner.enabled, true);
  assert.equal(homeBanner.image, image);
  assert.ok(homeBanner.updatedAt);
  assert.deepEqual(await (await fetch(`${baseUrl}/api/site-settings/home-banner`)).json(), homeBanner);
  const disabledHomeBanner = await fetch(`${baseUrl}/api/admin/settings/home-banner`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ enabled: false }),
  });
  assert.equal(disabledHomeBanner.status, 200);
  assert.equal((await disabledHomeBanner.json()).image, image);
  assert.equal((await (await fetch(`${baseUrl}/api/site-settings/home-banner`)).json()).image, '');
  const removedHomeBanner = await fetch(`${baseUrl}/api/admin/settings/home-banner`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ enabled: false, image: '' }),
  });
  assert.equal(removedHomeBanner.status, 200);
  assert.equal((await removedHomeBanner.json()).image, '');
  const defaultHomeHero = await (await fetch(`${baseUrl}/api/site-settings/home-hero`)).json();
  assert.equal(defaultHomeHero.title, 'Sewa mobil pintar untuk perjalanan aman, cepat, dan nyaman.');
  assert.equal(defaultHomeHero.effect, 'static');
  assert.equal((await fetch(`${baseUrl}/api/admin/settings/home-hero`, { headers: { cookie } })).status, 200);
  const invalidHomeHeroEffect = await fetch(`${baseUrl}/api/admin/settings/home-hero`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      eyebrow: '#DriveLink',
      title: 'Jelajahi perjalanan dengan DriveLink.',
      description: 'Pilih kendaraan sesuai kebutuhan.',
      effect: 'url(javascript:alert(1))',
    }),
  });
  assert.equal(invalidHomeHeroEffect.status, 400);
  const updatedHomeHero = {
    eyebrow: '#DriveLink',
    title: 'Jelajahi perjalanan nyaman bersama DriveLink.',
    description: 'Pilih kendaraan yang sesuai untuk rencana perjalanan Anda.',
    effect: 'marquee',
  };
  const saveHomeHero = await fetch(`${baseUrl}/api/admin/settings/home-hero`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(updatedHomeHero),
  });
  assert.equal(saveHomeHero.status, 200);
  assert.deepEqual(await saveHomeHero.json(), updatedHomeHero);
  assert.deepEqual(await (await fetch(`${baseUrl}/api/site-settings/home-hero`)).json(), updatedHomeHero);
  assert.deepEqual(await (await fetch(`${baseUrl}/api/site-settings/contact`)).json(), {
    heading: 'Kontak',
    phone: '+62 812-3456-789',
    email: 'hello@drivelink.id',
    whatsapp: '',
    socialLinks: [],
  });
  assert.equal((await fetch(`${baseUrl}/api/admin/settings/contact`)).status, 401);
  const invalidSocialUrl = await fetch(`${baseUrl}/api/admin/settings/contact`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      heading: 'Hubungi Kami',
      phone: '+62 812-3456-789',
      email: 'halo@drivelink.id',
      whatsapp: '',
      socialLinks: [{ platform: 'instagram', url: 'https://instagram.example/profile' }],
    }),
  });
  assert.equal(invalidSocialUrl.status, 400);
  const updatedSiteContact = {
    heading: 'Hubungi Kami',
    phone: '+62 811-2222-3333',
    email: 'halo@drivelink.id',
    whatsapp: '+62 811-2222-3333',
    socialLinks: [
      { platform: 'instagram', url: 'https://www.instagram.com/drivelink/' },
      { platform: 'youtube', url: 'https://youtube.com/@drivelink' },
    ],
  };
  const saveSiteContact = await fetch(`${baseUrl}/api/admin/settings/contact`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(updatedSiteContact),
  });
  assert.equal(saveSiteContact.status, 200);
  assert.deepEqual(await saveSiteContact.json(), updatedSiteContact);
  assert.deepEqual(await (await fetch(`${baseUrl}/api/site-settings/contact`)).json(), updatedSiteContact);
  const duplicateSocialPlatform = await fetch(`${baseUrl}/api/admin/settings/contact`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      ...updatedSiteContact,
      socialLinks: [
        { platform: 'instagram', url: 'https://instagram.com/one' },
        { platform: 'instagram', url: 'https://instagram.com/two' },
      ],
    }),
  });
  assert.equal(duplicateSocialPlatform.status, 400);
  const unauthorizedThemeResponse = await fetch(`${baseUrl}/api/admin/settings/theme`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ primary: '#ffffff' }),
  });
  assert.equal(unauthorizedThemeResponse.status, 400);
  const themeStreamResponse = await fetch(`${baseUrl}/api/events?clientId=theme-watcher-01`);
  const themeStreamReader = themeStreamResponse.body.getReader();
  await themeStreamReader.read();
  const themeChangeEventPromise = themeStreamReader.read();
  const themeResponse = await fetch(`${baseUrl}/api/admin/settings/theme`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ primary: '#087f5b', gradientEnd: '#0e7490', gradientAngle: '90deg' }),
  });
  assert.equal(themeResponse.status, 200);
  const themeChangeEvent = await themeChangeEventPromise;
  const themeChangeText = new TextDecoder().decode(themeChangeEvent.value);
  assert.match(themeChangeText, /event: data-changed/);
  assert.match(themeChangeText, /id: \d+/);
  const lastSeenRevision = Number(themeChangeText.match(/id: (\d+)/)[1]);
  await themeStreamReader.cancel();
  assert.deepEqual(await themeResponse.json(), {
    primary: '#087f5b',
    gradientEnd: '#0e7490',
    gradientAngle: '90deg',
  });
  assert.deepEqual(await (await fetch(`${baseUrl}/api/site-settings/theme`)).json(), {
    primary: '#087f5b',
    gradientEnd: '#0e7490',
    gradientAngle: '90deg',
  });
  const themedHome = await (await fetch(baseUrl)).text();
  assert.match(themedHome, /--primary:#087f5b/);
  assert.match(themedHome, /--primary-gradient-end:#0e7490/);
  assert.match(themedHome, /--primary-gradient-angle:90deg/);
  const invalidThemeGradient = await fetch(`${baseUrl}/api/admin/settings/theme`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ primary: '#087f5b', gradientEnd: '#0e7490', gradientAngle: 'to right; color:red' }),
  });
  assert.equal(invalidThemeGradient.status, 400);
  const invalidOfferLink = await fetch(`${baseUrl}/api/admin/settings/offer`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      enabled: true, badge: '', title: 'Promo', description: 'Penawaran spesial',
      buttonLabel: 'Booking', buttonUrl: 'https://example.com',
    }),
  });
  assert.equal(invalidOfferLink.status, 400);
  const homeOfferSettingsResponse = await fetch(`${baseUrl}/api/admin/settings/offer`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      enabled: true,
      badge: 'Promo spesial',
      title: 'Hemat untuk perjalanan',
      description: 'Atur promo sesuai kebutuhan.',
      buttonLabel: 'Pesan sekarang',
      buttonUrl: 'booking.html',
    }),
  });
  assert.equal(homeOfferSettingsResponse.status, 200);
  assert.deepEqual(await homeOfferSettingsResponse.json(), {
    enabled: true,
    badge: 'Promo spesial',
    title: 'Hemat untuk perjalanan',
    description: 'Atur promo sesuai kebutuhan.',
    buttonLabel: 'Pesan sekarang',
    buttonUrl: 'booking.html',
  });
  assert.deepEqual(await (await fetch(`${baseUrl}/api/site-settings/offer`)).json(), {
    enabled: true,
    badge: 'Promo spesial',
    title: 'Hemat untuk perjalanan',
    description: 'Atur promo sesuai kebutuhan.',
    buttonLabel: 'Pesan sekarang',
    buttonUrl: 'booking.html',
  });
  const packageResponse = await fetch(`${baseUrl}/api/admin/travel-packages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      name: 'Jelajah Keluarga',
      description: 'Paket untuk perjalanan bersama keluarga.',
      categories: ['MPV'],
      mealIncluded: true,
      mineralWaterIncluded: true,
      active: true,
    }),
  });
  assert.equal(packageResponse.status, 201);
  const travelPackage = await packageResponse.json();
  const promoDate = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const percentagePromoResponse = await fetch(`${baseUrl}/api/admin/travel-promotions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      name: 'Promo Uji',
      description: 'Diskon perjalanan untuk uji integrasi.',
      kind: 'discount_percent',
      value: 10,
      fuelDays: 0,
      startsAt: promoDate,
      endsAt: promoDate,
      packageIds: [travelPackage.id],
      active: true,
    }),
  });
  assert.equal(percentagePromoResponse.status, 201);
  const percentagePromo = await percentagePromoResponse.json();
  const fuelPromoResponse = await fetch(`${baseUrl}/api/admin/travel-promotions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      name: 'BBM Gratis Uji',
      description: '',
      kind: 'free_fuel',
      value: 50000,
      fuelDays: 1,
      startsAt: promoDate,
      endsAt: promoDate,
      packageIds: [travelPackage.id],
      active: true,
    }),
  });
  assert.equal(fuelPromoResponse.status, 201);
  const fuelPromo = await fuelPromoResponse.json();
  const offerResponse = await fetch(`${baseUrl}/api/travel-offers`);
  const publicOffers = await offerResponse.json();
  assert.equal(publicOffers.packages.some((item) => item.id === travelPackage.id), true);
  assert.equal(publicOffers.promotions.some((item) => item.id === percentagePromo.id), true);
  assert.equal((await fetch(`${baseUrl}/api/admin/travel-offers`)).status, 401);

  const discountedBookingResponse = await fetch(`${baseUrl}/api/bookings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Pelanggan Promo',
      email: 'promo@example.com',
      phone: '081234567891',
      address: 'Jakarta',
      carType: 'Avanza Smart',
      duration: '1 hari',
      bookingType: 'Reservasi',
      arrivalAt: `${promoDate}T00:10:00+07:00`,
      driverOption: 'Lepas kunci',
      packageId: travelPackage.id,
      promotionId: percentagePromo.id,
      documents: { identityType: 'KTP', ktp: image, simA: image, selfie: { dataUrl: image } },
    }),
  });
  assert.equal(discountedBookingResponse.status, 201, JSON.stringify(await discountedBookingResponse.clone().json()));
  const discountedBooking = await discountedBookingResponse.json();
  assert.equal(discountedBooking.baseTotal, 420000);
  assert.equal(discountedBooking.discountAmount, 42000);
  assert.equal(discountedBooking.estimatedTotal, 378000);
  assert.equal(discountedBooking.packageIncludes.meal, true);
  const wrongCategoryBookingResponse = await fetch(`${baseUrl}/api/bookings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Pelanggan Kategori',
      email: 'category@example.com',
      phone: '081234567893',
      address: 'Jakarta',
      carType: 'BR-V Family',
      duration: '1 hari',
      bookingType: 'Reservasi',
      arrivalAt: `${promoDate}T00:10:00+07:00`,
      driverOption: 'Lepas kunci',
      packageId: travelPackage.id,
      promotionId: percentagePromo.id,
      documents: { identityType: 'KTP', ktp: image, simA: image, selfie: { dataUrl: image } },
    }),
  });
  assert.equal(wrongCategoryBookingResponse.status, 400);

  const freeFuelBookingResponse = await fetch(`${baseUrl}/api/bookings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Pelanggan BBM',
      email: 'fuel@example.com',
      phone: '081234567892',
      address: 'Jakarta',
      carType: 'Avanza Smart',
      duration: '3 hari',
      bookingType: 'Reservasi',
      arrivalAt: `${promoDate}T00:10:00+07:00`,
      driverOption: 'Pakai driver',
      fuelPackage: 'Belum termasuk BBM',
      packageId: travelPackage.id,
      promotionId: fuelPromo.id,
      documents: { identityType: 'KTP', ktp: image, simA: image, selfie: { dataUrl: image } },
    }),
  });
  assert.equal(freeFuelBookingResponse.status, 201);
  const freeFuelBooking = await freeFuelBookingResponse.json();
  assert.equal(freeFuelBooking.freeFuelDays, 1);
  assert.equal(freeFuelBooking.discountAmount, 50000);
  assert.equal(freeFuelBooking.estimatedTotal, 1210000);

  const employeeResponse = await fetch(`${baseUrl}/api/admin/accounts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      name: 'Karyawan Uji',
      username: 'petugas01',
      email: 'petugas@example.com',
      phone: '081234567890',
      employeeCode: 'DL-EMP-01',
      position: 'Petugas lapangan',
      password: 'password-karyawan-123',
      permissions: ['bookings'],
    }),
  });
  assert.equal(employeeResponse.status, 201);
  const employee = await employeeResponse.json();
  assert.equal(employee.role, 'employee');
  assert.deepEqual(employee.permissions, ['bookings']);
  assert.equal(employee.password, undefined);

  const employeeLoginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'petugas01', password: 'password-karyawan-123' }),
  });
  assert.equal(employeeLoginResponse.status, 200);
  const employeeCookie = employeeLoginResponse.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(`${baseUrl}/api/admin/bookings`, { headers: { cookie: employeeCookie } })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/admin/handover/archive`, {
    headers: { cookie: employeeCookie },
  })).status, 403);
  assert.equal((await fetch(`${baseUrl}/api/admin/handover/checklist-config`, {
    headers: { cookie: employeeCookie },
  })).status, 403);
  assert.equal((await fetch(`${baseUrl}/admin-checklist.html`, { headers: { cookie: employeeCookie } })).status, 403);
  assert.equal((await fetch(`${baseUrl}/admin-handover-archive.html`, { headers: { cookie: employeeCookie } })).status, 403);
  const employeeNotificationData = await (await fetch(`${baseUrl}/api/admin/notification-data`, {
    headers: { cookie: employeeCookie },
  })).json();
  assert.ok(Number.isInteger(employeeNotificationData.actionCounts.bookings));
  assert.equal(employeeNotificationData.actionCounts.payments, 0);
  // Alur persetujuan serah-terima oleh admin sudah dihapus, sehingga tidak ada lagi antrean handover.
  assert.equal('handover' in employeeNotificationData.actionCounts, false);
  assert.equal(employeeNotificationData.actionCounts.returns, 0);
  assert.equal((await fetch(`${baseUrl}/admin-handover.html`, { headers: { cookie: employeeCookie } })).status, 403);
  assert.equal((await fetch(`${baseUrl}/admin-return.html`, { headers: { cookie: employeeCookie } })).status, 403);
  const returnOnlyPermissions = await fetch(`${baseUrl}/api/admin/accounts/petugas01`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      name: 'Karyawan Uji', username: 'petugas01', email: 'petugas@example.com',
      phone: '081234567890', employeeCode: 'DL-EMP-01', position: 'Petugas lapangan',
      password: '', permissions: ['return'], active: true,
    }),
  });
  assert.deepEqual((await returnOnlyPermissions.json()).permissions, ['return']);
  assert.equal((await fetch(`${baseUrl}/admin-return.html`, { headers: { cookie: employeeCookie } })).status, 200);
  assert.equal((await fetch(`${baseUrl}/admin-rental-archive.html`, { headers: { cookie: employeeCookie } })).status, 403);
  assert.equal((await fetch(`${baseUrl}/api/admin/returns/archive`, { headers: { cookie: employeeCookie } })).status, 403);
  assert.equal((await fetch(`${baseUrl}/admin-handover.html`, { headers: { cookie: employeeCookie } })).status, 403);
  assert.equal((await fetch(`${baseUrl}/api/admin/bookings/DL-NOT-FOUND/return`, { headers: { cookie: employeeCookie } })).status, 404);
  assert.equal((await fetch(`${baseUrl}/api/admin/handover/bookings`, { headers: { cookie: employeeCookie } })).status, 403);
  const handoverOnlyPermissions = await fetch(`${baseUrl}/api/admin/accounts/petugas01`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      name: 'Karyawan Uji', username: 'petugas01', email: 'petugas@example.com',
      phone: '081234567890', employeeCode: 'DL-EMP-01', position: 'Petugas lapangan',
      password: '', permissions: ['handover'], active: true,
    }),
  });
  assert.deepEqual((await handoverOnlyPermissions.json()).permissions, ['handover']);
  assert.equal((await fetch(`${baseUrl}/admin-handover.html`, { headers: { cookie: employeeCookie } })).status, 200);
  assert.equal((await fetch(`${baseUrl}/admin-return.html`, { headers: { cookie: employeeCookie } })).status, 403);
  assert.equal((await fetch(`${baseUrl}/api/admin/handover/bookings`, { headers: { cookie: employeeCookie } })).status, 200);
  assert.equal((await fetch(`${baseUrl}/admin-checklist.html`, { headers: { cookie: employeeCookie } })).status, 403);
  assert.equal((await fetch(`${baseUrl}/api/admin/handover/checklist-config`, { headers: { cookie: employeeCookie } })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/admin/handover/archive`, { headers: { cookie: employeeCookie } })).status, 403);
  const handoverCannotEditChecklist = await fetch(`${baseUrl}/api/admin/handover/checklist-config`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie: employeeCookie },
    body: JSON.stringify({ items: [] }),
  });
  assert.equal(handoverCannotEditChecklist.status, 403);
  const checklistOnlyPermissions = await fetch(`${baseUrl}/api/admin/accounts/petugas01`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      name: 'Karyawan Uji', username: 'petugas01', email: 'petugas@example.com',
      phone: '081234567890', employeeCode: 'DL-EMP-01', position: 'Petugas lapangan',
      password: '', permissions: ['checklist'], active: true,
    }),
  });
  assert.deepEqual((await checklistOnlyPermissions.json()).permissions, ['checklist']);
  assert.equal((await fetch(`${baseUrl}/admin-checklist.html`, { headers: { cookie: employeeCookie } })).status, 200);
  assert.equal((await fetch(`${baseUrl}/admin-handover.html`, { headers: { cookie: employeeCookie } })).status, 403);
  assert.equal((await fetch(`${baseUrl}/api/admin/handover/checklist-config`, { headers: { cookie: employeeCookie } })).status, 200);
  const checklistConfigUpdate = await fetch(`${baseUrl}/api/admin/handover/checklist-config`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie: employeeCookie },
    body: JSON.stringify({ items: [] }),
  });
  assert.equal(checklistConfigUpdate.status, 200);
  assert.equal((await fetch(`${baseUrl}/api/admin/handover/archive`, { headers: { cookie: employeeCookie } })).status, 403);
  const archiveOnlyPermissions = await fetch(`${baseUrl}/api/admin/accounts/petugas01`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      name: 'Karyawan Uji', username: 'petugas01', email: 'petugas@example.com',
      phone: '081234567890', employeeCode: 'DL-EMP-01', position: 'Petugas lapangan',
      password: '', permissions: ['handover-archive'], active: true,
    }),
  });
  assert.deepEqual((await archiveOnlyPermissions.json()).permissions, ['handover-archive']);
  assert.equal((await fetch(`${baseUrl}/admin-handover-archive.html`, { headers: { cookie: employeeCookie } })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/admin/handover/archive`, { headers: { cookie: employeeCookie } })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/admin/handover/bookings/DL-NOT-FOUND/details`, { headers: { cookie: employeeCookie } })).status, 404);
  assert.equal((await fetch(`${baseUrl}/admin-checklist.html`, { headers: { cookie: employeeCookie } })).status, 403);
  assert.equal((await fetch(`${baseUrl}/api/admin/handover/checklist-config`, { headers: { cookie: employeeCookie } })).status, 403);
  const rentalArchiveOnlyPermissions = await fetch(`${baseUrl}/api/admin/accounts/petugas01`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      name: 'Karyawan Uji', username: 'petugas01', email: 'petugas@example.com',
      phone: '081234567890', employeeCode: 'DL-EMP-01', position: 'Petugas lapangan',
      password: '', permissions: ['rental-archive'], active: true,
    }),
  });
  assert.deepEqual((await rentalArchiveOnlyPermissions.json()).permissions, ['rental-archive']);
  assert.equal((await fetch(`${baseUrl}/admin-rental-archive.html`, { headers: { cookie: employeeCookie } })).status, 200);
  assert.equal((await fetch(`${baseUrl}/admin-return.html`, { headers: { cookie: employeeCookie } })).status, 403);
  assert.equal((await fetch(`${baseUrl}/api/admin/returns/archive`, { headers: { cookie: employeeCookie } })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/admin/returns/archive/NOT-A-RETURNED-BOOKING`, {
    headers: { cookie: employeeCookie },
  })).status, 404);
  assert.equal((await fetch(`${baseUrl}/api/admin/bookings/DL-NOT-FOUND/return`, {
    headers: { cookie: employeeCookie },
  })).status, 403);
  const restoreBookingPermission = await fetch(`${baseUrl}/api/admin/accounts/petugas01`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      name: 'Karyawan Uji', username: 'petugas01', email: 'petugas@example.com',
      phone: '081234567890', employeeCode: 'DL-EMP-01', position: 'Petugas lapangan',
      password: '', permissions: ['bookings'], active: true,
    }),
  });
  assert.equal(restoreBookingPermission.status, 200);
  assert.equal((await fetch(`${baseUrl}/api/admin/payment-settings`, { headers: { cookie: employeeCookie } })).status, 403);
  assert.equal((await fetch(`${baseUrl}/api/admin/fleet`, { headers: { cookie: employeeCookie } })).status, 403);
  assert.equal((await fetch(`${baseUrl}/admin-fleet.html`, { headers: { cookie: employeeCookie } })).status, 403);
  assert.equal((await fetch(`${baseUrl}/admin-bookings.html`, { headers: { cookie: employeeCookie } })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/admin/accounts`, { headers: { cookie: employeeCookie } })).status, 403);
  assert.equal((await fetch(`${baseUrl}/admin-settings.html`, { headers: { cookie: employeeCookie } })).status, 403);
  assert.equal((await fetch(`${baseUrl}/api/admin/travel-offers`, { headers: { cookie: employeeCookie } })).status, 403);
  assert.equal((await fetch(`${baseUrl}/admin-travel-packages.html`, { headers: { cookie: employeeCookie } })).status, 403);
  assert.equal((await fetch(`${baseUrl}/admin-return.html`, { headers: { cookie: employeeCookie } })).status, 403);
  assert.equal((await fetch(`${baseUrl}/api/admin/bookings/DL-NOT-FOUND/return`, { headers: { cookie: employeeCookie } })).status, 403);
  assert.equal((await fetch(`${baseUrl}/admin-return.html`, { headers: { cookie } })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/admin/vehicle-services`, { headers: { cookie: employeeCookie } })).status, 403);
  assert.equal((await fetch(`${baseUrl}/api/admin/rental-settings`, { headers: { cookie: employeeCookie } })).status, 403);
  assert.equal((await fetch(`${baseUrl}/api/admin/rental-policy`, { headers: { cookie: employeeCookie } })).status, 403);
  assert.equal((await fetch(`${baseUrl}/api/admin/handover/conditions`, { headers: { cookie: employeeCookie } })).status, 403);

  const defaultRentalSettings = await fetch(`${baseUrl}/api/admin/rental-settings`, { headers: { cookie } });
  assert.equal(defaultRentalSettings.status, 200);
  assert.deepEqual(await defaultRentalSettings.json(), { reminderCycleHours: 24 });
  const defaultRentalPolicy = await (await fetch(`${baseUrl}/api/site-settings/rental-policy`)).json();
  assert.deepEqual(defaultRentalPolicy.depositOptions, [
    { label: 'Deposit Rp1.000.000', description: 'Dibayarkan sebelum kendaraan digunakan.' },
    { label: 'Titip motor', description: 'Motor menjadi jaminan selama masa rental.' },
  ]);
  assert.deepEqual(defaultRentalPolicy.collateralItems, ['Motor', 'KTP']);
  assert.deepEqual(await (await fetch(`${baseUrl}/api/admin/rental-policy`, { headers: { cookie } })).json(), defaultRentalPolicy);
  const updatedRentalPolicy = {
    depositOptions: [
      { label: 'Deposit Rp2.000.000', description: 'Dibayar sebelum kendaraan digunakan.' },
      { label: 'Titip KTP dan motor', description: 'KTP dan motor dititipkan selama masa rental.' },
      { label: 'Jaminan KTP', description: 'KTP asli dititipkan selama masa rental.' },
    ],
    collateralItems: ['KTP', 'Motor'],
  };
  const savedRentalPolicyResponse = await fetch(`${baseUrl}/api/admin/rental-policy`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(updatedRentalPolicy),
  });
  assert.equal(savedRentalPolicyResponse.status, 200);
  assert.deepEqual(await savedRentalPolicyResponse.json(), updatedRentalPolicy);
  assert.deepEqual(await (await fetch(`${baseUrl}/api/site-settings/rental-policy`)).json(), updatedRentalPolicy);
  const invalidRentalPolicyResponse = await fetch(`${baseUrl}/api/admin/rental-policy`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ ...updatedRentalPolicy, depositOptions: [{ label: 'Sama', description: 'Satu' }, { label: 'sama', description: 'Dua' }] }),
  });
  assert.equal(invalidRentalPolicyResponse.status, 400);
  const savedRentalSettings = await fetch(`${baseUrl}/api/admin/rental-settings`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ reminderCycleHours: 12 }),
  });
  assert.deepEqual(await savedRentalSettings.json(), { reminderCycleHours: 12 });

  const savedLocation = await fetch(`${baseUrl}/api/admin/location`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      address: 'Jalan DriveLink No. 1, Jakarta',
      mapsUrl: 'https://maps.app.goo.gl/abc123',
      reviewUrl: 'https://search.google.com/local/writereview?placeid=drivelink-test',
    }),
  });
  assert.equal(savedLocation.status, 200);
  assert.equal((await (await fetch(`${baseUrl}/api/location`)).json()).address, 'Jalan DriveLink No. 1, Jakarta');
  assert.deepEqual(await (await fetch(`${baseUrl}/api/site-settings/review-link`)).json(), {
    reviewUrl: 'https://search.google.com/local/writereview?placeid=drivelink-test',
  });
  const invalidReviewLink = await fetch(`${baseUrl}/api/admin/location`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      address: 'Jalan DriveLink No. 1, Jakarta',
      mapsUrl: 'https://maps.app.goo.gl/abc123',
      reviewUrl: 'https://example.org/not-a-google-review',
    }),
  });
  assert.equal(invalidReviewLink.status, 400);

  const customerReviewResponse = await fetch(`${baseUrl}/api/reviews`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Pelanggan Uji', rating: 5, comment: 'Pelayanan ramah dan kendaraan nyaman.' }),
  });
  assert.equal(customerReviewResponse.status, 201);
  const customerReview = await customerReviewResponse.json();
  assert.equal(customerReview.name, 'Pelanggan Uji');
  assert.equal(customerReview.rating, 5);
  assert.equal(customerReview.comment, 'Pelayanan ramah dan kendaraan nyaman.');
  assert.ok(customerReview.createdAt);
  assert.equal((await (await fetch(`${baseUrl}/api/reviews`)).json())[0].id, customerReview.id);
  const reconnectedStreamResponse = await fetch(`${baseUrl}/api/events?clientId=reconnected-watcher-01`);
  const reconnectedStreamReader = reconnectedStreamResponse.body.getReader();
  const reconnectedEvent = await reconnectedStreamReader.read();
  const reconnectedText = new TextDecoder().decode(reconnectedEvent.value);
  assert.match(reconnectedText, /event: connected/);
  assert.ok(Number(reconnectedText.match(/id: (\d+)/)[1]) > lastSeenRevision);
  await reconnectedStreamReader.cancel();
  const duplicateCustomerReview = await fetch(`${baseUrl}/api/reviews`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Pelanggan Ulang', rating: 4, comment: 'Saya ingin mengirim lagi.' }),
  });
  assert.equal(duplicateCustomerReview.status, 409);
  assert.match((await duplicateCustomerReview.json()).error, /sudah pernah memberikan penilaian/i);
  const invalidCustomerReview = await fetch(`${baseUrl}/api/reviews`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.60' },
    body: JSON.stringify({ name: 'Pelanggan', rating: 6, comment: 'Nilai tidak valid.' }),
  });
  assert.equal(invalidCustomerReview.status, 400);

  const savedVehicleService = await fetch(`${baseUrl}/api/admin/vehicle-services`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      plate: 'B 1234 DL',
      carType: 'Avanza Smart',
      engine: '1NR-VE',
      workshop: 'Bengkel Uji',
      lastServiceDate: '2026-10-01',
      lastServiceKm: 12000,
      nextServiceKm: 15000,
      nextServiceDate: '2026-12-01',
      receipt: image,
      items: [{ category: 'Oli', part: 'Oli mesin', details: 'Ganti oli berkala', cost: 150000 }],
    }),
  });
  assert.equal(savedVehicleService.status, 201);
  assert.equal((await savedVehicleService.json()).currentKm, 12000);
  let serviceUnits = await (await fetch(`${baseUrl}/api/admin/vehicle-services`, { headers: { cookie } })).json();
  assert.equal(serviceUnits[0].receipt, image);
  assert.equal(serviceUnits[0].serviceHistory[0].totalCost, 150000);
  assert.equal(serviceUnits[0].serviceHistory[0].items[0].part, 'Oli mesin');
  assert.equal(serviceUnits[0].serviceHistory[0].plate, 'B 1234 DL');
  assert.equal(serviceUnits[0].serviceHistory[0].carType, 'Avanza Smart');
  let serviceCategoriesResponse = await fetch(`${baseUrl}/api/admin/vehicle-service-categories`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      categories: ['Oli mesin', 'Ban', 'Cat', 'Salon mobil'],
      renamedFrom: 'Oli',
      renamedTo: 'Oli mesin',
    }),
  });
  assert.equal(serviceCategoriesResponse.status, 200);
  serviceUnits = await (await fetch(`${baseUrl}/api/admin/vehicle-services`, { headers: { cookie } })).json();
  assert.equal(serviceUnits[0].serviceHistory[0].items[0].category, 'Oli mesin');
  serviceCategoriesResponse = await fetch(`${baseUrl}/api/admin/vehicle-service-categories`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      categories: ['Ban', 'Cat', 'Salon mobil'],
      removedCategory: 'Oli mesin',
    }),
  });
  assert.equal(serviceCategoriesResponse.status, 200);
  serviceUnits = await (await fetch(`${baseUrl}/api/admin/vehicle-services`, { headers: { cookie } })).json();
  assert.equal(serviceUnits[0].serviceHistory[0].items[0].category, 'Ban');
  const overviewResponse = await fetch(`${baseUrl}/api/admin/overview`, { headers: { cookie } });
  assert.equal(overviewResponse.status, 200);
  const overview = await overviewResponse.json();
  assert.equal(overview.totalServiceExpenses, 150000);
  assert.equal(overview.revenueChart.length, 7);
  const dashboardSummary = await (await fetch(`${baseUrl}/api/admin/summary`, { headers: { cookie } })).json();
  assert.equal(dashboardSummary.totalServiceExpenses, 150000);
  const registeredExistingServiceUnit = await fetch(`${baseUrl}/api/admin/fleet/physical-units`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      plate: 'B 1234 DL',
      carType: 'Avanza Smart',
      color: 'Hitam',
      transmission: 'Otomatis',
      currentKm: 12000,
    }),
  });
  assert.equal(registeredExistingServiceUnit.status, 200);
  assert.equal((await registeredExistingServiceUnit.json()).color, 'Hitam');
  const missingUnitTransmission = await fetch(`${baseUrl}/api/admin/fleet/physical-units`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      carType: 'Avanza Smart',
      units: [{ plate: 'B 7777 DL', color: 'Merah', currentKm: 0 }],
    }),
  });
  assert.equal(missingUnitTransmission.status, 400);
  const registeredVehicles = await fetch(`${baseUrl}/api/admin/fleet/physical-units`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      carType: 'Avanza Smart',
      units: [
        { plate: 'B 5678 DL', color: 'Putih', transmission: 'Manual', currentKm: 9000 },
        { plate: 'B 9012 DL', color: 'Silver', transmission: 'Otomatis (CVT)', currentKm: 7000 },
      ],
    }),
  });
  assert.equal(registeredVehicles.status, 201);
  const registeredVehicleBatch = await registeredVehicles.json();
  assert.deepEqual(registeredVehicleBatch.map((unit) => unit.plate), ['B 5678 DL', 'B 9012 DL']);
  assert.deepEqual(registeredVehicleBatch.map((unit) => unit.transmission), ['Manual', 'Otomatis (CVT)']);
  assert.deepEqual(registeredVehicleBatch.map((unit) => unit.serviceHistory), [[], []]);
  const duplicateRegisteredVehicle = await fetch(`${baseUrl}/api/admin/fleet/physical-units`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      plate: 'B 5678 DL',
      carType: 'Avanza Smart',
      color: 'Putih',
      currentKm: 9000,
    }),
  });
  assert.equal(duplicateRegisteredVehicle.status, 409);
  const updatedPhysicalUnitResponse = await fetch(`${baseUrl}/api/admin/fleet/physical-units/B%205678%20DL`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ color: 'Putih Mutiara', transmission: 'Manual 6-speed', currentKm: 9500 }),
  });
  assert.equal(updatedPhysicalUnitResponse.status, 200);
  const updatedPhysicalUnit = await updatedPhysicalUnitResponse.json();
  assert.equal(updatedPhysicalUnit.color, 'Putih Mutiara');
  assert.equal(updatedPhysicalUnit.transmission, 'Manual 6-speed');
  assert.equal(updatedPhysicalUnit.currentKm, 9500);
  const refreshedPhysicalUnits = await (await fetch(`${baseUrl}/api/admin/fleet/physical-units`, {
    headers: { cookie },
  })).json();
  assert.equal(refreshedPhysicalUnits.find((unit) => unit.plate === 'B 5678 DL').transmission, 'Manual 6-speed');
  const deleteUnitWithServiceHistory = await fetch(`${baseUrl}/api/admin/fleet/physical-units/B%201234%20DL`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ reason: 'Perlu evaluasi penghapusan unit.' }),
  });
  assert.equal(deleteUnitWithServiceHistory.status, 202);
  const serviceHistoryDeletionRequest = await deleteUnitWithServiceHistory.json();
  assert.equal(serviceHistoryDeletionRequest.snapshot.unit.serviceHistory.length, 1);
  const rejectedServiceHistoryRequest = await fetch(`${baseUrl}/api/admin/fleet/deletion-requests/${serviceHistoryDeletionRequest.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ action: 'reject', note: 'Unit tetap dipertahankan.' }),
  });
  assert.equal(rejectedServiceHistoryRequest.status, 200);
  assert.equal((await rejectedServiceHistoryRequest.json()).status, 'rejected');
  const registeredUnitForDeletion = await fetch(`${baseUrl}/api/admin/fleet/physical-units`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      carType: 'Avanza Smart',
      units: [{ plate: 'B 3456 DL', color: 'Merah', transmission: 'Otomatis', currentKm: 0 }],
    }),
  });
  assert.equal(registeredUnitForDeletion.status, 201);
  const fleetCountBeforePhysicalDelete = (await (await fetch(`${baseUrl}/api/admin/fleet`, {
    headers: { cookie },
  })).json()).find((vehicle) => vehicle.name === 'Avanza Smart').totalCount;
  const deletePhysicalUnitResponse = await fetch(`${baseUrl}/api/admin/fleet/physical-units/B%203456%20DL`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ reason: 'Plat tidak lagi digunakan.' }),
  });
  assert.equal(deletePhysicalUnitResponse.status, 202);
  const physicalDeletionRequest = await deletePhysicalUnitResponse.json();
  assert.equal(physicalDeletionRequest.status, 'pending');
  assert.equal((await fetch(`${baseUrl}/api/admin/fleet/deletion-requests`, { headers: { cookie: employeeCookie } })).status, 403);
  assert.equal((await fetch(`${baseUrl}/admin-fleet-deletions.html`, { headers: { cookie: employeeCookie } })).status, 403);
  const pendingPhysicalUnits = await (await fetch(`${baseUrl}/api/admin/fleet/physical-units`, {
    headers: { cookie },
  })).json();
  assert.equal(pendingPhysicalUnits.some((unit) => unit.plate === 'B 3456 DL'), true);
  const approvePhysicalDeletionResponse = await fetch(`${baseUrl}/api/admin/fleet/deletion-requests/${physicalDeletionRequest.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ action: 'approve' }),
  });
  assert.equal(approvePhysicalDeletionResponse.status, 200);
  assert.equal((await approvePhysicalDeletionResponse.json()).status, 'approved');
  const remainingPhysicalUnits = await (await fetch(`${baseUrl}/api/admin/fleet/physical-units`, {
    headers: { cookie },
  })).json();
  assert.equal(remainingPhysicalUnits.some((unit) => unit.plate === 'B 3456 DL'), false);
  const fleetAfterPhysicalDelete = (await (await fetch(`${baseUrl}/api/admin/fleet`, {
    headers: { cookie },
  })).json()).find((vehicle) => vehicle.name === 'Avanza Smart');
  assert.equal(fleetAfterPhysicalDelete.totalCount, fleetCountBeforePhysicalDelete - 1);
  const unchangedOdometerResponse = await fetch(`${baseUrl}/api/admin/fleet/physical-units/B%205678%20DL`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ color: 'Putih', currentKm: 8000 }),
  });
  assert.equal(unchangedOdometerResponse.status, 200);
  assert.equal((await unchangedOdometerResponse.json()).currentKm, 9500);
  const serviceUnitList = await (await fetch(`${baseUrl}/api/admin/vehicle-services`, { headers: { cookie } })).json();
  assert.equal(serviceUnitList.find((unit) => unit.plate === 'B 5678 DL').serviceHistory.length, 0);
  const coloredFleet = await (await fetch(`${baseUrl}/api/fleet`)).json();
  const publicAvanza = coloredFleet.find((vehicle) => vehicle.name === 'Avanza Smart');
  assert.equal(publicAvanza.seats, 7);
  assert.deepEqual(publicAvanza.colors.map(({ name, totalCount, availableCount }) => ({ name, totalCount, availableCount })), [
    { name: 'Hitam', totalCount: 1, availableCount: 0 },
    { name: 'Putih', totalCount: 1, availableCount: 1 },
    { name: 'Silver', totalCount: 1, availableCount: 1 },
  ]);
  assert.deepEqual(publicAvanza.colors.find((color) => color.name === 'Putih').transmissions, [
    { name: 'Manual 6-speed', availableCount: 1 },
  ]);
  assert.deepEqual(publicAvanza.colors.find((color) => color.name === 'Silver').transmissions, [
    { name: 'Otomatis (CVT)', availableCount: 1 },
  ]);
  const colorBooking = {
    name: 'Pelanggan Warna',
    email: 'warna@example.com',
    phone: '081234567891',
    address: 'Jakarta',
    carType: 'Avanza Smart',
    vehicleColor: 'Putih',
    duration: '1 hari',
    bookingType: 'Reservasi',
    arrivalAt: new Date(Date.now() + 86400000).toISOString(),
    driverOption: 'Lepas kunci',
    documents: { identityType: 'KTP', ktp: image, simA: image, selfie: { dataUrl: image } },
  };
  const missingColorBooking = await fetch(`${baseUrl}/api/bookings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...colorBooking, vehicleColor: '' }),
  });
  assert.equal(missingColorBooking.status, 409);
  const colorBookingResponse = await fetch(`${baseUrl}/api/bookings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(colorBooking),
  });
  assert.equal(colorBookingResponse.status, 201);
  const savedColorBooking = await colorBookingResponse.json();
  assert.equal(savedColorBooking.vehicleColor, 'Putih');
  const colorBookingDetails = await (await fetch(
    `${baseUrl}/api/bookings/${savedColorBooking.id}/details?phone=${savedColorBooking.phone}`,
  )).json();
  assert.equal(colorBookingDetails.vehicleColor, 'Putih');
  const colorBookingApproval = await fetch(`${baseUrl}/api/admin/bookings/${savedColorBooking.id}/approval`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ action: 'approve' }),
  });
  assert.equal(colorBookingApproval.status, 200);
  const reservedColorUnitUpdate = await fetch(`${baseUrl}/api/admin/fleet/physical-units/B%205678%20DL`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ color: 'Putih', transmission: 'Manual', currentKm: 9600 }),
  });
  assert.equal(reservedColorUnitUpdate.status, 409);
  const deleteReservedPhysicalUnit = await fetch(`${baseUrl}/api/admin/fleet/physical-units/B%205678%20DL`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ reason: 'Unit sedang digunakan dalam pesanan.' }),
  });
  assert.equal(deleteReservedPhysicalUnit.status, 202);
  const reservedDeletionRequest = await deleteReservedPhysicalUnit.json();
  const approveReservedDeletion = await fetch(`${baseUrl}/api/admin/fleet/deletion-requests/${reservedDeletionRequest.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ action: 'approve' }),
  });
  assert.equal(approveReservedDeletion.status, 409);
  assert.equal((await (await fetch(`${baseUrl}/api/admin/fleet/deletion-requests`, { headers: { cookie } })).json())
    .find((request) => request.id === reservedDeletionRequest.id).status, 'pending');
  const fleetAfterColorApproval = await (await fetch(`${baseUrl}/api/fleet`)).json();
  assert.deepEqual(fleetAfterColorApproval.find((vehicle) => vehicle.name === 'Avanza Smart').colors
    .map(({ name, totalCount, availableCount }) => ({ name, totalCount, availableCount })), [
    { name: 'Hitam', totalCount: 1, availableCount: 0 },
    { name: 'Putih', totalCount: 1, availableCount: 0 },
    { name: 'Silver', totalCount: 1, availableCount: 1 },
  ]);
  const savedUnitCondition = await fetch(`${baseUrl}/api/admin/handover/conditions/Avanza%20Smart`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ notes: 'Periksa bodi kiri sebelum digunakan.', photos: [image] }),
  });
  assert.equal(savedUnitCondition.status, 200);
  assert.equal((await savedUnitCondition.json()).notes, 'Periksa bodi kiri sebelum digunakan.');
  const notificationData = await (await fetch(`${baseUrl}/api/admin/notification-data`, { headers: { cookie } })).json();
  assert.equal(notificationData.settings.reminderCycleHours, 12);
  assert.equal(notificationData.vehicleServices[0].receipt, undefined);
  assert.equal(notificationData.bookings[0].documents, undefined);
  assert.ok(Number.isInteger(notificationData.actionCounts.bookings));
  assert.ok(Number.isInteger(notificationData.actionCounts.payments));
  assert.ok(Number.isInteger(notificationData.actionCounts.returns));
  assert.equal('handover' in notificationData.actionCounts, false);

  const invalidFleetResponse = await fetch(`${baseUrl}/api/admin/fleet`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      name: 'Unit Tanpa Galeri',
      seats: 5,
      priceNoDriver: 500000,
      priceWithDriverFuel: 550000,
      priceWithDriverNoFuel: 520000,
      totalCount: 2,
      photos: [image],
    }),
  });
  assert.equal(invalidFleetResponse.status, 400);

  const fleetCreateResponse = await fetch(`${baseUrl}/api/admin/fleet`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      name: 'SUV Gallery',
      seats: 5,
      priceNoDriver: 500000,
      priceWithDriverFuel: 550000,
      priceWithDriverNoFuel: 520000,
      totalCount: 2,
      photos: [
        { name: 'depan.jpg', dataUrl: image },
        { name: 'samping.jpg', dataUrl: image },
      ],
    }),
  });
  assert.equal(fleetCreateResponse.status, 201);
  const createdFleetUnit = await fleetCreateResponse.json();
  assert.equal(createdFleetUnit.photoCount, 2);
  assert.equal(createdFleetUnit.photos[0].name, 'depan.jpg');
  assert.equal(Object.hasOwn(createdFleetUnit, 'transmission'), false);
  assert.equal(createdFleetUnit.seats, 5);
  const fleetUpdateResponse = await fetch(`${baseUrl}/api/admin/fleet/${createdFleetUnit.id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      priceNoDriver: 510000,
      priceWithDriverFuel: 560000,
      priceWithDriverNoFuel: 530000,
      totalCount: 2,
      category: 'SUV',
      seats: 7,
      photos: [
        { name: 'depan.jpg', dataUrl: image },
        { name: 'samping.jpg', dataUrl: image },
        { name: 'belakang.jpg', dataUrl: image },
      ],
    }),
  });
  assert.equal(fleetUpdateResponse.status, 200);
  const updatedFleetUnit = await fleetUpdateResponse.json();
  assert.equal(updatedFleetUnit.photoCount, 3);
  assert.equal(updatedFleetUnit.category, 'SUV');
  assert.equal(updatedFleetUnit.seats, 7);
  const publicFleet = await (await fetch(`${baseUrl}/api/fleet`)).json();
  assert.equal(publicFleet.find((item) => item.id === createdFleetUnit.id).photos.length, 3);
  assert.equal(Object.hasOwn(publicFleet.find((item) => item.id === createdFleetUnit.id), 'transmission'), false);
  assert.equal(publicFleet.find((item) => item.id === createdFleetUnit.id).seats, 7);
  const registerModelPhysicalUnit = await fetch(`${baseUrl}/api/admin/fleet/physical-units`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      carType: createdFleetUnit.name,
      units: [{ plate: 'S 1234 UV', color: 'Hitam', transmission: 'Otomatis', currentKm: 100 }],
    }),
  });
  assert.equal(registerModelPhysicalUnit.status, 201);

  const summaryBeforeArchive = await (await fetch(`${baseUrl}/api/admin/summary`, { headers: { cookie } })).json();
  assert.equal((await fetch(`${baseUrl}/api/admin/fleet/${createdFleetUnit.id}`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json', cookie: employeeCookie },
    body: JSON.stringify({ reason: 'Tidak diperlukan' }),
  })).status, 403);
  assert.equal((await fetch(`${baseUrl}/api/admin/fleet/${createdFleetUnit.id}`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ reason: '   ' }),
  })).status, 400);
  assert.equal((await fetch(`${baseUrl}/api/admin/fleet/${createdFleetUnit.id}`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ reason: 'x'.repeat(501) }),
  })).status, 400);
  assert.equal((await fetch(`${baseUrl}/api/admin/fleet/${createdFleetUnit.id}`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reason: 'Tidak diperlukan' }),
  })).status, 401);
  const archiveReason = 'Unit dijual dan tidak lagi tersedia untuk disewa.';
  const archiveResponse = await fetch(`${baseUrl}/api/admin/fleet/${createdFleetUnit.id}`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ reason: archiveReason }),
  });
  assert.equal(archiveResponse.status, 202);
  const fleetDeletionRequest = await archiveResponse.json();
  assert.equal(fleetDeletionRequest.status, 'pending');
  assert.equal(fleetDeletionRequest.reason, archiveReason);
  assert.equal(fleetDeletionRequest.snapshot.vehicle.name, createdFleetUnit.name);
  assert.equal((await fetch(`${baseUrl}/api/admin/fleet/${createdFleetUnit.id}`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ reason: archiveReason }),
  })).status, 409);
  assert.equal((await fetch(`${baseUrl}/api/admin/fleet/deletion-requests`, {
    headers: { cookie: employeeCookie },
  })).status, 403);
  assert.equal((await fetch(`${baseUrl}/api/admin/fleet/deletion-requests/${fleetDeletionRequest.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie: employeeCookie },
    body: JSON.stringify({ action: 'approve' }),
  })).status, 403);
  const deletionRequests = await (await fetch(`${baseUrl}/api/admin/fleet/deletion-requests`, {
    headers: { cookie },
  })).json();
  assert.ok(deletionRequests.some((item) => item.id === fleetDeletionRequest.id && item.reason === archiveReason));
  const approveFleetDeletionResponse = await fetch(`${baseUrl}/api/admin/fleet/deletion-requests/${fleetDeletionRequest.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ action: 'approve' }),
  });
  assert.equal(approveFleetDeletionResponse.status, 200);
  const archivedFleetDeletion = await approveFleetDeletionResponse.json();
  const archivedFleetUnit = (await (await fetch(`${baseUrl}/api/admin/fleet`, { headers: { cookie } })).json())
    .find((item) => item.id === createdFleetUnit.id);
  assert.equal(archivedFleetDeletion.status, 'approved');
  assert.equal(archivedFleetDeletion.snapshot.physicalUnits.some((unit) => unit.plate === 'S 1234 UV'), true);
  assert.equal(archivedFleetUnit.isArchived, true);
  assert.equal(archivedFleetUnit.archiveReason, archiveReason);
  assert.ok(archivedFleetUnit.archivedAt);
  const physicalUnitsAfterModelArchive = await (await fetch(`${baseUrl}/api/admin/fleet/physical-units`, {
    headers: { cookie },
  })).json();
  assert.equal(physicalUnitsAfterModelArchive.some((unit) => unit.plate === 'S 1234 UV'), false);
  const adminFleetAfterArchive = await (await fetch(`${baseUrl}/api/admin/fleet`, { headers: { cookie } })).json();
  assert.equal(adminFleetAfterArchive.find((item) => item.id === createdFleetUnit.id).isArchived, true);
  assert.equal((await fetch(`${baseUrl}/api/admin/fleet/${createdFleetUnit.id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      priceNoDriver: 510000,
      priceWithDriverFuel: 560000,
      priceWithDriverNoFuel: 530000,
      totalCount: 2,
    }),
  })).status, 409);
  assert.equal((await (await fetch(`${baseUrl}/api/fleet`)).json()).some((item) => item.id === createdFleetUnit.id), false);
  assert.equal((await fetch(`${baseUrl}/api/bookings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Pelanggan Unit Arsip',
      email: 'archive@example.com',
      phone: '081234567892',
      address: 'Jakarta',
      carType: createdFleetUnit.name,
      duration: '1 hari',
      bookingType: 'Reservasi',
      arrivalAt: new Date(Date.now() + 86400000).toISOString(),
      driverOption: 'Lepas kunci',
      documents: { identityType: 'KTP', ktp: image, simA: image, selfie: { dataUrl: image } },
    }),
  })).status, 409);
  const summaryAfterArchive = await (await fetch(`${baseUrl}/api/admin/summary`, { headers: { cookie } })).json();
  assert.equal(summaryBeforeArchive.totalVehicles - summaryAfterArchive.totalVehicles, createdFleetUnit.totalCount);

  const actionCountsBeforeBookingApproval = (await (await fetch(`${baseUrl}/api/admin/notification-data`, {
    headers: { cookie },
  })).json()).actionCounts;
  const approvalResponse = await fetch(`${baseUrl}/api/admin/bookings/${booking.id}/approval`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ action: 'approve' }),
  });
  assert.equal(approvalResponse.status, 200);
  assert.equal((await approvalResponse.json()).bookingApproval, 'Disetujui');
  const actionCountsAfterBookingApproval = (await (await fetch(`${baseUrl}/api/admin/notification-data`, {
    headers: { cookie },
  })).json()).actionCounts;
  assert.equal(actionCountsAfterBookingApproval.bookings, actionCountsBeforeBookingApproval.bookings - 1);
  assert.deepEqual(await (await fetch(`${baseUrl}/api/admin/handover/units`, { headers: { cookie } })).json(), [
    { plate: 'B 1234 DL', carType: 'Avanza Smart', category: 'MPV', color: 'Hitam', currentKm: 12000, lastServiceKm: 12000, nextServiceKm: 15000 },
    { plate: 'B 5678 DL', carType: 'Avanza Smart', category: 'MPV', color: 'Putih', currentKm: 9500 },
    { plate: 'B 9012 DL', carType: 'Avanza Smart', category: 'MPV', color: 'Silver', currentKm: 7000 },
  ]);

  const updatedFleet = await (await fetch(`${baseUrl}/api/fleet`)).json();
  assert.equal(updatedFleet.find((vehicle) => vehicle.name === 'Avanza Smart').availableCount, 0);
  const reservedVehicleArchiveResponse = await fetch(`${baseUrl}/api/admin/fleet/avanza-smart`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ reason: 'Unit sedang disewa.' }),
  });
  assert.equal(reservedVehicleArchiveResponse.status, 202);
  const reservedFleetDeletionRequest = await reservedVehicleArchiveResponse.json();
  const approveReservedFleetDeletion = await fetch(`${baseUrl}/api/admin/fleet/deletion-requests/${reservedFleetDeletionRequest.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ action: 'approve' }),
  });
  assert.equal(approveReservedFleetDeletion.status, 200);
  const approvedReservedFleetDeletion = await approveReservedFleetDeletion.json();
  assert.equal(approvedReservedFleetDeletion.status, 'approved');
  assert.match(approvedReservedFleetDeletion.reviewNote, /booking aktif tetap berjalan/);
  assert.equal((await (await fetch(`${baseUrl}/api/fleet`)).json())
    .some((vehicle) => vehicle.name === 'Avanza Smart'), false);
  const deferredPhysicalUnits = await (await fetch(`${baseUrl}/api/admin/fleet/physical-units`, {
    headers: { cookie },
  })).json();
  assert.ok(deferredPhysicalUnits.some((unit) => unit.carType === 'Avanza Smart' && unit.plate === 'B 1234 DL'));
  assert.equal(deferredPhysicalUnits.filter((unit) => unit.carType === 'Avanza Smart').length, 3);

  const actionCountsBeforePaymentSubmission = (await (await fetch(`${baseUrl}/api/admin/notification-data`, {
    headers: { cookie },
  })).json()).actionCounts;
  const paymentResponse = await fetch(`${baseUrl}/api/bookings/${booking.id}/payment`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: booking.phone, method: 'Cash ke petugas' }),
  });
  assert.equal(paymentResponse.status, 200);
  assert.equal((await paymentResponse.json()).paymentStatus, 'Bayar ke petugas');
  const actionCountsAfterPaymentSubmission = (await (await fetch(`${baseUrl}/api/admin/notification-data`, {
    headers: { cookie },
  })).json()).actionCounts;
  assert.equal(actionCountsAfterPaymentSubmission.payments, actionCountsBeforePaymentSubmission.payments);

  const paymentApprovalResponse = await fetch(`${baseUrl}/api/admin/bookings/${booking.id}/payment`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie: employeeCookie },
    body: JSON.stringify({ action: 'approve' }),
  });
  assert.equal(paymentApprovalResponse.status, 409);
  const actionCountsAfterPaymentApproval = (await (await fetch(`${baseUrl}/api/admin/notification-data`, {
    headers: { cookie },
  })).json()).actionCounts;
  assert.equal(actionCountsAfterPaymentApproval.payments, actionCountsAfterPaymentSubmission.payments);

  const handoverBookingsResponse = await fetch(`${baseUrl}/api/admin/handover/bookings`, { headers: { cookie } });
  assert.equal(handoverBookingsResponse.status, 200);
  const handoverBookings = await handoverBookingsResponse.json();
  assert.equal(handoverBookings.find((item) => item.id === booking.id).paymentStatus, 'Bayar ke petugas');
  assert.equal(handoverBookings.find((item) => item.id === savedColorBooking.id).stockReserved, true);
  const checklistCategory = {
    id: 'front-body-001',
    label: 'Cek body depan',
    types: ['check', 'choice', 'note', 'photo'],
    options: ['Baik', 'Ada lecet', 'Perlu diperiksa'],
    required: true,
  };
  const checklistConfigResponse = await fetch(`${baseUrl}/api/admin/handover/checklist-config`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ items: [checklistCategory] }),
  });
  assert.equal(checklistConfigResponse.status, 200);
  assert.deepEqual(await checklistConfigResponse.json(), [checklistCategory]);
  assert.deepEqual(await (await fetch(`${baseUrl}/api/admin/handover/checklist-config`, {
    headers: { cookie },
  })).json(), [checklistCategory]);
  const invalidChecklistOptions = await fetch(`${baseUrl}/api/admin/handover/checklist-config`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ items: [{ ...checklistCategory, options: ['Baik'] }] }),
  });
  assert.equal(invalidChecklistOptions.status, 400);

  const wrongColorInspection = await fetch(`${baseUrl}/api/admin/bookings/${booking.id}/inspection`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ plate: 'B 5678 DL' }),
  });
  assert.equal(wrongColorInspection.status, 400);

  const inspectionResponse = await fetch(`${baseUrl}/api/admin/bookings/${booking.id}/inspection`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      plate: 'B 1234 DL',
      odometerKm: 12000,
      fuelLevel: 'F (penuh)',
      bodyCondition: 'Baik, tidak ada lecet',
      bodyNotes: '',
      interiorCondition: 'Baik dan bersih',
      lightsCondition: 'Semua lampu berfungsi',
      tiresCondition: 'Baik dan tekanan sesuai',
      engineCondition: 'Normal, tidak ada indikator menyala',
      equipmentCondition: 'STNK, kunci, dongkrak, dan perlengkapan lengkap',
      notes: '',
      frontPhoto: image,
      photos: [image],
      customChecklist: [{
        id: checklistCategory.id,
        values: { checked: true, choice: 'Baik', note: 'Tidak ada kerusakan.', photo: image },
      }],
    }),
  });
  assert.equal(inspectionResponse.status, 200);

  const invalidInspectionResponse = await fetch(`${baseUrl}/api/admin/bookings/${booking.id}/inspection`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ frontPhoto: '' }),
  });
  assert.equal(invalidInspectionResponse.status, 400);

  const customerBookingAfterInspection = await (await fetch(`${baseUrl}/api/bookings/${booking.id}?phone=${booking.phone}`)).json();
  assert.equal(customerBookingAfterInspection.paymentStatus, 'Bayar ke petugas');
  assert.equal(customerBookingAfterInspection.vehicleInspectionComplete, true);
  assert.equal(customerBookingAfterInspection.vehicleInspection.plate, 'B 1234 DL');
  assert.equal(customerBookingAfterInspection.vehicleInspection.frontPhoto, image);
  assert.equal(customerBookingAfterInspection.vehicleInspection.photos, undefined);
  assert.deepEqual(customerBookingAfterInspection.vehicleInspection.customChecklist, [{
    id: checklistCategory.id,
    label: checklistCategory.label,
    types: checklistCategory.types,
    required: true,
    values: { checked: true, choice: 'Baik', note: 'Tidak ada kerusakan.', photo: image },
  }]);
  assert.equal(customerBookingAfterInspection.unitCondition.notes, 'Periksa bodi kiri sebelum digunakan.');
  assert.deepEqual(customerBookingAfterInspection.unitCondition.photos, [image]);
  const staffFrontPhotoResponse = await fetch(`${baseUrl}/api/admin/bookings/${booking.id}/inspection/front-photo`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ frontPhoto: image }),
  });
  assert.equal(staffFrontPhotoResponse.status, 200);
  assert.equal((await staffFrontPhotoResponse.json()).vehicleInspection.frontPhoto, image);
  const checklistPhotoUpdateResponse = await fetch(`${baseUrl}/api/admin/bookings/${booking.id}/inspection`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ frontPhoto: image }),
  });
  assert.equal(checklistPhotoUpdateResponse.status, 200);
  assert.equal((await checklistPhotoUpdateResponse.json()).vehicleInspection.frontPhoto, image);
  const handoverQueueResponse = await fetch(`${baseUrl}/api/admin/handover/bookings`, { headers: { cookie } });
  assert.equal(handoverQueueResponse.status, 200);
  assert.equal((await handoverQueueResponse.json()).find((item) => item.id === booking.id).paymentStatus, 'Bayar ke petugas');
  const handoverArchiveResponse = await fetch(`${baseUrl}/api/admin/handover/archive`, { headers: { cookie } });
  assert.equal(handoverArchiveResponse.status, 200);
  const handoverArchive = await handoverArchiveResponse.json();
  assert.equal(handoverArchive.find((item) => item.id === booking.id).id, booking.id);
  assert.ok(handoverArchive.find((item) => item.id === booking.id).checkedAt);
  const handoverArchiveDetailsResponse = await fetch(
    `${baseUrl}/api/admin/handover/bookings/${booking.id}/details`,
    { headers: { cookie } },
  );
  assert.equal(handoverArchiveDetailsResponse.status, 200);
  const handoverArchiveDetails = await handoverArchiveDetailsResponse.json();
  assert.equal(handoverArchiveDetails.documents.ktp, image);
  assert.equal(handoverArchiveDetails.documents.simA, image);
  assert.equal(handoverArchiveDetails.documents.selfie.dataUrl, image);
  assert.equal(handoverArchiveDetails.vehicleInspection.frontPhoto, image);
  assert.equal(handoverArchiveDetails.vehicleInspection.photos[0], image);
  assert.equal(handoverArchiveDetails.vehicleInspection.customChecklist[0].values.photo, image);
  const customerHandoverBooking = await (await fetch(
    `${baseUrl}/api/bookings/${booking.id}?phone=${booking.phone}`,
  )).json();
  assert.equal(customerHandoverBooking.vehicleInspection.frontPhoto, image);
  const orderDetailsAfterInspection = await (await fetch(`${baseUrl}/api/bookings/${booking.id}/details?phone=${booking.phone}`)).json();
  assert.equal(orderDetailsAfterInspection.vehicleInspection.plate, 'B 1234 DL');
  assert.equal(orderDetailsAfterInspection.vehicleInspection.customChecklist[0].values.choice, 'Baik');
  assert.equal(orderDetailsAfterInspection.vehicleInspection.odometerKm, 12000);
  assert.equal(orderDetailsAfterInspection.vehicleInspection.frontPhoto, undefined);
  assert.equal(orderDetailsAfterInspection.vehicleInspection.photos, undefined);

  const actionCountsBeforeHandoverSubmission = (await (await fetch(`${baseUrl}/api/admin/notification-data`, {
    headers: { cookie },
  })).json()).actionCounts;
  const handoverResponse = await fetch(`${baseUrl}/api/bookings/${booking.id}/handover`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: booking.phone, photos: [] }),
  });
  assert.equal(handoverResponse.status, 200);
  const submittedHandover = await handoverResponse.json();
  assert.equal(submittedHandover.handoverStatus, 'Disetujui');
  assert.equal(submittedHandover.status, 'Rental berjalan');
  assert.equal(submittedHandover.paymentStatus, 'Dikonfirmasi');
  assert.equal(submittedHandover.customerHandoverCompletedAt, submittedHandover.handoverSubmittedAt);
  const actionCountsAfterHandoverSubmission = (await (await fetch(`${baseUrl}/api/admin/notification-data`, {
    headers: { cookie },
  })).json()).actionCounts;
  assert.equal(actionCountsAfterHandoverSubmission.handover, actionCountsBeforeHandoverSubmission.handover);
  assert.deepEqual(submittedHandover.handoverPhotos, []);
  assert.ok(submittedHandover.rentalStartedAt);
  assert.ok(submittedHandover.handoverSubmittedAt);
  const orderAfterHandover = await (await fetch(`${baseUrl}/api/bookings/${booking.id}/details?phone=${booking.phone}`)).json();
  assert.equal(orderAfterHandover.rentalStartedAt, submittedHandover.rentalStartedAt);
  assert.equal(orderAfterHandover.customerHandoverCompletedAt, submittedHandover.customerHandoverCompletedAt);
  assert.equal(orderAfterHandover.rentalExtendedHours, 0);
  const repeatedHandoverResponse = await fetch(`${baseUrl}/api/bookings/${booking.id}/handover`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: booking.phone, photos: [] }),
  });
  assert.equal(repeatedHandoverResponse.status, 200);
  assert.equal((await repeatedHandoverResponse.json()).rentalStartedAt, submittedHandover.rentalStartedAt);

  // Endpoint persetujuan serah-terima oleh admin sudah dihapus; tidak ada lagi antrean ini.
  const handoverApprovalResponse = await fetch(`${baseUrl}/api/admin/bookings/${booking.id}/handover`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ action: 'approve' }),
  });
  assert.equal(handoverApprovalResponse.status, 404);
  const rentalExtensionResponse = await fetch(`${baseUrl}/api/admin/bookings/${booking.id}/rental`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ action: 'extend', hours: 12, checkpointHours: 12 }),
  });
  assert.equal(rentalExtensionResponse.status, 200);
  assert.equal((await rentalExtensionResponse.json()).rentalExtendedHours, 12);
  const notificationAfterExtension = await (await fetch(`${baseUrl}/api/admin/notification-data`, { headers: { cookie } })).json();
  assert.equal(notificationAfterExtension.bookings.find((item) => item.id === booking.id).rentalExtendedHours, 12);
  const finalOrderDetails = await (await fetch(`${baseUrl}/api/bookings/${booking.id}/details?phone=${booking.phone}`)).json();
  assert.equal(finalOrderDetails.bookingApproval, 'Disetujui');
  assert.equal(finalOrderDetails.paymentStatus, 'Dikonfirmasi');
  assert.ok(finalOrderDetails.paymentConfirmedAt);
  assert.equal(finalOrderDetails.handoverStatus, 'Disetujui');
  assert.ok(finalOrderDetails.customerHandoverCompletedAt);
  const orderByCodeOnly = await fetch(`${baseUrl}/api/bookings/${booking.id}/details`);
  assert.equal(orderByCodeOnly.status, 200);
  const orderByCodeOnlyDetails = await orderByCodeOnly.json();
  assert.equal(orderByCodeOnlyDetails.rentalStartedAt, finalOrderDetails.rentalStartedAt);
  assert.equal(orderByCodeOnlyDetails.rentalExtendedHours, 12);
  assert.equal(orderByCodeOnlyDetails.paymentProof, undefined);
  const returnLookupResponse = await fetch(`${baseUrl}/api/admin/bookings/${booking.id}/return`, { headers: { cookie } });
  assert.equal(returnLookupResponse.status, 200);
  const returnLookup = await returnLookupResponse.json();
  assert.equal(returnLookup.vehicleInspection.odometerKm, 12000);
  assert.equal(returnLookup.vehicleInspection.frontPhoto, image);
  assert.equal(returnLookup.returnInspection, null);
  const lowerReturnOdometer = await fetch(`${baseUrl}/api/admin/bookings/${booking.id}/return`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      plate: 'B 1234 DL',
      odometerKm: 11999,
      fuelLevel: '3/4 tangki',
      bodyCondition: 'Baik, tidak ada lecet',
      interiorCondition: 'Baik dan bersih',
      lightsCondition: 'Semua lampu berfungsi',
      tiresCondition: 'Baik dan tekanan sesuai',
      engineCondition: 'Normal, tidak ada indikator menyala',
      equipmentCondition: 'STNK, kunci, dongkrak, dan perlengkapan lengkap',
    }),
  });
  assert.equal(lowerReturnOdometer.status, 400);
  const mismatchedPlateResponse = await fetch(`${baseUrl}/api/admin/bookings/${booking.id}/return`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      plate: 'B 9999 XX',
      odometerKm: 12345,
      fuelLevel: '3/4 tangki',
      bodyCondition: 'Baik, tidak ada lecet',
      interiorCondition: 'Baik dan bersih',
      lightsCondition: 'Semua lampu berfungsi',
      tiresCondition: 'Baik dan tekanan sesuai',
      engineCondition: 'Normal, tidak ada indikator menyala',
      equipmentCondition: 'STNK, kunci, dongkrak, dan perlengkapan lengkap',
    }),
  });
  assert.equal(mismatchedPlateResponse.status, 400);
  const returnInspectionResponse = await fetch(`${baseUrl}/api/admin/bookings/${booking.id}/return`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      plate: 'B 1234 DL',
      odometerKm: 12345,
      fuelLevel: '3/4 tangki',
      bodyCondition: 'Ada lecet / penyok (catat lokasi)',
      bodyNotes: 'Lecet pintu belakang kiri',
      interiorCondition: 'Baik dan bersih',
      lightsCondition: 'Semua lampu berfungsi',
      tiresCondition: 'Baik dan tekanan sesuai',
      engineCondition: 'Normal, tidak ada indikator menyala',
      equipmentCondition: 'STNK, kunci, dongkrak, dan perlengkapan lengkap',
      notes: 'Ada lecet baru di bodi.',
    }),
  });
  assert.equal(returnInspectionResponse.status, 200);
  const returnedBooking = await returnInspectionResponse.json();
  assert.equal(returnedBooking.status, 'Dikembalikan');
  assert.equal(returnedBooking.returnInspection.odometerKm, 12345);
  assert.ok(returnedBooking.rentalReturnedAt);
  assert.equal(returnedBooking.stockReserved, false);
  const rentalArchiveResponse = await fetch(`${baseUrl}/api/admin/returns/archive`, { headers: { cookie } });
  assert.equal(rentalArchiveResponse.status, 200);
  const rentalArchive = await rentalArchiveResponse.json();
  assert.equal(rentalArchive.length, 1);
  assert.equal(rentalArchive[0].id, booking.id);
  assert.equal(rentalArchive[0].status, 'Dikembalikan');
  assert.equal(rentalArchive[0].plate, 'B 1234 DL');
  const rentalArchiveDetailsResponse = await fetch(
    `${baseUrl}/api/admin/returns/archive/${encodeURIComponent(booking.id)}`,
    { headers: { cookie } },
  );
  assert.equal(rentalArchiveDetailsResponse.status, 200);
  const rentalArchiveDetails = await rentalArchiveDetailsResponse.json();
  assert.equal(rentalArchiveDetails.name, 'Pelanggan Uji');
  assert.equal(rentalArchiveDetails.vehicleInspection.odometerKm, 12000);
  assert.equal(rentalArchiveDetails.returnInspection.odometerKm, 12345);
  assert.equal((await fetch(`${baseUrl}/api/admin/returns/archive/NOT-A-RETURNED-BOOKING`, {
    headers: { cookie },
  })).status, 404);
  const fleetAfterReturn = await (await fetch(`${baseUrl}/api/admin/fleet`, { headers: { cookie } })).json();
  assert.equal(fleetAfterReturn.find((item) => item.name === booking.carType).totalCount, 2);
  assert.equal(fleetAfterReturn.find((item) => item.name === booking.carType).availableCount, 0);
  const serviceUnitsAfterReturn = await (await fetch(`${baseUrl}/api/admin/vehicle-services`, { headers: { cookie } })).json();
  assert.equal(serviceUnitsAfterReturn.some((unit) => unit.plate === 'B 1234 DL'), false);
  assert.equal(serviceUnitsAfterReturn.filter((unit) => unit.carType === booking.carType).length, 2);
  const deletionHistoryAfterReturn = await (await fetch(`${baseUrl}/api/admin/fleet/deletion-requests`, {
    headers: { cookie },
  })).json();
  assert.equal(deletionHistoryAfterReturn.find((item) => item.id === reservedFleetDeletionRequest.id).status, 'approved');
  const returnedOrderDetails = await (await fetch(`${baseUrl}/api/bookings/${booking.id}/details?phone=${booking.phone}`)).json();
  assert.equal(returnedOrderDetails.status, 'Dikembalikan');
  assert.equal(returnedOrderDetails.vehicleInspection.odometerKm, 12000);
  assert.equal(returnedOrderDetails.returnInspection.odometerKm, 12345);
  assert.ok(returnedOrderDetails.rentalReturnedAt);
  const returnedCustomerBooking = await (await fetch(`${baseUrl}/api/bookings/${booking.id}?phone=${booking.phone}`)).json();
  assert.equal(returnedCustomerBooking.status, 'Dikembalikan');
  assert.ok(returnedCustomerBooking.rentalReturnedAt);
  const duplicateReturnResponse = await fetch(`${baseUrl}/api/admin/bookings/${booking.id}/return`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({}),
  });
  assert.equal(duplicateReturnResponse.status, 409);
  const remainingArchivedBookings = app.locals.db.prepare(`
    SELECT * FROM bookings
    WHERE stock_reserved = 1 AND status NOT IN ('Dibatalkan', 'Dikembalikan')
  `).all().map((row) => ({ row, booking: JSON.parse(row.payload) }))
    .filter(({ booking: item }) => item.carType === booking.carType);
  const archivedPhysicalUnits = (await (await fetch(`${baseUrl}/api/admin/fleet/physical-units`, {
    headers: { cookie },
  })).json()).filter((unit) => unit.carType === booking.carType);
  assert.equal(remainingArchivedBookings.length, archivedPhysicalUnits.length);
  for (const [{ row, booking: activeBooking }, unit] of remainingArchivedBookings.map((entry, index) => [entry, archivedPhysicalUnits[index]])) {
    const odometerKm = unit.currentKm || 0;
    activeBooking.vehicleInspection = { plate: unit.plate, odometerKm };
    app.locals.db.prepare(`
      UPDATE bookings
      SET status = 'Rental berjalan', payment_status = 'Dikonfirmasi', handover_status = 'Disetujui', payload = ?
      WHERE id = ?
    `).run(JSON.stringify(activeBooking), row.id);
    const finalReturnResponse = await fetch(`${baseUrl}/api/admin/bookings/${row.id}/return`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        plate: unit.plate,
        odometerKm,
        fuelLevel: '3/4 tangki',
        bodyCondition: 'Baik',
        interiorCondition: 'Baik',
        lightsCondition: 'Berfungsi',
        tiresCondition: 'Baik',
        engineCondition: 'Normal',
        equipmentCondition: 'Lengkap',
      }),
    });
    assert.equal(finalReturnResponse.status, 200);
  }
  const fullyCleanedArchivedFleet = (await (await fetch(`${baseUrl}/api/admin/fleet`, { headers: { cookie } })).json())
    .find((item) => item.name === booking.carType);
  assert.equal(fullyCleanedArchivedFleet.totalCount, 0);
  assert.equal(fullyCleanedArchivedFleet.availableCount, 0);
  assert.equal((await (await fetch(`${baseUrl}/api/admin/vehicle-services`, { headers: { cookie } })).json())
    .some((unit) => unit.carType === booking.carType), false);

  const disableEmployeeResponse = await fetch(`${baseUrl}/api/admin/accounts/petugas01`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      name: employee.name,
      email: employee.email,
      phone: employee.phone,
      employeeCode: employee.employeeCode,
      position: employee.position,
      permissions: employee.permissions,
      active: false,
    }),
  });
  assert.equal(disableEmployeeResponse.status, 200);
  assert.equal((await fetch(`${baseUrl}/api/auth/session`, { headers: { cookie: employeeCookie } })).status, 401);

  const duplicateUsernameResponse = await fetch(`${baseUrl}/api/admin/settings/profile`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      name: 'Admin DriveLink',
      username: 'petugas01',
      currentPassword: 'a-long-test-password',
      newPassword: '',
    }),
  });
  assert.equal(duplicateUsernameResponse.status, 409);
  const incorrectPasswordResponse = await fetch(`${baseUrl}/api/admin/settings/profile`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      name: 'Admin DriveLink',
      username: 'adminbaru',
      currentPassword: 'wrong-password',
      newPassword: '',
    }),
  });
  assert.equal(incorrectPasswordResponse.status, 401);

  const profileResponse = await fetch(`${baseUrl}/api/admin/settings/profile`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      name: 'Admin DriveLink Baru',
      username: 'adminbaru',
      currentPassword: 'a-long-test-password',
      newPassword: 'password-admin-baru-123',
    }),
  });
  assert.equal(profileResponse.status, 200);
  const refreshedCookie = profileResponse.headers.get('set-cookie').split(';')[0];
  assert.equal((await (await fetch(`${baseUrl}/api/auth/session`, { headers: { cookie: refreshedCookie } })).json()).username, 'adminbaru');
  assert.equal((await fetch(`${baseUrl}/api/auth/session`, { headers: { cookie } })).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'a-long-test-password' }),
  })).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'adminbaru', password: 'password-admin-baru-123' }),
  })).status, 200);
});
