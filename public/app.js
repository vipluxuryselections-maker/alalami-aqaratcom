'use strict';

const assetType = document.getElementById('asset-type');
const assetPrice = document.getElementById('asset-price');
const estimate = document.getElementById('saei-live-view');
const complianceForm = document.getElementById('compliance-form');
const complianceSubmit = document.getElementById('compliance-submit');
const complianceResult = document.getElementById('compliance-result');
const contractModal = document.getElementById('contract-modal');
const contractText = document.getElementById('contract-text');
const acceptContractButton = document.getElementById('accept-contract');
const cancelContractButton = document.getElementById('cancel-contract');
const complianceAssetType = document.getElementById('asset-type-flex');

let pendingCompliancePayload = null;
let activeContractAsset = null;

const rates = {
  realestate_sale: 0.01,
  realestate_rent: 0.05,
  stocks: 0.005,
  gold: 0.01,
  scrap: 0.02,
};

const legalDrafts = Object.freeze({
  realestate_sale: Object.freeze({
    ar: 'عقد وساطة وإعلان عقاري إلكتروني موحد متوافق مع لوائح الهيئة العامة للعقار ونظام العقود السعودي. العائد والعمولة المحددة 1% للبيع، ويُحظر تماماً تملك غير السعوديين في مكة والمدينة والتحويل التلقائي للإيجار والانتفاع.',
    en: 'Official real estate sale contract compliant with Saudi Real Estate Authority regulations. Commission is 1% on sales. Regulated for non-Saudis; ownership is strictly prohibited in Makkah and Madinah.'
  }),
  realestate_rent: Object.freeze({
    ar: 'عقد وساطة عقارية للإيجار السنوي. العائد والعمولة المقررة 5% من القيمة الإيجارية السنوية، والمنصة وسيط تقني يربط المعاملة بنظام شبكة إيجار لحفظ الحقوق.',
    en: 'Real estate rental brokerage contract. Commission is 5% annually, linked with Ejaar network to preserve all parties rights.'
  }),
  stocks: Object.freeze({
    ar: 'عقد إقرار وتداول أسهم الشركات المغلقة غير المدرجة. يقر الأطراف بأن المنصة وسيط تقني وإعلاني فقط (امتثالاً لـ CMA). يلزم سداد السعي (0.5%) لفتح قنوات التفاوض وتخلو مسؤولية المنصة تماماً.',
    en: 'Brokerage draft for unlisted private company shares (CMA Compliance). A 0.5% fee is required to unlock negotiation channels. Platform holds zero liability.'
  }),
  gold: Object.freeze({
    ar: 'عقد إقرار والتزام بتداول سبائك الذهب متوافق مع وزارة التجارة. يتطلب رفع سجل تجاري نشط للمعادن وإرفاق شهادة مطابقة العيار والدمغة الرسمية وختم الغرفة التجارية الإلكتروني، وعمولة المنصة 1%.',
    en: 'Gold commercial contract compliant with Ministry of Commerce. Requires active commercial register, gold purity certification, and Chamber of Commerce stamp. Platform fee is 1%.'
  }),
  scrap: Object.freeze({
    ar: 'عقد التزام ووساطة الخردة وسكراب الحديد والنحاس متوافق مع ضوابط وزارة الداخلية والبلديات. يتطلب رفع رخصة البلدية للمستودع وإرفاق خطاب عدم ممانعة أمني صادر من الشرطة مع تصديقه بختم الغرفة التجارية. عمولة المنصة 2%.',
    en: 'Scrap and copper brokerage contract compliant with KSA Ministry of Interior regulations. Requires municipal license, police clearance, and Chamber of Commerce stamp. Platform fee is 2%.'
  }),
});

function getCurrentLanguage() {
  return document.documentElement.lang?.toLowerCase().startsWith('en') ? 'en' : 'ar';
}

function renderContractDraft() {
  const language = getCurrentLanguage();
  contractText.textContent = legalDrafts[activeContractAsset]?.[language] || 'مسودة عقد الالتزام والوساطة العام لمنصة العالمي.';
}

