const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors());
app.use(express.static('public'));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const ADMIN_EMAIL = "support@alalami-aqaratcom.com";

let platformSettings = {
    bankAccounts: [
        { bankName: "البنك الأهلي السعودي (SNB)", accountName: "شركة بورصة العالمي للاستثمار", iban: "SA6210000000000000000000" },
        { bankName: "مصرف الراجحي (Al Rajhi)", accountName: "شركة بورصة العالمي للاستثمار", iban: "SA8000000000000000000000" }
    ],
    contactNumbers: [
        { title: "الرقم الموحد المعتمد", value: "920000000" },
        { title: "الدعم الفني عبر الواتساب", value: "+966500000000" }
    ],
    socialMedia: {
        twitter: "https://x.com",
        tiktok: "https://tiktok.com",
        instagram: "https://instagram.com",
        email: ADMIN_EMAIL
    }
};

async function initDatabaseTables() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS properties (
                id SERIAL PRIMARY KEY,
                owner_type VARCHAR(50) NOT NULL,
                property_category VARCHAR(100) NOT NULL,
                deal_purpose VARCHAR(50) DEFAULT 'بيع',
                title VARCHAR(200) NOT NULL,
                price NUMERIC(15, 2) NOT NULL,
                location VARCHAR(100) NOT NULL,
                license_number VARCHAR(50) NOT NULL,
                contact_phone VARCHAR(30) DEFAULT '+966500000000',
                video_data TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await pool.query(`ALTER TABLE properties ADD COLUMN IF NOT EXISTS video_data TEXT;`);
        await pool.query(`ALTER TABLE properties ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(30) DEFAULT '+966500000000';`);
        await pool.query(`ALTER TABLE properties ADD COLUMN IF NOT EXISTS deal_purpose VARCHAR(50) DEFAULT 'بيع';`);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS brokers (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                license_number VARCHAR(50) UNIQUE,
                subscriptions_count INT DEFAULT 0,
                is_regular_paid BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS crm_leads (
                id SERIAL PRIMARY KEY,
                lead_name VARCHAR(100) NOT NULL,
                lead_role VARCHAR(50) NOT NULL,
                target_interest VARCHAR(150) NOT NULL,
                status VARCHAR(50) DEFAULT 'غير مغلق',
                contacted_by VARCHAR(100) NOT NULL,
                subscriptions_used INT DEFAULT 1,
                rating INT DEFAULT 5,
                rating_comment TEXT,
                rating_approved BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS deals (
                deal_id VARCHAR(50) PRIMARY KEY,
                asset_type VARCHAR(50) NOT NULL,
                price NUMERIC(15, 2) NOT NULL,
                saei_amount NUMERIC(15, 2) NOT NULL,
                status VARCHAR(50) DEFAULT 'Locked',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✓ تم تفعيل كافة الجداول الحية بنجاح!");
    } catch (err) {
        console.error("❌ خطأ في تهيئة قاعدة البيانات:", err);
    }
}
initDatabaseTables();

app.get('/api/properties', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM properties ORDER BY created_at DESC');
        res.json({ success: true, properties: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, properties: [] });
    }
});

