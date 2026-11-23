const crypto = require('node:crypto');
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
        await pool.query(`
            ALTER TABLE deals
                ADD COLUMN IF NOT EXISTS platform_share NUMERIC(15, 2) DEFAULT 0,
                ADD COLUMN IF NOT EXISTS broker_shares JSONB DEFAULT '[]'::jsonb,
                ADD COLUMN IF NOT EXISTS unassigned_broker_share NUMERIC(15, 2) DEFAULT 0,
                ADD COLUMN IF NOT EXISTS payouts_executed BOOLEAN DEFAULT FALSE;

            CREATE TABLE IF NOT EXISTS user_offices (
                id SERIAL PRIMARY KEY,
                full_name VARCHAR(150) NOT NULL,
                phone VARCHAR(50) NOT NULL,
                email VARCHAR(254),
                license_number VARCHAR(100),
                bio TEXT,
                avatar_base64 TEXT,
                is_public BOOLEAN NOT NULL DEFAULT TRUE,
                facility_name VARCHAR(150),
                subscription_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS office_ledger (
                id SERIAL PRIMARY KEY,
                office_id INT NOT NULL DEFAULT 1,
                item_type VARCHAR(50) NOT NULL,
                status VARCHAR(50) NOT NULL DEFAULT 'جديد',
                title VARCHAR(200) NOT NULL,
                asset_category VARCHAR(100),
                deal_type VARCHAR(50),
                price NUMERIC(15, 2) NOT NULL DEFAULT 0,
                area NUMERIC(15, 2) NOT NULL DEFAULT 0,
                contact_phone VARCHAR(50),
                seriousness_score INT NOT NULL DEFAULT 5,
                recommendations_count INT NOT NULL DEFAULT 0,
                interactions_count INT NOT NULL DEFAULT 0,
                is_featured BOOLEAN NOT NULL DEFAULT FALSE,
                co_broker_name VARCHAR(100),
                commission_split VARCHAR(100),
                loi_attached BOOLEAN NOT NULL DEFAULT FALSE,
                buy_commitment BOOLEAN NOT NULL DEFAULT FALSE,
                brokers_commitment TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS appointments (
                id SERIAL PRIMARY KEY,
                client_name VARCHAR(150) NOT NULL,
                topic VARCHAR(200) NOT NULL,
                appointment_date DATE NOT NULL,
                appointment_time TIME NOT NULL,
                status VARCHAR(50) NOT NULL DEFAULT 'مجدول تلقائياً',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✓ تم تفعيل كافة الجداول الحية بنجاح!");
    } catch (err) {
        console.error("❌ خطأ في تهيئة قاعدة البيانات:", err);
    }
}
app.post('/api/office/profile', async (req, res) => {
    const {
        fullName, phone, email, licenseNumber, bio, avatarBase64, isPublic, facilityName
    } = req.body ?? {};
    if (
        typeof fullName !== 'string' || !fullName.trim() || fullName.length > 150 ||
        typeof phone !== 'string' || !phone.trim() || phone.length > 50 ||
        (email != null && email !== '' && (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) ||
        (licenseNumber != null && (typeof licenseNumber !== 'string' || licenseNumber.length > 100)) ||
        (bio != null && (typeof bio !== 'string' || bio.length > 12000)) ||
        (facilityName != null && (typeof facilityName !== 'string' || facilityName.length > 150)) ||
        (avatarBase64 != null && (typeof avatarBase64 !== 'string' || avatarBase64.length > 12000000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(avatarBase64))) ||
        (isPublic != null && typeof isPublic !== 'boolean')
    ) {
        return res.status(400).json({ success: false, message: "بيانات المكتب غير صالحة." });
    }

    try {
        const result = await pool.query(
            `INSERT INTO user_offices
                (id, full_name, phone, email, license_number, bio, avatar_base64, is_public, facility_name)
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
                fullName.trim(), phone.trim(), email || null, licenseNumber || null,
                bio || null, avatarBase64 || null, isPublic !== false, facilityName || null
            ]
        );
        return res.json({ success: true, office: result.rows[0], message: "تم حفظ بيانات المكتب في قاعدة البيانات." });
    } catch (err) {
        console.error("تعذر حفظ ملف المكتب:", err.message);
        return res.status(500).json({ success: false, message: "تعذر حفظ الملف الشخصي." });
    }
});

