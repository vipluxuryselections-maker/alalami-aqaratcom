const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// 💸 نسب السعي الخاصة بصاحب المنصة (المطور الرئيسي)
const PLATFORM_SAEI_RATES = {
    sale: 0.01,    // 1% من صفقات البيع
    rent: 0.05     // 5% من صفقات الإيجار السنوية
};
const SUBSCRIPTION_PLANS = {
    weekly: { price: 29, name: 'أسبوعية' },
    monthly: { price: 99, name: 'شهرية' },
    yearly: { price: 799, name: 'سنوية' }
};

// 📊 محاكاة لقواعد البيانات والأدوار (ستربط بـ PostgreSQL لاحقاً)
let transactions = [];
let activeChats = [];
let subscriptions = [];

// 1. رابط احتساب السعي وإتمام الصفقات
app.post('/api/deals/complete', (req, res) => {
    const { propertyId, propertyPrice, dealType, ownerId, clientId, brokerId } = req.body;

    const price = Number(propertyPrice);
    if (!Number.isFinite(price) || price <= 0) {
        return res.status(400).json({ success: false, message: 'يرجى إدخال سعر عقار صحيح.' });
    }

    if (!Object.prototype.hasOwnProperty.call(PLATFORM_SAEI_RATES, dealType)) {
        return res.status(400).json({ success: false, message: 'نوع الصفقة غير صالح.' });
    }

    // حساب نصيب المنصة تلقائياً
    const rate = PLATFORM_SAEI_RATES[dealType];
    const platformSaei = price * rate;
    
    const dealInvoice = {
        dealId: "DEAL_" + Math.random().toString(36).substr(2, 9),
        propertyId,
        dealType,
        totalPrice: price,
        platformSaeiEarnings: platformSaei, // أرباحك الصافية من هذه الصفقة
        status: "Pending_Payment"
    };
    
    transactions.push(dealInvoice);
    console.log(`💰 صفقة جديدة! نوعها: ${dealType}، أرباح المنصة المتوقعة: ${platformSaei} ريال.`);
    
    res.json({
        success: true,
        invoice: dealInvoice,
        message: `تم تسجيل الصفقة بنجاح. نصيب المنصة من السعي هو ${platformSaei} ريال يرجى السداد لتفعيل العقد والتوثيق.`
    });
});

app.post('/api/subscriptions/subscribe', (req, res) => {
    const { userId, planType } = req.body;
    const plan = SUBSCRIPTION_PLANS[planType];
    const parsedUserId = Number(userId);

    if (!Number.isInteger(parsedUserId) || parsedUserId <= 0 || !plan) {
        return res.status(400).json({ success: false, message: 'بيانات الاشتراك غير صالحة.' });
    }

    const subscription = {
        subscriptionId: "SUB_" + Math.random().toString(36).substr(2, 9),
        userId: parsedUserId,
        planType,
        price: plan.price,
        status: "Pending_Payment"
    };

    subscriptions.push(subscription);
    res.json({
        success: true,
        subscription,
        message: `تم تسجيل طلب الاشتراك في الباقة ${plan.name} بقيمة ${plan.price} ريال.`
    });
});

// 🔐 2. رابط التحقق من صلاحيات الإدارة (المطور والمشرفين)
app.post('/api/admin/check-privileges', (req, res) => {
    const { userRole } = req.body; // 'super_developer' أو 'support_agent'
    
    if (userRole === 'super_developer') {
        res.json({
            accessGranted: true,
            dashboardType: "الملكية الفائقة والتحكم المالي المطلق 👑"
        });
    } else if (userRole === 'support_agent') {
        res.json({
            accessGranted: true,
            dashboardType: "لوحة مشرف خدمة العملاء ومتابعة الدردشات والدعم الفني 🎧"
        });
    } else {
        res.status(403).json({ success: false, message: "غير مصرح لك بدخول الإدارة." });
    }
});

// 💬 3. محرك الدردشات وغرف المكالمات والاجتماعات المراقبة لحفظ الحقوق
io.on('connection', (socket) => {
    console.log('مستخدم متصل بالمنظومة: ' + socket.id);

    // استقبال رسائل الشات وتوجيهها وبثها للمشرفين للمراقبة وحفظ الخصوصية في نفس الوقت
    socket.on('send_secure_message', (data) => {
        // data تضم (المرسل، المستقبل، النص)
        activeChats.push(data);
        
        // إرسال فوري للطرف الآخر
        io.emit('receive_secure_message', data);
        
        // بث الرسالة لقسم الدعم الفني وخدمة العملاء لمتابعة جودة التعامل ومنع النزاعات
        io.emit('support_monitor_stream', data);
    });

    socket.on('disconnect', () => {
        console.log('مستخدم غادر المنظومة');
    });
});

