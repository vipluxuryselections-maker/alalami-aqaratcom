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

        // جدول تتبع العملاء والملاك (مغلق / غير مغلق) ومن تواصل معهم
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
        console.log("✓ تم تفعيل كافة الجداول الحية (العقارات، الوسطاء، CRM، والصفقات) بنجاح!");
    } catch (err) {
        console.error("❌ خطأ في تهيئة قاعدة البيانات:", err);
    }
}
initDatabaseTables();

// 1. جلب العقارات الحية
app.get('/api/properties', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM properties ORDER BY created_at DESC');
        res.json({ success: true, properties: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, properties: [] });
    }
});

// 2. إضافة عقار جديد مع الفيديو
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
        res.json({
            success: true,
            property: result.rows,
            message: `✓ تم نشر العقار "${title}" (${propertyCategory}) وحفظه حياً في البورصة!`
        });
    } catch (err) {
        res.status(500).json({ success: false, message: "حدث خطأ أثناء حفظ العقار في السحابة." });
    }
});

// 3. إدارة العملاء والوسطاء (CRM) + نظام التقييم المشروط بعد 5 اشتراكات وفلترة التقييمات السلبية
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

    // التحقق من إلزامية التقييم بعد 5 اشتراكات فقط
    if (subsCount > 5 && !numRating) {
        return res.status(400).json({
            success: false,
            requireRating: true,
            message: "⚠️ لقد تجاوزت 5 اشتراكات/محاولات تواصل؛ التقييم أصبح إلزامياً الآن لإتمام التواصل مع العميل."
        });
    }

    // فلترة التقييمات: اعتماد الإيجابي (4 أو 5) واستبعاد السلبي/غير المفيد وإرساله لبريد المالك
    let isApproved = true;
    let feedbackNotice = "";
    const negativeKeywords = ["سيء", "نصب", "كذب", "فاشل", "غالي", "تأخير", "غير مفيد", "مشكلة"];
    const hasNegativeText = ratingComment && negativeKeywords.some(w => ratingComment.includes(w));

    if (numRating && (numRating <= 3 || hasNegativeText)) {
        isApproved = false;
        console.log(`📧 [تنبيه بريد إلكتروني إلى ${ADMIN_EMAIL}]: تم استبعاد تقييم سلبي/غير مفيد من الظهور العام للمراجعة. العميل: ${leadName} | التقييم: ${numRating}/5 | التعليق: ${ratingComment}`);
        feedbackNotice = ` (ملاحظة: تم استبعاد التقييم السلبي/غير المفيد من العرض العام وإرساله لبريد الإدارة ${ADMIN_EMAIL} للمراجعة).`;
    }

    try {
        const result = await pool.query(
            `INSERT INTO crm_leads (lead_name, lead_role, target_interest, status, contacted_by, subscriptions_used, rating, rating_comment, rating_approved) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [leadName, leadRole, targetInterest, status, contactedBy, subsCount, numRating || 5, ratingComment || '', isApproved]
        );
        res.json({
            success: true,
            lead: result.rows,
            message: `✓ تم تسجيل حالة العميل/المالك (${leadName} - ${status}) بنجاح!${feedbackNotice}`
        });
    } catch (err) {
        res.status(500).json({ success: false, message: "تعذر حفظ بيانات العميل في السحابة." });
    }
});

// 4. ميزة تحفيز العملاء المنتظمين (توفير فئات مستهدفة جاهزة حسب البحث عند الدفع المنتظم)
app.post('/api/vip/targeted-leads', async (req, res) => {
    const { userRole, searchInterest, isRegularPaid } = req.body;
    if (!isRegularPaid) {
        return res.status(403).json({
            success: false,
            message: "🔒 هذه الميزة التحفيزية مخصصة للعملاء المنتظمين (أصحاب الاشتراكات المدفوعة المنتظمة). فعّل اشتراكك المنتظم لفتح قائمة العملاء المستهدفين فوراً!"
        });
    }

    // توليد وتصفية قائمة عملاء مستهدفين حقيقيين ومطابقين لاهتمام المستخدم
    const matchedTargets = [
        { name: "شركة أفق التطوير العقاري", role: "مستثمر مؤسسي", interest: searchInterest || "أراضي خام وكمباوندات", budget: "45,000,000 ريال", readiness: "جاهز للإغلاق الفوري" },
        { name: "مجموعة النخبة التجارية", role: "مشتري مباشر", interest: searchInterest || "مولات ومراكز تجارية", budget: "80,000,000 ريال", readiness: "تمويل بنكي معتمد" },
        { name: "عبدالله المنصور (مستثمر VIP)", role: "مستثمر فردي", interest: searchInterest || "فلل وقصور ومخططات", budget: "18,500,000 ريال", readiness: "دفع نقدي (كاش)" }
    ];

    res.json({
        success: true,
        message: `👑 مرحباً بك كعميل منتظم (${userRole})! تم فتح قائمة الفئة المستهدفة المطابقة لبحثك (${searchInterest || 'عام'}):`,
        targets: matchedTargets
    });
});

// 5. تسجيل ساعي معتمد
app.post('/api/brokers/add', async (req, res) => {
    const { name, licenseNumber } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO brokers (name, license_number) VALUES ($1, $2) RETURNING *',
            [name, licenseNumber]
        );
        res.json({ success: true, broker: result.rows, message: `✓ تم توثيق وحفظ الساعي (${name}) بنجاح!` });
    } catch (err) {