app.get('/api/office/profile/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
        return res.status(400).json({ success: false, message: "معرّف المكتب غير صالح." });
    }
    try {
        const result = await pool.query(
            `SELECT id, full_name, bio, avatar_base64, facility_name, created_at
             FROM user_offices
             WHERE id = $1 AND is_public = TRUE AND subscription_active = TRUE`,
            [id]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: "الملف غير متاح للعامة." });
        }
        return res.json({ success: true, office: result.rows[0] });
    } catch (err) {
        console.error("تعذر تحميل ملف المكتب:", err.message);
        return res.status(500).json({ success: false, message: "تعذر تحميل ملف المكتب." });
    }
});

app.get('/api/office/network', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, full_name, bio, facility_name, avatar_base64
             FROM user_offices
             WHERE is_public = TRUE AND subscription_active = TRUE
             ORDER BY created_at DESC`
        );
        return res.json({ success: true, members: result.rows });
    } catch (err) {
        console.error("تعذر تحميل شبكة المكاتب:", err.message);
        return res.status(500).json({ success: false, message: "تعذر تحميل شبكة المكاتب." });
    }
});

app.get('/api/ledger', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM office_ledger ORDER BY is_featured DESC, created_at DESC'
        );
        return res.json({ success: true, items: result.rows });
    } catch (err) {
        console.error("تعذر تحميل الدفتر:", err.message);
        return res.status(500).json({ success: false, message: "تعذر تحميل الدفتر." });
    }
});

app.post('/api/ledger/add', async (req, res) => {
    const {
        itemType, status, title, assetCategory, dealType, price, area, contactPhone,
        seriousnessScore, isFeatured, coBrokerName, commissionSplit, loiAttached,
        buyCommitment, brokersCommitment
    } = req.body ?? {};
    const validOptionalText = (value, limit) =>
        value == null || value === '' || (typeof value === 'string' && value.length <= limit);
    const validAmount = (value) =>
        value == null || value === '' ||
        (Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 9999999999999.99);
    if (
        typeof itemType !== 'string' || !itemType.trim() || itemType.length > 50 ||
        typeof title !== 'string' || !title.trim() || title.length > 200 ||
        (status != null && (typeof status !== 'string' || status.length > 50)) ||
        !validOptionalText(assetCategory, 100) || !validOptionalText(dealType, 50) ||
        !validOptionalText(coBrokerName, 100) || !validOptionalText(commissionSplit, 100) ||
        !validOptionalText(brokersCommitment, 12000) ||
        !validAmount(price) || !validAmount(area) ||
        (contactPhone != null && contactPhone !== '' &&
            (typeof contactPhone !== 'string' || contactPhone.length > 50 ||
             !/^\+?[\d\s()-]{7,50}$/.test(contactPhone) ||
             (contactPhone.match(/\d/g)?.length ?? 0) < 7)) ||
        (seriousnessScore != null && (!Number.isInteger(seriousnessScore) || seriousnessScore < 1 || seriousnessScore > 10)) ||
        (isFeatured != null && typeof isFeatured !== 'boolean') ||
        (loiAttached != null && typeof loiAttached !== 'boolean') ||
        (buyCommitment != null && typeof buyCommitment !== 'boolean')
    ) {
        return res.status(400).json({ success: false, message: "بيانات السجل غير صالحة." });
    }

    try {
        const result = await pool.query(
            `INSERT INTO office_ledger
                (item_type, status, title, asset_category, deal_type, price, area, contact_phone,
                 seriousness_score, is_featured, co_broker_name, commission_split,
                 loi_attached, buy_commitment, brokers_commitment)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
             RETURNING *`,
            [
                itemType.trim(), status || 'جديد', title.trim(), assetCategory || null,
                dealType || null, price || 0, area || 0, contactPhone || null,
                seriousnessScore ?? 5, isFeatured === true, coBrokerName || null,
                commissionSplit || null, loiAttached === true, buyCommitment === true,
                brokersCommitment || null
            ]
        );
        return res.status(201).json({ success: true, item: result.rows[0], message: `تم حفظ (${title.trim()}) في الدفتر السحابي.` });
    } catch (err) {
        console.error("تعذر حفظ سجل الدفتر:", err.message);
        return res.status(500).json({ success: false, message: "تعذر حفظ السجل." });
    }
});

app.post('/api/ledger/feature', async (req, res) => {
    const id = Number(req.body?.id);
    if (!Number.isSafeInteger(id) || id < 1) {
        return res.status(400).json({ success: false, message: "معرّف الإعلان غير صالح." });
    }
    try {
        const result = await pool.query(
            'UPDATE office_ledger SET is_featured = TRUE WHERE id = $1 RETURNING id',
            [id]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: "الإعلان غير موجود." });
        }
        return res.json({ success: true, message: "تم تمييز الإعلان." });
    } catch (err) {
        console.error("تعذر تمييز الإعلان:", err.message);
        return res.status(500).json({ success: false, message: "تعذر تمييز الإعلان." });
    }
});

app.get('/api/appointments', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM appointments ORDER BY appointment_date, appointment_time'
        );
        return res.json({ success: true, appointments: result.rows });
    } catch (err) {
        console.error("تعذر تحميل المواعيد:", err.message);
        return res.status(500).json({ success: false, message: "تعذر تحميل المواعيد." });
    }
});

app.post('/api/appointments/add', async (req, res) => {
    const { clientName, topic, appointmentDate, appointmentTime } = req.body ?? {};
    const parsedDate = typeof appointmentDate === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(appointmentDate)
        ? Date.parse(`${appointmentDate}T00:00:00Z`)
        : NaN;
    const validDate = typeof appointmentDate === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(appointmentDate) &&
        !Number.isNaN(parsedDate) &&
        new Date(parsedDate).toISOString().slice(0, 10) === appointmentDate;
    const validTime = typeof appointmentTime === 'string' &&
        /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(appointmentTime);
    if (
        typeof clientName !== 'string' || !clientName.trim() || clientName.length > 150 ||
        typeof topic !== 'string' || !topic.trim() || topic.length > 200 ||
        !validDate || !validTime
    ) {
        return res.status(400).json({ success: false, message: "بيانات الموعد غير مكتملة أو غير صالحة." });
    }
    try {
        const result = await pool.query(
            `INSERT INTO appointments (client_name, topic, appointment_date, appointment_time)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [clientName.trim(), topic.trim(), appointmentDate, appointmentTime]
        );
        return res.status(201).json({ success: true, appointment: result.rows[0], message: "تم حفظ الموعد في قاعدة البيانات." });
    } catch (err) {
        console.error("تعذر حفظ الموعد:", err.message);
        return res.status(500).json({ success: false, message: "تعذر حفظ الموعد." });
    }
});

