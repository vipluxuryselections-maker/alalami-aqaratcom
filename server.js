'use strict';

const crypto = require('node:crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const http = require('node:http');
const path = require('node:path');
const { Pool } = require('pg');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const databasePool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.DATABASE_SSL === 'true'
          ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' }
          : undefined,
    })
  : null;
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS ||
    'http://localhost:5000,http://localhost:8080,http://127.0.0.1:5000,http://127.0.0.1:8080')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);
const developerAlertToken = process.env.DEVELOPER_ALERT_TOKEN;
const complianceBypassToken = process.env.COMPLIANCE_BYPASS_TOKEN;
const platformAdminToken = process.env.PLATFORM_ADMIN_TOKEN;
const suspiciousWords = [
  'رقمي',
  'جوالي',
  'تواصل بره',
  'حسابي الخاص',
  'بدون مكتب',
  'تحويل مباشر',
];
const defaultSaeiRates = Object.freeze({
  realestate_sale: 0.01,
  realestate_rent: 0.05,
  stocks: 0.005,
  gold: 0.01,
  scrap: 0.02,
});
const assetRegulatoryRules = Object.freeze({
  realestate_sale: Object.freeze({
    requiredLicense: 'رخصة فال العقارية + ترخيص الإعلان العقاري',
    saeiRate: defaultSaeiRates.realestate_sale,
  }),
  realestate_rent: Object.freeze({
    requiredLicense: 'رخصة فال العقارية + توثيق عقد إيجار موحد',
    saeiRate: defaultSaeiRates.realestate_rent,
  }),
  gold: Object.freeze({
    requiredLicense: 'سجل تجاري لتجارة المعادن + ختم الغرفة التجارية الإلكتروني المعتمد',
    saeiRate: defaultSaeiRates.gold,
  }),
  stocks: Object.freeze({
    requiredLicense: 'إقرار ملكية أسهم شركة مغلقة غير مدرجة (امتثال CMA)',
    saeiRate: defaultSaeiRates.stocks,
  }),
  scrap: Object.freeze({
    requiredLicense:
      'رخصة مستودع بلدية + تصريح الشرطة + ختم وتصديق الغرفة التجارية للشركة',
    saeiRate: defaultSaeiRates.scrap,
  }),
});
const assetComplianceRules = Object.freeze({
  realestate_sale: Object.freeze({
    requiredLicense: 'رخصة فال العقارية + ترخيص الإعلان العقاري',
    saeiRate: defaultSaeiRates.realestate_sale,
  }),
  realestate_rent: Object.freeze({
    requiredLicense: 'رخصة فال العقارية + توثيق عقد إيجار موحد',
    saeiRate: defaultSaeiRates.realestate_rent,
  }),
  gold: Object.freeze({
    requiredLicense: 'سجل تجاري لتجارة المعادن الثمينة + شهادة مطابقة العيار والدمغة',
    saeiRate: defaultSaeiRates.gold,
  }),
  stocks: Object.freeze({
    requiredLicense: 'إقرار ملكية أسهم شركة مغلقة غير مدرجة (امتثال CMA)',
    saeiRate: defaultSaeiRates.stocks,
  }),
  scrap: Object.freeze({
    requiredLicense: 'رخصة المستودع البلدية',
    saeiRate: defaultSaeiRates.scrap,
  }),
});
const complianceReviewNotice =
  'المنصة أداة تقنية لتسجيل الطلبات. لا يُعد هذا الرد اعتماداً نظامياً أو تحققاً من المستندات ولا ينشئ عقداً أو توقيعاً إلكترونياً. تقع مسؤولية مراجعة المتطلبات المنطبقة على الأطراف، وينبغي استشارة مختص قانوني.';
const subscriptionPlans = Object.freeze({
  weekly: { name: 'الباقة الأسبوعية', price: 29 },
  monthly: { name: 'الباقة الشهرية', price: 99 },
  yearly: { name: 'الباقة السنوية', price: 799 },
});
let platformSettings = {
  bankAccounts: [],
  contactNumbers: [],
  socialMedia: {
    twitter: '',
    tiktok: '',
    instagram: '',
    email: '',
  },
};
const assetActionPreviews = Object.freeze({
  Sell: 'البيع',
  Rent: 'التأجير',
  Mortgage: 'الرهن العقاري',
  Develop: 'التطوير',
  Invest: 'الاستثمار',
});
const customDeals = new Map();

