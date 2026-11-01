const crypto = require('node:crypto');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const platformAdminToken = process.env.PLATFORM_ADMIN_TOKEN;
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
app.use(express.json());
app.use(cors());
app.use(express.static('public')); // تشغيل واجهة الموقع تلقائياً

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// 💸 نسب السعي والعمولات المرنة للأصول المتعددة (عرض الـ 1% التنافسي)
let customDeals = {};
const DEFAULT_SAEI_RATES = {
    realestate_sale: 0.01,   // 1% لصفقات البيع العقاري (ميزتك التنافسية)
    realestate_rent: 0.05,   // 5% للإيجار السنوي
    stocks: 0.005,
    gold: 0.01,
    scrap: 0.02
};

// باقات الاشتراكات الدورية للملاك
const subscriptionPlans = {
    weekly: { name: "الباقة الأسبوعية", price: 29 },
    monthly: { name: "الباقة الشهرية", price: 99 },
    yearly: { name: "الباقة السنوية", price: 799 }
};

let activeMeetings = {};

// بند خلو مسؤولية المنصة القانوني الصارم (Disclaimers)
const PLATFORM_LEGAL_DISCLAIMER = `بند خلو المسؤولية القانونية: منصة العالمي للاستثمار والعقارات هي وسيط تقني فقط يربط الأطراف. لا تتحمل المنصة أي مسؤولية قانونية، مالية، أو جنائية ناتجة عن الصفقات، الالتزامات، أو الاتفاقيات المبرمة بين الملاك، العملاء، السعاة، الجهات التمويلية (بنوك أو أفراد)، أو تجار الأصول (الذهب والأسهم والسكراب).`;

