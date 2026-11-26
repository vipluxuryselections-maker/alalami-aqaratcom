'use strict';

const crypto = require('node:crypto');
const { promisify } = require('node:util');
const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const http = require('node:http');
const path = require('node:path');
const { Pool } = require('pg');
const { Server } = require('socket.io');

const app = express();
app.set('trust proxy', 1);
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
const superAdminToken = process.env.SUPER_ADMIN_TOKEN;
const scrypt = promisify(crypto.scrypt);
const staffSessions = new Map();
const staffSessionLifetimeMs = 8 * 60 * 60 * 1000;
const liveRooms = new Map();
const liveRoomLifetimeMs = 2 * 60 * 60 * 1000;
const staffPermissionNames = Object.freeze([
  'reviewListings',
  'manageRequests',
  'crm',
  'recruitment',
  'manageProducts',
  'manageStories',
]);
const productCategories = Object.freeze([
  'الملابس',
  'الإكسسوارات',
  'الأجهزة',
  'الألعاب',
  'الأحذية',
  'العطورات',
  'الشموع',
  'أخرى',
]);
const productShippingOptions = Object.freeze([
  'توصيل فوري',
  'شحن سريع لجميع مناطق المملكة',
  'استلام من الفرع',
]);
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
      latitude NUMERIC(10, 7),
      longitude NUMERIC(10, 7),
      media_upload_token_hash VARCHAR(64),
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
    CREATE TABLE IF NOT EXISTS career_applications (
      id BIGSERIAL PRIMARY KEY,
      full_name VARCHAR(150) NOT NULL,
      email VARCHAR(254) NOT NULL,
      phone VARCHAR(50) NOT NULL,
      role VARCHAR(40) NOT NULL,
      note TEXT NOT NULL,
      privacy_consent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS job_applications (
      id BIGSERIAL PRIMARY KEY,
      full_name VARCHAR(150) NOT NULL,
      email VARCHAR(254) NOT NULL,
      phone VARCHAR(50) NOT NULL,
      role VARCHAR(40) NOT NULL,
      note TEXT NOT NULL,
      resume_name VARCHAR(160),
      resume_content BYTEA,
      privacy_consent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS staff_users (
      id BIGSERIAL PRIMARY KEY,
      username VARCHAR(60) NOT NULL UNIQUE,
      full_name VARCHAR(150) NOT NULL,
      password_hash TEXT NOT NULL,
      permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS customer_followups (
      id BIGSERIAL PRIMARY KEY,
      full_name VARCHAR(150) NOT NULL,
      phone VARCHAR(50) NOT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'جديد',
      note TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS listing_media (
      id BIGSERIAL PRIMARY KEY,
      listing_id INT NOT NULL REFERENCES office_ledger(id) ON DELETE CASCADE,
      file_name VARCHAR(160) NOT NULL,
      content_type VARCHAR(80) NOT NULL,
      is_panorama BOOLEAN NOT NULL DEFAULT FALSE,
      content BYTEA NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS vip_stories (
      id VARCHAR(64) PRIMARY KEY,
      share_token VARCHAR(64) NOT NULL UNIQUE,
      creator_name VARCHAR(100) NOT NULL,
      caption VARCHAR(500) NOT NULL DEFAULT '',
      content_type VARCHAR(80) NOT NULL,
      file_name VARCHAR(160) NOT NULL,
      content BYTEA NOT NULL,
      is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS vip_stories_active_idx
      ON vip_stories (expires_at, is_pinned, created_at DESC);
    CREATE TABLE IF NOT EXISTS affiliate_products (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(160) NOT NULL,
      category VARCHAR(60) NOT NULL,
      custom_category VARCHAR(60),
      description VARCHAR(2000) NOT NULL DEFAULT '',
      price NUMERIC(12, 2) NOT NULL CHECK (price > 0),
      commission_type VARCHAR(10) NOT NULL CHECK (commission_type IN ('percent', 'amount')),
      commission_value NUMERIC(10, 2) NOT NULL CHECK (commission_value > 0),
      sizes TEXT[] NOT NULL DEFAULT '{}',
      colors TEXT[] NOT NULL DEFAULT '{}',
      stock_quantity INT NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
      shipping_options TEXT[] NOT NULL,
      seller_name VARCHAR(100) NOT NULL,
      seller_phone VARCHAR(50) NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS affiliate_products_active_idx
      ON affiliate_products (is_active, created_at DESC);
    CREATE TABLE IF NOT EXISTS affiliate_product_media (
      id BIGSERIAL PRIMARY KEY,
      product_id BIGINT NOT NULL REFERENCES affiliate_products(id) ON DELETE CASCADE,
      file_name VARCHAR(160) NOT NULL,
      content_type VARCHAR(80) NOT NULL,
      content BYTEA NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
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
    ALTER TABLE job_applications
      ADD COLUMN IF NOT EXISTS resume_name VARCHAR(160),
      ADD COLUMN IF NOT EXISTS resume_content BYTEA
  `);
  await databasePool.query(`
    ALTER TABLE office_ledger
      ADD COLUMN IF NOT EXISTS location VARCHAR(150),
      ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7),
      ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7),
      ADD COLUMN IF NOT EXISTS media_upload_token_hash VARCHAR(64),
      ADD COLUMN IF NOT EXISTS owner_type VARCHAR(100)
  `);
  await databasePool.query(
    `DELETE FROM vip_stories
     WHERE is_pinned = FALSE AND expires_at < CURRENT_TIMESTAMP - INTERVAL '7 days'`,
  );
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
        connectSrc: ["'self'", 'https://api.open-meteo.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'", 'blob:'],
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
app.use('/api/listing-media', express.json({ limit: '18mb', strict: true }));
app.use('/api/stories', express.json({ limit: '8mb', strict: true }));
app.use('/api/staff/products', express.json({ limit: '18mb', strict: true }));
app.use('/api/careers/apply', express.json({ limit: '3mb', strict: true }));
app.use(express.json({ limit: '16kb', strict: true }));
app.use(
  '/api',
  rateLimit({
    windowMs: 60 * 1000,
    limit: process.env.NODE_ENV === 'test' ? 1000 : 60,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

const productMediaTypes = Object.freeze({
  'image/jpeg': (content) =>
    content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff,
  'image/png': (content) =>
    content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  'image/webp': (content) =>
    content.toString('ascii', 0, 4) === 'RIFF' &&
    content.toString('ascii', 8, 12) === 'WEBP',
});

function parseImageUploads(files) {
  if (!Array.isArray(files) || files.length > 5) return null;
  const prepared = [];
  let totalBytes = 0;
  for (const file of files) {
    if (
      file === null ||
      typeof file !== 'object' ||
      Object.keys(file).some((key) => !['name', 'contentType', 'data'].includes(key)) ||
      !isNonEmptyString(file.name, 160) ||
      !Object.hasOwn(productMediaTypes, file.contentType) ||
      typeof file.data !== 'string' ||
      file.data.length > 4 * 1024 * 1024 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        file.data,
      )
    ) {
      return null;
    }

    const content = Buffer.from(file.data, 'base64');
    totalBytes += content.length;
    if (
      content.length === 0 ||
      content.length > 3 * 1024 * 1024 ||
      totalBytes > 12 * 1024 * 1024 ||
      !productMediaTypes[file.contentType](content)
    ) {
      return null;
    }
    prepared.push({
      fileName: path
        .basename(file.name.replace(/\\/g, '/'))
        .replace(/[\u0000-\u001f]/g, '_'),
      contentType: file.contentType,
      content,
    });
  }
  return prepared;
}

function isValidStringList(value, maxLength, maxItems = 20) {
  return (
    Array.isArray(value) &&
    value.length <= maxItems &&
    value.every((item) => isNonEmptyString(item, maxLength))
  );
}

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

function isValidStaffPermissions(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).every(
      (permission) =>
        staffPermissionNames.includes(permission) &&
        typeof value[permission] === 'boolean',
    )
  );
}

function requireSuperAdmin(req, res, next) {
  if (!superAdminToken || Buffer.byteLength(superAdminToken) < 32) {
    res.status(503).json({
      success: false,
      code: 'SUPER_ADMIN_NOT_CONFIGURED',
      message: 'إدارة الموظفين غير مفعلة؛ اضبط SUPER_ADMIN_TOKEN عشوائياً وبطول 32 بايت على الأقل.',
    });
    return;
  }
  if (!tokensMatch(req.get('x-super-admin-token'), superAdminToken)) {
    res.status(401).json({
      success: false,
      code: 'SUPER_ADMIN_UNAUTHORIZED',
      message: 'رمز المالك الأعلى غير صالح.',
    });
    return;
  }
  next();
}

function requireStaffPermission(permission) {
  return (req, res, next) => {
    const bearerToken = req.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]+)$/)?.[1];
    if (!bearerToken) {
      res.status(401).json({
        success: false,
        code: 'STAFF_AUTH_REQUIRED',
        message: 'سجّل الدخول بحساب موظف مفوض.',
      });
      return;
    }

    const tokenHash = crypto.createHash('sha256').update(bearerToken).digest('hex');
    const session = staffSessions.get(tokenHash);
    if (!session || session.expiresAt <= Date.now()) {
      staffSessions.delete(tokenHash);
      res.status(401).json({
        success: false,
        code: 'STAFF_SESSION_EXPIRED',
        message: 'انتهت الجلسة؛ سجّل الدخول مجدداً.',
      });
      return;
    }
    if (session.permissions[permission] !== true) {
      res.status(403).json({
        success: false,
        code: 'STAFF_PERMISSION_REQUIRED',
        message: 'لا يملك هذا الحساب صلاحية الوصول إلى هذه البيانات.',
      });
      return;
    }

    req.staffUser = session;
    next();
  };
}

io.use((socket, next) => {
  if (tokensMatch(socket.handshake.auth?.developerToken, developerAlertToken)) {
    socket.data.isDeveloper = true;
    next();
    return;
  }

  const liveRoomId = socket.handshake.auth?.liveRoomId;
  const liveRoom = liveRooms.get(liveRoomId);
  if (
    typeof liveRoomId !== 'string' ||
    !/^[a-f0-9]{64}$/.test(liveRoomId) ||
    !liveRoom ||
    liveRoom.expiresAt <= Date.now()
  ) {
    next(new Error('Live room authentication failed'));
    return;
  }
  socket.data.liveRoomId = liveRoomId;
  next();
});

io.on('connection', (socket) => {
  if (socket.data.isDeveloper) socket.join('super_developer');
  if (socket.data.liveRoomId) {
    const room = `live_room_${socket.data.liveRoomId}`;
    const existingPeers = [...(io.sockets.adapter.rooms.get(room) || [])];
    socket.join(room);
    socket.emit('live_peers', existingPeers);
    socket.to(room).emit('live_peer_joined', { socketId: socket.id });
  }

  socket.on('start_realtime_stream', (data) => {
    const propertyId = data?.propertyId;
    if (
      !isNonEmptyString(propertyId, 120) ||
      (socket.data.liveRoomId && propertyId !== socket.data.liveRoomId) ||
      (!socket.data.liveRoomId && !socket.data.isDeveloper)
    ) {
      socket.emit('realtime_error', {
        event: 'start_realtime_stream',
        message: 'معرّف غرفة البث أو صلاحية الانضمام غير صالحة.',
      });
      return;
    }

    socket.join(`live_room_${propertyId}`);
    socket.emit('live_stream_joined', { propertyId });
  });

  socket.on('send_live_chat_message', (data) => {
    const { propertyId, senderName, messageText } = data ?? {};
    const liveRoom = socket.data.liveRoomId
      ? liveRooms.get(socket.data.liveRoomId)
      : null;
    if (
      !isNonEmptyString(propertyId, 120) ||
      !isNonEmptyString(senderName, 120) ||
      !isNonEmptyString(messageText, 1000) ||
      (socket.data.liveRoomId && propertyId !== socket.data.liveRoomId) ||
      (!socket.data.liveRoomId && !socket.data.isDeveloper) ||
      (socket.data.liveRoomId &&
        (!liveRoom || liveRoom.expiresAt <= Date.now()))
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

  socket.on('live_signal', (data) => {
    const liveRoomId = socket.data.liveRoomId;
    const liveRoom = liveRooms.get(liveRoomId);
    const targetId = data?.targetId;
    const signal = data?.signal;
    const target = typeof targetId === 'string' ? io.sockets.sockets.get(targetId) : null;
    const validDescription =
      signal?.type &&
      ['offer', 'answer'].includes(signal.type) &&
      typeof signal.sdp === 'string' &&
      signal.sdp.length <= 64000;
    const validCandidate =
      typeof signal?.candidate === 'string' &&
      signal.candidate.length <= 2048 &&
      (signal.sdpMid === null || typeof signal.sdpMid === 'string') &&
      (signal.sdpMLineIndex === null || Number.isInteger(signal.sdpMLineIndex));
    if (
      !liveRoomId ||
      !liveRoom ||
      liveRoom.expiresAt <= Date.now() ||
      !target ||
      target.data.liveRoomId !== liveRoomId ||
      (!validDescription && !validCandidate)
    ) {
      socket.emit('realtime_error', {
        event: 'live_signal',
        message: 'إشارة الاتصال غير صالحة أو أن الطرف الآخر ليس في الغرفة.',
      });
      return;
    }

    const forwardedSignal = validDescription
      ? { type: signal.type, sdp: signal.sdp }
      : {
          candidate: signal.candidate,
          sdpMid: signal.sdpMid,
          sdpMLineIndex: signal.sdpMLineIndex,
          usernameFragment: typeof signal.usernameFragment === 'string'
            ? signal.usernameFragment.slice(0, 256)
            : null,
        };
    io.to(targetId).emit('live_signal', {
      from: socket.id,
      signal: forwardedSignal,
    });
  });
});

app.get('/api/health', (req, res) => {
  res.json({ success: true, service: 'aqarat-app-api' });
});

app.post('/api/live/rooms', (req, res) => {
  const now = Date.now();
  for (const [roomId, room] of liveRooms) {
    if (room.expiresAt <= now) {
      clearTimeout(room.expirationTimer);
      io.in(`live_room_${roomId}`).disconnectSockets(true);
      liveRooms.delete(roomId);
    }
  }
  if (liveRooms.size >= 500) {
    res.status(503).json({
      success: false,
      message: 'تعذر إنشاء غرفة بث جديدة حالياً؛ أعد المحاولة لاحقاً.',
    });
    return;
  }

  const roomId = crypto.randomBytes(32).toString('hex');
  const expiresAt = now + liveRoomLifetimeMs;
  const expirationTimer = setTimeout(() => {
    io.in(`live_room_${roomId}`).disconnectSockets(true);
    liveRooms.delete(roomId);
  }, liveRoomLifetimeMs);
  expirationTimer.unref();
  liveRooms.set(roomId, { expiresAt, expirationTimer });
  res.status(201).json({
    success: true,
    roomId,
    expiresAt: new Date(expiresAt).toISOString(),
    message: 'غرفة معاينة مؤقتة؛ تنتهي صلاحية رابطها بعد ساعتين.',
  });
});

app.post('/api/staff/login', async (req, res) => {
  const { username, password } = req.body ?? {};
  if (
    !isNonEmptyString(username, 60) ||
    !/^[a-zA-Z0-9._-]{3,60}$/.test(username) ||
    !isNonEmptyString(password, 128)
  ) {
    res.status(400).json({
      success: false,
      message: 'اسم المستخدم أو كلمة المرور غير صالحة.',
    });
    return;
  }

  const pool = await getDatabaseOrRespond(res);
  if (!pool) return;
  try {
    const result = await pool.query(
      `SELECT id, username, full_name, password_hash, permissions
       FROM staff_users WHERE username = $1 AND is_active = TRUE`,
      [username.trim().toLowerCase()],
    );
    const staffUser = result.rows[0];
    if (!staffUser) {
      res.status(401).json({
        success: false,
        message: 'بيانات تسجيل الدخول غير صحيحة.',
      });
      return;
    }

    const [algorithm, salt, savedHash] = staffUser.password_hash.split('$');
    if (algorithm !== 'scrypt' || !salt || !/^[a-f0-9]{128}$/i.test(savedHash || '')) {
      throw new Error('Stored staff password hash is malformed.');
    }
    const candidateHash = await scrypt(password, salt, 64);
    const expectedHash = Buffer.from(savedHash, 'hex');
    if (
      candidateHash.length !== expectedHash.length ||
      !crypto.timingSafeEqual(candidateHash, expectedHash)
    ) {
      res.status(401).json({
        success: false,
        message: 'بيانات تسجيل الدخول غير صحيحة.',
      });
      return;
    }

    const accessToken = crypto.randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + staffSessionLifetimeMs;
    for (const [hash, session] of staffSessions) {
      if (session.expiresAt <= Date.now()) staffSessions.delete(hash);
    }
    staffSessions.set(
      crypto.createHash('sha256').update(accessToken).digest('hex'),
      {
        staffId: String(staffUser.id),
        username: staffUser.username,
        fullName: staffUser.full_name,
        permissions: staffUser.permissions,
        expiresAt,
      },
    );
    res.json({
      success: true,
      accessToken,
      expiresAt: new Date(expiresAt).toISOString(),
      staff: {
        id: staffUser.id,
        username: staffUser.username,
        fullName: staffUser.full_name,
        permissions: staffUser.permissions,
      },
    });
  } catch (error) {
    console.error('Staff login failed:', error.message);
    res.status(500).json({
      success: false,
      message: 'تعذر التحقق من حساب الموظف.',
    });
  }
});

app.post('/api/staff/logout', (req, res) => {
  const bearerToken = req.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]+)$/)?.[1];
  if (bearerToken) {
    staffSessions.delete(
      crypto.createHash('sha256').update(bearerToken).digest('hex'),
    );
  }
  res.json({ success: true });
});

app.post('/api/admin/staff-users', requireSuperAdmin, async (req, res) => {
  const { username, fullName, password, permissions } = req.body ?? {};
  if (
    !isNonEmptyString(username, 60) ||
    !/^[a-zA-Z0-9._-]{3,60}$/.test(username) ||
    !isNonEmptyString(fullName, 150) ||
    typeof password !== 'string' ||
    password.length < 12 ||
    password.length > 128 ||
    !isValidStaffPermissions(permissions)
  ) {
    res.status(400).json({
      success: false,
      message: 'تحقق من الاسم وكلمة المرور (12 حرفاً على الأقل) والصلاحيات.',
    });
    return;
  }

  const pool = await getDatabaseOrRespond(res);
  if (!pool) return;
  try {
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = await scrypt(password, salt, 64);
    const result = await pool.query(
      `INSERT INTO staff_users (username, full_name, password_hash, permissions)
       VALUES ($1, $2, $3, $4::jsonb)
       RETURNING id, username, full_name, permissions, is_active, created_at`,
      [
        username.trim().toLowerCase(),
        fullName.trim(),
        `scrypt$${salt}$${passwordHash.toString('hex')}`,
        JSON.stringify(permissions),
      ],
    );
    res.status(201).json({ success: true, staff: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      res.status(409).json({
        success: false,
        message: 'اسم المستخدم مستخدم بالفعل.',
      });
      return;
    }
    console.error('Failed to create staff user:', error.message);
    res.status(500).json({ success: false, message: 'تعذر إنشاء حساب الموظف.' });
  }
});

app.get('/api/admin/staff-users', requireSuperAdmin, async (req, res) => {
  const pool = await getDatabaseOrRespond(res);
  if (!pool) return;
  try {
    const result = await pool.query(
      `SELECT id, username, full_name, permissions, is_active, created_at
       FROM staff_users ORDER BY created_at DESC`,
    );
    res.json({ success: true, staff: result.rows });
  } catch (error) {
    console.error('Failed to load staff users:', error.message);
    res.status(500).json({ success: false, message: 'تعذر تحميل حسابات الموظفين.' });
  }
});

app.patch('/api/admin/staff-users/:id', requireSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const patch = req.body ?? {};
  const allowedFields = new Set(['permissions', 'isActive']);
  if (
    !/^\d+$/.test(id) ||
    Object.keys(patch).length === 0 ||
    Object.keys(patch).some((key) => !allowedFields.has(key)) ||
    (patch.permissions !== undefined && !isValidStaffPermissions(patch.permissions)) ||
    (patch.isActive !== undefined && typeof patch.isActive !== 'boolean')
  ) {
    res.status(400).json({ success: false, message: 'تحديث الموظف غير صالح.' });
    return;
  }

  const pool = await getDatabaseOrRespond(res);
  if (!pool) return;
  const updates = [];
  const values = [];
  if (patch.permissions !== undefined) {
    values.push(JSON.stringify(patch.permissions));
    updates.push(`permissions = $${values.length}::jsonb`);
  }
  if (patch.isActive !== undefined) {
    values.push(patch.isActive);
    updates.push(`is_active = $${values.length}`);
  }
  values.push(id);

  try {
    const result = await pool.query(
      `UPDATE staff_users SET ${updates.join(', ')}
       WHERE id = $${values.length}
       RETURNING id, username, full_name, permissions, is_active, created_at`,
      values,
    );
    if (result.rowCount === 0) {
      res.status(404).json({ success: false, message: 'الموظف غير موجود.' });
      return;
    }
    const updated = result.rows[0];
    for (const [tokenHash, session] of staffSessions) {
      if (session.staffId !== String(updated.id)) continue;
      if (!updated.is_active) staffSessions.delete(tokenHash);
      else session.permissions = updated.permissions;
    }
    res.json({ success: true, staff: updated });
  } catch (error) {
    console.error('Failed to update staff user:', error.message);
    res.status(500).json({ success: false, message: 'تعذر تحديث حساب الموظف.' });
  }
});

app.get(
  '/api/staff/job-applications',
  requireStaffPermission('recruitment'),
  async (req, res) => {
    const pool = await getDatabaseOrRespond(res);
    if (!pool) return;
    try {
      const result = await pool.query(
        `SELECT id, full_name, email, phone, role, note, resume_name, created_at
         FROM job_applications ORDER BY created_at DESC LIMIT 200`,
      );
      res.json({ success: true, applications: result.rows });
    } catch (error) {
      console.error('Failed to load job applications:', error.message);
      res.status(500).json({ success: false, message: 'تعذر تحميل طلبات التوظيف.' });
    }
  },
);

app.get(
  '/api/staff/job-applications/:id/resume',
  requireStaffPermission('recruitment'),
  async (req, res) => {
    if (!/^\d+$/.test(req.params.id)) {
      res.status(400).json({ success: false, message: 'معرّف الطلب غير صالح.' });
      return;
    }
    const pool = await getDatabaseOrRespond(res);
    if (!pool) return;
    try {
      const result = await pool.query(
        `SELECT resume_name, resume_content FROM job_applications WHERE id = $1`,
        [req.params.id],
      );
      if (result.rowCount === 0 || !result.rows[0].resume_content) {
        res.status(404).json({ success: false, message: 'السيرة الذاتية غير متاحة.' });
        return;
      }
      const { resume_name: resumeName, resume_content: resumeContent } = result.rows[0];
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${resumeName.replace(/["\\\r\n]/g, '_')}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      });
      res.send(resumeContent);
    } catch (error) {
      console.error('Failed to download applicant resume:', error.message);
      res.status(500).json({ success: false, message: 'تعذر تحميل السيرة الذاتية.' });
    }
  },
);

app.get(
  '/api/staff/requests',
  requireStaffPermission('manageRequests'),
  async (req, res) => {
    const pool = await getDatabaseOrRespond(res);
    if (!pool) return;
    try {
      const result = await pool.query(
        `SELECT id, client_name, topic, appointment_date, appointment_time,
                status, created_at
         FROM appointments ORDER BY created_at DESC LIMIT 200`,
      );
      res.json({ success: true, requests: result.rows });
    } catch (error) {
      console.error('Failed to load requests:', error.message);
      res.status(500).json({ success: false, message: 'تعذر تحميل الطلبات.' });
    }
  },
);

app.get(
  '/api/staff/listings',
  requireStaffPermission('reviewListings'),
  async (req, res) => {
    const pool = await getDatabaseOrRespond(res);
    if (!pool) return;
    try {
      const result = await pool.query(
        `SELECT id, item_type, status, title, asset_category, deal_type, price,
                area, location, owner_type, created_at
         FROM office_ledger ORDER BY created_at DESC LIMIT 200`,
      );
      res.json({ success: true, listings: result.rows });
    } catch (error) {
      console.error('Failed to load listings for review:', error.message);
      res.status(500).json({ success: false, message: 'تعذر تحميل الإعلانات.' });
    }
  },
);

app.patch(
  '/api/staff/listings/:id',
  requireStaffPermission('reviewListings'),
  async (req, res) => {
    const { id } = req.params;
    const { status } = req.body ?? {};
    if (!/^\d+$/.test(id) || !['قيد المراجعة', 'مقبول', 'مرفوض', 'منشور'].includes(status)) {
      res.status(400).json({ success: false, message: 'حالة المراجعة غير صالحة.' });
      return;
    }

    const pool = await getDatabaseOrRespond(res);
    if (!pool) return;
    try {
      const result = await pool.query(
        `UPDATE office_ledger SET status = $1 WHERE id = $2 RETURNING id, status`,
        [status, id],
      );
      if (result.rowCount === 0) {
        res.status(404).json({ success: false, message: 'الإعلان غير موجود.' });
        return;
      }
      res.json({ success: true, listing: result.rows[0] });
    } catch (error) {
      console.error('Failed to update listing review status:', error.message);
      res.status(500).json({ success: false, message: 'تعذر تحديث حالة الإعلان.' });
    }
  },
);

app.get(
  '/api/staff/crm',
  requireStaffPermission('crm'),
  async (req, res) => {
    const pool = await getDatabaseOrRespond(res);
    if (!pool) return;
    try {
      const result = await pool.query(
        `SELECT id, full_name, phone, status, note, created_at
         FROM customer_followups ORDER BY created_at DESC LIMIT 200`,
      );
      res.json({ success: true, customers: result.rows });
    } catch (error) {
      console.error('Failed to load CRM follow-ups:', error.message);
      res.status(500).json({ success: false, message: 'تعذر تحميل متابعة العملاء.' });
    }
  },
);

app.post(
  '/api/staff/crm',
  requireStaffPermission('crm'),
  async (req, res) => {
    const { fullName, phone, status = 'جديد', note, privacyConsent } = req.body ?? {};
    const validPhone =
      typeof phone === 'string' &&
      phone.length <= 50 &&
      /^\+?[\d\s()-]{7,50}$/.test(phone) &&
      (phone.match(/\d/g)?.length ?? 0) >= 7;
    if (
      !isNonEmptyString(fullName, 150) ||
      !validPhone ||
      !['جديد', 'تم التواصل', 'مهتم', 'غير مهتم', 'مغلق'].includes(status) ||
      !isNonEmptyString(note, 2000) ||
      privacyConsent !== true
    ) {
      res.status(400).json({ success: false, message: 'بيانات العميل أو موافقة الخصوصية غير صالحة.' });
      return;
    }

    const pool = await getDatabaseOrRespond(res);
    if (!pool) return;
    try {
      const result = await pool.query(
        `INSERT INTO customer_followups (full_name, phone, status, note)
         VALUES ($1, $2, $3, $4)
         RETURNING id, full_name, phone, status, note, created_at`,
        [fullName.trim(), phone.trim(), status, note.trim()],
      );
      res.status(201).json({ success: true, customer: result.rows[0] });
    } catch (error) {
      console.error('Failed to save CRM follow-up:', error.message);
      res.status(500).json({ success: false, message: 'تعذر حفظ متابعة العميل.' });
    }
  },
);

app.get('/api/stories', async (req, res) => {
  const pool = await getDatabaseOrRespond(res);
  if (!pool) return;
  try {
    const result = await pool.query(
      `SELECT id, share_token AS "shareToken", creator_name AS "creatorName",
              caption, content_type AS "contentType", file_name AS "fileName",
              is_pinned AS "isPinned", expires_at AS "expiresAt",
              created_at AS "createdAt"
       FROM vip_stories
       WHERE is_pinned = TRUE OR expires_at > CURRENT_TIMESTAMP
       ORDER BY is_pinned DESC, created_at DESC
       LIMIT 300`,
    );
    res.json({ success: true, stories: result.rows });
  } catch (error) {
    console.error('Failed to load VIP stories:', error.message);
    res.status(500).json({ success: false, message: 'تعذر تحميل القصص.' });
  }
});

app.post(
  '/api/stories',
  rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'وصلت إلى حد نشر القصص لهذا الوقت.' },
  }),
  async (req, res) => {
    const { creatorName, caption = '', media } = req.body ?? {};
    const storyTypes = {
      'image/jpeg': (content) =>
        content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff,
      'image/png': (content) =>
        content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
      'image/webp': (content) =>
        content.toString('ascii', 0, 4) === 'RIFF' &&
        content.toString('ascii', 8, 12) === 'WEBP',
      'video/mp4': (content) => content.toString('ascii', 4, 8) === 'ftyp',
      'video/webm': (content) =>
        content.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])),
    };
    if (
      !isNonEmptyString(creatorName, 100) ||
      typeof caption !== 'string' ||
      caption.length > 500 ||
      media === null ||
      typeof media !== 'object' ||
      Array.isArray(media) ||
      Object.keys(media).some((key) => !['name', 'contentType', 'data'].includes(key)) ||
      !isNonEmptyString(media.name, 160) ||
      !Object.hasOwn(storyTypes, media.contentType) ||
      typeof media.data !== 'string' ||
      media.data.length > 7 * 1024 * 1024 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        media.data,
      )
    ) {
      res.status(400).json({
        success: false,
        message: 'بيانات القصة غير صالحة؛ ارفع صورة أو فيديو ضمن الحدود المسموحة.',
      });
      return;
    }

    const content = Buffer.from(media.data, 'base64');
    if (
      content.length === 0 ||
      content.length > 5 * 1024 * 1024 ||
      !storyTypes[media.contentType](content)
    ) {
      res.status(400).json({
        success: false,
        message: 'محتوى الصورة أو الفيديو غير صالح أو أكبر من 5 ميغابايت.',
      });
      return;
    }

    const pool = await getDatabaseOrRespond(res);
    if (!pool) return;
    const storyId = crypto.randomUUID();
    const shareToken = crypto.randomBytes(32).toString('hex');
    const fileName = path
      .basename(media.name.replace(/\\/g, '/'))
      .replace(/[\u0000-\u001f]/g, '_');
    try {
      const result = await pool.query(
        `INSERT INTO vip_stories
           (id, share_token, creator_name, caption, content_type, file_name, content, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP + INTERVAL '24 hours')
         RETURNING id, share_token AS "shareToken", creator_name AS "creatorName",
                   caption, content_type AS "contentType", file_name AS "fileName",
                   is_pinned AS "isPinned", expires_at AS "expiresAt",
                   created_at AS "createdAt"`,
        [
          storyId,
          shareToken,
          creatorName.trim(),
          caption.trim(),
          media.contentType,
          fileName,
          content,
        ],
      );
      res.status(201).json({
        success: true,
        story: result.rows[0],
        shareUrl: `/stories/${shareToken}`,
        message: 'نُشرت القصة وستنتهي تلقائياً بعد 24 ساعة.',
      });
    } catch (error) {
      console.error('Failed to publish VIP story:', error.message);
      res.status(500).json({ success: false, message: 'تعذر نشر القصة.' });
    }
  },
);

app.get('/api/stories/:shareToken', async (req, res) => {
  if (!/^[a-f0-9]{64}$/.test(req.params.shareToken)) {
    res.status(404).json({ success: false, message: 'القصة غير موجودة.' });
    return;
  }
  const pool = await getDatabaseOrRespond(res);
  if (!pool) return;
  try {
    const result = await pool.query(
      `SELECT id, share_token AS "shareToken", creator_name AS "creatorName",
              caption, content_type AS "contentType", file_name AS "fileName",
              is_pinned AS "isPinned", expires_at AS "expiresAt",
              created_at AS "createdAt"
       FROM vip_stories
       WHERE share_token = $1 AND (is_pinned = TRUE OR expires_at > CURRENT_TIMESTAMP)`,
      [req.params.shareToken],
    );
    if (result.rowCount === 0) {
      res.status(404).json({ success: false, message: 'انتهت القصة أو لم تعد متاحة.' });
      return;
    }
    res.json({ success: true, story: result.rows[0] });
  } catch (error) {
    console.error('Failed to load VIP story:', error.message);
    res.status(500).json({ success: false, message: 'تعذر تحميل القصة.' });
  }
});

app.get('/api/stories/:shareToken/media', async (req, res) => {
  if (!/^[a-f0-9]{64}$/.test(req.params.shareToken)) {
    res.status(404).json({ success: false, message: 'القصة غير موجودة.' });
    return;
  }
  const pool = await getDatabaseOrRespond(res);
  if (!pool) return;
  try {
    const result = await pool.query(
      `SELECT content_type, content FROM vip_stories
       WHERE share_token = $1 AND (is_pinned = TRUE OR expires_at > CURRENT_TIMESTAMP)`,
      [req.params.shareToken],
    );
    if (result.rowCount === 0) {
      res.status(404).json({ success: false, message: 'انتهت القصة أو لم تعد متاحة.' });
      return;
    }
    res.set({
      'Content-Type': result.rows[0].content_type,
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=60',
    });
    res.send(result.rows[0].content);
  } catch (error) {
    console.error('Failed to load VIP story media:', error.message);
    res.status(500).json({ success: false, message: 'تعذر تحميل وسائط القصة.' });
  }
});

app.patch(
  '/api/staff/stories/:id/pin',
  requireStaffPermission('manageStories'),
  async (req, res) => {
    const { pinned } = req.body ?? {};
    if (
      !/^[0-9a-f-]{36}$/i.test(req.params.id) ||
      typeof pinned !== 'boolean'
    ) {
      res.status(400).json({ success: false, message: 'تحديث تثبيت القصة غير صالح.' });
      return;
    }
    const pool = await getDatabaseOrRespond(res);
    if (!pool) return;
    try {
      const result = await pool.query(
        `UPDATE vip_stories SET is_pinned = $1 WHERE id = $2
         RETURNING id, is_pinned AS "isPinned"`,
        [pinned, req.params.id],
      );
      if (result.rowCount === 0) {
        res.status(404).json({ success: false, message: 'القصة غير موجودة.' });
        return;
      }
      res.json({ success: true, story: result.rows[0] });
    } catch (error) {
      console.error('Failed to pin VIP story:', error.message);
      res.status(500).json({ success: false, message: 'تعذر تثبيت القصة.' });
    }
  },
);

app.get(
  '/api/staff/stories',
  requireStaffPermission('manageStories'),
  async (req, res) => {
    const pool = await getDatabaseOrRespond(res);
    if (!pool) return;
    try {
      const result = await pool.query(
        `SELECT id, creator_name AS "creatorName", caption, is_pinned AS "isPinned",
                expires_at AS "expiresAt", created_at AS "createdAt"
         FROM vip_stories ORDER BY is_pinned DESC, created_at DESC LIMIT 300`,
      );
      res.json({ success: true, stories: result.rows });
    } catch (error) {
      console.error('Failed to load stories for staff:', error.message);
      res.status(500).json({ success: false, message: 'تعذر تحميل القصص للإدارة.' });
    }
  },
);

app.get('/api/products', async (req, res) => {
  const pool = await getDatabaseOrRespond(res);
  if (!pool) return;
  try {
    const result = await pool.query(
      `SELECT product.id, product.name, product.category,
              product.custom_category AS "customCategory", product.description,
              product.price, product.commission_type AS "commissionType",
              product.commission_value AS "commissionValue", product.sizes,
              product.colors, product.stock_quantity AS "stockQuantity",
              product.shipping_options AS "shippingOptions",
              product.seller_name AS "sellerName", product.seller_phone AS "sellerPhone",
              product.created_at AS "createdAt",
              COALESCE((
                SELECT json_agg(json_build_object(
                  'id', image.id, 'fileName', image.file_name,
                  'contentType', image.content_type
                ) ORDER BY image.id)
                FROM affiliate_product_media image WHERE image.product_id = product.id
              ), '[]'::json) AS media
       FROM affiliate_products product
       WHERE product.is_active = TRUE AND product.stock_quantity > 0
       ORDER BY product.created_at DESC LIMIT 200`,
    );
    res.json({ success: true, products: result.rows });
  } catch (error) {
    console.error('Failed to load affiliate products:', error.message);
    res.status(500).json({ success: false, message: 'تعذر تحميل المنتجات.' });
  }
});

app.get(
  '/api/staff/products',
  requireStaffPermission('manageProducts'),
  async (req, res) => {
    const pool = await getDatabaseOrRespond(res);
    if (!pool) return;
    try {
      const result = await pool.query(
        `SELECT id, name, category, is_active AS "isActive",
                stock_quantity AS "stockQuantity", created_at AS "createdAt"
         FROM affiliate_products ORDER BY created_at DESC LIMIT 200`,
      );
      res.json({ success: true, products: result.rows });
    } catch (error) {
      console.error('Failed to load products for staff:', error.message);
      res.status(500).json({ success: false, message: 'تعذر تحميل المنتجات للإدارة.' });
    }
  },
);

app.get('/api/products/:productId/media/:mediaId', async (req, res) => {
  if (!/^\d+$/.test(req.params.productId) || !/^\d+$/.test(req.params.mediaId)) {
    res.status(400).json({ success: false, message: 'معرّف الصورة غير صالح.' });
    return;
  }
  const pool = await getDatabaseOrRespond(res);
  if (!pool) return;
  try {
    const result = await pool.query(
      `SELECT image.content_type, image.file_name, image.content
       FROM affiliate_product_media image
       JOIN affiliate_products product ON product.id = image.product_id
       WHERE image.id = $1 AND product.id = $2 AND product.is_active = TRUE`,
      [req.params.mediaId, req.params.productId],
    );
    if (result.rowCount === 0) {
      res.status(404).json({ success: false, message: 'الصورة غير متاحة.' });
      return;
    }
    res.set({
      'Content-Type': result.rows[0].content_type,
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=3600',
    });
    res.send(result.rows[0].content);
  } catch (error) {
    console.error('Failed to load product image:', error.message);
    res.status(500).json({ success: false, message: 'تعذر تحميل الصورة.' });
  }
});

app.post(
  '/api/staff/products',
  requireStaffPermission('manageProducts'),
  async (req, res) => {
    const {
      name,
      category,
      customCategory,
      description = '',
      price,
      commissionType,
      commissionValue,
      sizes = [],
      colors = [],
      stockQuantity,
      shippingOptions,
      sellerName,
      sellerPhone,
      images = [],
    } = req.body ?? {};
    const priceValue = Number(price);
    const commissionAmount = Number(commissionValue);
    const validPhone =
      typeof sellerPhone === 'string' &&
      sellerPhone.length <= 50 &&
      /^\+?[\d\s()-]{7,50}$/.test(sellerPhone) &&
      (sellerPhone.match(/\d/g)?.length ?? 0) >= 7;
    const preparedImages = parseImageUploads(images);
    if (
      !isNonEmptyString(name, 160) ||
      !productCategories.includes(category) ||
      (category === 'أخرى' && !isNonEmptyString(customCategory, 60)) ||
      (category !== 'أخرى' && customCategory !== undefined && customCategory !== '') ||
      typeof description !== 'string' ||
      description.length > 2000 ||
      !Number.isFinite(priceValue) ||
      priceValue <= 0 ||
      priceValue > 999999999 ||
      !['percent', 'amount'].includes(commissionType) ||
      !Number.isFinite(commissionAmount) ||
      commissionAmount <= 0 ||
      (commissionType === 'percent' && commissionAmount > 100) ||
      (commissionType === 'amount' && commissionAmount > priceValue) ||
      !isValidStringList(sizes, 30) ||
      !isValidStringList(colors, 30) ||
      !Number.isSafeInteger(stockQuantity) ||
      stockQuantity < 0 ||
      preparedImages?.length === 0 ||
      !isValidStringList(shippingOptions, 60, productShippingOptions.length) ||
      shippingOptions.length === 0 ||
      shippingOptions.some((option) => !productShippingOptions.includes(option)) ||
      !isNonEmptyString(sellerName, 100) ||
      !validPhone ||
      preparedImages === null
    ) {
      res.status(400).json({
        success: false,
        message: 'تحقق من بيانات المنتج والعمولة والمخزون والشحن والصور.',
      });
      return;
    }

    const pool = await getDatabaseOrRespond(res);
    if (!pool) return;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const productResult = await client.query(
        `INSERT INTO affiliate_products
           (name, category, custom_category, description, price,
            commission_type, commission_value, sizes, colors, stock_quantity,
            shipping_options, seller_name, seller_phone)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING id`,
        [
          name.trim(),
          category,
          category === 'أخرى' ? customCategory.trim() : null,
          description.trim(),
          priceValue,
          commissionType,
          commissionAmount,
          sizes.map((value) => value.trim()),
          colors.map((value) => value.trim()),
          stockQuantity,
          shippingOptions,
          sellerName.trim(),
          sellerPhone.trim(),
        ],
      );
      const productId = productResult.rows[0].id;
      for (const image of preparedImages) {
        await client.query(
          `INSERT INTO affiliate_product_media (product_id, file_name, content_type, content)
           VALUES ($1, $2, $3, $4)`,
          [productId, image.fileName, image.contentType, image.content],
        );
      }
      await client.query('COMMIT');
      res.status(201).json({
        success: true,
        product: { id: productId },
        message: 'تم نشر المنتج والصور في قاعدة البيانات.',
      });
    } catch (error) {
      await client.query('ROLLBACK').catch((rollbackError) => {
        console.error('Failed to roll back product creation:', rollbackError.message);
      });
      console.error('Failed to create affiliate product:', error.message);
      res.status(500).json({ success: false, message: 'تعذر حفظ المنتج.' });
    } finally {
      client.release();
    }
  },
);

app.patch(
  '/api/staff/products/:id',
  requireStaffPermission('manageProducts'),
  async (req, res) => {
    const { id } = req.params;
    const { isActive, stockQuantity } = req.body ?? {};
    if (
      !/^\d+$/.test(id) ||
      Object.keys(req.body ?? {}).length === 0 ||
      Object.keys(req.body ?? {}).some((key) => !['isActive', 'stockQuantity'].includes(key)) ||
      (isActive !== undefined && typeof isActive !== 'boolean') ||
      (stockQuantity !== undefined &&
        (!Number.isSafeInteger(stockQuantity) || stockQuantity < 0))
    ) {
      res.status(400).json({ success: false, message: 'تحديث المنتج غير صالح.' });
      return;
    }
    const pool = await getDatabaseOrRespond(res);
    if (!pool) return;
    const changes = [];
    const values = [];
    if (isActive !== undefined) {
      values.push(isActive);
      changes.push(`is_active = $${values.length}`);
    }
    if (stockQuantity !== undefined) {
      values.push(stockQuantity);
      changes.push(`stock_quantity = $${values.length}`);
    }
    values.push(id);
    try {
      const result = await pool.query(
        `UPDATE affiliate_products SET ${changes.join(', ')}
         WHERE id = $${values.length} RETURNING id, is_active AS "isActive",
           stock_quantity AS "stockQuantity"`,
        values,
      );
      if (result.rowCount === 0) {
        res.status(404).json({ success: false, message: 'المنتج غير موجود.' });
        return;
      }
      res.json({ success: true, product: result.rows[0] });
    } catch (error) {
      console.error('Failed to update affiliate product:', error.message);
      res.status(500).json({ success: false, message: 'تعذر تحديث المنتج.' });
    }
  },
);

app.post('/api/careers/apply', async (req, res) => {
  const { fullName, email, phone, role, note, privacyConsent, resume } = req.body ?? {};
  let resumeName = null;
  let resumeContent = null;
  let resumeIsValid = true;
  if (resume !== undefined) {
    resumeIsValid =
      resume !== null &&
      typeof resume === 'object' &&
      !Array.isArray(resume) &&
      Object.keys(resume).every((key) => ['name', 'contentType', 'data'].includes(key)) &&
      resume.contentType === 'application/pdf' &&
      isNonEmptyString(resume.name, 160) &&
      /\.pdf$/i.test(resume.name) &&
      typeof resume.data === 'string' &&
      resume.data.length <= 2800000 &&
      /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        resume.data,
      );
    if (resumeIsValid) {
      resumeContent = Buffer.from(resume.data, 'base64');
      resumeIsValid =
        resumeContent.length > 0 &&
        resumeContent.length <= 2 * 1024 * 1024 &&
        resumeContent.toString('ascii', 0, 5) === '%PDF-';
      resumeName = path
        .basename(resume.name.replace(/\\/g, '/'))
        .replace(/[\u0000-\u001f]/g, '_');
    }
  }
  const validPhone =
    typeof phone === 'string' &&
    phone.length <= 50 &&
    /^\+?[\d\s()-]{7,50}$/.test(phone) &&
    (phone.match(/\d/g)?.length ?? 0) >= 7;
  if (
    !isNonEmptyString(fullName, 150) ||
    !isNonEmptyString(email, 254) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !validPhone ||
    !['technology', 'real-estate', 'operations', 'other'].includes(role) ||
    !isNonEmptyString(note, 2000) ||
    !resumeIsValid ||
    privacyConsent !== true
  ) {
    res.status(400).json({
      success: false,
      message: 'بيانات طلب التوظيف أو موافقة الخصوصية غير صالحة.',
    });
    return;
  }

  const pool = await getDatabaseOrRespond(res);
  if (!pool) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO career_applications (full_name, email, phone, role, note)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, created_at`,
      [fullName.trim(), email.trim(), phone.trim(), role, note.trim()],
    );
    await client.query(
      `INSERT INTO job_applications
         (full_name, email, phone, role, note, resume_name, resume_content)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        fullName.trim(),
        email.trim(),
        phone.trim(),
        role,
        note.trim(),
        resumeName,
        resumeContent,
      ],
    );
    await client.query('COMMIT');
    res.status(201).json({
      success: true,
      application: result.rows[0],
      resumeReceived: resumeName !== null,
      emailNotificationSent: false,
      message: 'تم حفظ طلب التوظيف. إشعار البريد غير مهيأ حالياً.',
    });
  } catch (error) {
    await client.query('ROLLBACK').catch((rollbackError) => {
      console.error('Failed to roll back career application:', rollbackError.message);
    });
    console.error('Failed to save career application:', error.message);
    res.status(500).json({
      success: false,
      message: 'تعذر حفظ طلب التوظيف.',
    });
  } finally {
    client.release();
  }
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
         area, location, latitude, longitude, owner_type, seriousness_score, recommendations_count,
         interactions_count, is_featured, created_at,
         COALESCE((
           SELECT json_agg(json_build_object(
             'id', media.id,
             'contentType', media.content_type,
             'fileName', media.file_name,
             'isPanorama', media.is_panorama
           ) ORDER BY media.id)
           FROM listing_media media WHERE media.listing_id = office_ledger.id
         ), '[]'::json) AS media
       FROM office_ledger
       ORDER BY is_featured DESC, created_at DESC`,
    );
    res.json({ success: true, items: result.rows });
  } catch (error) {
    console.error('Failed to load office ledger:', error.message);
    res.status(500).json({ success: false, message: 'تعذر تحميل الدفتر.' });
  }
});

app.get('/api/listing-media/:id', async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) {
    res.status(400).json({ success: false, message: 'معرّف الملف غير صالح.' });
    return;
  }
  const pool = await getDatabaseOrRespond(res);
  if (!pool) return;
  try {
    const result = await pool.query(
      'SELECT content_type, file_name, content FROM listing_media WHERE id = $1',
      [req.params.id],
    );
    if (result.rowCount === 0) {
      res.status(404).json({ success: false, message: 'الملف غير موجود.' });
      return;
    }
    const media = result.rows[0];
    res.set({
      'Content-Type': media.content_type,
      'Content-Disposition':
        media.content_type === 'application/pdf'
          ? `attachment; filename="${media.file_name.replace(/["\\\r\n]/g, '_')}"`
          : 'inline',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=3600',
    });
    res.send(media.content);
  } catch (error) {
    console.error('Failed to load listing media:', error.message);
    res.status(500).json({ success: false, message: 'تعذر تحميل الوسيط.' });
  }
});