async function initializeSuperAppTables() {
  if (!databasePool) {
    return false;
  }

  await databasePool.query(`
    CREATE TABLE IF NOT EXISTS user_offices (
      id SERIAL PRIMARY KEY,
      full_name VARCHAR(150) NOT NULL,
      phone VARCHAR(50) NOT NULL,
      email VARCHAR(150),
      license_number VARCHAR(100),
      bio TEXT,
      avatar_base64 TEXT,
      is_public BOOLEAN DEFAULT TRUE,
      facility_name VARCHAR(150),
      subscription_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS office_ledger (
      id SERIAL PRIMARY KEY,
      office_id INT DEFAULT 1,
      item_type VARCHAR(50) NOT NULL,
      status VARCHAR(50) DEFAULT 'جديد',
      title VARCHAR(200) NOT NULL,
      asset_category VARCHAR(100),
      deal_type VARCHAR(50),
      price NUMERIC(15, 2) DEFAULT 0,
      area NUMERIC(15, 2) DEFAULT 0,
      location VARCHAR(150),
      owner_type VARCHAR(100),
      contact_phone VARCHAR(50),
      seriousness_score INT DEFAULT 5,
      recommendations_count INT DEFAULT 0,
      interactions_count INT DEFAULT 0,
      is_featured BOOLEAN DEFAULT FALSE,
      co_broker_name VARCHAR(100),
      commission_split VARCHAR(100),
      loi_attached BOOLEAN DEFAULT FALSE,
      buy_commitment BOOLEAN DEFAULT FALSE,
      brokers_commitment TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS appointments (
      id SERIAL PRIMARY KEY,
      client_name VARCHAR(150),
      topic VARCHAR(200),
      appointment_date VARCHAR(50),
      appointment_time VARCHAR(50),
      status VARCHAR(50) DEFAULT 'مجدول تلقائياً',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS deals (
      deal_id VARCHAR(120) PRIMARY KEY,
      asset_type VARCHAR(50) NOT NULL,
      price NUMERIC(15, 2) NOT NULL,
      saei_amount NUMERIC(15, 2) NOT NULL,
      platform_share NUMERIC(15, 2) NOT NULL,
      broker_shares JSONB NOT NULL,
      unassigned_broker_share NUMERIC(15, 2) NOT NULL,
      status VARCHAR(50) NOT NULL,
      payouts_executed BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await databasePool.query(
    'ALTER TABLE office_ledger ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50)',
  );
  await databasePool.query(`
    ALTER TABLE office_ledger
      ADD COLUMN IF NOT EXISTS location VARCHAR(150),
      ADD COLUMN IF NOT EXISTS owner_type VARCHAR(100)
  `);
  return true;
}

const databaseReady = initializeSuperAppTables().catch((error) => {
  console.error('Failed to initialize PostgreSQL tables:', error.message);
  return false;
});

async function getDatabaseOrRespond(res) {
  if (!databasePool) {
    res.status(503).json({
      success: false,
      code: 'DATABASE_NOT_CONFIGURED',
      message: 'الحفظ غير متاح؛ يجب إعداد DATABASE_URL لقاعدة PostgreSQL على الخادم.',
    });
    return null;
  }

  if (!(await databaseReady)) {
    res.status(503).json({
      success: false,
      code: 'DATABASE_NOT_READY',
      message: 'قاعدة البيانات غير جاهزة حالياً؛ لم يتم حفظ البيانات.',
    });
    return null;
  }

  return databasePool;
}

const io = new Server(server, {
  cors: {
    origin: [...allowedOrigins],
    methods: ['GET', 'POST'],
  },
});

app.disable('x-powered-by');
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      },
    },
  }),
);
app.use((req, res, next) => {
  const origin = req.get('origin');
  const requestOrigin = `${req.protocol}://${req.get('host')}`;

  if (!origin || origin === requestOrigin) {
    next();
    return;
  }

  cors({
    origin(requestOriginHeader, callback) {
      if (allowedOrigins.has(requestOriginHeader)) {
        callback(null, true);
        return;
      }

      callback(new Error('Origin is not allowed by CORS'));
    },
  })(req, res, next);
});
app.use(express.json({ limit: '16kb', strict: true }));
app.use(
  '/api',
  rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

function isNonEmptyString(value, maxLength) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function isValidSaudiIban(value) {
  if (typeof value !== 'string' || !/^SA\d{22}$/.test(value)) {
    return false;
  }

  const rearrangedIban = `${value.slice(4)}${value.slice(0, 4)}`;
  let remainder = 0;
  for (const character of rearrangedIban) {
    const digits =
      character >= 'A' && character <= 'Z'
        ? String(character.charCodeAt(0) - 55)
        : character;
    for (const digit of digits) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }

  return remainder === 1;
}

function isValidBankAccounts(value) {
  return (
    Array.isArray(value) &&
    value.length <= 20 &&
    value.every(
      (account) =>
        account !== null &&
        typeof account === 'object' &&
        !Array.isArray(account) &&
        Object.keys(account).every((key) =>
          ['bankName', 'accountName', 'iban'].includes(key),
        ) &&
        isNonEmptyString(account.bankName, 100) &&
        isNonEmptyString(account.accountName, 150) &&
        isValidSaudiIban(account.iban),
    )
  );
}

function isValidContactNumbers(value) {
  return (
    Array.isArray(value) &&
    value.length <= 20 &&
    value.every(
      (contact) =>
        contact !== null &&
        typeof contact === 'object' &&
        !Array.isArray(contact) &&
        Object.keys(contact).every((key) =>
          ['title', 'value'].includes(key),
        ) &&
        isNonEmptyString(contact.title, 100) &&
        typeof contact.value === 'string' &&
        contact.value.length <= 30 &&
        /^\+?[\d\s()-]{7,30}$/.test(contact.value) &&
        (contact.value.match(/\d/g)?.length ?? 0) >= 7,
    )
  );
}

function isValidSocialMedia(value) {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return false;
  }

  const allowedFields = new Set(['twitter', 'tiktok', 'instagram', 'email']);
  if (Object.keys(value).some((key) => !allowedFields.has(key))) {
    return false;
  }

  const validHttpsUrl = (url) => {
    if (url === '') {
      return true;
    }
    if (!isNonEmptyString(url, 2048)) {
      return false;
    }
    try {
      return new URL(url).protocol === 'https:';
    } catch {
      return false;
    }
  };
  const emailIsValid =
    value.email === undefined ||
    value.email === '' ||
    (isNonEmptyString(value.email, 254) &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email));

  return (
    ['twitter', 'tiktok', 'instagram'].every(
      (key) => value[key] === undefined || validHttpsUrl(value[key]),
    ) && emailIsValid
  );
}

function isValidPlatformSettingsPatch(value) {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length === 0
  ) {
    return false;
  }

  const allowedFields = new Set([
    'bankAccounts',
    'contactNumbers',
    'socialMedia',
  ]);
  if (Object.keys(value).some((key) => !allowedFields.has(key))) {
    return false;
  }

  return (
    (value.bankAccounts === undefined ||
      isValidBankAccounts(value.bankAccounts)) &&
    (value.contactNumbers === undefined ||
      isValidContactNumbers(value.contactNumbers)) &&
    (value.socialMedia === undefined ||
      isValidSocialMedia(value.socialMedia))
  );
}

function parseAmountInHalalas(value) {
  if (
    (typeof value !== 'number' && typeof value !== 'string') ||
    !/^\d+(?:\.\d{1,2})?$/.test(String(value).trim())
  ) {
    return null;
  }

  const amount = Number(value);
  const halalas = Math.round(amount * 100);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(halalas)) {
    return null;
  }

  return halalas;
}

function formatHalalas(halalas) {
  return Number((halalas / 100).toFixed(2));
}