app.post('/api/properties/add', async (req, res) => {
    const { ownerType, propertyCategory, dealPurpose, title, price, location, licenseNumber, contactPhone, videoData } = req.body;
    if (!title || !price || !licenseNumber || !propertyCategory) {
        return res.status(400).json({ success: false, message: "يرجى إكمال جميع الحقول الإلزامية." });
    }
    try {
        const result = await pool.query(
            `INSERT INTO properties (owner_type, property_category, deal_purpose, title, price, location, license_number, contact_phone, video_data) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [ownerType, propertyCategory, dealPurpose || 'بيع', title, price, location, licenseNumber, contactPhone || '+966500000000', videoData || null]
        );
        res.json({ success: true, property: result.rows[0], message: `✓ تم نشر العقار "${title}" (${propertyCategory}) وحفظه حياً في البورصة!` });
    } catch (err) {
        res.status(500).json({ success: false, message: "حدث خطأ أثناء حفظ العقار في السحابة." });
    }
});
app.get('/api/crm/leads', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM crm_leads ORDER BY created_at DESC');
        res.json({ success: true, leads: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, leads: [] });
    }
});

app.post('/api/crm/leads/add', async (req, res) => {
    const { leadName, leadRole, targetInterest, status, contactedBy, subscriptionsUsed, rating, ratingComment } = req.body;
    const subsCount = parseInt(subscriptionsUsed) || 1;
    const numRating = rating ? parseInt(rating) : null;

    if (subsCount > 5 && !numRating) {
        return res.status(400).json({ success: false, requireRating: true, message: "⚠️ لقد تجاوزت 5 اشتراكات؛ التقييم أصبح إلزامياً الآن لإتمام التواصل." });
    }

    let isApproved = true;
    let feedbackNotice = "";
    const negativeKeywords = ["سيء", "نصب", "كذب", "فاشل", "غالي", "تأخير", "غير مفيد", "مشكلة"];
    const hasNegativeText = ratingComment && negativeKeywords.some(w => ratingComment.includes(w));

    if (numRating && (numRating <= 3 || hasNegativeText)) {
        isApproved = false;
        console.log(`📧 [تنبيه بريد إلى ${ADMIN_EMAIL}]: استبعاد تقييم سلبي. العميل: ${leadName} | التقييم: ${numRating}/5`);
        feedbackNotice = ` (تم استبعاد التقييم السلبي/غير المفيد وإرساله لبريد الإدارة ${ADMIN_EMAIL}).`;
    }

    try {
        const result = await pool.query(
            `INSERT INTO crm_leads (lead_name, lead_role, target_interest, status, contacted_by, subscriptions_used, rating, rating_comment, rating_approved) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [leadName, leadRole, targetInterest, status, contactedBy, subsCount, numRating || 5, ratingComment || '', isApproved]
        );
        res.json({ success: true, lead: result.rows[0], message: `✓ تم تسجيل حالة العميل/المالك (${leadName} - ${status}) بنجاح!${feedbackNotice}` });
    } catch (err) {
        res.status(500).json({ success: false, message: "تعذر حفظ بيانات العميل في السحابة." });
    }
});

app.post('/api/vip/targeted-leads', async (req, res) => {
    const { userRole, searchInterest, isRegularPaid } = req.body;
    if (!isRegularPaid) {
        return res.status(403).json({ success: false, message: "🔒 هذه الميزة مخصصة للعملاء المنتظمين (أصحاب الاشتراكات المدفوعة المنتظمة)." });
    }
    const matchedTargets = [
        { name: "شركة أفق التطوير العقاري", role: "مستثمر مؤسسي", interest: searchInterest || "أراضي خام وكمباوندات", budget: "45,000,000 ريال", readiness: "جاهز للإغلاق الفوري" },
        { name: "مجموعة النخبة التجارية", role: "مشتري مباشر", interest: searchInterest || "مولات ومراكز تجارية", budget: "80,000,000 ريال", readiness: "تمويل بنكي معتمد" },
        { name: "عبدالله المنصور (مستثمر VIP)", role: "مستثمر فردي", interest: searchInterest || "فلل وقصور ومخططات", budget: "18,500,000 ريال", readiness: "دفع نقدي (كاش)" }
    ];
    res.json({ success: true, message: `👑 أهلاً بك كعميل منتظم (${userRole})! تم فتح قائمة الفئة المستهدفة المطابقة لبحثك:`, targets: matchedTargets });
});

app.post('/api/brokers/add', async (req, res) => {
    const { name, licenseNumber } = req.body;
    try {
        const result = await pool.query('INSERT INTO brokers (name, license_number) VALUES ($1, $2) RETURNING *', [name, licenseNumber]);
        res.json({ success: true, broker: result.rows[0], message: `✓ تم توثيق وحفظ الساعي (${name}) بنجاح!` });
    } catch (err) {
        res.status(500).json({ success: false, message: "رقم الرخصة مسجل مسبقاً أو البيانات غير مكتملة." });
    }
});

const DEFAULT_SAEI_RATES = { realestate_sale: 0.01, realestate_rent: 0.05, stocks: 0.005, gold: 0.01, scrap: 0.02 };

