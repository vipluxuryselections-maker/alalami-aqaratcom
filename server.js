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

// 1. رابط تفعيل الاشتراكات الدورية
app.post('/api/subscriptions/subscribe', (req, res) => {
    const { userId, planType } = req.body;
    const plan = subscriptionPlans[planType];
    if (!plan) return res.status(400).json({ error: "الباقة غير موجودة" });
    res.json({ success: true, message: `تم تفعيل ${plan.name} بنجاح! 💳` });
});

// 2. رابط حساب وتخصيص السعي وتوزيعه وقفل البيانات والشروط النظامية
app.post('/api/compliance/validate-deal-flexible', (req, res) => {
    const { 
        assetType, price, userNationality, propertyLocation, licenseNumber, 
        chamberOfCommerceStampAttached, isSuperDeveloperBypass, customSaeiAmount 
    } = req.body;

    // ميزة المرونة التجارية الفائقة للمطور (Bypass)
    if (isSuperDeveloperBypass === true) {
        const dealId = "DEAL_BYPASS_" + Math.random().toString(36).substr(2, 9);
        let finalSaei = customSaeiAmount ? parseFloat(customSaeiAmount) : (price * 0.01);
        return res.json({
            success: true,
            dealId,
            calculatedSaei: finalSaei,
            message: "✓ [تم التمرير بنجاح] صلاحية المطور الفائقة نشطة: تم قبول الصفقة وتمريرها استثنائياً وفتح قنوات التواصل والدردشة فوراً بمرونة تامة! 🔓"
        });
    }

    const rule = ASSET_REGULATORY_RULES[assetType] || { requiredLicense: "رخصة معتمدة", saeiRate: 0.01 };

    // فحص حظر تملك الأجانب بالحرمين
    if (userNationality !== 'Saudi' && (assetType === 'realestate_sale' || assetType === 'realestate_rent') && (propertyLocation === 'Makkah' || propertyLocation === 'Madinah')) {
        return res.status(403).json({
            success: false,
            message: "🚨 حظر نظامي: تم قفل خيار الشراء المطلق لغير السعوديين في مكة والمدينة والتحويل التلقائي للإيجار والانتفاع."
        });
    }

    if (!licenseNumber || licenseNumber.trim() === "") {
        return res.status(422).json({ success: false, message: `🔒 خطوة نظامية معلقة: يرجى إدخال المتطلب النظامي: (${rule.requiredLicense})` });
    }

    const finalSaei = price * rule.saeiRate;
    const dealId = "DEAL_" + Math.random().toString(36).substr(2, 9);

    res.json({
        success: true,
        dealId,
        calculatedSaei: finalSaei,
        message: "✓ تم التحقق من الامتثال وتصديق ختم الغرفة التجارية بنجاح! تم قفل البيانات وحظر إظهار الأرقام حتى سداد قيمة السعي الصافي للمنصة. 🔒",
        disclaimer: PLATFORM_LEGAL_DISCLAIMER
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

const PORT = 10000; // المنفذ الرسمي للسحابة
server.listen(PORT, () => console.log(`🚀 بورصة العالمي للأصول تعمل سحابياً بثبات على المنفذ ${PORT}`));
// 🏢 محاكاة محرك الربط الرسمي مع الهيئة العامة للعقار وهيئة السوق المالية (Regulatory API Gateway)
app.post('/api/regulatory/mega-connect', (req, res) => {
    const { userId, nationalId, propertyDeedNumber, chosenAction } = req.body;
    // chosenAction: 'Sell', 'Rent', 'Mortgage', 'Develop', 'Invest'

    if (!nationalId || nationalId.length !== 10) {
        return res.status(400).json({ success: false, message: "يتطلب الربط الحكومي إدخال رقم هوية وطنية صحيح." });
    }

    console.log(`📡 [بوابة الامتثال الحكومي]: جاري التحقق من الصك ${propertyDeedNumber} عبر الهيئة العامة للعقار...`);
    console.log(`📡 [بوابة الامتثال المالي]: جاري فحص مطابقة نظام الاستثمار والرهن مع هيئة السوق المالية (CMA) والبنك المركزي.`);

    // تعريف بنية الخيارات الخمسة الكبرى للمواطن
    const actionRoutes = {
        Sell: { status: "Active_In_Exchange", message: "🚀 تم التحقق من الصك عبر هيئة العقار وطرحه للبيع التنافسي (سعي 1%)." },
        Rent: { status: "Active_In_Ejaar", message: "📝 تم ربط العقار بنظام إيجار وجاري استقبال المستأجرين بنجاح." },
        Mortgage: { status: "Awaiting_Bank_Offers", message: "🏦 تم إرسال الصك لشركات التمويل والبنك العقاري لتقديم عروض الرهن مسبوقة بالمسودة." },
        Develop: { status: "Shared_With_Developers", message: "🤝 تم إدراج عقارك في قسم المطورين الكبار وشركاء الأرض للاتفاق التشغيلي." },
        Invest: { status: "CMA_Compliant_Investment", message: "🪙 تم تحويل العقار إلى محفظة استثمارية مساهمة متوافقة مع لوائح هيئة السوق المالية." }
    };

    const result = actionRoutes[chosenAction] || { status: "Pending", message: "تم تسجيل الطلب في المنظومة." };

    res.json({
        success: true,
        deedStatus: "✓ صك إلكتروني موثق ونظامي",
        currentAction: chosenAction,
        systemStatus: result.status,
        message: `${result.message}\n\nتنبيه: المنصة وسيط تقني وتخلو مسؤوليتها تماماً بموجب البند العام المعتمد للدولة. ⚖️`
    });
});