function calculateDistribution(totalHalalas) {
  const platformHalalas = Math.round(totalHalalas * 0.5);
  const mainBrokerHalalas = Math.round(totalHalalas * 0.3);
  const additionalBrokerHalalas =
    totalHalalas - platformHalalas - mainBrokerHalalas;

  return {
    platformAmount: formatHalalas(platformHalalas),
    mainBrokerAmount: formatHalalas(mainBrokerHalalas),
    additionalBrokerAmount: formatHalalas(additionalBrokerHalalas),
  };
}

function createFlexibleDeal({
  assetType,
  price,
  brokerIds,
  customSaeiAmount,
}) {
  const priceHalalas = parseAmountInHalalas(price);
  const hasCustomSaei = customSaeiAmount !== undefined && customSaeiAmount !== null;
  const customSaeiHalalas = hasCustomSaei
    ? parseAmountInHalalas(customSaeiAmount)
    : null;
  const validBrokerIds =
    Array.isArray(brokerIds) &&
    brokerIds.length <= 50 &&
    brokerIds.every((brokerId) => isNonEmptyString(brokerId, 120)) &&
    new Set(brokerIds).size === brokerIds.length;

  if (
    typeof assetType !== 'string' ||
    !Object.hasOwn(defaultSaeiRates, assetType) ||
    priceHalalas === null ||
    (hasCustomSaei && customSaeiHalalas === null) ||
    !validBrokerIds
  ) {
    return null;
  }

  const saeiHalalas =
    customSaeiHalalas ?? Math.round(priceHalalas * defaultSaeiRates[assetType]);
  if (saeiHalalas <= 0) return null;

  const platformHalalas = Math.round(saeiHalalas * 0.5);
  const brokerPoolHalalas = saeiHalalas - platformHalalas;
  const brokerShares = brokerIds.map((brokerId, index) => {
    const share =
      index === brokerIds.length - 1
        ? brokerPoolHalalas -
          Math.floor(brokerPoolHalalas / brokerIds.length) * index
        : Math.floor(brokerPoolHalalas / brokerIds.length);
    return { brokerId, amount: formatHalalas(share) };
  });
  const distributedBrokerHalalas = brokerShares.reduce(
    (total, broker) => total + Math.round(broker.amount * 100),
    0,
  );

  return {
    dealId: `DEAL_${crypto.randomUUID()}`,
    assetType,
    price: formatHalalas(priceHalalas),
    saeiAmount: formatHalalas(saeiHalalas),
    platformShare: formatHalalas(platformHalalas),
    brokerShares,
    unassignedBrokerShare: formatHalalas(
      brokerPoolHalalas - distributedBrokerHalalas,
    ),
    status: 'awaiting_payment',
    payoutsExecuted: false,
  };
}

function tokensMatch(providedToken, expectedToken) {
  if (typeof providedToken !== 'string' || !expectedToken) {
    return false;
  }

  const provided = Buffer.from(providedToken);
  const expected = Buffer.from(expectedToken);
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

io.use((socket, next) => {
  if (!tokensMatch(socket.handshake.auth?.developerToken, developerAlertToken)) {
    next(new Error('Developer alert authentication failed'));
    return;
  }

  next();
});

io.on('connection', (socket) => {
  socket.join('super_developer');

  socket.on('start_realtime_stream', (data) => {
    const propertyId = data?.propertyId;
    if (!isNonEmptyString(propertyId, 120)) {
      socket.emit('realtime_error', {
        event: 'start_realtime_stream',
        message: 'معرّف العقار مطلوب.',
      });
      return;
    }

    socket.join(`live_room_${propertyId}`);
    socket.emit('live_stream_joined', { propertyId });
  });

  socket.on('send_live_chat_message', (data) => {
    const { propertyId, senderName, messageText } = data ?? {};
    if (
      !isNonEmptyString(propertyId, 120) ||
      !isNonEmptyString(senderName, 120) ||
      !isNonEmptyString(messageText, 1000)
    ) {
      socket.emit('realtime_error', {
        event: 'send_live_chat_message',
        message: 'معرّف العقار واسم المرسل والرسالة مطلوبة ضمن الحدود المسموحة.',
      });
      return;
    }

    const room = `live_room_${propertyId}`;
    if (!socket.rooms.has(room)) {
      socket.emit('realtime_error', {
        event: 'send_live_chat_message',
        message: 'انضم إلى بث العقار قبل إرسال الرسائل.',
      });
      return;
    }

    io.to(room).emit('live_chat_received', {
      propertyId,
      sender: senderName,
      text: messageText,
    });
  });
});

app.get('/api/health', (req, res) => {
  res.json({ success: true, service: 'aqarat-app-api' });
});

app.post('/api/office/profile', async (req, res) => {
  const {
    fullName,
    phone,
    email,
    licenseNumber,
    bio,
    avatarBase64,
    isPublic,
    facilityName,
  } = req.body ?? {};
  const optionalTextIsValid = (value, maxLength) =>
    value === undefined ||
    value === null ||
    value === '' ||
    (typeof value === 'string' && value.length <= maxLength);
  if (
    !isNonEmptyString(fullName, 150) ||
    !isNonEmptyString(phone, 50) ||
    !optionalTextIsValid(email, 254) ||
    (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) ||
    !optionalTextIsValid(licenseNumber, 100) ||
    !optionalTextIsValid(bio, 12000) ||
    !optionalTextIsValid(facilityName, 150) ||
    (avatarBase64 !== undefined &&
      (typeof avatarBase64 !== 'string' ||
        avatarBase64.length > 12000 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(avatarBase64))) ||
    (isPublic !== undefined && typeof isPublic !== 'boolean')
  ) {
    res.status(400).json({
      success: false,
      message: 'بيانات المكتب غير صالحة أو تتجاوز الحدود المسموحة.',
    });
    return;
  }

  const pool = await getDatabaseOrRespond(res);
  if (!pool) return;
  try {
    const result = await pool.query(
      `INSERT INTO user_offices (
         id, full_name, phone, email, license_number, bio,
         avatar_base64, is_public, facility_name
       )
       VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         full_name = EXCLUDED.full_name,
         phone = EXCLUDED.phone,
         email = EXCLUDED.email,
         license_number = EXCLUDED.license_number,
         bio = EXCLUDED.bio,
         avatar_base64 = EXCLUDED.avatar_base64,
         is_public = EXCLUDED.is_public,
         facility_name = EXCLUDED.facility_name
       RETURNING id, full_name, phone, email, license_number, bio,
         avatar_base64, is_public, facility_name, subscription_active, created_at`,
      [
        fullName.trim(),
        phone.trim(),
        email?.trim() || null,
        licenseNumber?.trim() || null,
        bio?.trim() || null,
        avatarBase64 || null,
        isPublic !== false,
        facilityName?.trim() || null,
      ],
    );
    res.json({
      success: true,
      office: result.rows[0],
      message: 'تم حفظ بيانات المكتب في قاعدة البيانات.',
    });
  } catch (error) {
    console.error('Failed to save office profile:', error.message);
    res.status(500).json({ success: false, message: 'تعذر حفظ الملف الشخصي.' });
  }
});

app.get('/api/office/profile/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    res.status(400).json({ success: false, message: 'معرّف المكتب غير صالح.' });
    return;
  }
  const pool = await getDatabaseOrRespond(res);
  if (!pool) return;
  try {
    const result = await pool.query(
      `SELECT id, full_name, bio, avatar_base64, facility_name, created_at
       FROM user_offices WHERE id = $1 AND is_public = TRUE
         AND subscription_active = TRUE`,
      [id],
    );
    if (result.rowCount === 0) {
      res.status(404).json({ success: false, message: 'الملف غير متاح للعامة.' });
      return;
    }
    res.json({ success: true, office: result.rows[0] });
  } catch (error) {
    console.error('Failed to load public office profile:', error.message);
    res.status(500).json({ success: false, message: 'تعذر تحميل ملف المكتب.' });
  }
});

