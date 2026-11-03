'use strict';

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
  const contractText = document.getElementById('contract-text');
  if (contractText) {
    contractText.textContent = legalDrafts[activeContractAsset]?.[language] || 'مسودة عقد الالتزام والوساطة العام لمنصة العالمي.';
  }
}

function openContractModal(asset) {
  activeContractAsset = asset;
  renderContractDraft();
  const contractModal = document.getElementById('contract-modal');
  if (contractModal) contractModal.style.display = "flex";
}

function closeContractModal(discardRequest = true) {
  const contractModal = document.getElementById('contract-modal');
  if (contractModal) contractModal.style.display = "none";
  if (discardRequest) pendingCompliancePayload = null;
  activeContractAsset = null;
  
  // تفعيل بوابات الاجتماعات والمستندات فوراً بعد توقيع وقبول مسودة الامتثال
  const meetButton = document.getElementById('btn-meet');
  if (meetButton) {
    meetButton.disabled = false;
    meetButton.innerText = "🔗 إنشاء اجتماع فوري عبر Google Meet";
  }

  const docsButton = document.getElementById('btn-docs');
  if (docsButton) {
    docsButton.disabled = false;
    docsButton.innerText = "📤 إرسال ومعالجة المستندات للبنك";
  }
}

// دالة الحساب الفوري الذكية المحدثة لتقرأ من كلا الحقلين ديناميكياً وتدعم مبالغ المليار
function calculateLiveSaei() {
  const assetPrice = document.getElementById('asset-price');
  const propFinalPrice = document.getElementById('prop-final-price');
  const estimate = document.getElementById('saei-live-view');
  const assetType = document.getElementById('asset-type');

  const priceFromExchange = parseFloat(assetPrice ? assetPrice.value : 0) || 0;
  const priceFromOwner = parseFloat(propFinalPrice ? propFinalPrice.value : 0) || 0;
  
  // اختيار القيمة النشطة المكتوبة حالياً بالشاشة
  const activePrice = priceFromExchange > 0 ? priceFromExchange : priceFromOwner;
  
  const asset = assetType ? assetType.value : 'realestate_sale';
  const rate = rates[asset] || 0.01;
  
  if (estimate) {
    const calculatedAmount = activePrice * rate;
    estimate.innerText = `💰 نصيب المنصة التلقائي المتوقع من السعي: ${calculatedAmount.toLocaleString('ar-SA')} ريال قطعي`;
  }
}

async function sendComplianceRequest(payload) {
  const complianceSubmit = document.getElementById('compliance-submit');
  const complianceResult = document.getElementById('compliance-result');
  
  if (complianceSubmit) complianceSubmit.disabled = true;
  if (complianceResult) complianceResult.textContent = 'جاري معالجة الصفقة وتوثيقها بقاعدة البيانات السحابية الحية...';
  
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
  const complianceAssetType = document.getElementById('asset-type-flex');
  const asset = complianceAssetType ? complianceAssetType.value : 'realestate_sale';
  const price = document.getElementById('asset-price-flex-input').value;
  const license = document.getElementById('license-input-flex').value.trim();
  const chamberStamp = document.getElementById('chamber-stamp-checkbox').checked;
  const bypass = document.getElementById('developer-bypass-checkbox').checked;
  const customSaei = document.getElementById('custom-saei-flex').value;

  pendingCompliancePayload = {
    assetType: asset,
    price: price,
    userNationality: document.getElementById('user-nationality-flex').value,
    propertyLocation: document.getElementById('property-location-flex').value,
    licenseNumber: license,
    chamberOfCommerceStampAttached: chamberStamp,
    isSuperDeveloperBypass: bypass,
    customSaeiAmount: customSaei
  };

  openContractModal(asset);
}

document.addEventListener('DOMContentLoaded', () => {
  const assetPrice = document.getElementById('asset-price');
  const propFinalPrice = document.getElementById('prop-final-price');
  const assetType = document.getElementById('asset-type');
  const complianceForm = document.getElementById('compliance-form');
  const acceptContractButton = document.getElementById('accept-contract');
  const cancelContractButton = document.getElementById('cancel-contract');

  // تفعيل الاستماع اللحظي لتغير قيم الأسعار لتحديث السعي فوراً بالأرقام المليارية
  if (assetPrice) assetPrice.addEventListener('input', calculateLiveSaei);
  if (propFinalPrice) propFinalPrice.addEventListener('input', calculateLiveSaei);
  if (assetType) assetType.addEventListener('change', calculateLiveSaei);
  
  if (complianceForm) complianceForm.addEventListener('submit', submitComplianceRequest);
  if (acceptContractButton) acceptContractButton.addEventListener('click', acceptContract);
  if (cancelContractButton) cancelContractButton.addEventListener('click', () => closeContractModal(true));
  
  // تشغيل مبدئي للحساب
  calculateLiveSaei();
});
