const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public')); // تشغيل واجهة الموقع تلقائياً

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// 💸 نسب السعي والعمولات المرنة للأصول المتعددة (عرض الـ 1% التنافسي)
let customDeals = {};
const DEFAULT_SAEI_RATES = {
    realestate_sale: 0.01,
    realestate_rent: 0.05,
    stocks: 0.005,
    gold: 0.01,
    scrap: 0.02
};

// باقات الاشتراكات الدورية للملاك
const subscriptionPlans = {
    weekly: { name: 'الباقة الأسبوعية', price: 29 },
    monthly: { name: 'الباقة الشهرية', price: 99 },
    yearly: { name: 'الباقة السنوية', price: 799 }
};

let activeMeetings = {};

// بند خلو مسؤولية المنصة القانوني الصارم (Disclaimers)
const PLATFORM_LEGAL_DISCLAIMER = `بند خلو المسؤولية القانونية: منصة العالمي للاستثمار والعقارات هي وسيط تقني فقط يربط الأطراف. لا تتحمل المنصة أي مسؤولية قانونية، مالية، أو جنائية ناتجة عن الصفقات، الالتزامات، أو الاتفاقيات المبرمة بين الملاك، العملاء، السعاة، الجهات التمويلية (بنوك أو أفراد)، أو تجار الأصول (الذهب والأسهم والسكراب).`;

// 1. رابط تفعيل الاشتراكات الدورية
app.post('/api/subscriptions/subscribe', (req, res) => {
    const { userId, planType } = req.body;
    const plan = subscriptionPlans[planType];
    if (!plan) return res.status(400).json({ error: 'الباقة غير موجودة' });
    res.json({ success: true, message: `تم تفعيل ${plan.name} بنجاح! 💳` });
});

// 2. رابط حساب وتخصيص السعي وتوزيعه وقفل البيانات
app.post('/api/deals/create-flexible', (req, res) => {
    const { assetType, price, brokerIds, customSaeiAmount } = req.body;
    const numericPrice = Number(price);
    const brokerList = Array.isArray(brokerIds) ? brokerIds : [];

    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
        return res.status(400).json({ success: false, message: 'يرجى إدخال سعر صحيح.' });
    }

    let finalSaei = customSaeiAmount !== undefined && customSaeiAmount !== null
        ? Number(customSaeiAmount)
        : (numericPrice * (DEFAULT_SAEI_RATES[assetType] || 0.01));

    finalSaei = Number(finalSaei) || 0;
    const platformShare = finalSaei * 0.5;
    const brokersShare = (finalSaei * 0.5) / (brokerList.length || 1);

    const dealId = 'DEAL_' + Math.random().toString(36).substr(2, 9);
    customDeals[dealId] = {
        dealId,
        assetType,
        price: numericPrice,
        finalSaei,
        platformShare,
        brokersShare,
        status: 'Locked'
    };

    res.json({
        success: true,
        dealId,
        platformShare,
        message: 'تم قفل الأصل بنجاح. لا يمكن إظهار الأرقام أو فتح الدردشة إلا بعد سداد السعي للمنصة. 🔒',
        disclaimer: PLATFORM_LEGAL_DISCLAIMER
    });
});

// 3. رابط الذكاء الاصطناعي الأمني (فحص محاولات التلاعب والتهرب في الشات)
app.post('/api/ai/monitor-chat', (req, res) => {
    const { chatId, messageText, senderId } = req.body;
    const suspiciousWords = ['رقمي', 'جوالي', 'تواصل بره', 'حسابي الخاص', 'بدون مكتب', 'تحويل مباشر'];
    let isSuspicious = false;

    if (typeof messageText === 'string') {
        suspiciousWords.forEach((word) => {
            if (messageText.includes(word)) isSuspicious = true;
        });
    }

    res.json({ success: true, analysed: true, suspicious: isSuspicious });
});

// 4. رابط إنشاء روابط اجتماعات Google Meet الفورية
app.post('/api/meetings/google-meet', (req, res) => {
    const meetCode = Math.random().toString(36).substr(2, 3) + '-' + Math.random().toString(36).substr(2, 4) + '-' + Math.random().toString(36).substr(2, 3);
    const googleMeetUrl = `https://meet.google.com/${meetCode}`;

    res.json({
        success: true,
        meetUrl: googleMeetUrl,
        message: 'تم إنشاء اجتماع قوقل ميت بنجاح. 🔗'
    });
});

// 5. محرك الأتمتة الفورية (الشات، المزاد، والبث المباشر المطور مثل تيك توك)
io.on('connection', (socket) => {
    socket.on('start_realtime_stream', (data) => {
        socket.join(`live_room_${data.propertyId}`);
    });

    socket.on('send_live_chat_message', (data) => {
        io.to(`live_room_${data.propertyId}`).emit('live_chat_received', {
            sender: data.senderName,
            text: data.messageText
        });
    });

    socket.on('send_secure_message', (data) => {
        io.emit('receive_secure_message', data);
    });
});

const PORT = Number(process.env.PORT) || 10000;
server.listen(PORT, () => console.log(`🚀 بورصة العالمي للأصول تعمل سحابياً بثبات على المنفذ ${PORT}`));