app.get('/api/office/network', async (req, res) => {
  const pool = await getDatabaseOrRespond(res);
  if (!pool) return;
  try {
    const result = await pool.query(
      `SELECT id, full_name, bio, facility_name, avatar_base64
       FROM user_offices
       WHERE is_public = TRUE AND subscription_active = TRUE
       ORDER BY created_at DESC`,
    );
    res.json({ success: true, members: result.rows });
  } catch (error) {
    console.error('Failed to load office network:', error.message);
    res.status(500).json({ success: false, message: 'تعذر تحميل شبكة المكاتب.' });
  }
});

app.get('/api/ledger', async (req, res) => {
  const pool = await getDatabaseOrRespond(res);
  if (!pool) return;
  try {
    const result = await pool.query(
      `SELECT id, item_type, status, title, asset_category, deal_type, price,
         area, location, owner_type, seriousness_score, recommendations_count,
         interactions_count, is_featured, created_at
       FROM office_ledger
       ORDER BY is_featured DESC, created_at DESC`,
    );
    res.json({ success: true, items: result.rows });
  } catch (error) {
    console.error('Failed to load office ledger:', error.message);
    res.status(500).json({ success: false, message: 'تعذر تحميل الدفتر.' });
  }
});

app.post('/api/ledger/add', async (req, res) => {
  const {
    itemType,
    status,
    title,
    assetCategory,
    dealType,
    price,
    area,
    location,
    ownerType,
    contactPhone,
    seriousnessScore,
    isFeatured,
    coBrokerName,
    commissionSplit,
    loiAttached,
    buyCommitment,
    brokersCommitment,
  } = req.body ?? {};
  const optionalTextIsValid = (value, maxLength) =>
    value === undefined ||
    value === null ||
    value === '' ||
    (typeof value === 'string' && value.length <= maxLength);
  const validNumber = (value) =>
    value === undefined ||
    value === null ||
    value === '' ||
    (Number.isFinite(Number(value)) && Number(value) >= 0);
  if (
    !isNonEmptyString(title, 200) ||
    !isNonEmptyString(itemType, 50) ||
    (status !== undefined && !isNonEmptyString(status, 50)) ||
    !optionalTextIsValid(assetCategory, 100) ||
    (dealType !== undefined &&
      !['بيع', 'شراء', 'إيجار', 'استثمار'].includes(dealType)) ||
    !optionalTextIsValid(location, 150) ||
    !optionalTextIsValid(ownerType, 100) ||
    !optionalTextIsValid(coBrokerName, 100) ||
    !optionalTextIsValid(commissionSplit, 100) ||
    !optionalTextIsValid(brokersCommitment, 12000) ||
    !validNumber(price) ||
    Number(price || 0) > 9999999999999.99 ||
    !validNumber(area) ||
    Number(area || 0) > 9999999999999.99 ||
    (contactPhone !== undefined &&
      (typeof contactPhone !== 'string' ||
        contactPhone.length > 50 ||
        !/^\+?[\d\s()-]{7,50}$/.test(contactPhone) ||
        (contactPhone.match(/\d/g)?.length ?? 0) < 7)) ||
    (seriousnessScore !== undefined &&
      (!Number.isInteger(seriousnessScore) ||
        seriousnessScore < 1 ||
        seriousnessScore > 10)) ||
    (isFeatured !== undefined && typeof isFeatured !== 'boolean') ||
    (loiAttached !== undefined && typeof loiAttached !== 'boolean') ||
    (buyCommitment !== undefined && typeof buyCommitment !== 'boolean')
  ) {
    res.status(400).json({
      success: false,
      message: 'بيانات السجل غير صالحة.',
    });
    return;
  }

  const pool = await getDatabaseOrRespond(res);
  if (!pool) return;
  try {
    const result = await pool.query(
      `INSERT INTO office_ledger (
        item_type, status, title, asset_category, deal_type, price, area,
        location, owner_type, contact_phone, seriousness_score, is_featured, co_broker_name, commission_split,
         loi_attached, buy_commitment, brokers_commitment
       )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       RETURNING *`,
      [
        itemType.trim(),
        status?.trim() || 'جديد',
        title.trim(),
        assetCategory?.trim() || null,
        dealType?.trim() || null,
        price || 0,
        area || 0,
        location?.trim() || null,
        ownerType?.trim() || null,
        contactPhone?.trim() || null,
        seriousnessScore ?? 5,
        isFeatured === true,
        coBrokerName?.trim() || null,
        commissionSplit?.trim() || null,
        loiAttached === true,
        buyCommitment === true,
        brokersCommitment?.trim() || null,
      ],
    );
    res.status(201).json({
      success: true,
      item: result.rows[0],
      message: `تم حفظ (${title.trim()}) في الدفتر السحابي.`,
    });
  } catch (error) {
    console.error('Failed to save office ledger item:', error.message);
    res.status(500).json({ success: false, message: 'تعذر حفظ السجل.' });
  }
});