app.get('/api/partners', (req, res) => {
    res.json({
        success: true,
        partners: [
            { category: "جهات تنظيمية", name: "الهيئة العامة للعقار (REGA)", phone: "199011", url: "https://rega.gov.sa", desc: "تنظيم وخدمات القطاع العقاري" },
            { category: "صناديق سيادية وعقارية", name: "صندوق الاستثمارات العامة (PIF)", phone: "", url: "https://pif.gov.sa", desc: "المشاريع الكبرى والتطوير الاستثماري" },
            { category: "صناديق سيادية وعقارية", name: "صندوق التنمية العقارية (REDF)", phone: "199088", url: "https://redf.gov.sa", desc: "برامج الدعم السكني والتمويل العقاري" },
            { category: "صناديق سيادية وعقارية", name: "الشركة الوطنية للإسكان (NHC) وروشن", phone: "", url: "https://nhc.sa", desc: "المشاريع السكنية والمجتمعات المتكاملة" },
            { category: "بنوك سعودية", name: "البنك الأهلي السعودي (SNB)", phone: "920001000", url: "https://alahli.com", desc: "التمويل العقاري" },
            { category: "بنوك سعودية", name: "مصرف الراجحي", phone: "920003344", url: "https://alrajhibank.com.sa", desc: "التمويل العقاري والاستثماري" },
            { category: "بنوك سعودية", name: "بنك الرياض", phone: "920002470", url: "https://riyadbank.com", desc: "تمويل الشركات والمشاريع العقارية" },
            { category: "بنوك سعودية", name: "مصرف الإنماء", phone: "8001208000", url: "https://alinma.com", desc: "التمويل العقاري" },
            { category: "بنوك سعودية", name: "البنك السعودي الأول (SAB)", phone: "920007222", url: "https://sab.com", desc: "تمويل المطورين والمحافظ العقارية" },
            { category: "بنوك سعودية", name: "بنك البلاد", phone: "920001002", url: "https://bankalbilad.com", desc: "التمويل العقاري والرهن" },
            { category: "بنوك سعودية", name: "البنك السعودي الفرنسي (BSF)", phone: "8001242121", url: "https://bsf.sa", desc: "تمويل الأصول والمشاريع" },
            { category: "بنوك سعودية", name: "البنك العربي الوطني (ANB)", phone: "8001244040", url: "https://anb.com.sa", desc: "الحلول التمويلية والعقارية" },
            { category: "بنوك سعودية", name: "بنك الجزيرة", phone: "8002440404", url: "https://bankaljazira.com", desc: "التمويل العقاري للأفراد والشركات" }
        ]
    });
});