app.post('/api/compliance/validate-deal-flexible', async (req, res) => {
    const { assetType, price, userNationality, propertyLocation, customSaeiAmount, isSuperDeveloperBypass } = req.body;
    if (!isSuperDeveloperBypass && (userNationality === 'NonSaudi_Foreign' || userNationality === 'NonSaudi_GCC') && (propertyLocation === 'Makkah' || propertyLocation === 'Madinah')) {
        return res.status(403).json({ success: false, message: "⛔ نظاماً: يُحظر تملك غير السعوديين (خليجي أو أجنبي) في مكة المكرمة والمدينة المنورة. تم تحويل الطلب لصيغة الإيجار/الانتفاع." });
    }
    const rate = DEFAULT_SAEI_RATES[assetType] || 0.01;
    const finalSaei = customSaeiAmount ? parseFloat(customSaeiAmount) : (parseFloat(price) * rate);
    const dealId = "DEAL_" + Math.random().toString(36).substr(2, 9).toUpperCase();
    try {
        await pool.query('INSERT INTO deals (deal_id, asset_type, price, saei_amount, status) VALUES ($1, $2, $3, $4, $5)', [dealId, assetType, price, finalSaei, 'Locked']);
        res.json({ success: true, dealId, calculatedSaei: finalSaei, message: `✓ تم توثيق الصفقة (${dealId}) وحفظها! السعي المستحق: ${finalSaei.toLocaleString('ar-SA')} ريال.` });
    } catch (err) {
        res.status(500).json({ success: false, message: "تعذر حفظ المعاملة في قاعدة البيانات." });
    }
});

app.post('/api/ai/assistant', (req, res) => {
    const { prompt, type, title, category, location, price } = req.body;
    if (type === 'generate_ad') {
        const adText = `✨ فرصة استثمارية في ${location || 'المملكة'}! نعرض لكم (${category || 'عقار مميز'}): "${title || 'عرض حصري'}" بقيمة ${Number(price || 0).toLocaleString('ar-SA')} ريال. موثق عبر بورصة العالمي بسعي 1% فقط.`;
        return res.json({ success: true, reply: adText });
    }
    let reply = "أهلاً بك في المساعد الذكي لبورصة العالمي! اسألني عن التمويل العقاري، نسبة السعي (1% للبيع و5% للإيجار)، أو أنظمة التملك.";
    if (prompt && prompt.includes("تمويل")) reply = "لحساب التمويل العقاري، أدخل سعر العقار وسأحسب لك الدفعة الأولى (10%) والقسط الشهري المتوقع فوراً.";
    else if (prompt && (prompt.includes("سعي") || prompt.includes("عمولة"))) reply = "نسبة السعي في بورصة العالمي: 1% للبيع والذهب، 5% للإيجار، 2% للسكراب، و0.5% للأسهم المغلقة.";
    res.json({ success: true, reply });
});

app.get('/api/platform/info', (req, res) => res.json({ success: true, settings: platformSettings }));

app.post('/api/ai/monitor-chat', (req, res) => {
    const { messageText } = req.body;
    const suspiciousWords = ["رقمي", "جوالي", "واتس", "05", "تواصل بره", "حسابي"];
    const isSuspicious = suspiciousWords.some(word => messageText.includes(word));
    res.json({ success: true, suspicious: isSuspicious });
});

app.post('/api/meetings/google-meet', (req, res) => {
    const code = Math.random().toString(36).substr(2, 3) + "-" + Math.random().toString(36).substr(2, 4) + "-" + Math.random().toString(36).substr(2, 3);
    res.json({ success: true, meetUrl: `https://google.com{code}`, message: "✓ تم توليد رابط الاجتماع الآمن ومشاركة الشاشة بنجاح." });
});

io.on('connection', (socket) => {
    socket.on('live_stream_chat', (data) => io.emit('live_stream_chat_broadcast', data));
    socket.on('live_bid', (data) => io.emit('live_bid_broadcast', data));
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 بورصة العالمي تعمل حياً على المنفذ ${PORT}`));
         