app.post('/api/ledger/feature', async (req, res) => {
  const id = Number(req.body?.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    res.status(400).json({ success: false, message: 'معرّف الإعلان غير صالح.' });
    return;
  }
  const pool = await getDatabaseOrRespond(res);
  if (!pool) return;
  try {
    const result = await pool.query(
      'UPDATE office_ledger SET is_featured = TRUE WHERE id = $1 RETURNING id',
      [id],
    );
    if (result.rowCount === 0) {
      res.status(404).json({ success: false, message: 'الإعلان غير موجود.' });
      return;
    }
    res.json({ success: true, message: 'تم تمييز الإعلان في السوق.' });
  } catch (error) {
    console.error('Failed to feature office ledger item:', error.message);
    res.status(500).json({ success: false, message: 'تعذر تمييز الإعلان.' });
  }
});

app.get('/api/appointments', async (req, res) => {
  const pool = await getDatabaseOrRespond(res);
  if (!pool) return;
  try {
    const result = await pool.query(
      'SELECT * FROM appointments ORDER BY appointment_date, appointment_time',
    );
    res.json({ success: true, appointments: result.rows });
  } catch (error) {
    console.error('Failed to load appointments:', error.message);
    res.status(500).json({ success: false, message: 'تعذر تحميل المواعيد.' });
  }
});

