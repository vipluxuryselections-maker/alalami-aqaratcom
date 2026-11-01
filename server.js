'use strict';

const crypto = require('node:crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const http = require('node:http');
const path = require('node:path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS ||
    'http://localhost:5000,http://localhost:8080,http://127.0.0.1:5000,http://127.0.0.1:8080')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);
const developerAlertToken = process.env.DEVELOPER_ALERT_TOKEN;
const complianceBypassToken = process.env.COMPLIANCE_BYPASS_TOKEN;
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
const customDeals = new Map();

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
        styleSrc: ["'self'", "'unsafe-inline'"],
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

app.post('/api/deals/create-flexible', (req, res) => {
  const { assetType, price, brokerIds, customSaeiAmount } = req.body ?? {};
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
    res.status(400).json({
      success: false,
      message:
        'تحقق من نوع الأصل والسعر ومبلغ السعي الاختياري وقائمة السعاة (بحد أقصى 50).',
    });
    return;
  }

  const saeiHalalas =
    customSaeiHalalas ?? Math.round(priceHalalas * defaultSaeiRates[assetType]);
  if (saeiHalalas <= 0) {
    res.status(400).json({
      success: false,
      message: 'يجب أن يكون مبلغ السعي موجباً.',
    });
    return;
  }

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
  const dealId = `DEAL_${crypto.randomUUID()}`;
  const deal = {
    dealId,
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
  customDeals.set(dealId, deal);

  res.status(201).json({
    success: true,
    ...deal,
    message:
      'تم إنشاء معاينة للصفقة. لا يتم قفل أصل فعلي أو تنفيذ أي دفعة قبل ربط الخدمات اللازمة.',
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
      typeof chamberOfCommerceStampAttached !== 'boolean')
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

module.exports = { app, calculateDistribution, io, server };
