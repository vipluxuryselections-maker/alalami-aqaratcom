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
const suspiciousWords = [
  'رقمي',
  'جوالي',
  'تواصل بره',
  'حسابي الخاص',
  'بدون مكتب',
  'تحويل مباشر',
];

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
});

app.get('/api/health', (req, res) => {
  res.json({ success: true, service: 'aqarat-app-api' });
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
  });
}

module.exports = { app, calculateDistribution, io, server };