app.post('/api/appointments/add', async (req, res) => {
  const { clientName, topic, appointmentDate, appointmentTime } = req.body ?? {};
  if (
    !isNonEmptyString(clientName, 150) ||
    !isNonEmptyString(topic, 200) ||
    !isNonEmptyString(appointmentDate, 50) ||
    !isNonEmptyString(appointmentTime, 50)
  ) {
    res.status(400).json({ success: false, message: 'بيانات الموعد غير مكتملة.' });
    return;
  }
  const pool = await getDatabaseOrRespond(res);
  if (!pool) return;
  try {
    const result = await pool.query(
      `INSERT INTO appointments (client_name, topic, appointment_date, appointment_time)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [clientName.trim(), topic.trim(), appointmentDate.trim(), appointmentTime.trim()],
    );
    res.status(201).json({
      success: true,
      appointment: result.rows[0],
      message: 'تم حفظ الموعد في قاعدة البيانات.',
    });
  } catch (error) {
    console.error('Failed to save appointment:', error.message);
    res.status(500).json({ success: false, message: 'تعذر حفظ الموعد.' });
  }
});

app.get('/api/partners', (req, res) => {
  res.json({
    success: true,
    partners: [
      { category: 'جهات تنظيمية', name: 'الهيئة العامة للعقار (REGA)', phone: '199011', url: 'https://rega.gov.sa', desc: 'خدمات وتنظيم القطاع العقاري' },
      { category: 'صناديق سيادية وعقارية', name: 'صندوق الاستثمارات العامة (PIF)', phone: '', url: 'https://pif.gov.sa', desc: 'المشاريع الكبرى والتطوير الاستثماري' },
      { category: 'صناديق سيادية وعقارية', name: 'صندوق التنمية العقارية (REDF)', phone: '199088', url: 'https://redf.gov.sa', desc: 'برامج الدعم السكني والتمويل العقاري' },
      { category: 'صناديق سيادية وعقارية', name: 'الشركة الوطنية للإسكان (NHC) وروشن', phone: '', url: 'https://nhc.sa', desc: 'المشاريع السكنية والمجتمعات المتكاملة' },
      { category: 'بنوك سعودية', name: 'البنك الأهلي السعودي (SNB)', phone: '920001000', url: 'https://alahli.com', desc: 'التمويل العقاري السكني والتجاري' },
      { category: 'بنوك سعودية', name: 'مصرف الراجحي', phone: '920003344', url: 'https://alrajhibank.com.sa', desc: 'حلول التمويل العقاري والاستثماري' },
      { category: 'بنوك سعودية', name: 'بنك الرياض', phone: '920002470', url: 'https://riyadbank.com', desc: 'تمويل الشركات والمشاريع العقارية' },
      { category: 'بنوك سعودية', name: 'مصرف الإنماء', phone: '8001208000', url: 'https://alinma.com', desc: 'التمويل العقاري' },
      { category: 'بنوك سعودية', name: 'البنك السعودي الأول (SAB)', phone: '920007222', url: 'https://sab.com', desc: 'تمويل المطورين والمحافظ العقارية' },
      { category: 'بنوك سعودية', name: 'بنك البلاد', phone: '920001002', url: 'https://bankalbilad.com', desc: 'برامج التمويل العقاري والرهن' },
      { category: 'بنوك سعودية', name: 'البنك السعودي الفرنسي (BSF)', phone: '8001242121', url: 'https://bsf.sa', desc: 'تمويل الأصول والمشاريع' },
      { category: 'بنوك سعودية', name: 'البنك العربي الوطني (ANB)', phone: '8001244040', url: 'https://anb.com.sa', desc: 'الحلول التمويلية والعقارية' },
      { category: 'بنوك سعودية', name: 'بنك الجزيرة', phone: '8002440404', url: 'https://bankaljazira.com', desc: 'التمويل العقاري للأفراد والشركات' },
    ],
  });
});

app.post('/api/ai/assistant', (req, res) => {
  const { prompt } = req.body ?? {};
  if (!isNonEmptyString(prompt, 1000)) {
    res.status(400).json({ success: false, message: 'اكتب سؤالاً صالحاً للمساعد.' });
    return;
  }
  res.status(503).json({
    success: false,
    code: 'AI_ASSISTANT_NOT_CONFIGURED',
    message: 'المساعد الذكي غير مهيأ على الخادم حالياً؛ لم يتم إرسال السؤال إلى مزود ذكاء اصطناعي.',
  });
});

app.get('/api/platform/info', (req, res) => {
  res.json({
    success: true,
    settings: platformSettings,
  });
});

app.post('/api/admin/update-settings', (req, res) => {
  if (!platformAdminToken) {
    res.status(503).json({
      success: false,
      code: 'PLATFORM_ADMIN_NOT_CONFIGURED',
      message: 'تحديث إعدادات المنصة غير متاح قبل تهيئة PLATFORM_ADMIN_TOKEN على الخادم.',
    });
    return;
  }

  if (!tokensMatch(req.get('x-platform-admin-token'), platformAdminToken)) {
    res.status(403).json({
      success: false,
      message: 'غير مصرح بتعديل إعدادات المنصة.',
    });
    return;
  }

  const { newSettings } = req.body ?? {};
  if (!isValidPlatformSettingsPatch(newSettings)) {
    res.status(400).json({
      success: false,
      message: 'بيانات الإعدادات غير صالحة أو تحتوي حقولاً غير مدعومة.',
    });
    return;
  }

  const nextSettings = { ...platformSettings };
  if (newSettings.bankAccounts !== undefined) {
    nextSettings.bankAccounts = newSettings.bankAccounts.map(
      ({ bankName, accountName, iban }) => ({
        bankName: bankName.trim(),
        accountName: accountName.trim(),
        iban: iban.toUpperCase(),
      }),
    );
  }
  if (newSettings.contactNumbers !== undefined) {
    nextSettings.contactNumbers = newSettings.contactNumbers.map(
      ({ title, value }) => ({
        title: title.trim(),
        value: value.trim(),
      }),
    );
  }
  if (newSettings.socialMedia !== undefined) {
    nextSettings.socialMedia = {
      ...platformSettings.socialMedia,
      ...newSettings.socialMedia,
    };
  }

  platformSettings = nextSettings;
  res.json({
    success: true,
    message:
      'تم تحديث الإعدادات في ذاكرة الخادم. لن تبقى بعد إعادة تشغيله.',
    currentSettings: platformSettings,
  });
});

app.post('/api/regulatory/mega-connect', (req, res) => {
  const { nationalId, propertyDeedNumber, chosenAction } = req.body ?? {};

  if (
    typeof nationalId !== 'string' ||
    !/^\d{10}$/.test(nationalId) ||
    !isNonEmptyString(propertyDeedNumber, 100) ||
    !Object.hasOwn(assetActionPreviews, chosenAction)
  ) {
    res.status(400).json({
      success: false,
      message: 'أدخل رقم هوية من 10 أرقام ورقم صك وخياراً صالحاً.',
    });
    return;
  }

  res.json({
    success: true,
    previewOnly: true,
    submittedToAuthorities: false,
    deedVerified: false,
    currentAction: chosenAction,
    actionLabel: assetActionPreviews[chosenAction],
    systemStatus: 'Not_Submitted',
    deedStatus: 'لم يتم التحقق من الصك',
    message: `هذه معاينة لمسار ${assetActionPreviews[chosenAction]} فقط. لم يُرسل الطلب إلى أي جهة ولم تُتحقق الهوية أو الصك.`,
    disclaimer:
      'لا يوجد تكامل حكومي أو مالي مهيأ في هذا الخادم. لا تُرسل بيانات حقيقية قبل تهيئة التكامل الرسمي الآمن.',
  });
});

app.post('/api/subscriptions/subscribe', (req, res) => {
  const { userId, planType } = req.body ?? {};
  const plan =
    typeof planType === 'string' && Object.hasOwn(subscriptionPlans, planType)
      ? subscriptionPlans[planType]
      : null;

  if (!isNonEmptyString(userId, 120) || !plan) {
    res.status(400).json({
      success: false,
      message: 'أدخل معرّف مستخدم صالحاً واختر باقة موجودة.',
    });
    return;
  }

  res.json({
    success: true,
    userId,
    plan: { type: planType, ...plan },
    subscriptionActivated: false,
    paymentRequired: true,
    message: 'تم استلام طلب الباقة. يلزم ربط بوابة دفع لتفعيل الاشتراك.',
  });
});

app.get('/api/deals', async (req, res) => {
  const pool = await getDatabaseOrRespond(res);
  if (!pool) return;
  try {
    const result = await pool.query(
      'SELECT * FROM deals ORDER BY created_at DESC',
    );
    res.json({ success: true, deals: result.rows });
  } catch (error) {
    console.error('Failed to load deals:', error.message);
    res.status(500).json({ success: false, message: 'تعذر تحميل الصفقات.' });
  }
});

app.post('/api/deals/create-flexible', async (req, res) => {
  const deal = createFlexibleDeal(req.body ?? {});
  if (!deal) {
    res.status(400).json({
      success: false,
      message:
        'تحقق من نوع الأصل والسعر ومبلغ السعي الاختياري وقائمة السعاة (بحد أقصى 50).',
    });
    return;
  }
  const pool = await getDatabaseOrRespond(res);
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO deals (
         deal_id, asset_type, price, saei_amount, platform_share,
         broker_shares, unassigned_broker_share, status, payouts_executed
       )
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)`,
      [
        deal.dealId,
        deal.assetType,
        deal.price,
        deal.saeiAmount,
        deal.platformShare,
        JSON.stringify(deal.brokerShares),
        deal.unassignedBrokerShare,
        deal.status,
        deal.payoutsExecuted,
      ],
    );
  } catch (error) {
    console.error('Failed to persist flexible deal:', error.message);
    res.status(500).json({
      success: false,
      message: 'تعذر حفظ الصفقة؛ لم يتم إنشاء سجل مؤقت.',
    });
    return;
  }
  customDeals.set(dealId, deal);

  res.status(201).json({
    success: true,
    ...deal,
    message:
      'تم حفظ سجل الصفقة في قاعدة البيانات. لا يتم قفل أصل فعلي أو تنفيذ أي دفعة.',
  });
});