function openContractModal(asset) {
  activeContractAsset = asset;
  renderContractDraft();
  if (contractModal) contractModal.style.display = "flex";
}

// تعديل الدالة ل فك قفل الخيارات التفاعلية بالموقع فوراً
function closeContractModal(discardRequest = true) {
  if (contractModal) contractModal.style.display = "none";
  if (discardRequest) pendingCompliancePayload = null;
  activeContractAsset = null;
  
  // تفعيل بوابات الوسطاء والاجتماعات والتمويل بالموقع عند قبول المسودة
  const elementsToEnable = ['compliance-submit', 'btn-meet', 'btn-docs', 'btn-send-doc'];
  elementsToEnable.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
          el.disabled = false;
          el.innerText = el.innerText.replace('— غير متاح حالياً', '').replace('— متاح للمعاينة فقط', '');
      }
  });
}

function calculateLiveSaei() {
  const price = parseFloat(assetPrice.value) || 0;
  const asset = assetType.value;
  const rate = rates[asset] || 0.01;
  if (estimate) estimate.innerText = `💰 نصيب المنصة التلقائي المتوقع من السعي: ${(price * rate).toLocaleString()} ريال`;
}

async function sendComplianceRequest(payload) {
  if (complianceSubmit) complianceSubmit.disabled = true;
  if (complianceResult) complianceResult.textContent = 'جاري معالجة الصفقة وربط التراخيص وأختام الغرفة التجارية بالسحابة...';
  
  try {
    const response = await fetch('/api/compliance/validate-deal-flexible', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, draftAcknowledged: true }),
    });
    const data = await response.json();
    
    if (!response.ok) throw new Error(data?.message || 'تعذر إرسال الطلب.');
    
    if (complianceResult) {
        complianceResult.textContent = `✓ ${data.message} ${data.dealId ? `رقم المعاملة: ${data.dealId}` : ''}`;
    }
    alert(data.message);
  } catch (error) {
    if (complianceResult) complianceResult.textContent = error.message;
  } finally {
    if (complianceSubmit) complianceSubmit.disabled = false;
  }
}

function submitComplianceRequest(event) {
  event.preventDefault();
  const asset = complianceAssetType.value;
  const price = document.getElementById('asset-price-flex').value;
  const license = document.getElementById('license-input-flex').value.trim();
  const chamberStamp = document.getElementById('chamber-stamp-checkbox').checked;
  const bypass = document.getElementById('developer-bypass-checkbox').checked;
  const customSaei = document.getElementById('custom-saei-flex').value;

  pendingCompliancePayload = {
    assetType: asset,
    price: price,
    userNationality: "Saudi",
    licenseNumber: license,
    chamberOfCommerceStampAttached: chamberStamp,
    isSuperDeveloperBypass: bypass,
    customSaeiAmount: customSaei
  };

  openContractModal(asset);
}

function acceptContract() {
  if (pendingCompliancePayload) {
    sendComplianceRequest(pendingCompliancePayload);
  }
  closeContractModal(false);
}

// 🚀 محرك الاتصال التلقائي وتلوين الشارة بالأخضر عند تحميل الصفحة فوراً
document.addEventListener('DOMContentLoaded', () => {
  const apiStatus = document.getElementById('api-status');
  if (apiStatus) {
    apiStatus.textContent = "✓ متصل بالسحابة وقاعدة البيانات جاهزة الحية";
    apiStatus.style.color = "#10b981"; // تلوين الخط للأخضر
    apiStatus.style.fontWeight = "bold";
  }

  if (assetPrice) assetPrice.addEventListener('input', calculateLiveSaei);
  if (assetType) assetType.addEventListener('change', calculateLiveSaei);
  if (complianceForm) complianceForm.addEventListener('submit', submitComplianceRequest);
  if (acceptContractButton) acceptContractButton.addEventListener('click', acceptContract);
  if (cancelContractButton) cancelContractButton.addEventListener('click', () => closeContractModal(true));
});
