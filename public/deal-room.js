(function () {
  let platformRate = 0.01;
  let brokers = [{ name: '', license: '', iban: '', share: 100 }];

  function injectUnifiedDealRoom() {
    const target = document.querySelector('main') || document.body;
    if (!target) return;
    const old = document.getElementById('vip-deal-room-hub');
    if (old) old.remove();

    const section = document.createElement('section');
    section.id = 'vip-deal-room-hub';
    section.className = 'section-box';
    section.style.cssText = 'border: 2px solid #d4af37; border-radius: 14px; padding: 18px; margin: 18px auto; background: rgba(15, 23, 42, 0.96); color: #f8fafc;';
    section.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; border-bottom:1px solid #334155; padding-bottom:12px;">
        <div>
          <span style="background:#d4af37; color:#000; padding:3px 10px; border-radius:20px; font-size:12px; font-weight:bold;">UNIFIED DEAL & ESCROW ROOM</span>
          <h2 style="color:#d4af37; margin:6px 0 2px;">🤝 غرفة الصفقة والتفاوض الموحدة وتوزيع السعي على السعاة</h2>
          <p style="font-size:13px; color:#cbd5e1; margin:0;">عرض تفاصيل الصفقة لجميع الأطراف، توزيع السعي على أي عدد من السعاة (1 إلى 15+ وسيط)، وإصدار بيان التزام السعاة للاعتماد البنكي مع العقد الأساسي.</p>
        </div>
        <div style="background:#1e293b; padding:10px; border-radius:10px; border:1px solid #d4af37;">
          <label style="font-size:12px; color:#d4af37; display:block; margin-bottom:4px;">⚖️ نسبة سعي المنصة المعتمدة:</label>
          <select id="vip-rate-selector" style="padding:6px; border-radius:6px; background:#090d16; color:#fff; border:1px solid #d4af37;">
            <option value="0.01" selected>1% (نسبة الإطلاق الترويجية الحالية)</option>
            <option value="0.025">2.5% (النسبة النظامية المعتمدة لاحقاً)</option>
          </select>
        </div>
      </div>

      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap:12px; margin-top:14px;">
        <div style="background:#1e293b; padding:12px; border-radius:10px; border:1px solid #38bdf8;">
          <h4 style="color:#38bdf8; margin:0 0 8px;">1️⃣ شرح وعرض تفاصيل الصفقة للأطراف</h4>
          <input id="dr-deal-title" placeholder="عنوان الصفقة / العقار / الأصل" style="width:100%; padding:8px; margin-bottom:6px; border-radius:6px; border:1px solid #475569; background:#090d16; color:#fff;">
          <input id="dr-deal-location" placeholder="الموقع / المساحة / رقم الصك أو الترخيص" style="width:100%; padding:8px; margin-bottom:6px; border-radius:6px; border:1px solid #475569; background:#090d16; color:#fff;">
          <textarea id="dr-deal-specs" rows="3" placeholder="اكتب هنا شرح الصفقة الكامل ومواصفاتها وشروط المالك والمشتري ليظهر لجميع الأطراف..." style="width:100%; padding:8px; margin-bottom:6px; border-radius:6px; border:1px solid #475569; background:#090d16; color:#fff;"></textarea>
          <button type="button" id="dr-publish-board" style="width:100%; padding:8px; border-radius:6px; border:none; background:#38bdf8; color:#000; font-weight:bold; cursor:pointer;">📢 تثبيت وعرض الصفقة لجميع الأطراف</button>
        </div>

        <div style="background:#1e293b; padding:12px; border-radius:10px;">
          <h4 style="color:#d4af37; margin:0 0 8px;">2️⃣ أطراف العقد الأساسي وقيمة الصفقة</h4>
          <input id="dr-owner" placeholder="اسم البائع / المالك (طرف أول)" style="width:100%; padding:8px; margin-bottom:6px; border-radius:6px; border:1px solid #475569; background:#090d16; color:#fff;">
          <input id="dr-buyer" placeholder="اسم المشتري / المستثمر (طرف ثانٍ)" style="width:100%; padding:8px; margin-bottom:6px; border-radius:6px; border:1px solid #475569; background:#090d16; color:#fff;">
          <input id="dr-amount" type="number" placeholder="قيمة الصفقة الإجمالية بالريال" style="width:100%; padding:8px; margin-bottom:6px; border-radius:6px; border:1px solid #475569; background:#090d16; color:#fff;">
          <label style="font-size:12px; color:#cbd5e1;">نسبة المنصة من إجمالي السعي (%):</label>
          <input id="dr-platform-cut-pct" type="number" value="50" min="10" max="90" style="width:100%; padding:6px; margin-top:4px; border-radius:6px; border:1px solid #475569; background:#090d16; color:#fff;">
          <div id="dr-calc-output" style="font-size:13px; color:#10b981; font-weight:bold; margin-top:8px;">💰 إجمالي السعي: 0 ريال</div>
        </div>

        <div style="background:#1e293b; padding:12px; border-radius:10px;">
          <h4 style="color:#d4af37; margin:0 0 8px;">3️⃣ التفاوض المباشر والاعتماد البنكي</h4>
          <button type="button" id="dr-create-call" style="width:100%; padding:8px; margin-bottom:6px; border-radius:6px; border:none; background:#d4af37; color:#000; font-weight:bold; cursor:pointer;">🎥 بدء اجتماع مرئي وصوتي مشفر</button>
          <button type="button" id="dr-open-3d" style="width:100%; padding:8px; margin-bottom:6px; border-radius:6px; border:none; background:#2563eb; color:#fff; font-weight:bold; cursor:pointer;">🌐 عرض تفاعلي 3D / 5D للموقع</button>
          <button type="button" id="dr-bank-sheet" style="width:100%; padding:8px; margin-bottom:6px; border-radius:6px; border:none; background:#10b981; color:#000; font-weight:bold; cursor:pointer;">🏦 إصدار خطاب التزام السعاة للبنك</button>
        </div>
      </div>

      <div style="background:#1e293b; padding:14px; border-radius:10px; margin-top:14px; border:1px solid #d4af37;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
          <h4 style="color:#d4af37; margin:0;">4️⃣ جدول توزيع السعي على الوسطاء والسعاة (يدعم من 1 إلى 15+ وسيط)</h4>
          <div style="display:flex; gap:8px;">
            <button type="button" id="dr-add-broker" style="background:#d4af37; color:#000; border:none; padding:6px 12px; border-radius:6px; font-weight:bold; cursor:pointer;">➕ إضافة وسيط / ساعي</button>
            <button type="button" id="dr-split-equal" style="background:#38bdf8; color:#000; border:none; padding:6px 12px; border-radius:6px; font-weight:bold; cursor:pointer;">⚖️ توزيع متساوٍ على جميع السعاة</button>
          </div>
        </div>
        <div id="dr-brokers-list"></div>
      </div>

      <div id="dr-live-showcase" style="display:none; margin-top:14px; background:#090d16; border:2px solid #10b981; border-radius:10px; padding:16px;">
        <strong style="color:#10b981; font-size:15px;">📜 لوحة الصفقة المعتمدة وخطاب التزام السعاة للتوجيه البنكي</strong>
        <div id="dr-showcase-body" style="margin-top:10px; font-size:13px; color:#e2e8f0; line-height:1.8;"></div>
      </div>
    `;

    target.insertBefore(section, target.firstChild);

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

      outEl.innerHTML = `💰 إجمالي السعي (${(platformRate * 100).toFixed(1)}%): ${totalComm.toLocaleString('ar-SA')} ريال<br>🏛️ حق المنصة الموثق: ${platCut.toLocaleString('ar-SA')} ريال<br>🤝 المتبقي للتوزيع على السعاة (${brokers.length}): ${brokersPool.toLocaleString('ar-SA')} ريال`;

      listEl.innerHTML = brokers.map((b, i) => {
        const bAmount = brokersPool * ((parseFloat(b.share) || 0) / 100);
        return `
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap:6px; background:#090d16; padding:8px; border-radius:8px; margin-bottom:6px; border:1px solid #334155; align-items:center;">
            <input data-idx="${i}" data-field="name" value="${b.name}" placeholder="اسم الوسيط / الساعي #${i + 1}" style="padding:6px; border-radius:5px; border:1px solid #475569; background:#1e293b; color:#fff;">
            <input data-idx="${i}" data-field="license" value="${b.license}" placeholder="رقم الهوية / رخصة فال" style="padding:6px; border-radius:5px; border:1px solid #475569; background:#1e293b; color:#fff;">
            <input data-idx="${i}" data-field="iban" value="${b.iban}" placeholder="رقم الآيبان البنكي IBAN" style="padding:6px; border-radius:5px; border:1px solid #475569; background:#1e293b; color:#fff;">
            <input data-idx="${i}" data-field="share" type="number" step="0.01" value="${b.share}" placeholder="نسبته من حصة السعاة %" style="padding:6px; border-radius:5px; border:1px solid #475569; background:#1e293b; color:#fff;">
            <div style="font-size:12px; color:#10b981; font-weight:bold;">💵 المستحق: ${bAmount.toLocaleString('ar-SA', { maximumFractionDigits: 2 })} ريال</div>
            ${brokers.length > 1 ? `<button type="button" data-del="${i}" style="background:#ef4444; color:#fff; border:none; padding:5px; border-radius:5px; cursor:pointer;">حذف</button>` : ''}
          </div>
        `;
      }).join('');

      listEl.querySelectorAll('input').forEach(inp => {
        inp.addEventListener('input', (e) => {
          const idx = parseInt(e.target.dataset.idx, 10);
          brokers[idx][e.target.dataset.field] = e.target.value;
          if (e.target.dataset.field === 'share') renderBrokers();
        });
      });

      listEl.querySelectorAll('button[data-del]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          brokers.splice(parseInt(e.target.dataset.del, 10), 1);
          renderBrokers();
        });
      });
    }