app.post('/api/compliance/validate-deal-flexible', (req, res) => {
  const {
    assetType,
    price,
    userNationality,
    propertyLocation,
    licenseNumber,
    chamberOfCommerceStampAttached,
    isSuperDeveloperBypass,
    customSaeiAmount,
    draftAcknowledged,
  } = req.body ?? {};
  const rule =
    typeof assetType === 'string' && Object.hasOwn(assetRegulatoryRules, assetType)
      ? assetRegulatoryRules[assetType]
      : null;
  const priceHalalas = parseAmountInHalalas(price);
  const hasCustomSaei = customSaeiAmount !== undefined && customSaeiAmount !== null;
  const customSaeiHalalas = hasCustomSaei
    ? parseAmountInHalalas(customSaeiAmount)
    : null;

  if (
    !rule ||
    priceHalalas === null ||
    (hasCustomSaei && customSaeiHalalas === null) ||
    (isSuperDeveloperBypass !== undefined &&
      typeof isSuperDeveloperBypass !== 'boolean') ||
    (licenseNumber !== undefined && typeof licenseNumber !== 'string') ||
    (userNationality !== undefined && typeof userNationality !== 'string') ||
    (propertyLocation !== undefined && typeof propertyLocation !== 'string') ||
    (chamberOfCommerceStampAttached !== undefined &&
      typeof chamberOfCommerceStampAttached !== 'boolean') ||
    (draftAcknowledged !== undefined &&
      typeof draftAcknowledged !== 'boolean')
  ) {
    res.status(400).json({
      success: false,
      message: 'تحقق من نوع الأصل والسعر وأنواع بيانات التحقق الاختيارية.',
    });
    return;
  }

  const saeiHalalas =
    customSaeiHalalas ?? Math.round(priceHalalas * rule.saeiRate);
  if (saeiHalalas <= 0) {
    res.status(400).json({
      success: false,
      message: 'يجب أن يكون مبلغ السعي موجباً.',
    });
    return;
  }

  const isBypassRequested = isSuperDeveloperBypass === true;
  if (
    isBypassRequested &&
    !tokensMatch(req.get('x-compliance-bypass-token'), complianceBypassToken)
  ) {
    res.status(403).json({
      success: false,
      code: 'COMPLIANCE_BYPASS_UNAUTHORIZED',
      message: 'التمرير الاستثنائي يتطلب صلاحية خادم مخولة.',
    });
    return;
  }

  if (!isBypassRequested) {
    if (
      (assetType === 'realestate_sale' || assetType === 'realestate_rent') &&
      (!isNonEmptyString(userNationality, 80) ||
        !isNonEmptyString(propertyLocation, 120))
    ) {
      res.status(400).json({
        success: false,
        message: 'الجنسية وموقع العقار مطلوبان للتحقق الأولي من هذه الصفقة.',
      });
      return;
    }

    if (
      userNationality !== 'Saudi' &&
      (assetType === 'realestate_sale' || assetType === 'realestate_rent') &&
      (propertyLocation === 'Makkah' || propertyLocation === 'Madinah')
    ) {
      res.status(403).json({
        success: false,
        code: 'REQUIRES_LEGAL_REVIEW',
        message:
          'لا يمكن متابعة الطلب وفق قاعدة التطبيق الحالية؛ يلزم التحقق من القواعد النظامية المنطبقة قبل اتخاذ القرار.',
      });
      return;
    }

    if (!isNonEmptyString(licenseNumber, 300)) {
      res.status(422).json({
        success: false,
        code: 'LICENSE_INFORMATION_REQUIRED',
        requiredLicense: rule.requiredLicense,
        message: 'أدخل بيانات الترخيص المطلوبة للمتابعة إلى المراجعة اليدوية.',
      });
      return;
    }

    if (
      (assetType === 'gold' || assetType === 'scrap') &&
      chamberOfCommerceStampAttached !== true
    ) {
      res.status(422).json({
        success: false,
        code: 'CHAMBER_STAMP_INFORMATION_REQUIRED',
        message: 'أرفق بيانات ختم الغرفة التجارية للمتابعة إلى المراجعة اليدوية.',
      });
      return;
    }
  }

  const dealId = `DEAL_COMPLIANCE_${crypto.randomUUID()}`;
  const deal = {
    dealId,
    assetType,
    price: formatHalalas(priceHalalas),
    calculatedSaei: formatHalalas(saeiHalalas),
    isBypassed: isBypassRequested,
    complianceStatus: 'pending_manual_verification',
    complianceVerified: false,
    manualReviewRequired: true,
    draftAcknowledged: draftAcknowledged === true,
    licenseInformationProvided: isNonEmptyString(licenseNumber, 300),
    chamberStampInformationProvided: chamberOfCommerceStampAttached === true,
  };
  customDeals.set(dealId, deal);

  if (isBypassRequested) {
    console.warn(
      `Compliance exception requested by authorized operator: dealId=${dealId}, assetType=${assetType}`,
    );
  }

  res.status(202).json({
    success: true,
    ...deal,
    message:
      'تم تسجيل الطلب للمراجعة اليدوية. لم يتم التحقق من صحة المستندات أو الأختام، ولم تُقفل الصفقة أو تُفتح قنوات التواصل.',
  });
});