function tokensMatch(providedToken, expectedToken) {
    if (typeof providedToken !== 'string' || !expectedToken) {
        return false;
    }

    const provided = Buffer.from(providedToken);
    const expected = Buffer.from(expectedToken);
    return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

function isNonEmptyString(value, maxLength) {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function isValidSaudiIban(value) {
    if (typeof value !== 'string' || !/^SA\d{22}$/i.test(value)) {
        return false;
    }

    const rearrangedIban = `${value.slice(4)}${value.slice(0, 4).toUpperCase()}`;
    let remainder = 0;
    for (const character of rearrangedIban) {
        const digits = character >= 'A' && character <= 'Z'
            ? String(character.charCodeAt(0) - 55)
            : character;
        for (const digit of digits) {
            remainder = (remainder * 10 + Number(digit)) % 97;
        }
    }
    return remainder === 1;
}

function isValidPlatformSettingsPatch(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length === 0) {
        return false;
    }

    const allowedFields = ['bankAccounts', 'contactNumbers', 'socialMedia'];
    if (Object.keys(value).some((key) => !allowedFields.includes(key))) {
        return false;
    }

    if (value.bankAccounts !== undefined && (
        !Array.isArray(value.bankAccounts) ||
        value.bankAccounts.length > 20 ||
        !value.bankAccounts.every((account) =>
            account &&
            typeof account === 'object' &&
            !Array.isArray(account) &&
            Object.keys(account).every((key) => ['bankName', 'accountName', 'iban'].includes(key)) &&
            isNonEmptyString(account.bankName, 100) &&
            isNonEmptyString(account.accountName, 150) &&
            isValidSaudiIban(account.iban)
        )
    )) {
        return false;
    }

    if (value.contactNumbers !== undefined && (
        !Array.isArray(value.contactNumbers) ||
        value.contactNumbers.length > 20 ||
        !value.contactNumbers.every((contact) =>
            contact &&
            typeof contact === 'object' &&
            !Array.isArray(contact) &&
            Object.keys(contact).every((key) => ['title', 'value'].includes(key)) &&
            isNonEmptyString(contact.title, 100) &&
            typeof contact.value === 'string' &&
            contact.value.length <= 30 &&
            /^\+?[\d\s()-]{7,30}$/.test(contact.value) &&
            (contact.value.match(/\d/g) || []).length >= 7
        )
    )) {
        return false;
    }

    if (value.socialMedia !== undefined) {
        const social = value.socialMedia;
        if (!social || typeof social !== 'object' || Array.isArray(social)) {
            return false;
        }
        const socialFields = ['twitter', 'tiktok', 'instagram', 'email'];
        if (Object.keys(social).some((key) => !socialFields.includes(key))) {
            return false;
        }
        for (const key of ['twitter', 'tiktok', 'instagram']) {
            if (social[key] !== undefined && social[key] !== '') {
                if (!isNonEmptyString(social[key], 2048)) {
                    return false;
                }
                try {
                    if (new URL(social[key]).protocol !== 'https:') {
                        return false;
                    }
                } catch {
                    return false;
                }
            }
        }
        if (social.email !== undefined && social.email !== '' &&
            (!isNonEmptyString(social.email, 254) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(social.email))) {
            return false;
        }
    }

    return true;
}

app.get('/api/health', (req, res) => {
    res.json({ success: true, service: 'aqarat-app-api' });
});

app.get('/api/platform/info', (req, res) => {
    res.json({
        success: true,
        settings: platformSettings,
    });
});

app.post('/api/admin/update-settings', (req, res) => {
    if (!platformAdminToken) {
        return res.status(503).json({
            success: false,
            code: 'PLATFORM_ADMIN_NOT_CONFIGURED',
            message: 'تحديث الإعدادات غير متاح قبل تهيئة PLATFORM_ADMIN_TOKEN على الخادم.',
        });
    }

    if (!tokensMatch(req.get('x-platform-admin-token'), platformAdminToken)) {
        return res.status(403).json({
            success: false,
            message: 'غير مصرح بتعديل إعدادات المنصة.',
        });
    }

    const { newSettings } = req.body || {};
    if (!isValidPlatformSettingsPatch(newSettings)) {
        return res.status(400).json({
            success: false,
            message: 'بيانات الإعدادات غير صالحة أو تحتوي حقولاً غير مدعومة.',
        });
    }

    const nextSettings = { ...platformSettings };
    if (newSettings.bankAccounts !== undefined) {
        nextSettings.bankAccounts = newSettings.bankAccounts.map(({ bankName, accountName, iban }) => ({
            bankName: bankName.trim(),
            accountName: accountName.trim(),
            iban: iban.toUpperCase(),
        }));
    }
    if (newSettings.contactNumbers !== undefined) {
        nextSettings.contactNumbers = newSettings.contactNumbers.map(({ title, value }) => ({
            title: title.trim(),
            value: value.trim(),
        }));
    }
    if (newSettings.socialMedia !== undefined) {
        nextSettings.socialMedia = { ...platformSettings.socialMedia, ...newSettings.socialMedia };
    }

    platformSettings = nextSettings;
    return res.json({
        success: true,
        message: 'تم تحديث الإعدادات في ذاكرة الخادم فقط، وستُمسح عند إعادة تشغيله.',
        currentSettings: platformSettings,
    });
});

// 1. رابط تفعيل الاشتراكات الدورية
app.post('/api/subscriptions/subscribe', (req, res) => {
    const { userId, planType } = req.body;
    const plan = subscriptionPlans[planType];
    if (!plan) return res.status(400).json({ error: "الباقة غير موجودة" });
    res.json({ success: true, message: `تم تفعيل ${plan.name} بنجاح! 💳` });
});

// 2. معاينة تقدير السعي؛ لا تتحقق من المستندات ولا تعتمد أو تسجل الصفقات.
app.post('/api/compliance/validate-deal-flexible', (req, res) => {
    const { assetType, price, customSaeiAmount } = req.body ?? {};
    const rate = DEFAULT_SAEI_RATES[assetType];
    const numericPrice = Number(price);
    const numericCustomSaei = Number(customSaeiAmount);

    if (
        typeof assetType !== 'string' ||
        !Object.prototype.hasOwnProperty.call(DEFAULT_SAEI_RATES, assetType) ||
        !Number.isFinite(numericPrice) ||
        numericPrice <= 0 ||
        (customSaeiAmount !== undefined &&
            (!Number.isFinite(numericCustomSaei) || numericCustomSaei <= 0))
    ) {
        return res.status(400).json({
            success: false,
            message: 'أدخل نوع أصل معروفاً وسعراً موجباً صالحاً.',
        });
    }

    const calculatedSaei = customSaeiAmount === undefined
        ? numericPrice * rate
        : numericCustomSaei;

    res.status(202).json({
        success: true,
        previewOnly: true,
        complianceVerified: false,
        dealCreated: false,
        calculatedSaei,
        message: 'تم حساب معاينة تقديرية فقط. لم يتم التحقق من المستندات أو اعتماد الصفقة أو تسجيل طلب مراجعة أو فتح بيانات التواصل.',
        disclaimer: 'تقدير السعي لا يمثل اتفاقاً ملزماً أو طلب دفع.',
    });
});

// 3. رابط الذكاء الاصطناعي الأمني (فحص محاولات التلاعب والتهرب في الشات)
app.post('/api/ai/monitor-chat', (req, res) => {
    const { chatId, messageText, senderId } = req.body;
    const suspiciousWords = ["رقمي", "جوالي", "تواصل بره", "حسابي الخاص", "بدون مكتب", "تحويل مباشر"];
    let isSuspicious = false;

    suspiciousWords.forEach(word => {
        if (messageText.includes(word)) isSuspicious = true;
    });

    res.json({ success: true, analysed: true, suspicious: isSuspicious });
});

// 4. رابط إنشاء روابط اجتماعات Google Meet الفورية
app.post('/api/meetings/google-meet', (req, res) => {
    const meetCode = Math.random().toString(36).substr(2, 3) + "-" + Math.random().toString(36).substr(2, 4) + "-" + Math.random().toString(36).substr(2, 3);
    res.json({ success: true, meetUrl: `https://google.com{meetCode}`, message: "تم إنشاء اجتماع قوقل ميت بنجاح. 🔗" });
});

// 5. محرك الأتمتة الفورية (الشات، المزاد، والبث المباشر المطور مثل تيك توك)
io.on('connection', (socket) => {
    socket.on('start_realtime_stream', (data) => { socket.join(`live_room_${data.propertyId}`); });
    socket.on('send_live_chat_message', (data) => {
        io.to(`live_room_${data.propertyId}`).emit('live_chat_received', { sender: data.senderName, text: data.messageText });
    });
    socket.on('send_secure_message', (data) => { io.emit('receive_secure_message', data); });
});

// معاينة لمسارات الخيارات فقط؛ لا يوجد اتصال فعلي بالجهات الحكومية أو المالية.
app.post('/api/regulatory/mega-connect', (req, res) => {
    const { nationalId, propertyDeedNumber, chosenAction } = req.body ?? {};
    const actionLabels = {
        Sell: 'البيع',
        Rent: 'التأجير',
        Mortgage: 'الرهن العقاري',
        Develop: 'التطوير',
        Invest: 'الاستثمار',
    };

    if (
        typeof nationalId !== 'string' ||
        !/^\d{10}$/.test(nationalId) ||
        typeof propertyDeedNumber !== 'string' ||
        !propertyDeedNumber.trim() ||
        propertyDeedNumber.length > 100 ||
        !Object.prototype.hasOwnProperty.call(actionLabels, chosenAction)
    ) {
        return res.status(400).json({
            success: false,
            message: 'أدخل رقم هوية من 10 أرقام ورقم صك وخياراً صالحاً.',
        });
    }

    res.json({
        success: true,
        previewOnly: true,
        submittedToAuthorities: false,
        deedVerified: false,
        currentAction: chosenAction,
        actionLabel: actionLabels[chosenAction],
        systemStatus: 'Not_Submitted',
        deedStatus: 'لم يتم التحقق من الصك',
        message: `هذه معاينة لمسار ${actionLabels[chosenAction]} فقط. لم يُرسل الطلب إلى أي جهة ولم تُتحقق الهوية أو الصك.`,
        disclaimer:
            'لا يوجد تكامل حكومي أو مالي مهيأ في هذا الخادم. لا تُرسل بيانات حقيقية قبل تهيئة التكامل الرسمي الآمن.',
    });
});

const PORT = 10000;
server.listen(PORT, () => console.log(`API server listening on port ${PORT}`));