app.post('/api/listing-media', async (req, res) => {
  const { listingId, files, isPanorama = false } = req.body ?? {};
  const uploadToken = req.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]+)$/)?.[1];
  if (!uploadToken) {
    res.status(401).json({
      success: false,
      message: 'رمز رفع الوسائط المرتبط بالإعلان مطلوب.',
    });
    return;
  }
  const allowedTypes = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'application/pdf',
  ]);
  if (
    !Number.isSafeInteger(Number(listingId)) ||
    Number(listingId) < 1 ||
    !Array.isArray(files) ||
    files.length < 1 ||
    files.length > 5 ||
    typeof isPanorama !== 'boolean'
  ) {
    res.status(400).json({ success: false, message: 'بيانات رفع الوسائط غير صالحة.' });
    return;
  }

  const preparedFiles = [];
  let totalBytes = 0;
  for (const file of files) {
    if (
      file === null ||
      typeof file !== 'object' ||
      Object.keys(file).some((key) => !['name', 'contentType', 'data'].includes(key)) ||
      !isNonEmptyString(file.name, 160) ||
      !allowedTypes.has(file.contentType) ||
      typeof file.data !== 'string' ||
      file.data.length > 4 * 1024 * 1024 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.data)
    ) {
      res.status(400).json({
        success: false,
        message: 'الملفات المرفوعة يجب أن تكون صوراً أو فيديو أو PDF ضمن الحد المسموح.',
      });
      return;
    }

    const content = Buffer.from(file.data, 'base64');
    totalBytes += content.length;
    if (content.length === 0 || content.length > 3 * 1024 * 1024 || totalBytes > 12 * 1024 * 1024) {
      res.status(413).json({
        success: false,
        message: 'الحد هو 3 ميغابايت للملف و12 ميغابايت إجمالاً.',
      });
      return;
    }
    const header = content.subarray(0, 12);
    const signatures = {
      'image/jpeg': header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff,
      'image/png': header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
      'image/webp': header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WEBP',
      'image/gif': ['GIF87a', 'GIF89a'].includes(header.toString('ascii', 0, 6)),
      'video/mp4': header.toString('ascii', 4, 8) === 'ftyp',
      'video/quicktime': header.toString('ascii', 4, 8) === 'ftyp',
      'video/webm': header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])),
      'application/pdf': header.toString('ascii', 0, 5) === '%PDF-',
    };
    if (!signatures[file.contentType]) {
      res.status(400).json({
        success: false,
        message: `محتوى الملف ${file.name} لا يطابق نوعه المعلن.`,
      });
      return;
    }
    const safeName = path.basename(file.name.replace(/\\/g, '/')).replace(/[\u0000-\u001f]/g, '_');
    preparedFiles.push({
      name: safeName,
      contentType: file.contentType,
      content,
      isPanorama: isPanorama && file.contentType.startsWith('image/'),
    });
  }

  const pool = await getDatabaseOrRespond(res);
  if (!pool) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tokenHash = crypto.createHash('sha256').update(uploadToken).digest('hex');
    const listing = await client.query(
      `SELECT id FROM office_ledger
       WHERE id = $1 AND media_upload_token_hash = $2
       FOR UPDATE`,
      [Number(listingId), tokenHash],
    );
    if (listing.rowCount === 0) {
      await client.query('ROLLBACK');
      res.status(403).json({
        success: false,
        message: 'رمز الرفع غير صالح أو استُخدم مسبقاً.',
      });
      return;
    }
    const media = [];
    for (const file of preparedFiles) {
      const result = await client.query(
        `INSERT INTO listing_media (listing_id, file_name, content_type, is_panorama, content)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, file_name AS "fileName", content_type AS "contentType",
                   is_panorama AS "isPanorama"`,
        [Number(listingId), file.name, file.contentType, file.isPanorama, file.content],
      );
      media.push(result.rows[0]);
    }
    await client.query(
      'UPDATE office_ledger SET media_upload_token_hash = NULL WHERE id = $1',
      [Number(listingId)],
    );
    await client.query('COMMIT');
    res.status(201).json({ success: true, media });
  } catch (error) {
    await client.query('ROLLBACK').catch((rollbackError) => {
      console.error('Failed to roll back listing media upload:', rollbackError.message);
    });
    console.error('Failed to save listing media:', error.message);
    res.status(error.code === '23503' ? 404 : 500).json({
      success: false,
      message: error.code === '23503' ? 'الإعلان المرتبط بالوسائط غير موجود.' : 'تعذر حفظ الوسائط.',
    });
  } finally {
    client.release();
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
    latitude,
    longitude,
    ownerType,
    contactPhone,
    contactConsent,
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
  const coordinatesAreAbsent =
    (latitude === undefined || latitude === null || latitude === '') &&
    (longitude === undefined || longitude === null || longitude === '');
  const coordinatesAreValid =
    coordinatesAreAbsent ||
    (Number.isFinite(Number(latitude)) &&
      Number(latitude) >= -90 &&
      Number(latitude) <= 90 &&
      Number.isFinite(Number(longitude)) &&
      Number(longitude) >= -180 &&
      Number(longitude) <= 180);
  if (
    !isNonEmptyString(title, 200) ||
    !isNonEmptyString(itemType, 50) ||
    (status !== undefined && !isNonEmptyString(status, 50)) ||
    !optionalTextIsValid(assetCategory, 100) ||
    (dealType !== undefined &&
      !['بيع', 'شراء', 'إيجار', 'استثمار'].includes(dealType)) ||
    !optionalTextIsValid(location, 150) ||
    !coordinatesAreValid ||
    ((latitude === undefined || latitude === null || latitude === '') !==
      (longitude === undefined || longitude === null || longitude === '')) ||
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
    (contactPhone !== undefined && contactConsent !== true) ||
    (contactConsent !== undefined && typeof contactConsent !== 'boolean') ||
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
  const mediaUploadToken = crypto.randomBytes(32).toString('base64url');
  const mediaUploadTokenHash = crypto
    .createHash('sha256')
    .update(mediaUploadToken)
    .digest('hex');
  try {
    const result = await pool.query(
      `INSERT INTO office_ledger (
        item_type, status, title, asset_category, deal_type, price, area,
        location, latitude, longitude, media_upload_token_hash, owner_type, contact_phone, seriousness_score, is_featured, co_broker_name, commission_split,
         loi_attached, buy_commitment, brokers_commitment
       )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
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
        coordinatesAreAbsent ? null : latitude,
        coordinatesAreAbsent ? null : longitude,
        mediaUploadTokenHash,
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
    const { media_upload_token_hash, ...savedItem } = result.rows[0];
    res.status(201).json({
      success: true,
      item: savedItem,
      mediaUploadToken,
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

app.get('/careers', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/stories/:shareToken', (req, res) => {
  if (!/^[a-f0-9]{64}$/.test(req.params.shareToken)) {
    res.status(404).send('Story not found.');
    return;
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
    if (!superAdminToken || Buffer.byteLength(superAdminToken) < 32) {
      console.warn(
        'SUPER_ADMIN_TOKEN is missing or too short; owner staff management is disabled.',
      );
    }
  });
}

module.exports = { app, calculateDistribution, createFlexibleDeal, io, server };
