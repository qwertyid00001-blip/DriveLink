const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const express = require('express');

const ROOT = __dirname;
const DEFAULT_FLEET = [
  { id: 'avanza-smart', name: 'Avanza Smart', category: 'MPV', transmission: 'Otomatis', seats: 7, totalCount: 5, availableCount: 5, priceNoDriver: 420000, priceWithDriverFuel: 420000, priceWithDriverNoFuel: 420000 },
  { id: 'br-v-family', name: 'BR-V Family', category: 'SUV', transmission: 'Otomatis', seats: 7, totalCount: 5, availableCount: 5, priceNoDriver: 520000, priceWithDriverFuel: 520000, priceWithDriverNoFuel: 520000 },
  { id: 'ev-cityx', name: 'EV CityX', category: 'Electric', transmission: 'Otomatis', seats: 5, totalCount: 5, availableCount: 5, priceNoDriver: 680000, priceWithDriverFuel: 680000, priceWithDriverNoFuel: 680000 },
];
const DURATIONS = new Map([['1 hari', 1], ['3 hari', 3], ['7 hari', 7], ['1 bulan', 30]]);
const PAYMENT_METHODS = new Set(['QRIS', 'Transfer bank', 'Cash ke petugas']);
const MAX_FLEET_PHOTOS = 6;
const MAX_FLEET_PHOTO_BYTES = 700 * 1024;
const MAX_FLEET_PHOTO_TOTAL_BYTES = 4 * 1024 * 1024;
const MAX_HOME_BANNER_BYTES = 3 * 1024 * 1024;
const MAX_BRAND_LOGO_BYTES = 1 * 1024 * 1024;
const CHECKLIST_FIELD_TYPES = new Set(['check', 'choice', 'note', 'photo']);
const DEFAULT_FLEET_CATEGORIES = ['MPV', 'SUV', 'Electric'];
const DEFAULT_VEHICLE_SERVICE_CATEGORIES = ['Oli', 'Ban', 'Cat', 'Salon mobil'];
const DEFAULT_RENTAL_POLICY = {
  depositOptions: [
    { label: 'Deposit Rp1.000.000', description: 'Dibayarkan sebelum kendaraan digunakan.' },
    { label: 'Titip motor', description: 'Motor menjadi jaminan selama masa rental.' },
  ],
  collateralItems: ['Motor', 'KTP'],
};
const DEFAULT_HOME_BANNER = { enabled: false, image: '', updatedAt: '' };
const HOME_HERO_EFFECTS = new Set([
  'static', 'fade', 'slide-up', 'slide-left', 'slide-right',
  'zoom', 'typewriter', 'marquee', 'bounce', 'pulse', 'gradient',
]);
const DEFAULT_HOME_HERO = {
  eyebrow: '#MobilCerdas',
  title: 'Sewa mobil pintar untuk perjalanan aman, cepat, dan nyaman.',
  description: 'DriveLink menghadirkan layanan rental mobil berbasis IoT dengan pemantauan real-time, keamanan lebih tinggi, dan pengalaman perjalanan yang lebih efisien untuk kebutuhan personal maupun bisnis.',
  effect: 'static',
};
const SOCIAL_MEDIA_HOSTS = {
  instagram: ['instagram.com'],
  facebook: ['facebook.com', 'fb.com'],
  tiktok: ['tiktok.com'],
  youtube: ['youtube.com', 'youtu.be'],
  x: ['x.com', 'twitter.com'],
  whatsapp: ['wa.me', 'whatsapp.com'],
};
const DEFAULT_SITE_CONTACT = {
  heading: 'Kontak',
  phone: '+62 812-3456-789',
  email: 'hello@drivelink.id',
  whatsapp: '',
  socialLinks: [],
};
const DEFAULT_HOME_OFFER = {
  enabled: true,
  badge: 'Penawaran perjalanan',
  title: 'Temukan armada untuk perjalanan Anda',
  description: 'Jelajahi pilihan kendaraan DriveLink dan pilih yang paling sesuai dengan rencana perjalanan Anda.',
  buttonLabel: 'Lihat armada',
  buttonUrl: 'fleet.html',
};
const EMPLOYEE_FEATURES = [
  { id: 'overview', label: 'Ringkasan' },
  { id: 'bookings', label: 'Booking' },
  { id: 'fleet', label: 'Armada' },
  { id: 'vehicle-service', label: 'Kontrol unit & servis' },
  { id: 'location', label: 'Lokasi rental' },
  { id: 'rental-settings', label: 'Pengaturan sewa' },
  { id: 'travel-packages', label: 'Paket perjalanan & promo' },
  { id: 'monitoring', label: 'Monitoring IoT' },
  { id: 'payments', label: 'Pembayaran' },
  { id: 'handover', label: 'Serah-terima' },
  { id: 'checklist', label: 'Atur checklist' },
  { id: 'handover-archive', label: 'Arsip checklist' },
  { id: 'return', label: 'Pengembalian unit' },
  { id: 'rental-archive', label: 'Arsip penyewaan' },
];
const ADMIN_PAGE_FEATURES = {
  'admin.html': 'overview',
  'admin-bookings.html': 'bookings',
  'admin-fleet.html': 'fleet',
  'admin-fleet-deletions.html': 'fleet-deletions',
  'admin-vehicle-service.html': 'vehicle-service',
  'admin-location.html': 'location',
  'admin-rental-settings.html': 'rental-settings',
  'admin-travel-packages.html': 'travel-packages',
  'admin-monitoring.html': 'monitoring',
  'admin-payments.html': 'payments',
  'admin-handover.html': 'handover',
  'admin-checklist.html': 'checklist',
  'admin-handover-archive.html': 'handover-archive',
  'admin-return.html': 'return',
  'admin-rental-archive.html': 'rental-archive',
  'admin-accounts.html': 'accounts',
  'admin-settings.html': 'settings',
};

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '').replace(/^62/, '0');
}

function validImage(value, maxBytes = 400 * 1024) {
  if (typeof value !== 'string') return false;
  const match = value.match(/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]*={0,2})$/);
  if (!match) return false;
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > maxBytes) return false;
  if (match[1] === 'png') {
    return bytes.length >= 24
      && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      && bytes.readUInt32BE(16) > 0
      && bytes.readUInt32BE(20) > 0;
  }
  return bytes.length >= 4
    && bytes[0] === 0xff
    && bytes[1] === 0xd8
    && bytes[2] === 0xff
    && bytes[bytes.length - 2] === 0xff
    && bytes[bytes.length - 1] === 0xd9;
}

function imageBytes(value) {
  const match = typeof value === 'string' && value.match(/^data:image\/(?:jpeg|png);base64,([A-Za-z0-9+/]*={0,2})$/);
  return match ? Buffer.from(match[1], 'base64').length : 0;
}

function makeId() {
  return `DL-${crypto.randomBytes(12).toString('hex').toUpperCase()}`;
}

function paymentReady(booking) {
  if (booking.depositPaymentRequired) {
    return booking.depositPaymentStatus === 'Dikonfirmasi' && booking.paymentStatus === 'Dikonfirmasi';
  }
  return ['Dikonfirmasi', 'Bukti diunggah', 'Bayar ke petugas'].includes(booking.paymentStatus);
}

function depositAmountFromLabel(label) {
  const text = String(label || '');
  const rupiahAmount = text.match(/rp\.?\s*([\d.,]+)/i);
  if (rupiahAmount) return Number(rupiahAmount[1].replace(/\D/g, '')) || 0;
  const jutaAmount = text.match(/(\d+(?:[.,]\d+)?)\s*(?:jt|juta)\b/i);
  return jutaAmount ? Math.round(Number(jutaAmount[1].replace(',', '.')) * 1_000_000) : 0;
}

function canLookupOrderById(booking, id, phone) {
  const hasStrongBookingId = /^DL-[A-F0-9]{24}$/.test(id);
  return hasStrongBookingId
    ? !phone || normalizePhone(phone) === normalizePhone(booking.phone)
    : normalizePhone(phone) === normalizePhone(booking.phone);
}

