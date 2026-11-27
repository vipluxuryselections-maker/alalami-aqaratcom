(function () {
  let platformRate = 0.01;
  let brokers = [{ name: '', license: '', iban: '', share: 100 }];

  function initDealRoom() {
    if (document.getElementById('vip-deal-room-hub')) return;
    const anchor = document.querySelector('header') || document.body.firstElementChild;
    if (!anchor || !anchor.parentNode) return;

    const section = document.createElement('section');
    section.id = 'vip-deal-room-hub';
    section.style.cssText = 'border: 2px solid #d4af37; border-radius: 14px; padding: 18px; margin: 16px auto; max-width: 1180px; background: #0f172a; color: #f8fafc; box-shadow: 0 10px 30px rgba(0,0,0,0.45);';
    section.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; border-bottom:1px solid #334155; padding-bottom:12px;">
        <div>
          <span style="background:#d4af37; color:#000; padding:3px 10px; border-radius:20px; font-size:12px; font-weight:bold;">UNIFIED DEAL, ESCROW & DEFERRED SALE HUB</span>
          <h2 style="color:#d4af37; margin:6px 0 2px;">🤝 غرفة الصفقة الموحدة، توزيع السعي على السعاة، ونموذج الإقرار للبيع الآجل</h2>
          <p style="font-size:13px; color:#cbd5e1; margin:0;">شرح الصفقة لجميع الأطراف، توزيع السعي على 1 إلى 15+ وسيط، وإصدار نموذج الإقرار الرسمي للبيع الآجل (5 دفعات × 20%) وخطاب البنك.</p>
        </div>
        <div style="background:#1e293b; padding:10px; border-radius:10px; border:1px solid #d4af37;">
          <label style="font-size:12px; color:#d4af37; display:block; margin-bottom:4px;">⚖️ نسبة سعي المنصة:</label>
          <select id="vip-rate-selector" style="padding:6px; border-radius:6px; background:#090d16; color:#fff; border:1px solid #d4af37;">
            <option value="0.01" selected>1% (نسبة الإطلاق الترويجية الحالية)</option>
            <option value="0.025">2.5% (النسبة النظامية المعتمدة لاحقاً)</option>
            <option value="0.05">5% (سعي صفقات البيع الآجل المعتمد)</option>
          </select>
        </div>
      </div>

      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap:12px; margin-top:14px;">
        <div style="background:#1e293b; padding:12px; border-radius:10px; border:1px solid #38bdf8;">
          <h4 style="color:#38bdf8; margin:0 0 8px;">1️⃣ شرح وعرض تفاصيل الصفقة للأطراف</h4>
          <input id="dr-deal-title" placeholder="نوع العقار / أرض خام / أصل" style="width:100%; padding:8px; margin-bottom:6px; border-radius:6px; border:1px solid #475569; background:#090d16; color:#fff;">
          <input id="dr-deal-location" placeholder="المدينة / الحي / المساحة (م²) / رقم الصك وتاريخه" style="width:100%; padding:8px; margin-bottom:6px; border-radius:6px; border:1px solid #475569; background:#090d16; color:#fff;">
          <input id="dr-valuation-firm" placeholder="شركة التقييم العقاري وتاريخ التقرير" style="width:100%; padding:8px; margin-bottom:6px; border-radius:6px; border:1px solid #475569; background:#090d16; color:#fff;">
          <textarea id="dr-deal-specs" rows="2" placeholder="شرح الصفقة الكامل وشروط المالك والمشتري المعروضة لجميع الأطراف..." style="width:100%; padding:8px; margin-bottom:6px; border-radius:6px; border:1px solid #475569; background:#090d16; color:#fff;"></textarea>
          <button type="button" id="dr-publish-board" style="width:100%; padding:8px; border-radius:6px; border:none; background:#38bdf8; color:#000; font-weight:bold; cursor:pointer;">📢 تثبيت وعرض الصفقة لجميع الأطراف</button>
        </div>

        <div style="background:#1e293b; padding:12px; border-radius:10px;">
          <h4 style="color:#d4af37; margin:0 0 8px;">2️⃣ أطراف العقد وقيمة الصفقة ونوع السداد</h4>
          <input id="dr-owner" placeholder="اسم المالك الكامل + رقم الهوية الوطنية" style="width:100%; padding:8px; margin-bottom:6px; border-radius:6px; border:1px solid #475569; background:#090d16; color:#fff;">
          <input id="dr-buyer" placeholder="اسم المشتري / الجهة المنفذة (طرف ثانٍ)" style="width:100%; padding:8px; margin-bottom:6px; border-radius:6px; border:1px solid #475569; background:#090d16; color:#fff;">
          <input id="dr-amount" type="number" placeholder="قيمة الصفقة التقديرية بالريال" style="width:100%; padding:8px; margin-bottom:6px; border-radius:6px; border:1px solid #475569; background:#090d16; color:#fff;">
          <select id="dr-sale-type" style="width:100%; padding:8px; margin-bottom:6px; border-radius:6px; border:1px solid #475569; background:#090d16; color:#fff;">
            <option value="cash">بيع نقدي / تحويل مباشر</option>
            <option value="deferred5" selected>بيع آجل (5 دفعات متساوية × 20% خلال 5 أشهر + 5% سعي)</option>
          </select>
          <label style="font-size:12px; color:#cbd5e1;">حصة المنصة من السعي (%):</label>
          <input id="dr-platform-cut-pct" type="number" value="50" min="10" max="90" style="width:100%; padding:6px; margin-top:2px; border-radius:6px; border:1px solid #475569; background:#090d16; color:#fff;">
          <div id="dr-calc-output" style="font-size:12px; color:#10b981; font-weight:bold; margin-top:6px;">💰 إجمالي السعي: 0 ريال</div>
        </div>

        <div style="background:#1e293b; padding:12px; border-radius:10px;">
          <h4 style="color:#d4af37; margin:0 0 8px;">3️⃣ التفاوض والعقود والاعتماد البنكي</h4>
          <button type="button" id="dr-create-call" style="width:100%; padding:8px; margin-bottom:6px; border-radius:6px; border:none; background:#d4af37; color:#000; font-weight:bold; cursor:pointer;">🎥 بدء اجتماع مرئي وصوتي مشفر</button>
          <button type="button" id="dr-deferred-doc" style="width:100%; padding:8px; margin-bottom:6px; border-radius:6px; border:none; background:#f59e0b; color:#000; font-weight:bold; cursor:pointer;">📄 توليد نموذج الإقرار الرسمي (بيع آجل 5 دفعات)</button>
          <button type="button" id="dr-bank-sheet" style="width:100%; padding:8px; margin-bottom:6px; border-radius:6px; border:none; background:#10b981; color:#000; font-weight:bold; cursor:pointer;">🏦 إصدار خطاب التزام السعاة للبنك</button>
        </div>
      </div>

      <div style="background:#1e293b; padding:14px; border-radius:10px; margin-top:14px; border:1px solid #d4af37;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
          <h4 style="color:#d4af37; margin:0;">4️⃣ جدول توزيع السعي على الوسطاء والسعاة (يدعم 1 إلى 15+ وسيط)</h4>
          <div style="display:flex; gap:8px;">
            <button type="button" id="dr-add-broker" style="background:#d4af37; color:#000; border:none; padding:6px 12px; border-radius:6px; font-weight:bold; cursor:pointer;">➕ إضافة وسيط / ساعي</button>
            <button type="button" id="dr-split-equal" style="background:#38bdf8; color:#000; border:none; padding:6px 12px; border-radius:6px; font-weight:bold; cursor:pointer;">⚖️ توزيع متساوٍ على السعاة</button>
          </div>
        </div>
        <div id="dr-brokers-list"></div>
      </div>

      <div id="dr-live-showcase" style="display:none; margin-top:14px; background:#090d16; border:2px solid #10b981; border-radius:10px; padding:16px;">
        <strong style="color:#10b981; font-size:15px;">📜 الوثيقة المعتمدة للصفقة ونموذج الإقرار وبيان السعاة</strong>
        <div id="dr-showcase-body" style="margin-top:10px; font-size:13px; color:#e2e8f0; line-height:1.9;"></div>
      </div>
    `;

    anchor.parentNode.insertBefore(section, anchor.nextSibling);

    const amountEl = document.getElementById('dr-amount');
    const rateEl = document.getElementById('vip-rate-selector');
    const platPctEl = document.getElementById('dr-platform-cut-pct');
    const outEl = document.getElementById('dr-calc-output');
    const listEl = document.getElementById('dr-brokers-list');

    function renderBrokers() {
      const val = parseFloat(amountEl.value) || 0;
      platformRate = parseFloat(rateEl.value) || 0.01;
      const platRatio = (parseFloat(platPctEl.value) || 50) / 100;
      const totalComm = val * platformRate;
      const platCut = totalComm * platRatio;
      const brokersPool = totalComm - platCut;
      const installment = val * 0.20;

      outEl.innerHTML = `💰 إجمالي السعي (${(platformRate * 100).toFixed(1)}%): ${totalComm.toLocaleString('ar-SA')} ريال | 🏛️ حق المنصة: ${platCut.toLocaleString('ar-SA')} ريال<br>📅 الدفعة الواحدة (20%): ${installment.toLocaleString('ar-SA')} ريال × 5 دفعات`;

      listEl.innerHTML = brokers.map((b, i) => {
        const bAmount = brokersPool * ((parseFloat(b.share) || 0) / 100);
        return `
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap:6px; background:#090d16; padding:8px; border-radius:8px; margin-bottom:6px; border:1px solid #334155; align-items:center;">
            <input data-idx="${i}" data-field="name" value="${b.name}" placeholder="اسم الوسيط / الساعي #${i + 1}" style="padding:6px; border-radius:5px; border:1px solid #475569; background:#1e293b; color:#fff;">
            <input data-idx="${i}" data-field="license" value="${b.license}" placeholder="الهوية / رخصة فال" style="padding:6px; border-radius:5px; border:1px solid #475569; background:#1e293b; color:#fff;">
            <input data-idx="${i}" data-field="iban" value="${b.iban}" placeholder="الآيبان البنكي IBAN" style="padding:6px; border-radius:5px; border:1px solid #475569; background:#1e293b; color:#fff;">
            <input data-idx="${i}" data-field="share" type="number" step="0.01" value="${b.share}" placeholder="نسبته %" style="padding:6px; border-radius:5px; border:1px solid #475569; background:#1e293b; color:#fff;">
            <div style="font-size:12px; color:#10b981; font-weight:bold;">💵 المستحق: ${bAmount.toLocaleString('ar-SA', { maximumFractionDigits: 2 })} ريال</div>