const PORT = Number(process.env.PORT) || 4000;
server.listen(PORT, () => console.log(`🚀 محرك "العالمي للعقارات" يعمل بنجاح على المنفذ ${PORT}`));
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// 💸 نظام السعي والعمولات المرن للأصول المتعددة
let customDeals = {};
const DEFAULT_SAEI_RATES = {
    realestate_sale: 0.01,
    realestate_rent: 0.05,
    stocks: 0.005,
    gold: 0.01,
    scrap: 0.02
};

// بند خلو مسؤولية المنصة القانوني الصارم (Disclaimers)
const PLATFORM_LEGAL_DISCLAIMER = `
بند خلو المسؤولية القانونية: منصة العالمي للاستثمار والعقارات هي وسيط تقني فقط يربط الأطراف. 
لا تتحمل المنصة أي مسؤولية قانونية، مالية، أو جنائية ناتجة عن الصفقات، الالتزامات، 
أو الاتفاقيات المبرمة بين الملاك، العملاء، السعاة، المطورين، الجهات التمويلية (بنوك أو أفراد)، 
أو تجار الأصول (الذهب والأسهم والسكراب). توقيع عقد الوساطة وسداد السعي هو مسؤولية الأطراف المشتركة تماماً.
`;

// 1. رابط حساب وتخصيص السعي وتوزيعه بين السعاة الإضافيين
app.post('/api/deals/create-flexible', (req, res) => {
    const { assetType, price, ownerId, brokerIds, customSaeiAmount } = req.body;
    
    // احتساب السعي: إما مبلغ متفق عليه يدوياً أو النسبة الافتراضية
    let finalSaei = customSaeiAmount ? customSaeiAmount : (price * (DEFAULT_SAEI_RATES[assetType] || 0.01));
    
    // توزيع السعي بالتساوي بين السعاة والمنصة (مثال: 50% للمنصة والباقي يوزع على السعاة)
    const platformShare = finalSaei * 0.5;
    const brokersShare = (finalSaei * 0.5) / (brokerIds.length || 1);

    const dealId = "DEAL_" + Math.random().toString(36).substr(2, 9);
    customDeals[dealId] = {
        dealId, assetType, price, finalSaei, platformShare, brokersShare,
        status: "Locked_Awaiting_Saei_Payment", // مغلق حتى يتم دفع السعي
        legalDisclaimer: PLATFORM_LEGAL_DISCLAIMER
    };

    res.json({
        success: true,
        dealId,
        platformShare,
        brokersSharePerAgent: brokersShare,
        message: "تم قفل العقار/الأصل بنجاح. لا يمكن إظهار الأرقام أو فتح الدردشة إلا بعد تحويل السعي لحساب المنصة البنكي أو إرفاق الشيك الموثق. 🔒",
        disclaimer: PLATFORM_LEGAL_DISCLAIMER
    });
});

// 2. رابط إنشاء روابط اجتماعات Google Meet الفورية
app.post('/api/meetings/google-meet', (req, res) => {
    const { propertyId, title } = req.body;
    const meetCode = Math.random().toString(36).substr(2, 3) + "-" + Math.random().toString(36).substr(2, 4) + "-" + Math.random().toString(36).substr(2, 3);
    const googleMeetUrl = `https://google.com{meetCode}`;
    
    res.json({
        success: true,
        meetUrl: googleMeetUrl,
        message: `تم إنشاء اجتماع مرئي عبر Google Meet بنجاح للتفاوض على المستندات والتمويل. 🔗`
    });
});

// 3. التحويل الرسمي والنظامي لأرصدة السعاة بعد إتمام الصفقة
app.post('/api/finance/transfer-saei', (req, res) => {
    const { dealId, brokerIban, amount } = req.body;
    console.log(`🏦 تحويل بنكي رسمي بمبلغ ${amount} ريال إلى الآيبان ${brokerIban} التابع للمسوق المعتمد.`);
    res.json({ success: true, message: "تمت الحوالة النظامية بنجاح إلى حساب الساعي بعد استقطاع نصيب المنصة. 💳" });
});

// 4. إرسال الصفة الاعتبارية لجهة التمويل (بنك، فرد، صندوق)
app.post('/api/funding/send-status', (req, res) => {
    const { ownerId, funderType, funderName, isDetailsComplete } = req.body; // funderType: بنك، فرد على صندوق، رهن...
    res.json({
        success: true,
        message: `تم إرسال الملف الاعتباري الكامل للجهة الممولة (${funderName} - ${funderType}) إلى المالك بنجاح مسبوقاً بمسودة العقد النظامية. 📜`
    });
});

const PORT = 4000;
server.listen(PORT, () => console.log(`🚀 بورصة العالمي للأصول المتعددة تعمل على المنفذ ${PORT}`));
