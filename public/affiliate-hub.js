﻿﻿(function () {
  function injectAffiliatePartnersAndPrivacy() {
    const affiliateTarget = document.getElementById('affiliate-marketplace') || document.querySelector('main') || document.body;
    if (affiliateTarget && !document.getElementById('vip-global-affiliates')) {
      const box = document.createElement('div');
      box.id = 'vip-global-affiliates';
      box.style.cssText = 'border: 2px solid #10b981; border-radius: 14px; padding: 18px; margin: 18px auto; background: rgba(15, 23, 42, 0.94); color: #f8fafc;';
      box.innerHTML = `
        <div style="border-bottom:1px solid #334155; padding-bottom:10px; margin-bottom:14px;">
          <span style="background:#10b981; color:#000; padding:3px 10px; border-radius:20px; font-size:12px; font-weight:bold;">GLOBAL AFFILIATE & INFLUENCERS HUB</span>
          <h3 style="color:#d4af37; margin:6px 0 4px;">🛍️ بوابة منصات التسويق بالعمولة (أمازون • سلة • زد • مخازن) والمشاهير</h3>
          <p style="font-size:13px; color:#cbd5e1; margin:0;">روابط الشراكة والتواصل المباشر للمالك، وروابط التسويق للمستخدمين والمشاهير مع حفظ حق المنصة كوسيط ومسوق في كل عملية.</p>
        </div>

        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:10px; margin-bottom:14px;">
          <div style="background:#1e293b; padding:12px; border-radius:10px; border:1px solid #334155;">
            <strong style="color:#f59e0b;">📦 أمازون السعودية (Amazon.sa)</strong>
            <p style="font-size:12px; color:#94a3b8; margin:6px 0;">برنامج شركاء أمازون للتسويق بالعمولة</p>
            <a href="https://amazon.sa" target="_blank" rel="noopener" style="display:inline-block; background:#f59e0b; color:#000; padding:5px 10px; border-radius:6px; font-size:12px; font-weight:bold; text-decoration:none;">تواصل وشراكة / تسويق</a>
          </div>

          <div style="background:#1e293b; padding:12px; border-radius:10px; border:1px solid #334155;">
            <strong style="color:#38bdf8;">🛒 منصة سلة (Salla)</strong>
            <p style="font-size:12px; color:#94a3b8; margin:6px 0;">ربط المتاجر والتسويق بالعمولة لتجار سلة</p>
            <a href="https://salla.com" target="_blank" rel="noopener" style="display:inline-block; background:#38bdf8; color:#000; padding:5px 10px; border-radius:6px; font-size:12px; font-weight:bold; text-decoration:none;">بوابة الشركاء والتواصل</a>
          </div>

          <div style="background:#1e293b; padding:12px; border-radius:10px; border:1px solid #334155;">
            <strong style="color:#a855f7;">🏪 منصة زد (Zid)</strong>
            <p style="font-size:12px; color:#94a3b8; margin:6px 0;">شراكات التجار والتسويق بالعمولة عبر زد</p>
            <a href="https://zid.sa" target="_blank" rel="noopener" style="display:inline-block; background:#a855f7; color:#fff; padding:5px 10px; border-radius:6px; font-size:12px; font-weight:bold; text-decoration:none;">بوابة الشركاء والتواصل</a>
          </div>

          <div style="background:#1e293b; padding:12px; border-radius:10px; border:1px solid #334155;">
            <strong style="color:#10b981;">🏭 مخازن (Makhazen)</strong>
            <p style="font-size:12px; color:#94a3b8; margin:6px 0;">التجارة الإلكترونية والدروبشيبينغ بالعمولة</p>
            <a href="https://makhazen.sa" target="_blank" rel="noopener" style="display:inline-block; background:#10b981; color:#000; padding:5px 10px; border-radius:6px; font-size:12px; font-weight:bold; text-decoration:none;">تواصل وشراكة / تسويق</a>
          </div>
        </div>

        <div style="background:#0f172a; padding:12px; border-radius:10px; border:1px dashed #d4af37;">
          <h4 style="color:#d4af37; margin:0 0 8px;">🌟 بوابة المشاهير والإعلاميين (توليد رابط إحالة موثق بحق المنصة)</h4>
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:8px;">
            <input id="inf-name" placeholder="اسم المشهور / الإعلامي أو الحساب" style="padding:8px; border-radius:6px; border:1px solid #475569; background:#1e293b; color:#fff;">
            <input id="inf-store" placeholder="رابط المتجر أو حساب التواصل (TikTok/Snap/X...)" style="padding:8px; border-radius:6px; border:1px solid #475569; background:#1e293b; color:#fff;">
            <button type="button" id="inf-gen-btn" style="padding:8px; border-radius:6px; border:none; background:#d4af37; color:#000; font-weight:bold; cursor:pointer;">🔗 توليد ونسخ رابط الإحالة الموثق</button>
          </div>
        </div>
      `;
      affiliateTarget.appendChild(box);

      document.getElementById('inf-gen-btn').addEventListener('click', async () => {
        const name = encodeURIComponent(document.getElementById('inf-name').value.trim() || 'vip_partner');
        const refUrl = `${window.location.origin}/?ref=${name}&platform_fee=protected`;
        if (navigator.clipboard) await navigator.clipboard.writeText(refUrl);
        alert(`✅ تم توليد رابط التسويق الموثق للمشهور/الإعلامي وحفظ حق المنصة:\n${refUrl}`);
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectAffiliatePartnersAndPrivacy);
  else injectAffiliatePartnersAndPrivacy();
})();
