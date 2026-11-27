﻿﻿(function () {
  let platformRate = 0.01; // 1% مبدئياً ثم يرفع إلى 2.5%

  function injectUnifiedDealRoom() {
    const target = document.querySelector('main') || document.body;
    if (!target || document.getElementById('vip-deal-room-hub')) return;

    const section = document.createElement('section');
    section.id = 'vip-deal-room-hub';
    section.className = 'section-box';
    section.style.cssText = 'border: 2px solid #d4af37; border-radius: 14px; padding: 18px; margin: 18px auto; background: rgba(15, 23, 42, 0.92); color: #f8fafc;';
    section.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; border-bottom:1px solid #334155; padding-bottom:12px;">
        <div>
          <span style="background:#d4af37; color:#000; padding:3px 10px; border-radius:20px; font-size:12px; font-weight:bold;">UNIFIED DEAL ROOM</span>
          <h2 style="color:#d4af37; margin:6px 0 2px;">🤝 غرفة الصفقة والتفاوض الموحدة (ربط المالك + الوسيط + المستثمر)</h2>
          <p style="font-size:13px; color:#cbd5e1; margin:0;">تجمع أطراف الصفقة في مساحة واحدة لتبادل العقود، الاتصال الصوتي/المرئي، والعرض 3D/5D مع حفظ حق المنصة الموثق.</p>
        </div>
        <div style="background:#1e293b; padding:10px; border-radius:10px; border:1px solid #d4af37;">
          <label style="font-size:12px; color:#d4af37; display:block; margin-bottom:4px;">⚖️ نسبة سعي المنصة المعتمدة:</label>
          <select id="vip-rate-selector" style="padding:6px; border-radius:6px; background:#090d16; color:#fff; border:1px solid #d4af37;">
            <option value="0.01" selected>1% (نسبة الإطلاق الترويجية الحالية)</option>
            <option value="0.025">2.5% (النسبة النظامية المعتمدة لاحقاً)</option>
          </select>
        </div>
      </div>

      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:12px; margin-top:14px;">
        <div style="background:#1e293b; padding:12px; border-radius:10px;">
          <h4 style="color:#d4af37; margin:0 0 8px;">1️⃣ أطراف الصفقة المربوطة</h4>
          <input id="dr-owner" placeholder="اسم / صفة المالك" style="width:100%; padding:8px; margin-bottom:6px; border-radius:6px; border:1px solid #475569; background:#090d16; color:#fff;">
          <input id="dr-broker" placeholder="اسم الوسيط / المسوق (عقد وساطة إضافي)" style="width:100%; padding:8px; margin-bottom:6px; border-radius:6px; border:1px solid #475569; background:#090d16; color:#fff;">
          <input id="dr-buyer" placeholder="اسم المشتري / المستثمر" style="width:100%; padding:8px; border-radius:6px; border:1px solid #475569; background:#090d16; color:#fff;">
        </div>

        <div style="background:#1e293b; padding:12px; border-radius:10px;">
          <h4 style="color:#d4af37; margin:0 0 8px;">2️⃣ قيمة الصفقة وتقسيم السعي وحق المنصة</h4>
          <input id="dr-amount" type="number" placeholder="قيمة الصفقة بالريال (مثال: 1000000)" style="width:100%; padding:8px; margin-bottom:6px; border-radius:6px; border:1px solid #475569; background:#090d16; color:#fff;">
          <input id="dr-broker-share" type="number" value="50" min="0" max="100" placeholder="نسبة الوسيط من المتبقي (%)" style="width:100%; padding:8px; margin-bottom:6px; border-radius:6px; border:1px solid #475569; background:#090d16; color:#fff;">
          <div id="dr-calc-output" style="font-size:13px; color:#10b981; font-weight:bold; margin-top:6px;">💰 نصيب المنصة الموثق: 0 ريال</div>
        </div>

        <div style="background:#1e293b; padding:12px; border-radius:10px;">
          <h4 style="color:#d4af37; margin:0 0 8px;">3️⃣ أدوات التفاوض والعرض المباشر</h4>
          <button type="button" id="dr-create-call" style="width:100%; padding:8px; margin-bottom:6px; border-radius:6px; border:none; background:#d4af37; color:#000; font-weight:bold; cursor:pointer;">🎥 بدء اجتماع مرئي وصوتي مشفر</button>
          <button type="button" id="dr-open-3d" style="width:100%; padding:8px; margin-bottom:6px; border-radius:6px; border:none; background:#2563eb; color:#fff; font-weight:bold; cursor:pointer;">🌐 عرض تفاعلي 3D / 5D للموقع</button>
          <button type="button" id="dr-share-deal" style="width:100%; padding:8px; border-radius:6px; border:none; background:#10b981; color:#fff; font-weight:bold; cursor:pointer;">📤 دعوة الأطراف وتوثيق العقد</button>
        </div>
      </div>
    `;

    target.insertBefore(section, target.firstChild);

    const amountEl = document.getElementById('dr-amount');
    const rateEl = document.getElementById('vip-rate-selector');
    const shareEl = document.getElementById('dr-broker-share');
    const outEl = document.getElementById('dr-calc-output');

    function recalc() {
      const val = parseFloat(amountEl.value) || 0;
      platformRate = parseFloat(rateEl.value) || 0.01;
      const brokerPct = Math.min(100, Math.max(0, parseFloat(shareEl.value) || 0));
      const totalCommission = val * platformRate;
      const platformCut = totalCommission * 0.5;
      const partiesCut = (totalCommission - platformCut) * (brokerPct / 100);
      outEl.innerHTML = `💰 إجمالي السعي (${(platformRate * 100).toFixed(1)}%): ${totalCommission.toLocaleString('ar-SA')} ريال<br>🏛️ حق المنصة الموثق: ${platformCut.toLocaleString('ar-SA')} ريال | 🤝 حصة الوسيط: ${partiesCut.toLocaleString('ar-SA')} ريال`;
    }

    amountEl.addEventListener('input', recalc);
    rateEl.addEventListener('change', recalc);
    shareEl.addEventListener('input', recalc);

    document.getElementById('dr-create-call').addEventListener('click', () => {
      const btn = document.getElementById('live-create-room') || document.querySelector('[data-action="create-live-room"]');
      if (btn) { btn.click(); btn.scrollIntoView({ behavior: 'smooth' }); }
      else { window.open('https://google.com', '_blank', 'noopener'); }
    });

    document.getElementById('dr-open-3d').addEventListener('click', () => {
      const modal = document.getElementById('panorama-modal');
      if (modal) { modal.hidden = false; modal.style.display = 'flex'; }
      else { alert('العارض التفاعلي 3D / 5D جاهز؛ اختر أي عقار مزوّد بصورة بانورامية لاستعراضه.'); }
    });

    document.getElementById('dr-share-deal').addEventListener('click', async () => {
      const summary = `🤝 دعوة غرفة صفقة موحدة — بورصة العالمي VIP\nالمالك: ${document.getElementById('dr-owner').value || 'محدد'}\nالوسيط: ${document.getElementById('dr-broker').value || 'محدد'}\nالمستثمر: ${document.getElementById('dr-buyer').value || 'محدد'}\n${outEl.innerText}\nالرابط: ${window.location.href}`;
      if (navigator.clipboard) await navigator.clipboard.writeText(summary);
      alert('✅ تم نسخ بطاقة الدعوة وتفاصيل السعي الموثق لإرسالها للأطراف عبر واتساب أو الاجتماع!');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectUnifiedDealRoom);
  else injectUnifiedDealRoom();
})();