app.post('/api/compliance/validate-deal', (req, res) => {
  const {
    assetType,
    price,
    userNationality,
    propertyLocation,
    licenseNumber,
    securityClearanceAttached,
  } = req.body ?? {};
  const rule =
    typeof assetType === 'string' && Object.hasOwn(assetComplianceRules, assetType)
      ? assetComplianceRules[assetType]
      : null;
  const priceHalalas = parseAmountInHalalas(price);

  if (
    !rule ||
    priceHalalas === null ||
    (userNationality !== undefined && typeof userNationality !== 'string') ||
    (propertyLocation !== undefined && typeof propertyLocation !== 'string') ||
    (licenseNumber !== undefined && typeof licenseNumber !== 'string') ||
    (securityClearanceAttached !== undefined &&
      typeof securityClearanceAttached !== 'boolean')
  ) {
    res.status(400).json({
      success: false,
      message: 'تحقق من نوع الأصل والسعر وأنواع بيانات الامتثال الاختيارية.',
    });
    return;
  }

  const isRealEstate =
    assetType === 'realestate_sale' || assetType === 'realestate_rent';
  if (
    isRealEstate &&
    (!isNonEmptyString(userNationality, 80) ||
      !isNonEmptyString(propertyLocation, 120))
  ) {
    res.status(400).json({
      success: false,
      message: 'الجنسية وموقع العقار مطلوبان لتسجيل طلب المراجعة.',
    });
    return;
  }

  if (
    isRealEstate &&
    userNationality !== 'Saudi' &&
    (propertyLocation === 'Makkah' || propertyLocation === 'Madinah')
  ) {
    res.status(403).json({
      success: false,
      actionRequired: 'MANUAL_LEGAL_REVIEW',
      code: 'REQUIRES_LEGAL_REVIEW',
      message:
        'تعذر متابعة الطلب آلياً؛ تحقّق من الأنظمة والاستثناءات المنطبقة مع مختص قبل اتخاذ أي إجراء.',
      disclaimer: complianceReviewNotice,
    });
    return;
  }

  if (!isNonEmptyString(licenseNumber, 300)) {
    res.status(422).json({
      success: false,
      code: 'LICENSE_INFORMATION_REQUIRED',
      requiredLicense: rule.requiredLicense,
      message: 'أدخل بيانات الترخيص المطلوبة لتسجيل الطلب للمراجعة اليدوية.',
    });
    return;
  }

  if (assetType === 'scrap' && securityClearanceAttached !== true) {
    res.status(422).json({
      success: false,
      code: 'SECURITY_CLEARANCE_INFORMATION_REQUIRED',
      message: 'أدخل بيانات تصريح عدم الممانعة الأمني للمتابعة إلى المراجعة اليدوية.',
    });
    return;
  }

  const saeiHalalas = Math.round(priceHalalas * rule.saeiRate);
  if (saeiHalalas <= 0) {
    res.status(400).json({
      success: false,
      message: 'مبلغ الصفقة منخفض جداً لحساب سعي موجب.',
    });
    return;
  }

  const dealId = `DEAL_REVIEW_${crypto.randomUUID()}`;
  const review = {
    dealId,
    assetType,
    price: formatHalalas(priceHalalas),
    calculatedSaei: formatHalalas(saeiHalalas),
    complianceStatus: 'pending_manual_review',
    complianceVerified: false,
    draftStatus: 'not_generated',
    contractSigned: false,
    communicationUnlocked: false,
    licenseInformationProvided: true,
    securityClearanceInformationProvided: securityClearanceAttached === true,
  };
  customDeals.set(dealId, review);

  res.status(202).json({
    success: true,
    ...review,
    message:
      'تم تسجيل طلب المراجعة وحساب السعي التقديري فقط. لم يتم اعتماد المستندات أو إنشاء مسودة عقد أو قفل الصفقة.',
    disclaimer: complianceReviewNotice,
  });
});

app.post('/api/meetings/google-meet', (req, res) => {
  res.status(501).json({
    success: false,
    code: 'GOOGLE_MEET_NOT_CONFIGURED',
    message: 'إنشاء اجتماع Meet يتطلب ربط Google API وحساباً مخولاً.',
  });
});

app.post('/api/ai/monitor-chat', (req, res) => {
  const { chatId, messageText, senderId } = req.body ?? {};
  if (
    !isNonEmptyString(chatId, 120) ||
    !isNonEmptyString(senderId, 120) ||
    !isNonEmptyString(messageText, 4000)
  ) {
    res.status(400).json({
      success: false,
      message: 'chatId وsenderId وmessageText مطلوبة ويجب أن تكون ضمن الحدود المسموحة.',
    });
    return;
  }

  const normalizedMessage = messageText.toLocaleLowerCase('ar');
  const matchedWords = suspiciousWords.filter((word) =>
    normalizedMessage.includes(word),
  );
  const suspicious = matchedWords.length > 0;
  let notifiedDevelopers = 0;

  if (suspicious) {
    const developerRoom = io.sockets.adapter.rooms.get('super_developer');
    notifiedDevelopers = developerRoom?.size ?? 0;
    if (notifiedDevelopers > 0) {
      io.to('super_developer').emit('super_developer_alert', {
        chatId,
        senderId,
        alertMessage: 'تم رصد رسالة تحتاج إلى مراجعة وفق سياسة المنصة.',
      });
    }

    console.warn(
      `Chat policy alert: chatId=${JSON.stringify(chatId)}, senderId=${JSON.stringify(senderId)}`,
    );
  }

  res.json({
    success: true,
    analysed: true,
    suspicious,
    notifiedDevelopers,
    analysisMethod: 'keyword-match',
  });
});

app.post('/api/finance/split-saei-payment', (req, res) => {
  const { dealId, totalSaeiPaid } = req.body ?? {};
  const totalHalalas = parseAmountInHalalas(totalSaeiPaid);

  if (!isNonEmptyString(dealId, 120) || totalHalalas === null) {
    res.status(400).json({
      success: false,
      message: 'أدخل dealId صالحاً ومبلغ سعي موجباً بحد أقصى منزلتين عشريتين.',
    });
    return;
  }

  const distribution = calculateDistribution(totalHalalas);
  res.json({
    success: true,
    dealId,
    totalSaeiPaid: formatHalalas(totalHalalas),
    ...distribution,
    payoutsExecuted: false,
    message:
      'تم حساب التوزيع التقديري فقط. لم تُنفّذ أي حوالة بنكية ولم يتم فك قفل أي عقد.',
  });
});

app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html' }));

app.use((error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const status =
    error.type === 'entity.too.large'
      ? 413
      : error.message === 'Origin is not allowed by CORS'
        ? 403
        : error.status || 500;
  if (status >= 500) {
    console.error('Request failed:', error.message);
  }

  res.status(status).json({
    success: false,
    message: status === 413 ? 'حجم الطلب أكبر من الحد المسموح.' : 'تعذر معالجة الطلب.',
  });
});

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  server.listen(port, () => {
    console.log(`API server listening on port ${port}`);
    if (!developerAlertToken) {
      console.warn(
        'DEVELOPER_ALERT_TOKEN is not configured; developer Socket.IO alerts are disabled.',
      );
    }
    if (!complianceBypassToken) {
      console.warn(
        'COMPLIANCE_BYPASS_TOKEN is not configured; compliance bypass requests are disabled.',
      );
    }
  });
}

module.exports = { app, calculateDistribution, createFlexibleDeal, io, server };