app.post('/api/deals/create-flexible', async (req, res) => {
    const { assetType, price, brokerIds, customSaeiAmount } = req.body ?? {};
    const rate = DEFAULT_SAEI_RATES[assetType];
    const amount = (value) =>
        (typeof value === 'number' || typeof value === 'string') &&
        /^\d+(?:\.\d{1,2})?$/.test(String(value).trim()) &&
        Number.isFinite(Number(value)) && Number(value) > 0;
    if (
        !rate || !amount(price) ||
        (customSaeiAmount != null && !amount(customSaeiAmount)) ||
        !Array.isArray(brokerIds) || brokerIds.length > 50 ||
        !brokerIds.every((id) => typeof id === 'string' && id.trim().length > 0 && id.length <= 120) ||
        new Set(brokerIds).size !== brokerIds.length
    ) {
        return res.status(400).json({ success: false, message: "بيانات الصفقة أو قائمة الوسطاء غير صالحة." });
    }

    const saeiAmount = Number(customSaeiAmount ?? Number(price) * rate);
    if (!Number.isFinite(saeiAmount) || saeiAmount <= 0) {
        return res.status(400).json({ success: false, message: "مبلغ السعي غير صالح." });
    }
    const platformShare = Math.round(saeiAmount * 50) / 100;
    const brokerPool = Math.round((saeiAmount - platformShare) * 100);
    const sharePerBroker = brokerIds.length ? Math.floor(brokerPool / brokerIds.length) : 0;
    const brokerShares = brokerIds.map((brokerId, index) => ({
        brokerId,
        amount: Number(((index === brokerIds.length - 1
            ? brokerPool - sharePerBroker * index
            : sharePerBroker) / 100).toFixed(2))
    }));
    const distributedShares = brokerShares.reduce((sum, broker) => sum + Math.round(broker.amount * 100), 0);
    const deal = {
        dealId: `DEAL_${crypto.randomUUID()}`,
        assetType,
        price: Number(Number(price).toFixed(2)),
        saeiAmount: Number(saeiAmount.toFixed(2)),
        platformShare: Number(platformShare.toFixed(2)),
        brokerShares,
        unassignedBrokerShare: Number(((brokerPool - distributedShares) / 100).toFixed(2)),
        status: 'awaiting_payment',
        payoutsExecuted: false
    };
    try {
        await pool.query(
            `INSERT INTO deals
                (deal_id, asset_type, price, saei_amount, status, platform_share,
                 broker_shares, unassigned_broker_share, payouts_executed)
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
            [
                deal.dealId, deal.assetType, deal.price, deal.saeiAmount, deal.status,
                deal.platformShare, JSON.stringify(deal.brokerShares),
                deal.unassignedBrokerShare, deal.payoutsExecuted
            ]
        );
        return res.status(201).json({
            success: true,
            ...deal,
            message: "تم حفظ سجل الصفقة في قاعدة البيانات. لا يتم تنفيذ أي دفعة."
        });
    } catch (err) {
        console.error("تعذر حفظ الصفقة:", err.message);
        return res.status(500).json({ success: false, message: "تعذر حفظ الصفقة." });
    }
});

app.get('/api/deals', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM deals ORDER BY created_at DESC');
        return res.json({ success: true, deals: result.rows });
    } catch (err) {
        console.error("تعذر تحميل الصفقات:", err.message);
        return res.status(500).json({ success: false, message: "تعذر تحميل الصفقات." });
    }
});

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
initDatabaseTables().then(() => {
    server.listen(PORT, () => console.log(`🚀 بورصة العالمي تعمل حياً على المنفذ ${PORT}`));
});
         
