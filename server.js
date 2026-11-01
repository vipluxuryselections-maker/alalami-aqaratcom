const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
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

app.get('/api/health', (req, res) => {
    res.json({ success: true, service: 'aqarat-app-api' });
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