function jakartaDate(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftIsoDate(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function passwordHash(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function passwordMatches(password, stored) {
  const [salt, expectedHex] = String(stored).split(':');
  if (!salt || !expectedHex) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function hasReadableContrast(hexColor) {
  const channels = hexColor.slice(1).match(/.{2}/g).map((channel) => Number.parseInt(channel, 16) / 255);
  const luminance = channels.map((channel) => channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);
  return (1.05 / (luminance + 0.05)) >= 4.5;
}

function createDatabase(databasePath, adminUsername, adminPassword) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS admins (
      username TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      employee_code TEXT NOT NULL DEFAULT '',
      position TEXT NOT NULL DEFAULT '',
      permissions_json TEXT NOT NULL DEFAULT '[]',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      username TEXT NOT NULL REFERENCES admins(username) ON DELETE CASCADE,
      expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS fleet (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      total_count INTEGER NOT NULL CHECK (total_count >= 0),
      available_count INTEGER NOT NULL CHECK (available_count >= 0 AND available_count <= total_count),
      price_no_driver INTEGER NOT NULL CHECK (price_no_driver >= 1000),
      price_driver_fuel INTEGER NOT NULL CHECK (price_driver_fuel >= 1000),
      price_driver_no_fuel INTEGER NOT NULL CHECK (price_driver_no_fuel >= 1000),
      photos_json TEXT NOT NULL DEFAULT '[]',
      category TEXT NOT NULL DEFAULT 'MPV',
      transmission TEXT NOT NULL DEFAULT 'Belum diisi',
      seats INTEGER NOT NULL DEFAULT 0,
      is_archived INTEGER NOT NULL DEFAULT 0,
      archive_reason TEXT NOT NULL DEFAULT '',
      archived_at TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      phone_normalized TEXT NOT NULL,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL,
      approval TEXT NOT NULL,
      payment_status TEXT NOT NULL,
      handover_status TEXT NOT NULL,
      stock_reserved INTEGER NOT NULL DEFAULT 0,
      payload TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS bookings_created_at ON bookings(created_at DESC);
    CREATE INDEX IF NOT EXISTS bookings_phone ON bookings(id, phone_normalized);
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS fleet_deletion_requests (
      id TEXT PRIMARY KEY,
      target_type TEXT NOT NULL CHECK (target_type IN ('fleet-model', 'physical-unit')),
      target_id TEXT NOT NULL,
      target_name TEXT NOT NULL,
      target_snapshot_json TEXT NOT NULL,
      reason TEXT NOT NULL,
      requested_by TEXT NOT NULL,
      requested_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      reviewed_by TEXT NOT NULL DEFAULT '',
      reviewed_at TEXT NOT NULL DEFAULT '',
      review_note TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS fleet_deletion_requests_status ON fleet_deletion_requests(status, requested_at DESC);
  `);
  const adminColumns = db.prepare('PRAGMA table_info(admins)').all();
  const adminMigrations = [
    ['role', "TEXT NOT NULL DEFAULT 'admin'"],
    ['email', "TEXT NOT NULL DEFAULT ''"],
    ['phone', "TEXT NOT NULL DEFAULT ''"],
    ['employee_code', "TEXT NOT NULL DEFAULT ''"],
    ['position', "TEXT NOT NULL DEFAULT ''"],
    ['permissions_json', "TEXT NOT NULL DEFAULT '[]'"],
    ['active', 'INTEGER NOT NULL DEFAULT 1'],
    ['created_at', "TEXT NOT NULL DEFAULT ''"],
  ];
  for (const [column, definition] of adminMigrations) {
    if (!adminColumns.some((item) => item.name === column)) {
      db.exec(`ALTER TABLE admins ADD COLUMN ${column} ${definition}`);
    }
  }
  db.exec("UPDATE admins SET created_at = datetime('now') WHERE created_at = ''");
  const employeePermissions = db.prepare("SELECT username, permissions_json FROM admins WHERE role = 'employee'").all();
  const updateEmployeePermissions = db.prepare('UPDATE admins SET permissions_json = ? WHERE username = ?');
  const permissionMigrationKey = 'employee-checklist-permissions-v1';
  const shouldMigrateChecklistPermissions = !db.prepare('SELECT 1 FROM settings WHERE key = ?').get(permissionMigrationKey);
  for (const employee of employeePermissions) {
    const permissions = JSON.parse(employee.permissions_json || '[]');
    if (permissions.includes('handover') && !permissions.includes('return')) {
      permissions.push('return');
    }
    if (shouldMigrateChecklistPermissions && permissions.includes('handover')) {
      if (!permissions.includes('checklist')) permissions.push('checklist');
      if (!permissions.includes('handover-archive')) permissions.push('handover-archive');
    }
    updateEmployeePermissions.run(JSON.stringify([...new Set(permissions)]), employee.username);
  }
  if (shouldMigrateChecklistPermissions) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(permissionMigrationKey, 'complete');
  }
  const rentalArchiveMigrationKey = 'employee-rental-archive-permissions-v1';
  if (!db.prepare('SELECT 1 FROM settings WHERE key = ?').get(rentalArchiveMigrationKey)) {
    const employeesWithReturnAccess = db.prepare("SELECT username, permissions_json FROM admins WHERE role = 'employee'").all();
    for (const employee of employeesWithReturnAccess) {
      const permissions = JSON.parse(employee.permissions_json || '[]');
      if (permissions.includes('return') && !permissions.includes('rental-archive')) {
        permissions.push('rental-archive');
        updateEmployeePermissions.run(JSON.stringify(permissions), employee.username);
      }
    }
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(rentalArchiveMigrationKey, 'complete');
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS admins_email_unique ON admins(email) WHERE email <> \'\'');
  const fleetColumns = db.prepare('PRAGMA table_info(fleet)').all();
  if (!fleetColumns.some((column) => column.name === 'photos_json')) {
    db.exec("ALTER TABLE fleet ADD COLUMN photos_json TEXT NOT NULL DEFAULT '[]'");
  }
  if (!fleetColumns.some((column) => column.name === 'category')) {
    db.exec("ALTER TABLE fleet ADD COLUMN category TEXT NOT NULL DEFAULT 'MPV'");
    db.exec("UPDATE fleet SET category = CASE WHEN name LIKE '%EV%' OR name LIKE '%Electric%' THEN 'Electric' WHEN name LIKE '%SUV%' OR name LIKE '%BR-V%' THEN 'SUV' ELSE 'MPV' END");
  }
  if (!fleetColumns.some((column) => column.name === 'is_archived')) {
    db.exec('ALTER TABLE fleet ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0');
  }
  if (!fleetColumns.some((column) => column.name === 'archive_reason')) {
    db.exec("ALTER TABLE fleet ADD COLUMN archive_reason TEXT NOT NULL DEFAULT ''");
  }
  if (!fleetColumns.some((column) => column.name === 'archived_at')) {
    db.exec("ALTER TABLE fleet ADD COLUMN archived_at TEXT NOT NULL DEFAULT ''");
  }
  if (!fleetColumns.some((column) => column.name === 'transmission')) {
    db.exec("ALTER TABLE fleet ADD COLUMN transmission TEXT NOT NULL DEFAULT 'Belum diisi'");
  }
  if (!fleetColumns.some((column) => column.name === 'seats')) {
    db.exec('ALTER TABLE fleet ADD COLUMN seats INTEGER NOT NULL DEFAULT 0');
  }

  const admin = db.prepare('SELECT username FROM admins LIMIT 1').get();
  if (!admin) {
    if (!adminUsername || !adminPassword || adminPassword.length < 12) {
      db.close();
      throw new Error('Set ADMIN_USERNAME and ADMIN_PASSWORD (minimum 12 characters) before starting the server.');
    }
    db.prepare(`
      INSERT INTO admins (username, password_hash, name, role, email, position, active)
      VALUES (?, ?, ?, 'admin', 'admin@drivelink.id', 'Administrator', 1)
    `).run(adminUsername, passwordHash(adminPassword), 'Admin DriveLink');
  } else if (adminUsername && !db.prepare('SELECT 1 FROM admins WHERE username = ?').get(adminUsername)) {
    // Peringatan saja: nilai dari environment tidak boleh menaikkan role atau mengubah akun mana pun.
    console.warn(`ADMIN_USERNAME "${adminUsername}" tidak ada di database. Akun yang ada tidak diubah.`);
  }

  const insertFleet = db.prepare(`
    INSERT OR IGNORE INTO fleet
      (id, name, total_count, available_count, price_no_driver, price_driver_fuel, price_driver_no_fuel, category, transmission, seats)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const vehicle of DEFAULT_FLEET) {
    insertFleet.run(vehicle.id, vehicle.name, vehicle.totalCount, vehicle.availableCount,
      vehicle.priceNoDriver, vehicle.priceWithDriverFuel, vehicle.priceWithDriverNoFuel,
      vehicle.category, vehicle.transmission, vehicle.seats);
  }
  db.prepare("UPDATE fleet SET transmission = ?, seats = ? WHERE id = ? AND transmission = 'Belum diisi' AND seats = 0")
    .run('Otomatis', 7, 'avanza-smart');
  db.prepare("UPDATE fleet SET transmission = ?, seats = ? WHERE id = ? AND transmission = 'Belum diisi' AND seats = 0")
    .run('Otomatis', 7, 'br-v-family');
  db.prepare("UPDATE fleet SET transmission = ?, seats = ? WHERE id = ? AND transmission = 'Belum diisi' AND seats = 0")
    .run('Otomatis', 5, 'ev-cityx');
  return db;
}

function createApp(options = {}) {
  const databasePath = options.databasePath || process.env.DATABASE_PATH || path.join(ROOT, 'data', 'drivelink.sqlite');
  const db = options.db || createDatabase(
    databasePath,
    options.adminUsername || process.env.ADMIN_USERNAME,
    options.adminPassword || process.env.ADMIN_PASSWORD,
  );
  const sessionSecret = options.sessionSecret || process.env.SESSION_SECRET;
  if (!sessionSecret || sessionSecret.length < 32) {
    if (!options.db) db.close();
    throw new Error('Set SESSION_SECRET to a random string of at least 32 characters.');
  }
  const app = express();
  const loginAttempts = new Map();
  const reviewAttempts = new Map();
  const updateStreams = new Set();
  const updateInstanceId = crypto.randomUUID();

  function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
      return forwarded.split(',')[0].trim();
    }
    const realIp = req.headers['x-real-ip'];
    if (typeof realIp === 'string' && realIp.trim()) {
      return realIp.trim();
    }
    const cloudflareIp = req.headers['cf-connecting-ip'];
    if (typeof cloudflareIp === 'string' && cloudflareIp.trim()) {
      return cloudflareIp.trim();
    }
    return req.ip || req.socket?.remoteAddress || 'unknown';
  }
  let updateRevision = 0;
  const hashSessionToken = (token) => crypto.createHmac('sha256', sessionSecret).update(token).digest('hex');
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cache-Control', 'no-store');
    req.cookies = Object.fromEntries(
      String(req.headers.cookie || '').split(';').map((part) => {
        const separator = part.indexOf('=');
        return separator < 0
          ? ['', '']
          : [part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim())];
      }).filter(([name]) => name),
    );
    next();
  });
  app.use(express.json({ limit: '8mb', strict: true }));

  function publishDataChange(excludedClientId) {
    updateRevision += 1;
    const event = `id: ${updateRevision}\nevent: data-changed\ndata: ${JSON.stringify({ instanceId: updateInstanceId, revision: updateRevision })}\n\n`;
    for (const stream of updateStreams) {
      if (stream.clientId === excludedClientId) continue;
      if (stream.response.destroyed || stream.response.writableEnded) {
        updateStreams.delete(stream);
        continue;
      }
      stream.response.write(event);
    }
  }

  app.get('/api/events', (req, res) => {
    const clientId = /^[a-zA-Z0-9-]{8,80}$/.test(String(req.query.clientId || ''))
      ? String(req.query.clientId)
      : '';
    res.status(200);
    res.set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    res.write(`id: ${updateRevision}\nevent: connected\ndata: ${JSON.stringify({ instanceId: updateInstanceId, revision: updateRevision })}\n\n`);
    const stream = { response: res, clientId };
    updateStreams.add(stream);
    const heartbeat = setInterval(() => {
      if (!res.destroyed && !res.writableEnded) res.write(': keep-alive\n\n');
    }, 25000);
    heartbeat.unref();
    res.on('close', () => {
      clearInterval(heartbeat);
      updateStreams.delete(stream);
    });
  });

  app.use((req, res, next) => {
    res.once('finish', () => {
      if (!req.path.startsWith('/api/')
        || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)
        || req.path.startsWith('/api/auth/')
        || res.statusCode < 200 || res.statusCode >= 300) return;
      publishDataChange(String(req.get('X-DriveLink-Client-Id') || ''));
    });
    next();
  });

  function fail(res, status, message) {
    return res.status(status).json({ error: message });
  }

  function readSetting(key, fallback = {}) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? JSON.parse(row.value) : fallback;
  }

  function writeSetting(key, value) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, JSON.stringify(value));
  }

  const physicalUnitTransmissionMigration = 'physical-unit-transmission-v1';
  if (!db.prepare('SELECT 1 FROM settings WHERE key = ?').get(physicalUnitTransmissionMigration)) {
    const units = readSetting('vehicle-services', []);
    let changed = false;
    for (const unit of units) {
      if (unit.transmission) continue;
      const legacyModel = db.prepare('SELECT transmission FROM fleet WHERE name = ?').get(unit.carType);
      if (!legacyModel?.transmission || legacyModel.transmission === 'Belum diisi') continue;
      unit.transmission = legacyModel.transmission;
      changed = true;
    }
    if (changed) writeSetting('vehicle-services', units);
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(physicalUnitTransmissionMigration, 'complete');
  }

  function fleetCategories() {
    return readSetting('fleet-categories', DEFAULT_FLEET_CATEGORIES);
  }

  function normalizeFleetCategory(value) {
    return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  }

  function validFleetCategory(value) {
    return value.length >= 2 && value.length <= 40 && !/[\u0000-\u001f\u007f<>]/.test(value);
  }

  function replaceFleetCategoryReferences(previous, next) {
    db.prepare('UPDATE fleet SET category = ? WHERE category = ?').run(next, previous);
    const packages = readSetting('travel-packages', []).map((item) => {
      if (!Array.isArray(item.categories) || !item.categories.includes(previous)) return item;
      return { ...item, categories: [...new Set(item.categories.map((category) => category === previous ? next : category))] };
    });
    writeSetting('travel-packages', packages);
  }

  function readRentalPolicy() {
    return readSetting('rental-policy', DEFAULT_RENTAL_POLICY);
  }

  function fleetRecord(row) {
    const photos = JSON.parse(row.photos_json || '[]');
    return {
      id: row.id,
      name: row.name,
      category: row.category || 'MPV',
      seats: Number(row.seats) || 0,
      totalCount: row.total_count,
      availableCount: row.available_count,
      priceNoDriver: row.price_no_driver,
      priceWithDriverFuel: row.price_driver_fuel,
      priceWithDriverNoFuel: row.price_driver_no_fuel,
      photos,
      photoCount: photos.length,
      isArchived: Boolean(row.is_archived),
      archiveReason: row.archive_reason || '',
      archivedAt: row.archived_at || '',
    };
  }

  function fleetDeletionRequestRecord(row) {
    return {
      id: row.id,
      targetType: row.target_type,
      targetId: row.target_id,
      targetName: row.target_name,
      snapshot: JSON.parse(row.target_snapshot_json),
      reason: row.reason,
      requestedBy: row.requested_by,
      requestedAt: row.requested_at,
      status: row.status,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at,
      reviewNote: row.review_note,
    };
  }

  function activeFleetReservations(excludeBookingId = '') {
    return db.prepare('SELECT * FROM bookings ORDER BY created_at ASC, id ASC').all()
      .map(bookingRecord)
      .filter((booking) => booking.id !== excludeBookingId
        && booking.stockReserved
        && !['Dibatalkan', 'Dikembalikan'].includes(booking.status));
  }

  function fleetPhysicalUnits(carType) {
    return readSetting('vehicle-services', []).filter((unit) => unit.carType === carType && unit.color);
  }

  function createFleetDeletionRequest(req, targetType, targetId, reason) {
    const normalizedReason = typeof reason === 'string' ? reason.trim() : '';
    if (!normalizedReason || normalizedReason.length > 500) {
      return { error: 'Alasan penghapusan wajib diisi, maksimal 500 karakter.' };
    }
    let targetName;
    let snapshot;
    if (targetType === 'fleet-model') {
      const row = db.prepare('SELECT * FROM fleet WHERE id = ? AND is_archived = 0').get(targetId);
      if (!row) return { error: 'Unit armada tidak ditemukan atau sudah diarsipkan.', status: 404 };
      const vehicle = fleetRecord(row);
      targetName = vehicle.name;
      snapshot = { vehicle, physicalUnits: fleetPhysicalUnits(vehicle.name) };
    } else {
      const unit = readSetting('vehicle-services', []).find((item) =>
        item.plate.toUpperCase() === String(targetId).trim().toUpperCase() && item.color);
      if (!unit) return { error: `Unit berplat ${targetId} tidak ditemukan.`, status: 404 };
      targetName = `${unit.carType} · ${unit.plate}`;
      snapshot = { unit };
    }
    const existingRequest = db.prepare(`
      SELECT id FROM fleet_deletion_requests
      WHERE target_type = ? AND target_id = ? AND status = 'pending'
    `).get(targetType, targetId);
    if (existingRequest) return { error: 'Permintaan penghapusan untuk unit ini masih menunggu persetujuan.', status: 409 };
    const id = `FDR-${crypto.randomUUID()}`;
    const requestedAt = new Date().toISOString();
    db.prepare(`
      INSERT INTO fleet_deletion_requests
        (id, target_type, target_id, target_name, target_snapshot_json, reason, requested_by, requested_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, targetType, String(targetId), targetName, JSON.stringify(snapshot),
      normalizedReason, req.admin.username, requestedAt);
    return { request: fleetDeletionRequestRecord(db.prepare('SELECT * FROM fleet_deletion_requests WHERE id = ?').get(id)) };
  }

  function physicalColorReservations(carType, excludeBookingId = '') {
    const units = fleetPhysicalUnits(carType);
    const colors = [...new Set(units.map((unit) => unit.color))]
      .sort((left, right) => left.localeCompare(right, 'id'));
    const counts = new Map(colors.map((color) => [
      color,
      units.filter((unit) => unit.color === color).length,
    ]));
    const assignedColors = new Map();
    const reservations = activeFleetReservations(excludeBookingId)
      .filter((booking) => booking.carType === carType);
    reservations.forEach((booking) => {
      const assignedUnit = units.find((unit) => unit.plate === booking.vehicleInspection?.plate);
      const reservedColor = booking.vehicleColor || assignedUnit?.color;
      if (reservedColor && counts.has(reservedColor)) {
        counts.set(reservedColor, counts.get(reservedColor) - 1);
        assignedColors.set(booking.id, reservedColor);
      }
    });
    reservations.filter((booking) => !booking.vehicleColor && !booking.vehicleInspection?.plate)
      .forEach((booking) => {
        const availableColor = colors.find((color) => counts.get(color) > 0);
        if (!availableColor) return;
        counts.set(availableColor, counts.get(availableColor) - 1);
        assignedColors.set(booking.id, availableColor);
      });
    return { units, colors, counts, assignedColors };
  }

  function physicalColorAvailability(carType, excludeBookingId = '') {
    const { units, colors, counts } = physicalColorReservations(carType, excludeBookingId);
    const reservedPlates = reservedPhysicalPlates();
    return colors.map((name) => ({
      name,
      totalCount: units.filter((unit) => unit.color === name).length,
      availableCount: Math.max(0, counts.get(name)),
      transmissions: [...units.filter((unit) => unit.color === name && !reservedPlates.has(unit.plate.toUpperCase()))
        .reduce((transmissions, unit) => {
          const transmission = unit.transmission || 'Belum diisi';
          transmissions.set(transmission, (transmissions.get(transmission) || 0) + 1);
          return transmissions;
        }, new Map())]
        .map(([transmission, availableCount]) => ({ name: transmission, availableCount })),
    }));
  }

  function reservedPhysicalPlates() {
    const units = readSetting('vehicle-services', []).filter((unit) => unit.color);
    const bookings = activeFleetReservations();
    const reservedPlates = new Set(bookings.map((booking) => booking.vehicleInspection?.plate?.toUpperCase()).filter(Boolean));
    const holdsByColor = new Map();
    for (const carType of new Set(units.map((unit) => unit.carType))) {
      const assignments = physicalColorReservations(carType).assignedColors;
      for (const color of assignments.values()) {
        const key = JSON.stringify([carType, color]);
        holdsByColor.set(key, (holdsByColor.get(key) || 0) + 1);
      }
    }
    for (const [key, heldCount] of holdsByColor) {
      const [carType, color] = JSON.parse(key);
      let remaining = Math.max(0, heldCount - bookings.filter((booking) =>
        booking.carType === carType && booking.vehicleInspection?.plate
        && units.some((unit) => unit.plate.toUpperCase() === booking.vehicleInspection.plate.toUpperCase()
          && unit.carType === carType && unit.color === color)).length);
      for (const unit of units) {
        if (remaining <= 0) break;
        if (unit.carType !== carType || unit.color !== color || reservedPlates.has(unit.plate.toUpperCase())) continue;
        reservedPlates.add(unit.plate.toUpperCase());
        remaining -= 1;
      }
    }
    return reservedPlates;
  }

  function publicFleetRecord(row) {
    const record = fleetRecord(row);
    const physicalUnits = fleetPhysicalUnits(record.name);
    if (!physicalUnits.length) return { ...record, colors: [] };
    const colors = physicalColorAvailability(record.name);
    return {
      ...record,
      colors,
      availableCount: colors.reduce((sum, color) => sum + color.availableCount, 0),
    };
  }

  function availablePhysicalColorCount(carType, color, excludeBookingId = '') {
    return physicalColorAvailability(carType, excludeBookingId)
      .find((entry) => entry.name === color)?.availableCount || 0;
  }

  function parseFleetPhotos(value, required = true) {
    if (!Array.isArray(value)) return required ? { error: 'Unggah minimal dua foto kendaraan.' } : { photos: undefined };
    if (value.length < 2 || value.length > MAX_FLEET_PHOTOS) {
      return { error: `Unggah 2 sampai ${MAX_FLEET_PHOTOS} foto kendaraan.` };
    }
    const photos = [];
    let totalBytes = 0;
    for (const item of value) {
      const dataUrl = typeof item === 'string' ? item : item?.dataUrl;
      const name = typeof item === 'object' && typeof item.name === 'string' ? item.name.trim().slice(0, 120) : '';
      const bytes = imageBytes(dataUrl);
      if (!validImage(dataUrl, MAX_FLEET_PHOTO_BYTES) || !bytes) {
        return { error: 'Setiap foto harus JPG/PNG dengan ukuran maksimal 700 KB.' };
      }
      totalBytes += bytes;
      photos.push({ name: name || `Foto kendaraan ${photos.length + 1}`, dataUrl });
    }
    if (totalBytes > MAX_FLEET_PHOTO_TOTAL_BYTES) {
      return { error: 'Ukuran total foto armada maksimal 4 MB.' };
    }
    return { photos };
  }

  function bookingRecord(row) {
    const booking = JSON.parse(row.payload);
    return {
      ...booking,
      status: row.status,
      bookingApproval: row.approval,
      paymentStatus: row.payment_status,
      handoverStatus: row.handover_status,
      stockReserved: Boolean(row.stock_reserved),
    };
  }

  function publicBooking(booking) {
    const publicFields = [
      'id', 'phone', 'carType', 'vehicleColor', 'duration', 'bookingType', 'arrivalAt',
      'driverOption', 'fuelPackage', 'ratePerDay', 'estimatedTotal', 'deposit',
      'depositAmount', 'depositPaymentRequired', 'depositPaymentStatus', 'depositPaymentMethod',
      'packageId', 'packageName', 'packageIncludes', 'promotionId', 'promotionName',
      'baseTotal', 'discountAmount', 'freeFuelDays',
      'status', 'bookingApproval', 'paymentStatus', 'paymentMethod',
      'handoverStatus', 'handoverAdminNote', 'handoverPhotos',
      'handoverSubmittedAt', 'handoverApprovedAt', 'customerHandoverCompletedAt',
      'rentalStartedAt', 'rentalReturnedAt',
      'vehicleInspection', 'createdAt',
    ];
    const result = Object.fromEntries(publicFields
      .filter((key) => booking[key] !== undefined)
      .map((key) => [key, booking[key]]).concat([
        ['vehicleInspectionComplete', Boolean(booking.vehicleInspection)],
      ]));
    if (booking.vehicleInspection) {
      const inspection = booking.vehicleInspection;
      const frontPhoto = inspection.frontPhoto || inspection.photos?.[0];
      result.vehicleInspection = Object.fromEntries([
        'plate', 'color', 'odometerKm', 'fuelLevel', 'bodyCondition', 'bodyNotes',
        'interiorCondition', 'lightsCondition', 'tiresCondition', 'engineCondition',
        'equipmentCondition', 'notes', 'customChecklist', 'checkedAt',
      ].filter((key) => inspection[key] !== undefined)
        .map((key) => [key, inspection[key]]));
      if (frontPhoto) result.vehicleInspection.frontPhoto = frontPhoto;
    }
    const condition = readSetting('unit-conditions', {})[booking.carType];
    if (condition) result.unitCondition = { notes: condition.notes, photos: condition.photos };
    return result;
  }

  function publicOrderDetails(booking) {
    return {
      id: booking.id,
      name: booking.name,
      email: booking.email,
      phone: booking.phone,
      address: booking.address,
      bookingType: booking.bookingType,
      arrivalAt: booking.arrivalAt,
      carType: booking.carType,
      vehicleColor: booking.vehicleColor || '',
      duration: booking.duration,
      driverOption: booking.driverOption,
      fuelPackage: booking.fuelPackage,
      ratePerDay: booking.ratePerDay,
      estimatedTotal: booking.estimatedTotal,
      baseTotal: booking.baseTotal,
      discountAmount: booking.discountAmount,
      deposit: booking.deposit,
      packageName: booking.packageName,
      packageIncludes: booking.packageIncludes,
      promotionName: booking.promotionName,
      freeFuelDays: booking.freeFuelDays,
      status: booking.status,
      bookingApproval: booking.bookingApproval,
      bookingApprovedAt: booking.bookingApprovedAt || '',
      paymentStatus: booking.paymentStatus,
      paymentMethod: booking.paymentMethod || '',
      depositAmount: booking.depositAmount || 0,
      depositPaymentRequired: Boolean(booking.depositPaymentRequired),
      depositPaymentStatus: booking.depositPaymentStatus || '',
      depositPaymentMethod: booking.depositPaymentMethod || '',
      depositPaymentSubmittedAt: booking.depositPaymentSubmittedAt || '',
      depositPaymentReviewedAt: booking.depositPaymentReviewedAt || '',
      paymentSubmittedAt: booking.paymentSubmittedAt || '',
      paymentConfirmedAt: booking.paymentConfirmedAt || '',
      handoverStatus: booking.handoverStatus,
      handoverAdminNote: booking.handoverAdminNote || '',
      handoverSubmittedAt: booking.handoverSubmittedAt || '',
      handoverApprovedAt: booking.handoverApprovedAt || '',
      customerHandoverCompletedAt: booking.customerHandoverCompletedAt || '',
      rentalStartedAt: booking.rentalStartedAt || '',
      rentalExtendedHours: booking.rentalExtendedHours || 0,
      rentalReturnedAt: booking.rentalReturnedAt || '',
      returnInspection: booking.returnInspection ? Object.fromEntries([
        'plate', 'odometerKm', 'fuelLevel', 'bodyCondition', 'bodyNotes',
        'interiorCondition', 'lightsCondition', 'tiresCondition', 'engineCondition',
        'equipmentCondition', 'notes', 'checkedAt',
      ].filter((key) => booking.returnInspection[key] !== undefined)
        .map((key) => [key, booking.returnInspection[key]])) : null,
      vehicleInspectionComplete: Boolean(booking.vehicleInspection),
      vehiclePlate: booking.vehicleInspection?.plate || '',
      vehicleInspection: booking.vehicleInspection ? Object.fromEntries([
        'plate', 'odometerKm', 'fuelLevel', 'bodyCondition', 'bodyNotes',
        'interiorCondition', 'lightsCondition', 'tiresCondition', 'engineCondition',
        'equipmentCondition', 'notes', 'customChecklist', 'checkedAt',
      ].filter((key) => booking.vehicleInspection[key] !== undefined)
        .map((key) => [key, booking.vehicleInspection[key]])) : null,
      travelType: booking.documents?.residencyType || booking.travelType || '',
      residencyDays: booking.documents?.residencyDays || '',
      identityType: booking.documents?.identityType || '',
      uploadedDocuments: [
        ['ktp', 'KTP'],
        ['passport', 'Paspor'],
        ['simA', 'SIM A'],
        ['selfie', 'Selfie'],
        ['ticket', 'Tiket perjalanan'],
        ['hotel', 'Bukti penginapan'],
      ].filter(([key]) => Boolean(booking.documents?.[key])).map(([, label]) => label),
      createdAt: booking.createdAt,
    };
  }

  function saveBooking(booking) {
    db.prepare(`
      INSERT INTO bookings (id, phone_normalized, created_at, status, approval, payment_status, handover_status, stock_reserved, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET phone_normalized=excluded.phone_normalized, created_at=excluded.created_at,
        status=excluded.status, approval=excluded.approval, payment_status=excluded.payment_status,
        handover_status=excluded.handover_status, stock_reserved=excluded.stock_reserved, payload=excluded.payload
    `).run(
      booking.id, normalizePhone(booking.phone), booking.createdAt, booking.status,
      booking.bookingApproval, booking.paymentStatus, booking.handoverStatus,
      Number(Boolean(booking.stockReserved)), JSON.stringify(booking),
    );
  }

  function getBooking(id) {
    const row = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
    return row ? bookingRecord(row) : null;
  }

  db.prepare("SELECT * FROM bookings WHERE payment_status = 'Dikonfirmasi' AND status = 'Pembayaran'")
    .all()
    .forEach((row) => {
      const booking = bookingRecord(row);
      booking.status = 'Serah terima';
      booking.statusHistory = booking.statusHistory || [];
      booking.statusHistory.push({ status: booking.status, at: new Date().toISOString() });
      saveBooking(booking);
    });

  function requireAdmin(req, res, next) {
    const token = req.cookies?.drivelink_session;
    if (!token) return fail(res, 401, 'Silakan login sebagai admin.');
    const session = db.prepare(`
      SELECT admins.username, admins.name, admins.role, admins.email, admins.position,
        admins.permissions_json, admins.active FROM sessions
      JOIN admins ON admins.username = sessions.username
      WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND admins.active = 1
    `).get(hashSessionToken(token), new Date().toISOString());
    if (!session) return fail(res, 401, 'Sesi admin tidak valid atau sudah berakhir.');
    req.admin = {
      ...session,
      permissions: session.role === 'admin' ? EMPLOYEE_FEATURES.map(({ id }) => id)
        : JSON.parse(session.permissions_json || '[]'),
    };
    return next();
  }

  function requirePrimaryAdmin(req, res, next) {
    return requireAdmin(req, res, (error) => {
      if (error) return next(error);
      if (req.admin.role !== 'admin') return fail(res, 403, 'Hanya admin utama yang dapat menyetujui penghapusan armada.');
      return next();
    });
  }

  function requireFeature(feature) {
    return (req, res, next) => requireAdmin(req, res, (error) => {
      if (error) return next(error);
      if (req.admin.role !== 'admin' && !req.admin.permissions.includes(feature)) {
        return fail(res, 403, 'Akun ini tidak memiliki izin untuk fitur tersebut.');
      }
      return next();
    });
  }

  function requireAnyFeature(...features) {
    return (req, res, next) => requireAdmin(req, res, (error) => {
      if (error) return next(error);
      if (req.admin.role !== 'admin' && !features.some((feature) => req.admin.permissions.includes(feature))) {
        return fail(res, 403, 'Akun ini tidak memiliki izin untuk fitur tersebut.');
      }
      return next();
    });
  }

  function requireAccountManager(req, res, next) {
    return requireAdmin(req, res, (error) => {
      if (error) return next(error);
      if (req.admin.role !== 'admin') return fail(res, 403, 'Hanya administrator yang dapat mengelola akun.');
      return next();
    });
  }

  function accountRecord(row) {
    return {
      username: row.username,
      name: row.name,
      email: row.email,
      phone: row.phone,
      employeeCode: row.employee_code,
      position: row.position,
      role: row.role,
      permissions: row.role === 'admin' ? EMPLOYEE_FEATURES.map(({ id }) => id)
        : JSON.parse(row.permissions_json || '[]'),
      active: Boolean(row.active),
      createdAt: row.created_at,
    };
  }

  function packageRecord(item) {
    return {
      id: item.id,
      name: item.name,
      description: item.description,
      categories: item.categories,
      mealIncluded: item.mealIncluded,
      mineralWaterIncluded: item.mineralWaterIncluded,
      active: item.active,
    };
  }

  function promotionRecord(item) {
    return {
      id: item.id,
      name: item.name,
      description: item.description,
      kind: item.kind,
      value: item.value,
      fuelDays: item.fuelDays,
      startsAt: item.startsAt,
      endsAt: item.endsAt,
      packageIds: item.packageIds,
      active: item.active,
    };
  }

  function validDateOnly(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
      && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  }

  function validateTravelPackage(body) {
    const name = String(body?.name || '').trim();
    const description = String(body?.description || '').trim();
    const categories = Array.isArray(body?.categories) ? [...new Set(body.categories)] : [];
    if (!name || name.length > 80 || description.length > 500 || !categories.length
      || categories.some((category) => !fleetCategories().includes(category))
      || typeof body?.mealIncluded !== 'boolean' || typeof body?.mineralWaterIncluded !== 'boolean'
      || typeof body?.active !== 'boolean') {
      return { error: 'Isi nama, deskripsi, kategori armada, fasilitas makan/air mineral, dan status paket dengan benar.' };
    }
    const availableCategories = new Set(db.prepare('SELECT DISTINCT category FROM fleet').all().map((row) => row.category));
    if (categories.some((category) => !availableCategories.has(category))) {
      return { error: 'Kategori paket harus memiliki unit armada yang terdaftar.' };
    }
    return { item: {
      name, description, categories, mealIncluded: body.mealIncluded,
      mineralWaterIncluded: body.mineralWaterIncluded, active: body.active,
    } };
  }

  function validatePromotion(body) {
    const name = String(body?.name || '').trim();
    const description = String(body?.description || '').trim();
    const kind = body?.kind;
    const value = Number(body?.value);
    const fuelDays = Number(body?.fuelDays);
    const startsAt = body?.startsAt;
    const endsAt = body?.endsAt;
    const packageIds = Array.isArray(body?.packageIds) ? [...new Set(body.packageIds)] : [];
    const packages = readSetting('travel-packages', []);
    if (!name || name.length > 80 || description.length > 500
      || !['discount_percent', 'discount_amount', 'free_fuel'].includes(kind)
      || !Number.isInteger(value) || value < 1
      || kind === 'discount_percent' && value > 100
      || kind !== 'free_fuel' && value > 100000000
      || kind === 'free_fuel' && (value > 100000000 || !Number.isInteger(fuelDays) || fuelDays < 1 || fuelDays > 30)
      || kind !== 'free_fuel' && fuelDays !== 0
      || !validDateOnly(startsAt) || !validDateOnly(endsAt) || startsAt > endsAt
      || packageIds.some((id) => !packages.some((item) => item.id === id))
      || typeof body?.active !== 'boolean') {
      return { error: 'Periksa nama promo, jenis dan nilai manfaat, rentang tanggal, paket berlaku, dan status.' };
    }
    return { item: { name, description, kind, value, fuelDays, startsAt, endsAt, packageIds, active: body.active } };
  }

  function validateAccount(body, { creating = false } = {}) {
    const name = String(body?.name || '').trim();
    const username = String(body?.username || '').trim();
    const email = String(body?.email || '').trim().toLowerCase();
    const phone = String(body?.phone || '').trim();
    const employeeCode = String(body?.employeeCode || '').trim();
    const position = String(body?.position || '').trim();
    const password = String(body?.password || '');
    const permissions = body?.permissions;
    if (!name || name.length > 100 || !/^[A-Za-z0-9._-]{3,40}$/.test(username)
      || !email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      || phone.length > 30 || employeeCode.length > 40 || position.length > 100
      || creating && password.length < 12
      || !creating && password && password.length < 12
      || !Array.isArray(permissions)
      || permissions.some((permission) => !EMPLOYEE_FEATURES.some((feature) => feature.id === permission))) {
      return { error: 'Periksa nama, username (3–40 karakter), email, data karyawan, izin fitur, dan password minimal 12 karakter.' };
    }
    return { account: { name, username, email, phone, employeeCode, position, password, permissions: [...new Set(permissions)] } };
  }

  function cookie(req, res, token, maxAge) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `drivelink_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`);
  }

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  app.post('/api/auth/login', (req, res) => {
    const address = req.ip || req.socket.remoteAddress || 'unknown';
    const cutoff = Date.now() - 15 * 60 * 1000;
    const attempts = (loginAttempts.get(address) || []).filter((timestamp) => timestamp > cutoff);
    if (attempts.length >= 8) return fail(res, 429, 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.');
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    const admin = db.prepare('SELECT username, password_hash, name, email, role, permissions_json, active FROM admins WHERE username = ?').get(username);
    if (!admin || !admin.active || !passwordMatches(password, admin.password_hash)) {
      attempts.push(Date.now());
      loginAttempts.set(address, attempts);
      return fail(res, 401, 'Username atau password admin tidak sesuai.');
    }
    loginAttempts.delete(address);
    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
    db.prepare('INSERT INTO sessions (token_hash, username, expires_at) VALUES (?, ?, ?)')
      .run(hashSessionToken(token), admin.username, expiresAt);
    cookie(req, res, token, 8 * 60 * 60);
    return res.json({
      name: admin.name,
      email: admin.email,
      username: admin.username,
      role: admin.role,
      permissions: admin.role === 'admin' ? EMPLOYEE_FEATURES.map(({ id }) => id) : JSON.parse(admin.permissions_json || '[]'),
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = req.cookies?.drivelink_session;
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?')
      .run(hashSessionToken(token));
    cookie(req, res, '', 0);
    return res.json({ success: true });
  });

  app.get('/api/auth/session', requireAdmin, (req, res) => {
    res.json({
      name: req.admin.name,
      email: req.admin.email,
      username: req.admin.username,
      role: req.admin.role,
      position: req.admin.position,
      permissions: req.admin.permissions,
    });
  });

  app.get('/api/site-settings/theme', (req, res) => {
    const theme = readSetting('theme', { primary: '#1837d1' });
    const primary = /^#[0-9a-f]{6}$/i.test(theme.primary) && hasReadableContrast(theme.primary)
      ? theme.primary
      : '#1837d1';
    const gradientEnd = /^#[0-9a-f]{6}$/i.test(theme.gradientEnd)
      && hasReadableContrast(theme.gradientEnd)
      ? theme.gradientEnd
      : '#476eff';
    const gradientAngle = ['45deg', '90deg', '135deg', '180deg'].includes(theme.gradientAngle)
      ? theme.gradientAngle
      : '135deg';
    res.json({ primary, gradientEnd, gradientAngle });
  });

  app.get('/api/site-settings/logo', (req, res) => {
    const logo = readSetting('brand-logo', '');
    res.json({ image: validImage(logo, MAX_BRAND_LOGO_BYTES) ? logo : '' });
  });

  app.get('/api/admin/settings/logo', requireAccountManager, (req, res) => {
    const logo = readSetting('brand-logo', '');
    res.json({ image: validImage(logo, MAX_BRAND_LOGO_BYTES) ? logo : '' });
  });

  app.put('/api/admin/settings/logo', requireAccountManager, (req, res) => {
    const image = req.body?.image;
    if (image !== '' && !validImage(image, MAX_BRAND_LOGO_BYTES)) {
      return fail(res, 400, `Unggah logo JPG/PNG maksimal ${MAX_BRAND_LOGO_BYTES / 1024 / 1024} MB.`);
    }
    writeSetting('brand-logo', image);
    res.json({ image });
  });

  app.get('/api/site-settings/offer', (req, res) => {
    const offer = readSetting('home-offer', DEFAULT_HOME_OFFER);
    res.json(offer);
  });

  app.get('/api/site-settings/home-hero', (req, res) => {
    res.json(readSetting('home-hero', DEFAULT_HOME_HERO));
  });

  app.get('/api/site-settings/contact', (req, res) => {
    res.json(readSetting('site-contact', DEFAULT_SITE_CONTACT));
  });

  app.get('/api/site-settings/rental-policy', (req, res) => {
    res.json(readRentalPolicy());
  });

  app.get('/api/reviews', (req, res) => {
    const reviews = readSetting('customer-reviews', []).map((review) => {
      const { reviewerIpHash, ...publicReview } = review;
      return publicReview;
    });
    res.json(reviews.slice(0, 200));
  });

  app.post('/api/reviews', (req, res) => {
    const clientIp = getClientIp(req);
    const reviewerIpHash = crypto.createHash('sha256').update(clientIp).digest('hex');
    const reviews = readSetting('customer-reviews', []);
    if (reviewAttempts.has(reviewerIpHash) || reviews.some((review) => review.reviewerIpHash === reviewerIpHash)) {
      return fail(res, 409, 'Anda sudah pernah memberikan penilaian di website ini. Terima kasih atas feedback Anda.');
    }
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim() : '';
    const rating = Number(req.body?.rating);
    if (!name || name.length > 60 || !comment || comment.length > 600
      || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return fail(res, 400, 'Isi nama, penilaian 1 sampai 5 bintang, dan ulasan maksimal 600 karakter.');
    }
    reviewAttempts.set(reviewerIpHash, Date.now());
    const review = {
      id: crypto.randomUUID(),
      name,
      rating,
      comment,
      createdAt: new Date().toISOString(),
      reviewerIpHash,
    };
    writeSetting('customer-reviews', [review, ...reviews].slice(0, 200));
    return res.status(201).json({
      id: review.id,
      name: review.name,
      rating: review.rating,
      comment: review.comment,
      createdAt: review.createdAt,
    });
  });

  app.get('/api/site-settings/review-link', (req, res) => {
    const location = readSetting('location', null);
    res.json({ reviewUrl: location?.reviewUrl || '' });
  });

  app.get('/api/site-settings/home-banner', (req, res) => {
    const banner = readSetting('home-banner', DEFAULT_HOME_BANNER);
    res.json(banner.enabled ? banner : { ...banner, image: '' });
  });

  app.get('/api/admin/settings/home-banner', requireAccountManager, (req, res) => {
    res.json(readSetting('home-banner', DEFAULT_HOME_BANNER));
  });

  app.get('/api/admin/settings/home-hero', requireAccountManager, (req, res) => {
    res.json(readSetting('home-hero', DEFAULT_HOME_HERO));
  });

  app.get('/api/admin/settings/contact', requireAccountManager, (req, res) => {
    res.json(readSetting('site-contact', DEFAULT_SITE_CONTACT));
  });

  app.put('/api/admin/settings/theme', requireAccountManager, (req, res) => {
    const primary = String(req.body?.primary || '');
    const gradientEnd = String(req.body?.gradientEnd || '#476eff');
    const gradientAngle = String(req.body?.gradientAngle || '135deg');
    if (!/^#[0-9a-f]{6}$/i.test(primary) || !hasReadableContrast(primary)
      || !/^#[0-9a-f]{6}$/i.test(gradientEnd) || !hasReadableContrast(gradientEnd)
      || !['45deg', '90deg', '135deg', '180deg'].includes(gradientAngle)) {
      return fail(res, 400, 'Pilih warna aksen valid dengan kontras yang cukup agar teks tetap terbaca.');
    }
    const theme = {
      primary: primary.toLowerCase(),
      gradientEnd: gradientEnd.toLowerCase(),
      gradientAngle,
    };
    writeSetting('theme', theme);
    return res.json(theme);
  });

  app.put('/api/admin/settings/offer', requireAccountManager, (req, res) => {
    const { enabled } = req.body || {};
    const badge = String(req.body?.badge || '').trim();
    const title = String(req.body?.title || '').trim();
    const description = String(req.body?.description || '').trim();
    const buttonLabel = String(req.body?.buttonLabel || '').trim();
    const buttonUrl = String(req.body?.buttonUrl || '').trim();
    let destination;
    try {
      destination = new URL(buttonUrl, 'https://drivelink.local/');
    } catch {
      return fail(res, 400, 'Tautan tombol penawaran tidak valid.');
    }
    const allowedPages = new Set([
      '/index.html', '/fleet.html', '/features.html', '/pricing.html',
      '/reviews.html', '/booking.html', '/orders.html',
    ]);
    if (typeof enabled !== 'boolean' || badge.length > 40
      || !title || title.length > 100 || !description || description.length > 240
      || !buttonLabel || buttonLabel.length > 40
      || destination.origin !== 'https://drivelink.local' || !allowedPages.has(destination.pathname)) {
      return fail(res, 400, 'Isi judul, deskripsi, label tombol, dan tautan halaman website dengan benar.');
    }
    const offer = {
      enabled,
      badge: badge || 'Penawaran spesial',
      title,
      description,
      buttonLabel,
      buttonUrl: `${destination.pathname.slice(1)}${destination.search}${destination.hash}`,
    };
    writeSetting('home-offer', offer);
    return res.json(offer);
  });

  app.put('/api/admin/settings/home-hero', requireAccountManager, (req, res) => {
    const eyebrow = String(req.body?.eyebrow || '').trim();
    const title = String(req.body?.title || '').trim();
    const description = String(req.body?.description || '').trim();
    const effect = String(req.body?.effect || '');
    if (!eyebrow || eyebrow.length > 40
      || !title || title.length > 140
      || !description || description.length > 400
      || !HOME_HERO_EFFECTS.has(effect)) {
      return fail(res, 400, 'Isi label, judul (maksimal 140 karakter), deskripsi, dan pilih efek teks yang tersedia.');
    }
    const hero = { eyebrow, title, description, effect };
    writeSetting('home-hero', hero);
    return res.json(hero);
  });

  app.put('/api/admin/settings/contact', requireAccountManager, (req, res) => {
    const heading = String(req.body?.heading || '').trim();
    const phone = String(req.body?.phone || '').trim();
    const email = String(req.body?.email || '').trim();
    const whatsapp = String(req.body?.whatsapp || '').trim();
    const socialLinks = req.body?.socialLinks;
    const validPhone = (value) => !value || value.length <= 30
      && /^\+?[\d().\-\s]+$/.test(value) && /\d/.test(value);
    if (!heading || heading.length > 40
      || !validPhone(phone) || !validPhone(whatsapp)
      || email.length > 254 || email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      || !Array.isArray(socialLinks) || socialLinks.length > Object.keys(SOCIAL_MEDIA_HOSTS).length) {
      return fail(res, 400, 'Periksa judul kontak, nomor telepon, email, WhatsApp, dan daftar media sosial.');
    }
    const seenPlatforms = new Set();
    const normalizedLinks = [];
    for (const item of socialLinks) {
      const platform = String(item?.platform || '');
      const rawUrl = String(item?.url || '').trim();
      if (!Object.hasOwn(SOCIAL_MEDIA_HOSTS, platform) || seenPlatforms.has(platform) || !rawUrl || rawUrl.length > 500) {
        return fail(res, 400, 'Pilih media sosial yang valid, tidak berulang, dan isi tautan profilnya.');
      }
      let url;
      try {
        url = new URL(rawUrl);
      } catch {
        return fail(res, 400, `Tautan ${platform} tidak valid.`);
      }
      const allowedHosts = SOCIAL_MEDIA_HOSTS[platform];
      const hostAllowed = allowedHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
      if (url.protocol !== 'https:' || url.username || url.password || !hostAllowed) {
        return fail(res, 400, `Gunakan tautan HTTPS resmi untuk ${platform}.`);
      }
      seenPlatforms.add(platform);
      normalizedLinks.push({ platform, url: url.href });
    }
    const contact = { heading, phone, email, whatsapp, socialLinks: normalizedLinks };
    writeSetting('site-contact', contact);
    return res.json(contact);
  });

  app.put('/api/admin/settings/home-banner', requireAccountManager, (req, res) => {
    const current = readSetting('home-banner', DEFAULT_HOME_BANNER);
    const { enabled } = req.body || {};
    const image = req.body?.image === undefined ? current.image : req.body.image;
    if (typeof enabled !== 'boolean'
      || image !== '' && !validImage(image, MAX_HOME_BANNER_BYTES)
      || enabled && !image) {
      return fail(res, 400, `Unggah poster JPG/PNG maksimal ${MAX_HOME_BANNER_BYTES / 1024 / 1024} MB dan aktifkan hanya jika poster tersedia.`);
    }
    const banner = {
      enabled,
      image,
      updatedAt: new Date().toISOString(),
    };
    writeSetting('home-banner', banner);
    return res.json(banner);
  });

  app.put('/api/admin/settings/profile', requireAccountManager, (req, res) => {
    const current = db.prepare('SELECT * FROM admins WHERE username = ? AND role = ?')
      .get(req.admin.username, 'admin');
    if (!current) return fail(res, 404, 'Akun administrator tidak ditemukan.');

    const name = String(req.body?.name || '').trim();
    const username = String(req.body?.username || '').trim();
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    if (!name || name.length > 100
      || username !== current.username && !/^[A-Za-z0-9._-]{3,40}$/.test(username)
      || !currentPassword || newPassword && (newPassword.length < 12 || newPassword.length > 256)) {
      return fail(res, 400, 'Periksa nama tampilan, username (3–40 karakter), dan password baru (minimal 12 karakter).');
    }
    if (!passwordMatches(currentPassword, current.password_hash)) {
      return fail(res, 401, 'Password saat ini tidak sesuai.');
    }

    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
    try {
      db.exec('BEGIN IMMEDIATE');
      db.prepare('DELETE FROM sessions WHERE username = ?').run(current.username);
      db.prepare(`
        UPDATE admins SET username = ?, name = ?, password_hash = CASE WHEN ? = '' THEN password_hash ELSE ? END
        WHERE username = ?
      `).run(
        username, name, newPassword,
        newPassword ? passwordHash(newPassword) : '', current.username,
      );
      db.prepare('INSERT INTO sessions (token_hash, username, expires_at) VALUES (?, ?, ?)')
        .run(hashSessionToken(token), username, expiresAt);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      if (error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || error.code === 'SQLITE_CONSTRAINT_UNIQUE'
        || [1555, 2067].includes(error.errcode)) {
        return fail(res, 409, 'Username sudah digunakan akun lain.');
      }
      throw error;
    }

    cookie(req, res, token, 8 * 60 * 60);
    return res.json({
      name,
      username,
      email: current.email,
      role: current.role,
      position: current.position,
      permissions: EMPLOYEE_FEATURES.map(({ id }) => id),
    });
  });

  app.get('/api/admin/accounts', requireAccountManager, (req, res) => {
    const accounts = db.prepare('SELECT * FROM admins ORDER BY role, name COLLATE NOCASE').all();
    res.json(accounts.map(accountRecord));
  });

  app.post('/api/admin/accounts', requireAccountManager, (req, res) => {
    const { account, error } = validateAccount(req.body, { creating: true });
    if (error) return fail(res, 400, error);
    try {
      db.prepare(`
        INSERT INTO admins (username, password_hash, name, role, email, phone, employee_code, position, permissions_json, active)
        VALUES (?, ?, ?, 'employee', ?, ?, ?, ?, ?, 1)
      `).run(
        account.username, passwordHash(account.password), account.name, account.email,
        account.phone, account.employeeCode, account.position, JSON.stringify(account.permissions),
      );
    } catch (insertError) {
      if (insertError.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || insertError.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return fail(res, 409, 'Username atau email sudah digunakan.');
      }
      throw insertError;
    }
    const created = db.prepare('SELECT * FROM admins WHERE username = ?').get(account.username);
    return res.status(201).json(accountRecord(created));
  });

  app.put('/api/admin/accounts/:username', requireAccountManager, (req, res) => {
    const current = db.prepare('SELECT * FROM admins WHERE username = ?').get(req.params.username);
    if (!current) return fail(res, 404, 'Akun tidak ditemukan.');
    if (current.role === 'admin') return fail(res, 403, 'Akun administrator utama tidak dapat diubah dari halaman karyawan.');
    if (req.body?.active === false && current.username === req.admin.username) return fail(res, 400, 'Anda tidak dapat menonaktifkan akun yang sedang digunakan.');
    const { account, error } = validateAccount({
      ...req.body,
      username: current.username,
      password: req.body?.password || '',
    });
    if (error) return fail(res, 400, error);
    const active = typeof req.body.active === 'boolean' ? Number(req.body.active) : current.active;
    try {
      db.prepare(`
        UPDATE admins SET name = ?, email = ?, phone = ?, employee_code = ?, position = ?,
          permissions_json = ?, active = ?, password_hash = CASE WHEN ? = '' THEN password_hash ELSE ? END
        WHERE username = ?
      `).run(
        account.name, account.email, account.phone, account.employeeCode, account.position,
        JSON.stringify(account.permissions), active, account.password,
        account.password ? passwordHash(account.password) : '', current.username,
      );
    } catch (updateError) {
      if (updateError.code === 'SQLITE_CONSTRAINT_UNIQUE') return fail(res, 409, 'Email sudah digunakan akun lain.');
      throw updateError;
    }
    if (!active || account.password) db.prepare('DELETE FROM sessions WHERE username = ?').run(current.username);
    const updated = db.prepare('SELECT * FROM admins WHERE username = ?').get(current.username);
    return res.json(accountRecord(updated));
  });

  function travelOffers() {
    return {
      packages: readSetting('travel-packages', []).map(packageRecord),
      promotions: readSetting('travel-promotions', []).map(promotionRecord),
    };
  }

  app.get('/api/travel-offers', (req, res) => {
    const offers = travelOffers();
    const today = jakartaDate(new Date());
    res.json({
      packages: offers.packages.filter((item) => item.active),
      promotions: offers.promotions.filter((item) => item.active && item.endsAt >= today),
      categories: fleetCategories(),
    });
  });

  app.get('/api/admin/travel-offers', requireFeature('travel-packages'), (req, res) => {
    res.json({ ...travelOffers(), categories: fleetCategories(), fleet: db.prepare('SELECT id, name, category FROM fleet WHERE is_archived = 0 ORDER BY name').all() });
  });

  app.post('/api/admin/travel-packages', requireFeature('travel-packages'), (req, res) => {
    const { item, error } = validateTravelPackage(req.body);
    if (error) return fail(res, 400, error);
    const packages = readSetting('travel-packages', []);
    const created = { id: crypto.randomUUID(), ...item };
    writeSetting('travel-packages', [...packages, created]);
    res.status(201).json(packageRecord(created));
  });

  app.put('/api/admin/travel-packages/:id', requireFeature('travel-packages'), (req, res) => {
    const packages = readSetting('travel-packages', []);
    const index = packages.findIndex((item) => item.id === req.params.id);
    if (index < 0) return fail(res, 404, 'Paket perjalanan tidak ditemukan.');
    const { item, error } = validateTravelPackage(req.body);
    if (error) return fail(res, 400, error);
    packages[index] = { id: packages[index].id, ...item };
    writeSetting('travel-packages', packages);
    res.json(packageRecord(packages[index]));
  });

  app.delete('/api/admin/travel-packages/:id', requireFeature('travel-packages'), (req, res) => {
    const packages = readSetting('travel-packages', []);
    if (!packages.some((item) => item.id === req.params.id)) return fail(res, 404, 'Paket perjalanan tidak ditemukan.');
    writeSetting('travel-packages', packages.filter((item) => item.id !== req.params.id));
    const promotions = readSetting('travel-promotions', []).map((item) => {
      if (!item.packageIds.includes(req.params.id)) return item;
      const packageIds = item.packageIds.filter((id) => id !== req.params.id);
      return { ...item, packageIds, active: packageIds.length ? item.active : false };
    });
    writeSetting('travel-promotions', promotions);
    res.json({ success: true });
  });

  app.post('/api/admin/travel-promotions', requireFeature('travel-packages'), (req, res) => {
    const { item, error } = validatePromotion(req.body);
    if (error) return fail(res, 400, error);
    const promotions = readSetting('travel-promotions', []);
    const created = { id: crypto.randomUUID(), ...item };
    writeSetting('travel-promotions', [...promotions, created]);
    res.status(201).json(promotionRecord(created));
  });

  app.put('/api/admin/travel-promotions/:id', requireFeature('travel-packages'), (req, res) => {
    const promotions = readSetting('travel-promotions', []);
    const index = promotions.findIndex((item) => item.id === req.params.id);
    if (index < 0) return fail(res, 404, 'Promo tidak ditemukan.');
    const { item, error } = validatePromotion(req.body);
    if (error) return fail(res, 400, error);
    promotions[index] = { id: promotions[index].id, ...item };
    writeSetting('travel-promotions', promotions);
    res.json(promotionRecord(promotions[index]));
  });

  app.delete('/api/admin/travel-promotions/:id', requireFeature('travel-packages'), (req, res) => {
    const promotions = readSetting('travel-promotions', []);
    if (!promotions.some((item) => item.id === req.params.id)) return fail(res, 404, 'Promo tidak ditemukan.');
    writeSetting('travel-promotions', promotions.filter((item) => item.id !== req.params.id));
    res.json({ success: true });
  });

  app.get('/api/fleet', (req, res) => {
    const rows = db.prepare('SELECT * FROM fleet WHERE is_archived = 0 ORDER BY name').all();
    res.json(rows.map(publicFleetRecord));
  });

  app.get('/api/fleet-categories', (req, res) => res.json(fleetCategories()));

  app.get('/api/admin/fleet-categories', requireFeature('checklist'), (req, res) => res.json(fleetCategories()));

  app.post('/api/admin/fleet-categories', requireFeature('checklist'), (req, res) => {
    const label = normalizeFleetCategory(req.body?.label);
    const categories = fleetCategories();
    if (!validFleetCategory(label)) return fail(res, 400, 'Nama kategori harus terdiri dari 2–40 karakter.');
    if (categories.some((category) => category.toLocaleLowerCase('id-ID') === label.toLocaleLowerCase('id-ID'))) {
      return fail(res, 409, 'Nama kategori tersebut sudah digunakan.');
    }
    if (categories.length >= 30) return fail(res, 400, 'Maksimal 30 kategori kendaraan.');
    const updated = [...categories, label];
    writeSetting('fleet-categories', updated);
    res.status(201).json(updated);
  });

  app.put('/api/admin/fleet-categories/:category', requireFeature('checklist'), (req, res) => {
    const previous = req.params.category;
    const label = normalizeFleetCategory(req.body?.label);
    const categories = fleetCategories();
    if (!categories.includes(previous)) return fail(res, 404, 'Kategori kendaraan tidak ditemukan.');
    if (!validFleetCategory(label)) return fail(res, 400, 'Nama kategori harus terdiri dari 2–40 karakter.');
    if (categories.some((category) => category !== previous
      && category.toLocaleLowerCase('id-ID') === label.toLocaleLowerCase('id-ID'))) {
      return fail(res, 409, 'Nama kategori tersebut sudah digunakan.');
    }
    if (label === previous) return res.json(categories);
    const updated = categories.map((category) => category === previous ? label : category);
    db.exec('BEGIN IMMEDIATE');
    try {
      replaceFleetCategoryReferences(previous, label);
      writeSetting('fleet-categories', updated);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    res.json(updated);
  });

  app.delete('/api/admin/fleet-categories/:category', requireFeature('checklist'), (req, res) => {
    const previous = req.params.category;
    const categories = fleetCategories();
    if (!categories.includes(previous)) return fail(res, 404, 'Kategori kendaraan tidak ditemukan.');
    if (categories.length <= 1) return fail(res, 409, 'Minimal harus ada satu kategori kendaraan.');
    const updated = categories.filter((category) => category !== previous);
    const replacement = updated[0];
    db.exec('BEGIN IMMEDIATE');
    try {
      replaceFleetCategoryReferences(previous, replacement);
      writeSetting('fleet-categories', updated);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    res.json({ categories: updated, reassignedTo: replacement });
  });

  app.post('/api/bookings', (req, res) => {
    const body = req.body || {};
    const required = ['name', 'email', 'phone', 'address', 'carType', 'duration', 'arrivalAt', 'bookingType'];
    if (required.some((key) => typeof body[key] !== 'string' || !body[key].trim())) {
      return fail(res, 400, 'Lengkapi data pemesan, kendaraan, durasi, dan jadwal.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) || normalizePhone(body.phone).length < 9) {
      return fail(res, 400, 'Email atau nomor telepon tidak valid.');
    }
    const days = DURATIONS.get(body.duration);
    if (!days || !['Reservasi', 'Sewa langsung hari ini'].includes(body.bookingType)) return fail(res, 400, 'Jenis booking atau durasi tidak valid.');
    const arrivalAt = new Date(body.arrivalAt);
    if (Number.isNaN(arrivalAt.getTime()) || body.bookingType === 'Reservasi' && arrivalAt <= new Date()) {
      return fail(res, 400, 'Pilih jadwal kedatangan yang valid dan masih akan datang.');
    }
    const vehicle = db.prepare('SELECT * FROM fleet WHERE name = ? AND is_archived = 0').get(body.carType);
    if (!vehicle || vehicle.available_count < 1) return fail(res, 409, 'Kendaraan tidak tersedia.');
    const physicalUnits = fleetPhysicalUnits(body.carType);
    let vehicleColor = '';
    if (physicalUnits.length) {
      vehicleColor = typeof body.vehicleColor === 'string' ? body.vehicleColor.trim() : '';
      if (!vehicleColor || !physicalUnits.some((unit) => unit.color === vehicleColor)
        || availablePhysicalColorCount(body.carType, vehicleColor) < 1) {
        return fail(res, 409, 'Pilih warna kendaraan yang masih tersedia.');
      }
    } else if (body.vehicleColor) {
      return fail(res, 400, 'Warna kendaraan tidak tersedia untuk jenis mobil yang dipilih.');
    }
    if (!['Pakai driver', 'Lepas kunci'].includes(body.driverOption)) return fail(res, 400, 'Pilihan layanan tidak valid.');
    const rentalPolicy = readRentalPolicy();
    const deposit = String(body.deposit || rentalPolicy.depositOptions[0].label).trim();
    const selectedDeposit = rentalPolicy.depositOptions.find((option) => option.label === deposit);
    if (!selectedDeposit) return fail(res, 400, 'Pilih salah satu metode deposit yang tersedia.');
    const fuelPackage = body.driverOption === 'Pakai driver' ? body.fuelPackage : '';
    if (fuelPackage && !['Termasuk BBM', 'Belum termasuk BBM'].includes(fuelPackage)) return fail(res, 400, 'Pilihan paket BBM tidak valid.');
    const rate = body.driverOption === 'Lepas kunci'
      ? vehicle.price_no_driver
      : fuelPackage === 'Belum termasuk BBM' ? vehicle.price_driver_no_fuel : vehicle.price_driver_fuel;
    const baseTotal = rate * days;
    const packages = readSetting('travel-packages', []);
    let selectedPackage = null;
    if (body.packageId) {
      selectedPackage = packages.find((item) => item.id === body.packageId && item.active);
      if (!selectedPackage || !selectedPackage.categories.includes(vehicle.category)) {
        return fail(res, 400, 'Paket tidak aktif atau tidak tersedia untuk kategori kendaraan ini.');
      }
    }
    let selectedPromotion = null;
    let discountAmount = 0;
    let freeFuelDays = 0;
    if (body.promotionId) {
      const arrivalDate = jakartaDate(arrivalAt);
      selectedPromotion = readSetting('travel-promotions', []).find((item) => (
        item.id === body.promotionId && item.active
        && item.startsAt <= arrivalDate && item.endsAt >= arrivalDate
        && (!item.packageIds.length || selectedPackage && item.packageIds.includes(selectedPackage.id))
      ));
      if (!selectedPromotion) return fail(res, 400, 'Promo tidak aktif, di luar tanggal berlaku, atau tidak sesuai paket.');
      if (selectedPromotion.kind === 'discount_percent') {
        discountAmount = Math.floor(baseTotal * selectedPromotion.value / 100);
      } else if (selectedPromotion.kind === 'discount_amount') {
        discountAmount = Math.min(baseTotal, selectedPromotion.value);
      } else {
        if (body.driverOption !== 'Pakai driver' || fuelPackage !== 'Belum termasuk BBM') {
          return fail(res, 400, 'Promo BBM gratis hanya berlaku untuk layanan driver tanpa BBM.');
        }
        freeFuelDays = Math.min(days, selectedPromotion.fuelDays);
        discountAmount = Math.min(baseTotal, selectedPromotion.value * freeFuelDays);
      }
    }
    const estimatedTotal = Math.max(0, baseTotal - discountAmount);
    const documents = body.documents && typeof body.documents === 'object' ? body.documents : {};
    const requiredDocument = documents.identityType === 'Paspor' ? 'passport' : 'ktp';
    if (!['KTP', 'Paspor'].includes(documents.identityType) || !documents.simA || !documents.selfie
      || !validImage(documents[requiredDocument]?.dataUrl || documents[requiredDocument])
      || !validImage(documents.simA?.dataUrl || documents.simA)
      || !validImage(documents.selfie?.dataUrl || documents.selfie)) {
      return fail(res, 400, 'Unggah identitas, SIM A, dan selfie yang valid.');
    }
    for (const key of ['ktp', 'simA', 'passport', 'ticket', 'hotel', 'selfie']) {
      const photo = documents[key]?.dataUrl || documents[key];
      if (photo && !validImage(photo)) return fail(res, 400, `Format atau ukuran dokumen ${key} tidak valid.`);
    }
    const residencyDays = Number(documents.residencyDays);
    const requiresTravelProof = documents.identityType === 'Paspor'
      || documents.residencyType === 'Dari luar kota' && residencyDays > 2;
    if (requiresTravelProof
      && !['ticket', 'hotel'].every((key) => validImage(documents[key]?.dataUrl || documents[key]))) {
      return fail(res, 400, 'Unggah tiket perjalanan dan bukti penginapan sesuai persyaratan.');
    }
    let id;
    do {
      id = makeId();
    } while (db.prepare('SELECT 1 FROM bookings WHERE id = ?').get(id));
    const createdAt = new Date().toISOString();
    const booking = {
      ...body,
      vehicleColor,
      id,
      phone: String(body.phone).trim(),
      fuelPackage,
      packageId: selectedPackage?.id || '',
      packageName: selectedPackage?.name || '',
      packageIncludes: selectedPackage ? {
        meal: selectedPackage.mealIncluded,
        mineralWater: selectedPackage.mineralWaterIncluded,
      } : null,
      promotionId: selectedPromotion?.id || '',
      promotionName: selectedPromotion?.name || '',
      baseTotal,
      discountAmount,
      freeFuelDays,
      ratePerDay: rate,
      estimatedTotal,
      deposit: selectedDeposit.label,
      depositAmount: depositAmountFromLabel(selectedDeposit.label),
      depositPaymentRequired: depositAmountFromLabel(selectedDeposit.label) === 1_000_000,
      depositPaymentStatus: depositAmountFromLabel(selectedDeposit.label) === 1_000_000 ? 'Belum dibayar' : '',
      travelType: documents.residencyType || '',
      status: 'Booking',
      bookingApproval: 'Menunggu persetujuan',
      paymentStatus: 'Belum dipilih',
      handoverStatus: 'Belum dimulai',
      statusHistory: [{ status: 'Booking', at: createdAt }],
      createdAt,
    };
    saveBooking(booking);
    return res.status(201).json(publicBooking(booking));
  });

  app.get('/api/bookings/:id', (req, res) => {
    const booking = getBooking(String(req.params.id).toUpperCase());
    if (!booking || normalizePhone(req.query.phone) !== normalizePhone(booking.phone)) return fail(res, 404, 'Booking tidak ditemukan.');
    res.json(publicBooking(booking));
  });

  app.get('/api/bookings/:id/details', (req, res) => {
    const id = String(req.params.id).toUpperCase();
    const booking = getBooking(id);
    if (!booking || !canLookupOrderById(booking, id, req.query.phone)) return fail(res, 404, 'Booking tidak ditemukan.');
    res.json(publicOrderDetails(booking));
  });

  app.post('/api/bookings/:id/payment', (req, res) => {
    const booking = getBooking(String(req.params.id).toUpperCase());
    if (!booking || normalizePhone(req.body?.phone) !== normalizePhone(booking.phone)) return fail(res, 404, 'Booking tidak ditemukan.');
    if (booking.bookingApproval !== 'Disetujui') return fail(res, 409, 'Booking belum disetujui admin.');
    const { method, proof } = req.body || {};
    if (!PAYMENT_METHODS.has(method)) return fail(res, 400, 'Metode pembayaran tidak valid.');
    const now = new Date().toISOString();
    if (booking.depositPaymentRequired) {
      const stage = req.body?.stage;
      const expectedStage = booking.depositPaymentStatus === 'Dikonfirmasi' ? 'rental' : 'deposit';
      if (stage !== expectedStage) {
        return fail(res, 409, expectedStage === 'deposit'
          ? 'Deposit harus dikirim dan dikonfirmasi admin terlebih dahulu.'
          : 'Deposit sudah dikonfirmasi; lanjutkan pembayaran sewa.');
      }
      if ((stage === 'deposit' && booking.depositPaymentStatus === 'Menunggu konfirmasi')
        || (stage === 'rental' && booking.paymentStatus === 'Menunggu konfirmasi')) {
        return fail(res, 409, 'Pembayaran tahap ini sedang menunggu verifikasi admin.');
      }
      if (stage === 'rental' && booking.paymentStatus === 'Dikonfirmasi') {
        return fail(res, 409, 'Pembayaran deposit dan sewa sudah dikonfirmasi.');
      }
      if (!validImage(proof)) return fail(res, 400, 'Unggah bukti pembayaran atau kuitansi tunai JPG/PNG maksimal 400 KB.');
      if (stage === 'deposit') {
        booking.depositPaymentMethod = method;
        booking.depositPaymentProof = proof;
        booking.depositPaymentStatus = 'Menunggu konfirmasi';
        booking.depositPaymentSubmittedAt = now;
      } else {
        booking.paymentMethod = method;
        booking.paymentProof = proof;
        booking.paymentStatus = 'Menunggu konfirmasi';
        booking.paymentSubmittedAt = now;
      }
      saveBooking(booking);
      return res.json(publicBooking(booking));
    }
    if (paymentReady(booking)) return fail(res, 409, 'Metode pembayaran sudah dikirim.');
    if (method !== 'Cash ke petugas' && !validImage(proof)) return fail(res, 400, 'Unggah bukti pembayaran JPG/PNG maksimal 400 KB.');
    booking.paymentMethod = method;
    booking.paymentProof = proof || '';
    booking.paymentStatus = method === 'Cash ke petugas' ? 'Bayar ke petugas' : 'Bukti diunggah';
    booking.paymentSubmittedAt = now;
    booking.status = 'Persiapan unit';
    booking.statusHistory.push({ status: 'Persiapan unit', at: booking.paymentSubmittedAt });
    saveBooking(booking);
    res.json(publicBooking(booking));
  });

  app.post('/api/bookings/:id/handover', (req, res) => {
    const booking = getBooking(String(req.params.id).toUpperCase());
    if (!booking || normalizePhone(req.body?.phone) !== normalizePhone(booking.phone)) return fail(res, 404, 'Booking tidak ditemukan.');
    if (booking.handoverStatus === 'Disetujui' && booking.rentalStartedAt) return res.json(publicBooking(booking));
    if (!paymentReady(booking) || !booking.vehicleInspection) return fail(res, 409, 'Metode pembayaran dan checklist persiapan unit harus diselesaikan terlebih dahulu.');
    const photos = req.body?.photos;
    const staffFrontPhoto = booking.vehicleInspection.frontPhoto || booking.vehicleInspection.photos?.[0];
    if (!staffFrontPhoto || !validImage(staffFrontPhoto)) {
      return fail(res, 409, 'Foto langsung bagian depan unit dari karyawan belum tersedia.');
    }
    booking.vehicleInspection.frontPhoto = staffFrontPhoto;
    if (!Array.isArray(photos) || photos.length !== 0) {
      return fail(res, 400, 'Konfirmasi serah-terima tidak memerlukan foto tambahan dari pelanggan.');
    }
    booking.handoverPhotos = photos;
    const submittedAt = new Date().toISOString();
    booking.handoverStatus = 'Disetujui';
    booking.handoverSubmittedAt = submittedAt;
    booking.customerHandoverCompletedAt = submittedAt;
    booking.rentalStartedAt = booking.rentalStartedAt || submittedAt;
    booking.paymentStatus = 'Dikonfirmasi';
    booking.paymentConfirmedAt = booking.paymentConfirmedAt || submittedAt;
    booking.handoverAdminNote = '';
    booking.status = 'Rental berjalan';
    booking.statusHistory.push({ status: booking.status, at: submittedAt });
    saveBooking(booking);
    res.json(publicBooking(booking));
  });

  app.get('/api/admin/handover/bookings', requireFeature('handover'), (req, res) => {
    const bookingRecords = db.prepare('SELECT * FROM bookings ORDER BY created_at DESC').all().map(bookingRecord);
    const colorAssignments = new Map([...new Set(bookingRecords.map((booking) => booking.carType))]
      .map((carType) => [carType, physicalColorReservations(carType).assignedColors]));
    const bookings = bookingRecords.map((booking) => ({
      id: booking.id,
      name: booking.name,
      carType: booking.carType,
      vehicleColor: booking.vehicleColor || '',
      allocatedColor: colorAssignments.get(booking.carType)?.get(booking.id) || '',
      duration: booking.duration,
      driverOption: booking.driverOption,
      fuelPackage: booking.fuelPackage,
      status: booking.status,
      stockReserved: Boolean(booking.stockReserved),
      paymentStatus: booking.paymentStatus,
      handoverStatus: booking.handoverStatus,
      handoverPhotos: booking.handoverPhotos || [],
      handoverAdminNote: booking.handoverAdminNote || '',
      vehicleInspection: booking.vehicleInspection || null,
    }));
    res.json(bookings);
  });

  app.get('/api/admin/handover/checklist-config', requireAnyFeature('handover', 'checklist'), (req, res) => {
    res.json(readSetting('handover-checklist-config', []));
  });

  app.put('/api/admin/handover/checklist-config', requireFeature('checklist'), (req, res) => {
    const items = req.body?.items;
    if (!Array.isArray(items) || items.length > 40) {
      return fail(res, 400, 'Checklist harus berisi maksimal 40 kategori.');
    }
    const ids = new Set();
    const labels = new Set();
    let photoFields = 0;
    const normalized = [];
    for (const item of items) {
      const id = typeof item?.id === 'string' ? item.id.trim() : '';
      const label = typeof item?.label === 'string' ? item.label.trim() : '';
      const types = Array.isArray(item?.types) ? [...new Set(item.types)] : [];
      const options = Array.isArray(item?.options) ? item.options : [];
      if (!/^[a-zA-Z0-9-]{8,80}$/.test(id) || ids.has(id)
        || !label || label.length > 80 || labels.has(label.toLocaleLowerCase('id-ID'))
        || !types.length || types.some((type) => !CHECKLIST_FIELD_TYPES.has(type))
        || typeof item.required !== 'boolean') {
        return fail(res, 400, 'Kategori checklist tidak valid. Periksa nama, jenis isian, dan status wajib.');
      }
      if (types.includes('choice')) {
        const cleanOptions = options.map((option) => typeof option === 'string' ? option.trim() : '');
        const uniqueOptions = new Set(cleanOptions.map((option) => option.toLocaleLowerCase('id-ID')));
        if (cleanOptions.length < 2 || cleanOptions.length > 10
          || cleanOptions.some((option) => !option || option.length > 80)
          || uniqueOptions.size !== cleanOptions.length) {
          return fail(res, 400, `Pilihan untuk "${label}" harus berisi 2–10 opsi unik (maksimal 80 karakter).`);
        }
        item.options = cleanOptions;
      } else if (options.length) {
        return fail(res, 400, `Opsi hanya dapat diisi untuk jenis pilihan pada "${label}".`);
      }
      if (types.includes('photo')) photoFields += 1;
      if (photoFields > 10) return fail(res, 400, 'Maksimal 10 kategori foto dapat digunakan.');
      ids.add(id);
      labels.add(label.toLocaleLowerCase('id-ID'));
      normalized.push({
        id,
        label,
        types,
        options: types.includes('choice') ? item.options : [],
        required: item.required,
      });
    }
    writeSetting('handover-checklist-config', normalized);
    return res.json(normalized);
  });

  app.get('/api/admin/handover/archive', requireFeature('handover-archive'), (req, res) => {
    const bookings = db.prepare('SELECT id, payload FROM bookings ORDER BY created_at DESC').all()
      .map(({ id, payload }) => ({ id, vehicleInspection: JSON.parse(payload).vehicleInspection }))
      .filter((booking) => Boolean(booking.vehicleInspection))
      .map(({ id, vehicleInspection }) => ({ id, checkedAt: vehicleInspection.checkedAt || '' }));
    res.json(bookings);
  });

  app.get('/api/admin/handover/bookings/:id/details', requireAnyFeature('handover', 'handover-archive'), (req, res) => {
    const booking = getBooking(String(req.params.id).toUpperCase());
    if (!booking?.vehicleInspection) return fail(res, 404, 'Arsip checklist booking tidak ditemukan.');
    const inspectionFields = [
      'plate', 'odometerKm', 'fuelLevel', 'bodyCondition', 'bodyNotes',
      'interiorCondition', 'lightsCondition', 'tiresCondition', 'engineCondition',
      'equipmentCondition', 'notes', 'frontPhoto', 'photos', 'customChecklist', 'checkedAt',
    ];
    const returnInspectionFields = [
      'plate', 'odometerKm', 'fuelLevel', 'bodyCondition', 'bodyNotes',
      'interiorCondition', 'lightsCondition', 'tiresCondition', 'engineCondition',
      'equipmentCondition', 'notes', 'checkedAt',
    ];
    const unitCondition = readSetting('unit-conditions', {})[booking.carType];
    return res.json({
      id: booking.id,
      name: booking.name,
      email: booking.email || '',
      phone: booking.phone,
      address: booking.address || '',
      documents: booking.documents || {},
      travelType: booking.travelType || '',
      bookingType: booking.bookingType || 'Reservasi',
      arrivalAt: booking.arrivalAt || '',
      carType: booking.carType,
      duration: booking.duration,
      driverOption: booking.driverOption || '',
      fuelPackage: booking.fuelPackage || '',
      packageName: booking.packageName || '',
      packageIncludes: booking.packageIncludes || null,
      promotionName: booking.promotionName || '',
      ratePerDay: booking.ratePerDay || 0,
      estimatedTotal: booking.estimatedTotal || 0,
      baseTotal: booking.baseTotal || 0,
      discountAmount: booking.discountAmount || 0,
      freeFuelDays: booking.freeFuelDays || 0,
      deposit: booking.deposit || '',
      status: booking.status,
      bookingApproval: booking.bookingApproval,
      paymentStatus: booking.paymentStatus,
      paymentMethod: booking.paymentMethod || '',
      paymentProof: booking.paymentProof || '',
      depositAmount: booking.depositAmount || 0,
      depositPaymentRequired: Boolean(booking.depositPaymentRequired),
      depositPaymentStatus: booking.depositPaymentStatus || '',
      depositPaymentMethod: booking.depositPaymentMethod || '',
      depositPaymentProof: booking.depositPaymentProof || '',
      depositPaymentSubmittedAt: booking.depositPaymentSubmittedAt || '',
      depositPaymentReviewedAt: booking.depositPaymentReviewedAt || '',
      handoverStatus: booking.handoverStatus,
      handoverAdminNote: booking.handoverAdminNote || '',
      handoverPhotos: booking.handoverPhotos || [],
      handoverSubmittedAt: booking.handoverSubmittedAt || '',
      handoverApprovedAt: booking.handoverApprovedAt || '',
      createdAt: booking.createdAt,
      vehicleInspection: Object.fromEntries(inspectionFields
        .filter((key) => booking.vehicleInspection[key] !== undefined)
        .map((key) => [key, booking.vehicleInspection[key]])),
      unitCondition: unitCondition ? { notes: unitCondition.notes || '', photos: unitCondition.photos || [] } : null,
      rentalReturnedAt: booking.rentalReturnedAt || '',
      returnInspection: booking.returnInspection ? Object.fromEntries(returnInspectionFields
        .filter((key) => booking.returnInspection[key] !== undefined)
        .map((key) => [key, booking.returnInspection[key]])) : null,
    });
  });

  app.get('/api/admin/bookings/:id/return', requireFeature('return'), (req, res) => {
    const booking = getBooking(String(req.params.id).toUpperCase());
    if (!booking) return fail(res, 404, 'Booking tidak ditemukan.');
    res.json({
      id: booking.id,
      name: booking.name,
      carType: booking.carType,
      duration: booking.duration,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      handoverStatus: booking.handoverStatus,
      rentalStartedAt: booking.rentalStartedAt || booking.handoverSubmittedAt || booking.handoverApprovedAt || '',
      rentalReturnedAt: booking.rentalReturnedAt || '',
      vehicleInspection: booking.vehicleInspection || null,
      returnInspection: booking.returnInspection || null,
    });
  });

  app.get('/api/admin/returns/archive', requireFeature('rental-archive'), (req, res) => {
    const records = db.prepare('SELECT id, payload FROM bookings').all()
      .map(({ id, payload }) => {
        const booking = JSON.parse(payload);
        return booking.rentalReturnedAt && booking.returnInspection ? {
          id,
          name: booking.name || '',
          carType: booking.carType || '',
          plate: booking.returnInspection.plate || booking.vehicleInspection?.plate || '',
          rentalStartedAt: booking.rentalStartedAt || booking.handoverSubmittedAt || '',
          rentalReturnedAt: booking.rentalReturnedAt,
          duration: booking.duration || '',
          estimatedTotal: Number(booking.estimatedTotal) || 0,
          status: booking.status || 'Dikembalikan',
        } : null;
      })
      .filter(Boolean)
      .sort((first, second) => new Date(second.rentalReturnedAt) - new Date(first.rentalReturnedAt));
    res.json(records);
  });

  app.get('/api/admin/returns/archive/rejected', requireFeature('rental-archive'), (req, res) => {
    const records = db.prepare('SELECT id, payload FROM bookings').all()
      .map(({ id, payload }) => {
        const booking = JSON.parse(payload);
        return booking.bookingApproval === 'Ditolak' ? {
          id,
          name: booking.name || '',
          carType: booking.carType || '',
          duration: booking.duration || '',
          rejectedAt: booking.bookingRejectedAt || booking.createdAt || '',
          reason: booking.bookingRejectionReason || '',
        } : null;
      })
      .filter(Boolean)
      .sort((first, second) => new Date(second.rejectedAt) - new Date(first.rejectedAt));
    res.json(records);
  });

  app.get('/api/admin/returns/archive/:id', requireFeature('rental-archive'), (req, res) => {
    const booking = getBooking(String(req.params.id).toUpperCase());
    if (!booking?.rentalReturnedAt || !booking.returnInspection) {
      return fail(res, 404, 'Arsip penyewaan yang sudah dikembalikan tidak ditemukan.');
    }
    res.json({
      id: booking.id,
      name: booking.name || '',
      email: booking.email || '',
      phone: booking.phone || '',
      address: booking.address || '',
      carType: booking.carType || '',
      duration: booking.duration || '',
      bookingType: booking.bookingType || '',
      driverOption: booking.driverOption || '',
      fuelPackage: booking.fuelPackage || '',
      packageName: booking.packageName || '',
      promotionName: booking.promotionName || '',
      ratePerDay: Number(booking.ratePerDay) || 0,
      baseTotal: Number(booking.baseTotal) || 0,
      discountAmount: Number(booking.discountAmount) || 0,
      estimatedTotal: Number(booking.estimatedTotal) || 0,
      deposit: booking.deposit || '',
      paymentMethod: booking.paymentMethod || '',
      paymentStatus: booking.paymentStatus || '',
      status: booking.status || 'Dikembalikan',
      createdAt: booking.createdAt || '',
      rentalStartedAt: booking.rentalStartedAt || booking.handoverSubmittedAt || '',
      rentalReturnedAt: booking.rentalReturnedAt,
      vehicleInspection: booking.vehicleInspection || null,
      returnInspection: booking.returnInspection,
    });
  });

  app.patch('/api/admin/bookings/:id/return', requireFeature('return'), (req, res) => {
    const booking = getBooking(String(req.params.id).toUpperCase());
    if (!booking) return fail(res, 404, 'Booking tidak ditemukan.');
    if (booking.handoverStatus !== 'Disetujui' || booking.paymentStatus !== 'Dikonfirmasi'
      || !booking.vehicleInspection) {
      return fail(res, 409, 'Pengembalian hanya dapat dicatat untuk booking dengan serah-terima dan checklist awal yang disetujui.');
    }
    if (booking.rentalReturnedAt || booking.returnInspection) {
      return fail(res, 409, 'Pengembalian booking ini sudah dicatat.');
    }
    const inspection = req.body || {};
    const textFields = ['plate', 'fuelLevel', 'bodyCondition', 'interiorCondition', 'lightsCondition', 'tiresCondition', 'engineCondition', 'equipmentCondition'];
    if (textFields.some((key) => typeof inspection[key] !== 'string' || !inspection[key].trim())
      || !Number.isInteger(inspection.odometerKm) || inspection.odometerKm < 0
      || ['bodyNotes', 'notes'].some((key) => inspection[key] !== undefined && typeof inspection[key] !== 'string')) {
      return fail(res, 400, 'Data checklist pengembalian unit tidak valid.');
    }
    if (inspection.plate.trim().toUpperCase() !== String(booking.vehicleInspection.plate || '').trim().toUpperCase()) {
      return fail(res, 400, 'Plat kendaraan harus sama dengan plat pada checklist saat unit diserahkan.');
    }
    if (inspection.odometerKm < Number(booking.vehicleInspection.odometerKm || 0)) {
      return fail(res, 400, 'Odometer saat pengembalian tidak boleh lebih rendah dari odometer saat serah-terima.');
    }
    const checkedAt = new Date().toISOString();
    const returnInspection = {
      plate: inspection.plate.trim().slice(0, 30),
      odometerKm: inspection.odometerKm,
      fuelLevel: inspection.fuelLevel.trim().slice(0, 80),
      bodyCondition: inspection.bodyCondition.trim().slice(0, 100),
      bodyNotes: String(inspection.bodyNotes || '').trim().slice(0, 500),
      interiorCondition: inspection.interiorCondition.trim().slice(0, 100),
      lightsCondition: inspection.lightsCondition.trim().slice(0, 100),
      tiresCondition: inspection.tiresCondition.trim().slice(0, 100),
      engineCondition: inspection.engineCondition.trim().slice(0, 100),
      equipmentCondition: inspection.equipmentCondition.trim().slice(0, 120),
      notes: String(inspection.notes || '').trim().slice(0, 500),
      checkedAt,
    };
    db.exec('BEGIN IMMEDIATE');
    try {
      if (booking.stockReserved) {
        const released = db.prepare('UPDATE fleet SET available_count = MIN(total_count, available_count + 1) WHERE name = ?')
          .run(booking.carType);
        if (!released.changes) {
          db.exec('ROLLBACK');
          return fail(res, 409, 'Unit armada booking tidak ditemukan; pengembalian belum disimpan.');
        }
      }
      booking.returnInspection = returnInspection;
      booking.rentalReturnedAt = checkedAt;
      booking.status = 'Dikembalikan';
      booking.stockReserved = false;
      booking.statusHistory = booking.statusHistory || [];
      booking.statusHistory.push({ status: 'Dikembalikan', at: checkedAt });
      saveBooking(booking);
      const services = readSetting('vehicle-services', []);
      const serviceUnit = services.find((unit) => unit.plate.toUpperCase() === returnInspection.plate.toUpperCase());
      if (serviceUnit) {
        serviceUnit.currentKm = Math.max(Number(serviceUnit.currentKm) || 0, returnInspection.odometerKm);
      }
      const archivedFleet = db.prepare('SELECT id FROM fleet WHERE name = ? AND is_archived = 1').get(booking.carType);
      if (archivedFleet) {
        const remainingReservations = activeFleetReservations()
          .filter((activeBooking) => activeBooking.carType === booking.carType).length;
        const remainingServices = remainingReservations
          ? services.filter((unit) => unit.carType !== booking.carType
            || unit.plate.toUpperCase() !== returnInspection.plate.toUpperCase())
          : services.filter((unit) => unit.carType !== booking.carType);
        db.prepare('UPDATE fleet SET total_count = ?, available_count = 0 WHERE id = ?')
          .run(remainingReservations, archivedFleet.id);
        writeSetting('vehicle-services', remainingServices);
      } else if (serviceUnit) {
        writeSetting('vehicle-services', services);
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    res.json({
      id: booking.id,
      status: booking.status,
      rentalReturnedAt: booking.rentalReturnedAt,
      stockReserved: booking.stockReserved,
      vehicleInspection: booking.vehicleInspection,
      returnInspection: booking.returnInspection,
    });
  });

  app.patch('/api/admin/bookings/:id/inspection', requireFeature('handover'), (req, res) => {
    const booking = getBooking(String(req.params.id).toUpperCase());
    if (!booking) return fail(res, 404, 'Booking tidak ditemukan.');
    if (!paymentReady(booking)) return fail(res, 409, 'Checklist unit hanya dapat disimpan setelah metode pembayaran dikirim.');
    const inspection = req.body || {};
    if (Object.keys(inspection).length === 1 && Object.hasOwn(inspection, 'frontPhoto')) {
      if (!booking.vehicleInspection) return fail(res, 409, 'Simpan checklist kendaraan sebelum menambahkan foto depan.');
      if (!validImage(inspection.frontPhoto, 250 * 1024)) {
        return fail(res, 400, 'Foto depan harus berupa JPG/PNG maksimal 250 KB.');
      }
      booking.vehicleInspection.frontPhoto = inspection.frontPhoto;
      saveBooking(booking);
      return res.json(booking);
    }
    const inspectedPlate = typeof inspection.plate === 'string' ? inspection.plate.trim().toUpperCase() : '';
    const physicalUnits = readSetting('vehicle-services', []);
    const inspectedUnit = physicalUnits.find((unit) => unit.plate.toUpperCase() === inspectedPlate);
    if (!inspectedUnit || inspectedUnit.carType !== booking.carType) {
      return fail(res, 400, `Pilih plat unit ${booking.carType} yang terdaftar.`);
    }
    const reservedColor = booking.vehicleColor
      || physicalColorReservations(booking.carType).assignedColors.get(booking.id);
    if (reservedColor && inspectedUnit.color !== reservedColor) {
      return fail(res, 400, `Pilih plat unit dengan warna ${reservedColor} sesuai ketersediaan booking.`);
    }
    const plateAssigned = db.prepare('SELECT * FROM bookings').all().map(bookingRecord)
      .some((item) => item.id !== booking.id
        && !['Dibatalkan', 'Dikembalikan'].includes(item.status)
        && item.vehicleInspection?.plate?.toUpperCase() === inspectedPlate);
    if (plateAssigned) return fail(res, 409, `Unit ${inspectedPlate} sudah dialokasikan ke booking lain.`);
    const textFields = ['plate', 'fuelLevel', 'bodyCondition', 'interiorCondition', 'lightsCondition', 'tiresCondition', 'engineCondition', 'equipmentCondition'];
    const checklistDefinitions = readSetting('handover-checklist-config', []);
    const submittedChecklist = inspection.customChecklist ?? [];
    const customChecklist = [];
    let customPhotoBytes = 0;
    if (!Array.isArray(submittedChecklist) || submittedChecklist.length !== checklistDefinitions.length) {
      return fail(res, 400, 'Kategori checklist berubah. Muat ulang halaman sebelum menyimpan.');
    }
    for (let index = 0; index < checklistDefinitions.length; index += 1) {
      const definition = checklistDefinitions[index];
      const submitted = submittedChecklist[index];
      const values = submitted?.values;
      if (!submitted || submitted.id !== definition.id || !values || typeof values !== 'object' || Array.isArray(values)) {
        return fail(res, 400, 'Data kategori checklist tidak sesuai dengan pengaturan.');
      }
      const normalizedValues = {};
      if (definition.types.includes('check')) {
        if (typeof values.checked !== 'boolean' || (definition.required && !values.checked)) {
          return fail(res, 400, `Checklist "${definition.label}" wajib dicentang.`);
        }
        normalizedValues.checked = values.checked;
      }
      if (definition.types.includes('choice')) {
        if (typeof values.choice !== 'string'
          || (values.choice && !definition.options.includes(values.choice))
          || (definition.required && !values.choice)) {
          return fail(res, 400, `Pilihan untuk "${definition.label}" tidak valid atau belum diisi.`);
        }
        normalizedValues.choice = values.choice;
      }
      if (definition.types.includes('note')) {
        if (typeof values.note !== 'string' || values.note.length > 500
          || (definition.required && !values.note.trim())) {
          return fail(res, 400, `Catatan "${definition.label}" tidak valid atau belum diisi.`);
        }
        normalizedValues.note = values.note.trim();
      }
      if (definition.types.includes('photo')) {
        const photo = values.photo || '';
        if (typeof photo !== 'string' || (photo && !validImage(photo, 250 * 1024))
          || (definition.required && !photo)) {
          return fail(res, 400, `Foto "${definition.label}" tidak valid atau belum diunggah.`);
        }
        customPhotoBytes += imageBytes(photo);
        if (customPhotoBytes > 2.5 * 1024 * 1024) {
          return fail(res, 400, 'Total foto checklist tambahan melebihi batas penyimpanan.');
        }
        normalizedValues.photo = photo;
      }
      customChecklist.push({
        id: definition.id,
        label: definition.label,
        types: definition.types,
        required: definition.required,
        values: normalizedValues,
      });
    }
    if (textFields.some((key) => typeof inspection[key] !== 'string' || !inspection[key].trim())
      || !Number.isInteger(inspection.odometerKm) || inspection.odometerKm < 0
      || !validImage(inspection.frontPhoto, 250 * 1024)
      || ['bodyNotes', 'notes'].some((key) => inspection[key] !== undefined && typeof inspection[key] !== 'string')
      || (inspection.photos !== undefined && (!Array.isArray(inspection.photos) || inspection.photos.length > 4
        || inspection.photos.some((photo) => !validImage(photo, 250 * 1024))))) {
      return fail(res, 400, 'Data checklist unit atau foto tidak valid.');
    }
    booking.vehicleInspection = {
      plate: inspection.plate.trim().slice(0, 30),
      color: inspectedUnit?.color || '',
      odometerKm: inspection.odometerKm,
      fuelLevel: inspection.fuelLevel.trim().slice(0, 80),
      bodyCondition: inspection.bodyCondition.trim().slice(0, 100),
      bodyNotes: String(inspection.bodyNotes || '').trim().slice(0, 500),
      interiorCondition: inspection.interiorCondition.trim().slice(0, 100),
      lightsCondition: inspection.lightsCondition.trim().slice(0, 100),
      tiresCondition: inspection.tiresCondition.trim().slice(0, 100),
      engineCondition: inspection.engineCondition.trim().slice(0, 100),
      equipmentCondition: inspection.equipmentCondition.trim().slice(0, 120),
      notes: String(inspection.notes || '').trim().slice(0, 500),
      frontPhoto: inspection.frontPhoto,
      photos: inspection.photos || [],
      customChecklist,
      checkedAt: new Date().toISOString(),
    };
    booking.vehiclePlate = booking.vehicleInspection.plate;
    const services = readSetting('vehicle-services', []);
    const serviceUnit = services.find((unit) => unit.plate.toUpperCase() === booking.vehicleInspection.plate.toUpperCase());
    if (serviceUnit) {
      serviceUnit.currentKm = Math.max(Number(serviceUnit.currentKm) || 0, booking.vehicleInspection.odometerKm);
      writeSetting('vehicle-services', services);
    }
    saveBooking(booking);
    res.json(booking);
  });

  app.patch('/api/admin/bookings/:id/inspection/front-photo', requireFeature('handover'), (req, res) => {
    const booking = getBooking(String(req.params.id).toUpperCase());
    if (!booking) return fail(res, 404, 'Booking tidak ditemukan.');
    if (!booking.vehicleInspection) return fail(res, 409, 'Simpan checklist kendaraan sebelum menambahkan foto depan.');
    const { frontPhoto } = req.body || {};
    if (!validImage(frontPhoto, 250 * 1024)) return fail(res, 400, 'Foto depan harus berupa JPG/PNG maksimal 250 KB.');
    booking.vehicleInspection.frontPhoto = frontPhoto;
    saveBooking(booking);
    res.json(booking);
  });

  app.get('/api/admin/overview', requireFeature('overview'), (req, res) => {
    const bookings = db.prepare('SELECT * FROM bookings ORDER BY created_at DESC').all().map(bookingRecord);
    const fleet = db.prepare('SELECT * FROM fleet').all();
    const today = jakartaDate(new Date());
    const monthPrefix = today.slice(0, 7);
    const chartDates = Array.from({ length: 7 }, (_, index) => shiftIsoDate(today, index - 6));
    const revenueByDate = new Map(chartDates.map((date) => [date, 0]));
    const rentedByType = new Map();
    let dailyRevenue = 0;
    let monthlyRevenue = 0;
    bookings.forEach((booking) => {
      if (booking.paymentStatus !== 'Dikonfirmasi') return;
      const paidAt = booking.paymentConfirmedAt || booking.createdAt;
      const paidDate = paidAt ? jakartaDate(new Date(paidAt)) : '';
      const amount = Number(booking.estimatedTotal) || 0;
      if (paidDate === today) dailyRevenue += amount;
      if (paidDate.startsWith(monthPrefix)) monthlyRevenue += amount;
      if (revenueByDate.has(paidDate)) revenueByDate.set(paidDate, revenueByDate.get(paidDate) + amount);
    });
    bookings.forEach((booking) => {
      if (booking.handoverStatus !== 'Disetujui' || booking.status === 'Dibatalkan') return;
      const rentedAt = booking.rentalStartedAt || booking.paymentConfirmedAt || '';
      if (!rentedAt) return;
      const rentedDate = jakartaDate(new Date(rentedAt));
      if (!chartDates.includes(rentedDate)) return;
      rentedByType.set(booking.carType, (rentedByType.get(booking.carType) || 0) + 1);
    });
    const services = readSetting('vehicle-services', []);
    const totalServiceExpenses = services.reduce((unitTotal, unit) => unitTotal
      + (unit.serviceHistory || []).reduce((historyTotal, service) => historyTotal
        + (Number(service.totalCost) || (service.items || []).reduce((sum, item) => sum + (Number(item.cost) || 0), 0)), 0), 0);
    res.json({
      bookings: bookings.slice(0, 5),
      totalBookings: bookings.length,
      pendingBookings: bookings.filter((booking) => booking.bookingApproval === 'Menunggu persetujuan').length,
      availableVehicles: fleet.filter((vehicle) => !vehicle.is_archived).reduce((sum, vehicle) => sum + vehicle.available_count, 0),
      totalVehicles: fleet.filter((vehicle) => !vehicle.is_archived).reduce((sum, vehicle) => sum + vehicle.total_count, 0),
      dailyRevenue,
      monthlyRevenue,
      totalServiceExpenses,
      revenueChart: chartDates.map((date) => ({ date, amount: revenueByDate.get(date) })),
      rentedVehiclesByType: [...rentedByType].map(([carType, count]) => ({ carType, count }))
        .sort((left, right) => right.count - left.count || left.carType.localeCompare(right.carType, 'id')),
    });
  });

  app.get('/api/admin/summary', requireFeature('overview'), (req, res) => {
    const bookings = db.prepare('SELECT * FROM bookings').all().map(bookingRecord);
    const fleet = db.prepare('SELECT * FROM fleet').all().map(fleetRecord);
    const activeFleet = fleet.filter((vehicle) => !vehicle.isArchived);
    const today = jakartaDate(new Date());
    const monthPrefix = today.slice(0, 7);
    const dailyRevenue = bookings.filter((booking) => booking.paymentStatus === 'Dikonfirmasi'
      && (booking.paymentConfirmedAt || booking.createdAt)
      && jakartaDate(new Date(booking.paymentConfirmedAt || booking.createdAt)) === today)
      .reduce((sum, booking) => sum + Number(booking.estimatedTotal || 0), 0);
    const services = readSetting('vehicle-services', []);
    const totalServiceExpenses = services.reduce((unitTotal, unit) => unitTotal
      + (unit.serviceHistory || []).reduce((historyTotal, service) => historyTotal
        + (Number(service.totalCost) || (service.items || []).reduce((sum, item) => sum + (Number(item.cost) || 0), 0)), 0), 0);
    res.json({
      totalBookings: bookings.length,
      pendingBookings: bookings.filter((booking) => booking.bookingApproval === 'Menunggu persetujuan').length,
      availableVehicles: activeFleet.reduce((sum, vehicle) => sum + vehicle.availableCount, 0),
      totalVehicles: activeFleet.reduce((sum, vehicle) => sum + vehicle.totalCount, 0),
      monthlyRevenue: bookings.filter((booking) => booking.paymentStatus === 'Dikonfirmasi'
        && (booking.paymentConfirmedAt || booking.createdAt)
        && jakartaDate(new Date(booking.paymentConfirmedAt || booking.createdAt)).startsWith(monthPrefix))
        .reduce((sum, booking) => sum + Number(booking.estimatedTotal || 0), 0),
      dailyRevenue,
      totalServiceExpenses,
    });
  });

  app.get('/api/admin/notification-data', requireAdmin, (req, res) => {
    const canReadBookings = req.admin.role === 'admin' || req.admin.permissions.includes('bookings');
    const canReadPayments = req.admin.role === 'admin' || req.admin.permissions.includes('payments');
    const canReadHandover = req.admin.role === 'admin' || req.admin.permissions.includes('handover');
    const canReadReturns = req.admin.role === 'admin' || req.admin.permissions.includes('return');
    const canReadServices = req.admin.role === 'admin'
      || req.admin.permissions.includes('vehicle-service');
    const canReadRentalSettings = req.admin.role === 'admin'
      || req.admin.permissions.includes('rental-settings');
    const settings = canReadRentalSettings || canReadBookings
      ? readSetting('rental-settings', { reminderCycleHours: 24 })
      : { reminderCycleHours: 24 };
    const actionRows = db.prepare(`
      SELECT approval AS bookingApproval, payment_status AS paymentStatus,
        handover_status AS handoverStatus,
        json_extract(payload, '$.depositPaymentRequired') AS depositPaymentRequired,
        json_extract(payload, '$.depositPaymentStatus') AS depositPaymentStatus,
        json_extract(payload, '$.duration') AS duration,
        json_extract(payload, '$.rentalStartedAt') AS rentalStartedAt,
        json_extract(payload, '$.rentalReturnedAt') AS rentalReturnedAt,
        json_extract(payload, '$.rentalExtendedHours') AS rentalExtendedHours
      FROM bookings
    `).all();
    const bookings = canReadBookings
      ? db.prepare('SELECT * FROM bookings ORDER BY created_at DESC').all().map(bookingRecord).map((booking) => ({
        id: booking.id,
        name: booking.name,
        phone: booking.phone,
        carType: booking.carType,
        duration: booking.duration,
        handoverStatus: booking.handoverStatus,
        rentalStartedAt: booking.rentalStartedAt,
        rentalReturnedAt: booking.rentalReturnedAt,
        rentalExtendedHours: booking.rentalExtendedHours,
        rentalConfirmedCheckpointHours: booking.rentalConfirmedCheckpointHours,
      }))
      : [];
    const vehicleServices = canReadServices ? readSetting('vehicle-services', []) : [];
    const rentalDurationHours = (duration) => {
      const value = String(duration || '');
      if (value.includes('bulan')) return 30 * 24;
      const days = Number.parseInt(value, 10);
      return Number.isInteger(days) && days > 0 ? days * 24 : 0;
    };
    const now = Date.now();
    const overdueReturns = canReadReturns
      ? actionRows.filter((booking) => {
        if (booking.handoverStatus !== 'Disetujui' || booking.rentalReturnedAt || !booking.rentalStartedAt) return false;
        const startedAt = new Date(booking.rentalStartedAt).getTime();
        const durationMs = rentalDurationHours(booking.duration) * 60 * 60 * 1000;
        const extendedMs = Math.max(0, Number(booking.rentalExtendedHours) || 0) * 60 * 60 * 1000;
        return Number.isFinite(startedAt) && durationMs > 0 && now >= startedAt + durationMs + extendedMs;
      }).length
      : 0;
    return res.json({
      settings: { reminderCycleHours: settings.reminderCycleHours === 12 ? 12 : 24 },
      bookings,
      vehicleServices: vehicleServices.map(({ receipt, serviceHistory, ...unit }) => unit),
      actionCounts: {
        bookings: canReadBookings
          ? actionRows.filter((booking) => booking.bookingApproval === 'Menunggu persetujuan').length
          : 0,
        payments: canReadPayments
          ? actionRows.filter((booking) => booking.paymentStatus === 'Menunggu konfirmasi'
            || booking.depositPaymentRequired && booking.depositPaymentStatus === 'Menunggu konfirmasi').length
          : 0,
        handover: canReadHandover
          ? actionRows.filter((booking) => booking.handoverStatus === 'Menunggu konfirmasi admin').length
          : 0,
        returns: overdueReturns,
      },
    });
  });

  app.get('/api/admin/rental-settings', requireFeature('rental-settings'), (req, res) => {
    const settings = readSetting('rental-settings', { reminderCycleHours: 24 });
    res.json({ reminderCycleHours: settings.reminderCycleHours === 12 ? 12 : 24 });
  });

  app.put('/api/admin/rental-settings', requireFeature('rental-settings'), (req, res) => {
    const reminderCycleHours = Number(req.body?.reminderCycleHours);
    if (![12, 24].includes(reminderCycleHours)) {
      return fail(res, 400, 'Pilih siklus pengingat 12 atau 24 jam.');
    }
    const settings = { reminderCycleHours };
    writeSetting('rental-settings', settings);
    return res.json(settings);
  });

  app.get('/api/admin/rental-policy', requireFeature('rental-settings'), (req, res) => {
    res.json(readRentalPolicy());
  });

  app.put('/api/admin/rental-policy', requireFeature('rental-settings'), (req, res) => {
    const depositOptions = req.body?.depositOptions;
    const collateralItems = req.body?.collateralItems;
    if (!Array.isArray(depositOptions) || depositOptions.length < 1 || depositOptions.length > 6
      || !Array.isArray(collateralItems) || collateralItems.length > 10) {
      return fail(res, 400, 'Sediakan 1–6 pilihan deposit dan maksimal 10 barang jaminan.');
    }
    const normalizedDepositOptions = [];
    const depositLabels = new Set();
    for (const option of depositOptions) {
      const label = typeof option?.label === 'string' ? option.label.trim() : '';
      const description = typeof option?.description === 'string' ? option.description.trim() : '';
      const normalizedLabel = label.toLocaleLowerCase('id-ID');
      if (!label || label.length > 100 || !description || description.length > 180
        || depositLabels.has(normalizedLabel)) {
        return fail(res, 400, 'Nama pilihan deposit harus unik dan keterangannya wajib diisi.');
      }
      depositLabels.add(normalizedLabel);
      normalizedDepositOptions.push({ label, description });
    }
    const normalizedCollateralItems = [];
    const collateralLabels = new Set();
    for (const item of collateralItems) {
      const label = typeof item === 'string' ? item.trim() : '';
      const normalizedLabel = label.toLocaleLowerCase('id-ID');
      if (!label || label.length > 60 || collateralLabels.has(normalizedLabel)) {
        return fail(res, 400, 'Nama barang jaminan harus unik dan maksimal 60 karakter.');
      }
      collateralLabels.add(normalizedLabel);
      normalizedCollateralItems.push(label);
    }
    const policy = { depositOptions: normalizedDepositOptions, collateralItems: normalizedCollateralItems };
    writeSetting('rental-policy', policy);
    return res.json(policy);
  });

  app.get('/api/admin/vehicle-services', requireFeature('vehicle-service'), (req, res) => {
    res.json(readSetting('vehicle-services', []));
  });

  app.get('/api/admin/fleet/physical-units', requireFeature('fleet'), (req, res) => {
    const units = readSetting('vehicle-services', []);
    const physicallyReserved = reservedPhysicalPlates();
    res.json(units.filter((unit) => unit.color).map((unit) => ({
      plate: unit.plate,
      carType: unit.carType,
      category: db.prepare('SELECT category FROM fleet WHERE name = ?').get(unit.carType)?.category || unit.category || '',
      color: unit.color,
      transmission: unit.transmission || db.prepare('SELECT transmission FROM fleet WHERE name = ?').get(unit.carType)?.transmission || 'Belum diisi',
      currentKm: Number(unit.currentKm) || 0,
      hasServiceHistory: Boolean(unit.serviceHistory?.length),
      serviceCount: unit.serviceHistory?.length || 0,
      lastServiceDate: unit.lastServiceDate || '',
      nextServiceKm: Number(unit.nextServiceKm) || 0,
      nextServiceDate: unit.nextServiceDate || '',
      isReserved: physicallyReserved.has(unit.plate.toUpperCase()),
    })));
  });

  app.get('/api/admin/fleet/deletion-requests', requirePrimaryAdmin, (req, res) => {
    const requests = db.prepare('SELECT * FROM fleet_deletion_requests ORDER BY requested_at DESC, id DESC')
      .all().map(fleetDeletionRequestRecord);
    res.json(requests);
  });

  app.patch('/api/admin/fleet/deletion-requests/:id', requirePrimaryAdmin, (req, res) => {
    const row = db.prepare('SELECT * FROM fleet_deletion_requests WHERE id = ?').get(req.params.id);
    if (!row) return fail(res, 404, 'Permintaan penghapusan tidak ditemukan.');
    if (row.status !== 'pending') return fail(res, 409, 'Permintaan ini sudah ditinjau.');
    const action = req.body?.action;
    if (!['approve', 'reject'].includes(action)) return fail(res, 400, 'Pilih setujui atau tolak.');
    const reviewedAt = new Date().toISOString();
    const reviewNote = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 500) : '';
    if (action === 'reject') {
      db.prepare(`
        UPDATE fleet_deletion_requests SET status = 'rejected', reviewed_by = ?, reviewed_at = ?, review_note = ?
        WHERE id = ? AND status = 'pending'
      `).run(req.admin.username, reviewedAt, reviewNote, row.id);
      return res.json(fleetDeletionRequestRecord(db.prepare('SELECT * FROM fleet_deletion_requests WHERE id = ?').get(row.id)));
    }

    const units = readSetting('vehicle-services', []);
    let approvedSnapshot;
    if (row.target_type === 'fleet-model') {
      const vehicleRow = db.prepare('SELECT * FROM fleet WHERE id = ? AND is_archived = 0').get(row.target_id);
      if (!vehicleRow) return fail(res, 409, 'Model armada tidak lagi tersedia untuk dihapus.');
      const vehicle = fleetRecord(vehicleRow);
      const modelUnits = units.filter((unit) => unit.carType === vehicle.name && unit.color);
      const modelReservations = activeFleetReservations().filter((booking) => booking.carType === vehicle.name);
      const reservedPlates = reservedPhysicalPlates();
      const retainedPlates = new Set(modelUnits
        .filter((unit) => reservedPlates.has(unit.plate.toUpperCase()))
        .map((unit) => unit.plate.toUpperCase()));
      approvedSnapshot = { vehicle, physicalUnits: modelUnits };
      const finalReviewNote = modelReservations.length
        ? [reviewNote, `${modelReservations.length} booking aktif tetap berjalan; unit terkait akan dihapus dari inventaris setelah booking selesai.`]
          .filter(Boolean).join(' ').slice(0, 500)
        : reviewNote;
      const archivedAt = reviewedAt;
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare(`
          UPDATE fleet
          SET is_archived = 1, archive_reason = ?, archived_at = ?, total_count = ?, available_count = 0
          WHERE id = ? AND is_archived = 0
        `).run(row.reason, archivedAt, modelReservations.length, vehicleRow.id);
        writeSetting('vehicle-services', units.filter((unit) => unit.carType !== vehicle.name
          || retainedPlates.has(unit.plate.toUpperCase())));
        db.prepare(`
          UPDATE fleet_deletion_requests
          SET status = 'approved', reviewed_by = ?, reviewed_at = ?, review_note = ?, target_snapshot_json = ?
          WHERE id = ? AND status = 'pending'
        `).run(req.admin.username, reviewedAt, finalReviewNote, JSON.stringify(approvedSnapshot), row.id);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    } else {
      const plate = row.target_id.trim().toUpperCase();
      const index = units.findIndex((unit) => unit.plate.toUpperCase() === plate && unit.color);
      if (index < 0) return fail(res, 409, 'Unit berplat ini tidak lagi ditemukan.');
      if (reservedPhysicalPlates().has(plate)) {
        return fail(res, 409, `Unit ${plate} sedang dialokasikan untuk booking dan belum dapat dihapus.`);
      }
      const unit = units[index];
      const vehicleRow = db.prepare('SELECT * FROM fleet WHERE name = ? AND is_archived = 0').get(unit.carType);
      if (!vehicleRow || vehicleRow.total_count < 1 || vehicleRow.available_count < 1) {
        return fail(res, 409, `Stok model ${unit.carType} tidak dapat disesuaikan untuk menghapus unit.`);
      }
      approvedSnapshot = { unit };
      units.splice(index, 1);
      db.exec('BEGIN IMMEDIATE');
      try {
        const update = db.prepare(`
          UPDATE fleet SET total_count = total_count - 1, available_count = available_count - 1
          WHERE id = ? AND total_count > 0 AND available_count > 0
        `).run(vehicleRow.id);
        if (!update.changes) {
          db.exec('ROLLBACK');
          return fail(res, 409, `Stok model ${unit.carType} berubah. Muat ulang lalu coba lagi.`);
        }
        writeSetting('vehicle-services', units);
        db.prepare(`
          UPDATE fleet_deletion_requests
          SET status = 'approved', reviewed_by = ?, reviewed_at = ?, review_note = ?, target_snapshot_json = ?
          WHERE id = ? AND status = 'pending'
        `).run(req.admin.username, reviewedAt, reviewNote, JSON.stringify(approvedSnapshot), row.id);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }
    return res.json(fleetDeletionRequestRecord(db.prepare('SELECT * FROM fleet_deletion_requests WHERE id = ?').get(row.id)));
  });

  app.post('/api/admin/fleet/physical-units', requireFeature('fleet'), (req, res) => {
    const body = req.body || {};
    const carType = typeof body.carType === 'string' ? body.carType.trim() : '';
    const submissions = Array.isArray(body.units) ? body.units : [body];
    const vehicle = db.prepare('SELECT * FROM fleet WHERE name = ? AND is_archived = 0').get(carType);
    const normalizedUnits = submissions.map((unit) => ({
      plate: typeof unit?.plate === 'string' ? unit.plate.trim().toUpperCase() : '',
      color: typeof unit?.color === 'string' ? unit.color.trim().replace(/\s+/g, ' ') : '',
      transmission: typeof unit?.transmission === 'string' ? unit.transmission.trim().replace(/\s+/g, ' ') : '',
      currentKm: Number(unit?.currentKm ?? 0),
    }));
    if (!vehicle || !normalizedUnits.length || normalizedUnits.length > 30
      || normalizedUnits.some((unit) => !/^[A-Z0-9 -]{2,16}$/.test(unit.plate)
        || unit.color.length < 2 || unit.color.length > 40
        || /[\u0000-\u001f\u007f<>]/.test(unit.color)
        || unit.transmission && (unit.transmission.length < 2 || unit.transmission.length > 40
          || /[\u0000-\u001f\u007f<>]/.test(unit.transmission))
        || !Number.isSafeInteger(unit.currentKm) || unit.currentKm < 0 || unit.currentKm > 1_000_000_000)
      || new Set(normalizedUnits.map((unit) => unit.plate)).size !== normalizedUnits.length) {
      return fail(res, 400, 'Plat unik, jenis kendaraan, warna, dan odometer setiap unit harus valid.');
    }
    const units = readSetting('vehicle-services', []);
    const matched = normalizedUnits.map((submission) => ({
      submission,
      existing: units.find((unit) => unit.plate.toUpperCase() === submission.plate),
    }));
    if (matched.some(({ submission, existing }) => {
      const transmission = submission.transmission || existing?.transmission;
      return typeof transmission !== 'string' || transmission.length < 2 || transmission.length > 40
        || /[\u0000-\u001f\u007f<>]/.test(transmission);
    })) return fail(res, 400, 'Transmisi setiap unit harus diisi dengan benar.');
    const occupied = matched.find(({ submission, existing }) => existing?.color
      || existing && existing.carType !== carType);
    if (occupied) return fail(res, 409, `Plat ${occupied.submission.plate} sudah terdaftar.`);
    const activeReservations = activeFleetReservations();
    const assignedLegacyUnit = matched.find(({ submission, existing }) => existing
      && activeReservations.some((booking) =>
        booking.vehicleInspection?.plate?.toUpperCase() === submission.plate));
    if (assignedLegacyUnit) {
      return fail(res, 409, `Unit ${assignedLegacyUnit.submission.plate} sedang dipakai booking dan belum dapat diubah.`);
    }
    const newUnitCount = matched.filter(({ existing }) => !existing).length;
    const modelUnits = units.filter((unit) => unit.carType === carType && unit.color);
    if (modelUnits.length + newUnitCount > vehicle.total_count) {
      return fail(res, 409, `Jumlah unit berplat untuk ${carType} melebihi total unit ${vehicle.total_count}.`);
    }
    const savedUnits = matched.map(({ submission, existing }) => {
      const unit = {
        ...(existing || {}),
        plate: submission.plate,
        carType,
        category: vehicle.category,
        color: submission.color,
        transmission: submission.transmission || existing?.transmission || '',
        engine: existing?.engine || '',
        currentKm: existing ? Math.max(Number(existing.currentKm) || 0, submission.currentKm) : submission.currentKm,
        serviceHistory: existing?.serviceHistory || [],
      };
      if (existing) units[units.indexOf(existing)] = unit;
      else units.push(unit);
      return unit;
    });
    writeSetting('vehicle-services', units);
    if (Array.isArray(body.units)) return res.status(201).json(savedUnits);
    return res.status(matched[0].existing ? 200 : 201).json(savedUnits[0]);
  });

  app.put('/api/admin/fleet/physical-units/:plate', requireFeature('fleet'), (req, res) => {
    const plate = String(req.params.plate || '').trim().toUpperCase();
    const color = typeof req.body?.color === 'string' ? req.body.color.trim().replace(/\s+/g, ' ') : '';
    const units = readSetting('vehicle-services', []);
    const unit = units.find((item) => item.plate.toUpperCase() === plate && item.color);
    if (!unit) return fail(res, 404, `Unit berplat ${plate} tidak ditemukan.`);
    const transmission = typeof req.body?.transmission === 'string'
      ? req.body.transmission.trim().replace(/\s+/g, ' ')
      : unit.transmission || db.prepare('SELECT transmission FROM fleet WHERE name = ?').get(unit.carType)?.transmission || '';
    const currentKm = Number(req.body?.currentKm);
    if (!/^[A-Z0-9 -]{2,16}$/.test(plate) || color.length < 2 || color.length > 40
      || /[\u0000-\u001f\u007f<>]/.test(color)
      || transmission.length < 2 || transmission.length > 40 || /[\u0000-\u001f\u007f<>]/.test(transmission)
      || !Number.isSafeInteger(currentKm) || currentKm < 0 || currentKm > 1_000_000_000) {
      return fail(res, 400, 'Transmisi, warna, dan odometer unit harus valid.');
    }
    if (reservedPhysicalPlates().has(plate) && (color !== unit.color || transmission !== unit.transmission)) {
      return fail(res, 409, `Warna atau transmisi unit ${plate} tidak dapat diubah selama unit sedang dialokasikan.`);
    }
    unit.color = color;
    unit.transmission = transmission;
    unit.currentKm = Math.max(Number(unit.currentKm) || 0, currentKm);
    writeSetting('vehicle-services', units);
    return res.json({
      plate: unit.plate,
      carType: unit.carType,
      color: unit.color,
      transmission: unit.transmission,
      currentKm: unit.currentKm,
    });
  });

  app.delete('/api/admin/fleet/physical-units/:plate', requireFeature('fleet'), (req, res) => {
    const plate = String(req.params.plate || '').trim().toUpperCase();
    if (!/^[A-Z0-9 -]{2,16}$/.test(plate)) return fail(res, 400, 'Plat kendaraan tidak valid.');
    const result = createFleetDeletionRequest(req, 'physical-unit', plate, req.body?.reason);
    if (result.error) return fail(res, result.status || 400, result.error);
    return res.status(202).json(result.request);
  });

  app.get('/api/admin/vehicle-service-categories', requireAnyFeature('vehicle-service', 'checklist'), (req, res) => {
    res.json(readSetting('vehicle-service-categories', DEFAULT_VEHICLE_SERVICE_CATEGORIES));
  });

  app.post('/api/admin/vehicle-units', requireFeature('vehicle-service'), (req, res) => {
    const body = req.body || {};
    const plate = String(body.plate || '').trim().toUpperCase();
    const engine = typeof body.engine === 'string' ? body.engine.trim() : '';
    const carType = typeof body.carType === 'string' ? body.carType.trim() : '';
    const currentKm = Number(body.currentKm);
    const activeFleet = db.prepare('SELECT name, total_count FROM fleet WHERE is_archived = 0').all();
    if (!/^[A-Z0-9 -]{2,16}$/.test(plate) || engine.length < 1 || engine.length > 80
      || !activeFleet.some((item) => item.name === carType)
      || !Number.isSafeInteger(currentKm) || currentKm < 0 || currentKm > 1_000_000_000) {
      return fail(res, 400, 'Plat, tipe kendaraan, nomor mesin, dan odometer unit harus diisi dengan benar.');
    }
    const units = readSetting('vehicle-services', []);
    if (units.some((unit) => unit.plate.toUpperCase() === plate)) {
      return fail(res, 409, `Unit dengan plat ${plate} sudah terdaftar.`);
    }
    const fleetRecord = activeFleet.find((item) => item.name === carType);
    if (units.filter((unit) => unit.carType === carType).length >= fleetRecord.total_count) {
      return fail(res, 409, `Semua ${fleetRecord.total_count} unit ${carType} sudah terdaftar.`);
    }
    const unit = { plate, carType, engine, currentKm, serviceHistory: [] };
    units.push(unit);
    writeSetting('vehicle-services', units);
    return res.status(201).json(unit);
  });

  app.put('/api/admin/vehicle-service-categories', requireFeature('checklist'), (req, res) => {
    const categories = req.body?.categories;
    if (!Array.isArray(categories) || categories.length < 1 || categories.length > 30) {
      return fail(res, 400, 'Minimal satu dan maksimal 30 kategori servis harus tersedia.');
    }
    const normalized = [];
    const labels = new Set();
    for (const value of categories) {
      const label = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
      const key = label.toLocaleLowerCase('id-ID');
      if (label.length < 2 || label.length > 60 || /[\u0000-\u001f\u007f<>]/.test(label) || labels.has(key)) {
        return fail(res, 400, 'Nama kategori servis harus unik, 2–60 karakter, dan tidak mengandung karakter khusus.');
      }
      labels.add(key);
      normalized.push(label);
    }
    const previousCategories = readSetting('vehicle-service-categories', DEFAULT_VEHICLE_SERVICE_CATEGORIES);
    const renamedFrom = typeof req.body.renamedFrom === 'string' ? req.body.renamedFrom : '';
    const removedCategory = typeof req.body.removedCategory === 'string' ? req.body.removedCategory : '';
    if (renamedFrom && (!previousCategories.includes(renamedFrom) || !normalized.includes(req.body.renamedTo))) {
      return fail(res, 400, 'Kategori servis yang akan diganti namanya tidak valid.');
    }
    if (removedCategory && (!previousCategories.includes(removedCategory) || normalized.includes(removedCategory))) {
      return fail(res, 400, 'Kategori servis yang akan dihapus tidak valid.');
    }
    const units = readSetting('vehicle-services', []);
    for (const unit of units) {
      for (const service of unit.serviceHistory || []) {
        service.items = (service.items || []).map((item) => ({
          ...item,
          category: renamedFrom && item.category === renamedFrom
            ? req.body.renamedTo
            : removedCategory && item.category === removedCategory
              ? normalized[0]
              : normalized.includes(item.category) ? item.category : normalized[0],
        }));
      }
    }
    writeSetting('vehicle-service-categories', normalized);
    writeSetting('vehicle-services', units);
    res.json(normalized);
  });

  app.get('/api/admin/handover/units', requireFeature('handover'), (req, res) => {
    const units = readSetting('vehicle-services', []);
    res.json(units.map(({ plate, carType, category, color, currentKm, lastServiceKm, nextServiceKm }) => ({
      plate,
      carType,
      category: db.prepare('SELECT category FROM fleet WHERE name = ?').get(carType)?.category || category || '',
      color: color || '',
      currentKm,
      lastServiceKm,
      nextServiceKm,
    })));
  });

  app.get('/api/admin/handover/conditions', requireFeature('handover'), (req, res) => {
    res.json(readSetting('unit-conditions', {}));
  });

  app.put('/api/admin/handover/conditions/:carType', requireFeature('handover'), (req, res) => {
    const carType = String(req.params.carType || '').trim();
    const active = db.prepare('SELECT 1 FROM fleet WHERE name = ? AND is_archived = 0').get(carType);
    const notes = req.body?.notes;
    const photos = req.body?.photos;
    if (!active || typeof notes !== 'string' || notes.length > 500
      || !Array.isArray(photos) || photos.length > 6
      || photos.some((photo) => !validImage(photo, 250 * 1024))
      || photos.reduce((total, photo) => total + imageBytes(photo), 0) > 1500 * 1024) {
      return fail(res, 400, 'Catatan kondisi harus maksimal 500 karakter dan foto JPG/PNG maksimal 6 foto, 250 KB per foto.');
    }
    const conditions = readSetting('unit-conditions', {});
    const condition = { notes: notes.trim(), photos };
    conditions[carType] = condition;
    writeSetting('unit-conditions', conditions);
    return res.json(condition);
  });

  app.post('/api/admin/vehicle-services', requireFeature('vehicle-service'), (req, res) => {
    const body = req.body || {};
    const plate = String(body.plate || '').trim().toUpperCase();
    const engine = String(body.engine || '').trim();
    const workshop = String(body.workshop || '').trim();
    const lastServiceDate = body.lastServiceDate;
    const nextServiceDate = body.nextServiceDate;
    const lastServiceKm = Number(body.lastServiceKm);
    const nextServiceKm = Number(body.nextServiceKm);
    const activeFleet = db.prepare('SELECT name FROM fleet WHERE is_archived = 0').all();
    const serviceCategories = readSetting('vehicle-service-categories', DEFAULT_VEHICLE_SERVICE_CATEGORIES);
    const items = Array.isArray(body.items) ? body.items : [];
    const normalizedItems = items.map((item) => ({
      category: typeof item?.category === 'string' ? item.category.trim() : '',
      part: typeof item?.part === 'string' ? item.part.trim() : '',
      details: typeof item?.details === 'string' ? item.details.trim() : '',
      cost: Number(item?.cost),
    }));
    const totalCost = normalizedItems.reduce((sum, item) => sum + item.cost, 0);
    if (!/^[A-Z0-9 -]{2,16}$/.test(plate) || engine.length < 1 || engine.length > 80
      || workshop.length < 1 || workshop.length > 120
      || typeof body.carType !== 'string' || !activeFleet.some((item) => item.name === body.carType)
      || !validDateOnly(lastServiceDate) || !validDateOnly(nextServiceDate) || nextServiceDate <= lastServiceDate
      || !Number.isInteger(lastServiceKm) || lastServiceKm < 0
      || !Number.isInteger(nextServiceKm) || nextServiceKm <= lastServiceKm
      || items.length < 1 || items.length > 20
      || normalizedItems.some((item) => !serviceCategories.includes(item.category)
        || !item.part || item.part.length > 100 || item.details.length > 300
        || !Number.isSafeInteger(item.cost) || item.cost < 0)
      || !Number.isSafeInteger(totalCost) || totalCost > 1_000_000_000
      || !validImage(body.receipt, 300 * 1024)) {
      return fail(res, 400, 'Periksa plat, tipe kendaraan, rincian biaya servis, jadwal berikutnya, dan nota JPG/PNG maksimal 300 KB.');
    }
    const units = readSetting('vehicle-services', []);
    const existingIndex = units.findIndex((unit) => unit.plate.toUpperCase() === plate);
    const existing = existingIndex < 0 ? null : units[existingIndex];
    if ((existing?.serviceHistory || []).length >= 20) {
      return fail(res, 409, 'Riwayat servis unit sudah mencapai batas 20 catatan.');
    }
    const service = {
      plate,
      carType: body.carType,
      date: lastServiceDate,
      km: lastServiceKm,
      workshop,
      receipt: body.receipt,
      items: normalizedItems,
      totalCost,
      nextServiceKm,
      nextServiceDate,
    };
    const unit = {
      ...(existing || {}),
      plate,
      carType: body.carType,
      engine,
      workshop,
      lastServiceDate,
      lastServiceKm,
      currentKm: Math.max(Number(existing?.currentKm) || 0, lastServiceKm),
      nextServiceKm,
      nextServiceDate,
      receipt: body.receipt,
      serviceHistory: [...(existing?.serviceHistory || []), service],
    };
    if (existingIndex < 0) units.push(unit);
    else units[existingIndex] = unit;
    writeSetting('vehicle-services', units);
    return res.status(201).json(unit);
  });

  app.patch('/api/admin/bookings/:id/rental', requireFeature('bookings'), (req, res) => {
    const booking = getBooking(String(req.params.id).toUpperCase());
    if (!booking) return fail(res, 404, 'Booking tidak ditemukan.');
    if (booking.handoverStatus !== 'Disetujui' || booking.rentalReturnedAt) {
      return fail(res, 409, 'Perubahan masa sewa hanya dapat dicatat untuk unit yang masih disewa.');
    }
    if (req.body?.action !== 'extend'
      || ![12, 24].includes(Number(req.body.hours))
      || !Number.isFinite(Number(req.body.checkpointHours))
      || Number(req.body.checkpointHours) <= 0) {
      return fail(res, 400, 'Data konfirmasi perpanjangan masa sewa tidak valid.');
    }
    booking.rentalExtendedHours = Math.max(0, Number(booking.rentalExtendedHours) || 0) + Number(req.body.hours);
    booking.rentalConfirmedCheckpointHours = Math.max(
      Number(booking.rentalConfirmedCheckpointHours) || 0,
      Number(req.body.checkpointHours),
    );
    saveBooking(booking);
    return res.json({
      id: booking.id,
      rentalExtendedHours: booking.rentalExtendedHours,
      rentalConfirmedCheckpointHours: booking.rentalConfirmedCheckpointHours,
    });
  });

  app.get('/api/admin/bookings', requireFeature('bookings'), (req, res) => {
    const bookings = db.prepare('SELECT * FROM bookings ORDER BY created_at DESC').all().map(bookingRecord);
    res.json(bookings);
  });

  app.get('/api/admin/bookings/:id', requireFeature('bookings'), (req, res) => {
    const booking = getBooking(String(req.params.id).toUpperCase());
    if (!booking) return fail(res, 404, 'Booking tidak ditemukan.');
    res.json(booking);
  });

  app.patch('/api/admin/bookings/:id/approval', requireFeature('bookings'), (req, res) => {
    const booking = getBooking(String(req.params.id).toUpperCase());
    if (!booking) return fail(res, 404, 'Booking tidak ditemukan.');
    if (booking.bookingApproval !== 'Menunggu persetujuan') return fail(res, 409, 'Booking sudah diproses.');
    const action = req.body?.action;
    if (action === 'approve') {
      if (!booking.vehicleColor && fleetPhysicalUnits(booking.carType).length
        && physicalColorAvailability(booking.carType, booking.id)
          .every((color) => color.availableCount === 0)) {
        return fail(res, 409, `Tidak ada unit fisik ${booking.carType} yang tersedia untuk booking ini.`);
      }
      if (booking.vehicleColor && availablePhysicalColorCount(booking.carType, booking.vehicleColor, booking.id) < 1) {
        return fail(res, 409, `Warna ${booking.vehicleColor} untuk ${booking.carType} sudah tidak tersedia.`);
      }
      const reserve = db.prepare('UPDATE fleet SET available_count = available_count - 1 WHERE name = ? AND available_count > 0 AND is_archived = 0');
      const transaction = db.prepare('BEGIN IMMEDIATE');
      transaction.run();
      try {
        const result = reserve.run(booking.carType);
        if (!result.changes) {
          db.exec('ROLLBACK');
          return fail(res, 409, 'Unit tidak tersedia. Tambahkan stok atau tolak pengajuan ini.');
        }
        booking.bookingApproval = 'Disetujui';
        booking.bookingApprovedAt = new Date().toISOString();
        booking.stockReserved = true;
        if (booking.depositPaymentRequired) {
          booking.status = 'Pembayaran';
          booking.statusHistory = booking.statusHistory || [];
          booking.statusHistory.push({ status: booking.status, at: booking.bookingApprovedAt });
        }
        saveBooking(booking);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    } else if (action === 'reject') {
      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
      if (!reason) return fail(res, 400, 'Alasan penolakan wajib diisi.');
      booking.bookingApproval = 'Ditolak';
      booking.bookingRejectedAt = new Date().toISOString();
      booking.bookingRejectionReason = reason.slice(0, 500);
      saveBooking(booking);
    } else return fail(res, 400, 'Aksi persetujuan tidak valid.');
    res.json(booking);
  });

  app.get('/api/admin/fleet', requireFeature('fleet'), (req, res) => {
    res.json(db.prepare('SELECT * FROM fleet ORDER BY name').all().map(fleetRecord));
  });

  app.delete('/api/admin/fleet/:id', requireFeature('fleet'), (req, res) => {
    const current = db.prepare('SELECT * FROM fleet WHERE id = ?').get(req.params.id);
    if (!current) return fail(res, 404, 'Unit armada tidak ditemukan.');
    if (current.is_archived) return fail(res, 409, 'Unit armada ini sudah diarsipkan.');
    const result = createFleetDeletionRequest(req, 'fleet-model', current.id, req.body?.reason);
    if (result.error) return fail(res, result.status || 400, result.error);
    return res.status(202).json(result.request);
  });

  app.post('/api/admin/fleet', requireFeature('fleet'), (req, res) => {
    const { name, priceNoDriver, priceWithDriverFuel, priceWithDriverNoFuel, totalCount } = req.body || {};
    const category = req.body?.category || fleetCategories()[0];
    const seats = Number(req.body?.seats);
    const parsedPhotos = parseFleetPhotos(req.body?.photos);
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 80
      || !Number.isInteger(seats) || seats < 1 || seats > 20
      || ![priceNoDriver, priceWithDriverFuel, priceWithDriverNoFuel].every((price) => Number.isInteger(price) && price >= 1000)
      || !Number.isInteger(totalCount) || totalCount < 1 || totalCount > 1000
      || !fleetCategories().includes(category)) return fail(res, 400, 'Nama, kategori, jumlah kursi, tarif, atau jumlah unit tidak valid.');
    if (parsedPhotos.error) return fail(res, 400, parsedPhotos.error);
    const id = `unit-${crypto.randomUUID()}`;
    try {
      db.prepare('INSERT INTO fleet (id, name, total_count, available_count, price_no_driver, price_driver_fuel, price_driver_no_fuel, photos_json, category, transmission, seats) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, name.trim(), totalCount, totalCount, priceNoDriver, priceWithDriverFuel, priceWithDriverNoFuel, JSON.stringify(parsedPhotos.photos), category, 'Belum diisi', seats);
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return fail(res, 409, 'Nama unit sudah ada di daftar.');
      throw error;
    }
    res.status(201).json(fleetRecord(db.prepare('SELECT * FROM fleet WHERE id = ?').get(id)));
  });

  app.put('/api/admin/fleet/:id', requireFeature('fleet'), (req, res) => {
    const current = db.prepare('SELECT * FROM fleet WHERE id = ?').get(req.params.id);
    if (!current) return fail(res, 404, 'Unit armada tidak ditemukan.');
    if (current.is_archived) return fail(res, 409, 'Kendaraan yang sudah dihapus tidak dapat diperbarui.');
    const { priceNoDriver, priceWithDriverFuel, priceWithDriverNoFuel, totalCount } = req.body || {};
    const category = req.body?.category || current.category || fleetCategories()[0];
    const seats = req.body?.seats === undefined ? current.seats : Number(req.body.seats);
    const parsedPhotos = Object.hasOwn(req.body || {}, 'photos')
      ? parseFleetPhotos(req.body.photos)
      : { photos: JSON.parse(current.photos_json || '[]') };
    const reserved = current.total_count - current.available_count;
    const registeredUnitCount = fleetPhysicalUnits(current.name).length;
    if (![priceNoDriver, priceWithDriverFuel, priceWithDriverNoFuel].every((price) => Number.isInteger(price) && price >= 1000)
      || !Number.isInteger(seats) || seats < 1 || seats > 20
      || !Number.isInteger(totalCount) || totalCount < reserved || totalCount < registeredUnitCount || totalCount > 1000
      || !fleetCategories().includes(category)) return fail(res, 400, 'Jumlah unit harus mencakup unit terpesan dan seluruh plat terdaftar, dengan kategori valid serta tarif minimal Rp1.000.');
    if (parsedPhotos.error) return fail(res, 400, parsedPhotos.error);
    db.prepare(`
      UPDATE fleet SET total_count = ?, available_count = ?, price_no_driver = ?, price_driver_fuel = ?, price_driver_no_fuel = ?, photos_json = ?, category = ?, seats = ?
      WHERE id = ?
    `).run(totalCount, totalCount - reserved, priceNoDriver, priceWithDriverFuel, priceWithDriverNoFuel, JSON.stringify(parsedPhotos.photos), category, seats, current.id);
    res.json(fleetRecord(db.prepare('SELECT * FROM fleet WHERE id = ?').get(current.id)));
  });

  app.get('/api/payment-settings', (req, res) => res.json(readSetting('payment', {})));
  app.get('/api/admin/payment-settings', requireFeature('payments'), (req, res) => res.json(readSetting('payment', {})));
  app.put('/api/admin/payment-settings', requireFeature('payments'), (req, res) => {
    const settings = req.body || {};
    if (['qrName', 'bankName', 'bankAccount', 'bankHolder'].some((key) => typeof settings[key] !== 'string')) return fail(res, 400, 'Pengaturan pembayaran tidak valid.');
    if (settings.qrImage && !validImage(settings.qrImage, 250 * 1024)) return fail(res, 400, 'QRIS harus berupa JPG/PNG maksimal 250 KB.');
    const saved = {
      qrName: settings.qrName.trim().slice(0, 100),
      qrImage: settings.qrImage || '',
      bankName: settings.bankName.trim().slice(0, 100),
      bankAccount: settings.bankAccount.trim().slice(0, 60),
      bankHolder: settings.bankHolder.trim().slice(0, 100),
    };
    writeSetting('payment', saved);
    res.json(saved);
  });

  app.patch('/api/admin/bookings/:id/payment', requireFeature('bookings'), (req, res) => {
    const booking = getBooking(String(req.params.id).toUpperCase());
    if (!booking) return fail(res, 404, 'Booking tidak ditemukan.');
    if (!['approve', 'reject'].includes(req.body?.action)) return fail(res, 400, 'Aksi pembayaran tidak valid.');
    const stage = req.body?.stage || 'rental';
    const approved = req.body.action === 'approve';
    const reviewedAt = new Date().toISOString();
    if (booking.depositPaymentRequired && stage === 'deposit') {
      if (booking.depositPaymentStatus !== 'Menunggu konfirmasi') return fail(res, 409, 'Verifikasi deposit sudah diproses atau belum dikirim.');
      booking.depositPaymentStatus = approved ? 'Dikonfirmasi' : 'Ditolak';
      booking.depositPaymentReviewedAt = reviewedAt;
      booking.depositPaymentAdminNote = approved ? '' : 'Bukti deposit ditolak; pelanggan perlu mengirim ulang.';
    } else {
      if (stage !== 'rental') return fail(res, 400, 'Tahap pembayaran tidak valid.');
      if (booking.depositPaymentRequired && booking.depositPaymentStatus !== 'Dikonfirmasi') {
        return fail(res, 409, 'Deposit harus dikonfirmasi sebelum pembayaran sewa.');
      }
      if (booking.paymentStatus !== 'Menunggu konfirmasi') return fail(res, 409, 'Pembayaran sudah diproses atau belum dikirim.');
      booking.paymentStatus = approved ? 'Dikonfirmasi' : 'Ditolak';
      booking.paymentReviewedAt = reviewedAt;
      if (approved) booking.paymentConfirmedAt = reviewedAt;
      booking.paymentAdminNote = approved ? '' : 'Bukti ditolak; silakan kirim ulang bukti pembayaran.';
      if (approved) {
        booking.status = booking.depositPaymentRequired ? 'Persiapan unit' : 'Serah terima';
        booking.statusHistory.push({ status: booking.status, at: reviewedAt });
      }
    }
    saveBooking(booking);
    res.json(booking);
  });

  app.get('/api/location', (req, res) => res.json(readSetting('location', null)));
  app.put('/api/admin/location', requireFeature('location'), (req, res) => {
    const { address, mapsUrl } = req.body || {};
    const reviewUrl = typeof req.body?.reviewUrl === 'string' ? req.body.reviewUrl.trim() : '';
    let url;
    let parsedReviewUrl = null;
    try { url = new URL(mapsUrl); } catch { return fail(res, 400, 'Masukkan tautan Google Maps yang valid.'); }
    if (reviewUrl) {
      try { parsedReviewUrl = new URL(reviewUrl); } catch { return fail(res, 400, 'Masukkan tautan ulasan Google Maps yang valid.'); }
    }
    const validGoogleMapsUrl = (candidate) => candidate.protocol === 'https:'
      && (candidate.hostname === 'maps.app.goo.gl'
        || candidate.hostname === 'goo.gl' && candidate.pathname.startsWith('/maps')
        || candidate.hostname === 'google.com'
        || candidate.hostname.endsWith('.google.com'));
    if (typeof address !== 'string' || !address.trim() || !validGoogleMapsUrl(url)
      || parsedReviewUrl && !validGoogleMapsUrl(parsedReviewUrl)) {
      return fail(res, 400, 'Isi alamat dan gunakan tautan Google Maps HTTPS yang valid.');
    }
    const location = {
      address: address.trim().slice(0, 300),
      mapsUrl: url.href,
      reviewUrl: parsedReviewUrl?.href || '',
    };
    writeSetting('location', location);
    res.json(location);
  });

  app.patch('/api/admin/bookings/:id/handover', requireFeature('handover'), (req, res) => {
    const booking = getBooking(String(req.params.id).toUpperCase());
    if (!booking) return fail(res, 404, 'Booking tidak ditemukan.');
    if (booking.handoverStatus !== 'Menunggu konfirmasi admin') return fail(res, 409, 'Serah-terima tidak sedang menunggu persetujuan.');
    const action = req.body?.action;
    if (!['approve', 'reject'].includes(action)) return fail(res, 400, 'Aksi serah-terima tidak valid.');
    booking.handoverStatus = action === 'approve' ? 'Disetujui' : 'Ditolak';
    booking.handoverReviewedAt = new Date().toISOString();
    if (action === 'approve') {
      booking.handoverApprovedAt = booking.handoverReviewedAt;
      booking.rentalStartedAt = booking.rentalStartedAt || booking.handoverReviewedAt;
    }
    booking.handoverAdminNote = action === 'reject' ? String(req.body.note || '').trim().slice(0, 500) : '';
    if (action === 'approve') booking.status = 'Selesai';
    booking.statusHistory.push({ status: booking.status, at: new Date().toISOString() });
    saveBooking(booking);
    res.json(booking);
  });

  app.use('/api', (req, res) => fail(res, 404, 'Endpoint API tidak ditemukan.'));
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'Metode tidak diizinkan.');
    const relative = decodeURIComponent(req.path).replace(/^\/+/, '');
    const isPage = !relative || /^[^/]+\.html$/i.test(relative);
    const isAsset = /^assets\/(?:css\/[^/]+\.css|js\/[^/]+\.js)$/i.test(relative);
    const resolved = isPage
      ? path.join(ROOT, 'pages', relative || 'index.html')
      : path.resolve(ROOT, relative);
    const allowed = (isPage || isAsset)
      && fs.existsSync(resolved)
      && fs.statSync(resolved).isFile();
    if (!allowed) return fail(res, 404, 'Halaman tidak ditemukan.');
    const pageName = path.basename(resolved);
    const feature = ADMIN_PAGE_FEATURES[pageName];
    if (feature) {
      const token = req.cookies?.drivelink_session;
      const session = token ? db.prepare(`
        SELECT admins.username, admins.role, admins.permissions_json FROM sessions
        JOIN admins ON admins.username = sessions.username
        WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND admins.active = 1
      `).get(hashSessionToken(token), new Date().toISOString()) : null;
      if (!session) return res.redirect('/auth.html');
      if (['accounts', 'settings', 'fleet-deletions'].includes(feature) && session.role !== 'admin') {
        return fail(res, 403, 'Halaman ini hanya dapat diakses administrator.');
      }
      if (session.role !== 'admin' && feature !== 'accounts'
        && !JSON.parse(session.permissions_json || '[]').includes(feature)) {
        return fail(res, 403, 'Akun Anda tidak memiliki izin untuk halaman ini.');
      }
    }
    if (isPage) {
      return fs.readFile(resolved, 'utf8', (error, html) => {
        if (error) return next(error);
        const theme = readSetting('theme', { primary: '#1837d1' });
        const primary = /^#[0-9a-f]{6}$/i.test(theme.primary) && hasReadableContrast(theme.primary)
          ? theme.primary
          : '#1837d1';
        const gradientEnd = /^#[0-9a-f]{6}$/i.test(theme.gradientEnd) && hasReadableContrast(theme.gradientEnd)
          ? theme.gradientEnd
          : '#476eff';
        const gradientAngle = ['45deg', '90deg', '135deg', '180deg'].includes(theme.gradientAngle)
          ? theme.gradientAngle
          : '135deg';
        const themeStyles = `<style id="drivelink-site-theme">:root{--primary:${primary};--primary-gradient-end:${gradientEnd};--primary-gradient-angle:${gradientAngle};--primary-dark:color-mix(in srgb,${primary} 78%,#000);--secondary:color-mix(in srgb,${primary} 10%,#fff);--admin-sidebar:color-mix(in srgb,${primary} 45%,#101b37);--admin-sidebar-active:color-mix(in srgb,${primary} 25%,#101b37);--admin-sidebar-accent:${primary}}</style>`;
        const logo = readSetting('brand-logo', '');
        const renderedLogo = validImage(logo, MAX_BRAND_LOGO_BYTES)
          ? `<img class="brand-mark brand-logo" src="${logo}" alt="" />`
          : '<span class="brand-mark">D</span>';
        const themedHtml = html.replace('</head>', `${themeStyles}</head>`);
        const brandedHtml = themedHtml.replaceAll('<span class="brand-mark">D</span>', renderedLogo);
        return res.type('html').send(brandedHtml);
      });
    }
    return res.sendFile(resolved);
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof SyntaxError && 'body' in error) return fail(res, 400, 'Format JSON tidak valid.');
    if (error.type === 'entity.too.large') return fail(res, 413, 'Ukuran data terlalu besar.');
    console.error(error);
    return fail(res, 500, 'Terjadi kesalahan server.');
  });

  app.locals.db = db;
  return app;
}

if (require.main === module) {
  const app = createApp();
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';
  app.listen(port, host, () => {
    console.log(`DriveLink berjalan di http://localhost:${port}`);
    if (host === '0.0.0.0') {
      const addresses = Object.values(os.networkInterfaces())
        .flatMap((interfaces) => interfaces || [])
        .filter((network) => network.family === 'IPv4' && !network.internal)
        .map((network) => network.address);
      [...new Set(addresses)].forEach((address) => {
        console.log(`Perangkat lain di jaringan yang sama: http://${address}:${port}`);
      });
    }
  });
}

module.exports = { createApp, normalizePhone };
