'use strict';

const apiStatus = document.getElementById('api-status');
const assetType = document.getElementById('asset-type');
const assetPrice = document.getElementById('asset-price');
const estimate = document.getElementById('saei-live-view');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input-field');
const sendButton = document.getElementById('send-message');
const chatLog = document.getElementById('chat-box-msgs');
const complianceForm = document.getElementById('compliance-form');
const complianceSubmit = document.getElementById('compliance-submit');
const complianceResult = document.getElementById('compliance-result');
const contractModal = document.getElementById('contract-modal');
const contractText = document.getElementById('contract-text');
const acceptContractButton = document.getElementById('accept-contract');
const cancelContractButton = document.getElementById('cancel-contract');
const complianceAssetType = document.getElementById('asset-type-flex');
let pendingCompliancePayload = null;
let modalPreviousFocus = null;
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
    ar:
      'ملخص مراجعة لطلب وساطة عقارية للبيع.\n' +
      'يتطلب الطلب تقديم بيانات التراخيص ذات الصلة ومراجعتها من مختص.\n' +
      'نسبة السعي المعروضة تقديرية وفق إعداد التطبيق (1%)، ولا تمثل اتفاقاً ملزماً أو تحصيلاً.',
    en:
      'Review summary for a real estate sale brokerage request.\n' +
      'Relevant license details must be provided and reviewed by a qualified professional.\n' +
      'The displayed brokerage fee is an estimate based on the app setting (1%); it is not a binding agreement or a payment.',
  }),
  realestate_rent: Object.freeze({
    ar:
      'ملخص مراجعة لطلب وساطة عقارية للإيجار.\n' +
      'يتطلب الطلب تقديم بيانات التراخيص والعقد ذي الصلة ومراجعتها من مختص.\n' +
      'نسبة السعي المعروضة تقديرية وفق إعداد التطبيق (5%)، ولا تمثل اتفاقاً ملزماً أو تحصيلاً.',
    en:
      'Review summary for a real estate rental brokerage request.\n' +
      'Relevant license and contract details must be provided and reviewed by a qualified professional.\n' +
      'The displayed brokerage fee is an estimate based on the app setting (5%); it is not a binding agreement or a payment.',
  }),
  stocks: Object.freeze({
    ar:
      'ملخص مراجعة لطلب متعلق بأسهم غير مدرجة.\n' +
      'يتطلب الطلب التحقق من الملكية والمتطلبات التنظيمية بواسطة مختص.\n' +
      'نسبة السعي المعروضة تقديرية وفق إعداد التطبيق (0.5%)، ولا تمثل اتفاقاً ملزماً أو تحصيلاً.',
    en:
      'Review summary for a request concerning unlisted shares.\n' +
      'Ownership and applicable regulatory requirements must be reviewed by a qualified professional.\n' +
      'The displayed brokerage fee is an estimate based on the app setting (0.5%); it is not a binding agreement or a payment.',
  }),
  gold: Object.freeze({
    ar:
      'ملخص مراجعة لطلب متعلق بالذهب والمعادن.\n' +
      'يتطلب الطلب مراجعة بيانات الترخيص وشهادات المعدن وأي أختام مرفقة من مختص.\n' +
      'نسبة السعي المعروضة تقديرية وفق إعداد التطبيق (1%)، ولا تمثل اتفاقاً ملزماً أو تحصيلاً.',
    en:
      'Review summary for a request concerning gold and other metals.\n' +
      'License details, metal certificates, and any supplied stamps must be reviewed by a qualified professional.\n' +
      'The displayed brokerage fee is an estimate based on the app setting (1%); it is not a binding agreement or a payment.',
  }),
  scrap: Object.freeze({
    ar:
      'ملخص مراجعة لطلب متعلق بالسكراب.\n' +
      'يتطلب الطلب مراجعة بيانات الترخيص والتصاريح والمستندات الأمنية ذات الصلة من مختص.\n' +
      'نسبة السعي المعروضة تقديرية وفق إعداد التطبيق (2%)، ولا تمثل اتفاقاً ملزماً أو تحصيلاً.',
    en:
      'Review summary for a request concerning scrap materials.\n' +
      'License details, permits, and relevant security documents must be reviewed by a qualified professional.\n' +
      'The displayed brokerage fee is an estimate based on the app setting (2%); it is not a binding agreement or a payment.',
  }),
});

function getCurrentLanguage() {
  return document.documentElement.lang.toLowerCase().startsWith('en')
    ? 'en'
    : 'ar';
}

function renderContractDraft() {
  const language = getCurrentLanguage();
  const defaultDraft = language === 'en'
    ? 'Informational request summary.\n' +
      'Information and requirements are subject to independent review. This page does not create a contract or obligation.'
    : 'ملخص معلوماتي للطلب.\n' +
      'تخضع البيانات والمتطلبات لمراجعة مستقلة، ولا تنشئ هذه الصفحة عقداً أو التزاماً.';
  contractText.textContent =
    legalDrafts[activeContractAsset]?.[language] || defaultDraft;
}

function openContractModal(asset) {
  activeContractAsset = asset;
  renderContractDraft();
  modalPreviousFocus = document.activeElement;
  contractModal.hidden = false;
  acceptContractButton.focus();
}

function closeContractModal(discardRequest = true) {
  contractModal.hidden = true;
  if (discardRequest) {
    pendingCompliancePayload = null;
  }
  activeContractAsset = null;
  if (modalPreviousFocus instanceof HTMLElement) {
    modalPreviousFocus.focus();
  }
}

async function sendComplianceRequest(payload) {
  complianceSubmit.disabled = true;
  complianceResult.textContent = 'جارٍ إرسال الطلب...';
  complianceResult.dataset.state = 'pending';

  try {
    const response = await fetch('/api/compliance/validate-deal-flexible', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...payload, draftAcknowledged: true }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        data?.message || `تعذر إرسال الطلب (HTTP ${response.status}).`,
      );
    }

    complianceResult.textContent = [
      data.message,
      data.dealId ? `رقم الطلب: ${data.dealId}.` : '',
      Number.isFinite(data.calculatedSaei)
        ? `السعي التقديري: ${new Intl.NumberFormat('ar-SA', {
            maximumFractionDigits: 2,
          }).format(data.calculatedSaei)} ريال.`
        : '',
    ]
      .filter(Boolean)
      .join(' ');
    complianceResult.dataset.state = 'success';
  } catch (error) {
    console.error('Compliance request failed:', error);
    complianceResult.textContent =
      error instanceof TypeError
        ? 'تعذر الاتصال بالخادم. لم يتم إرسال الطلب.'
        : error.message;
    complianceResult.dataset.state = 'error';
  } finally {
    complianceSubmit.disabled = false;
  }
}

function submitComplianceRequest(event) {
  event.preventDefault();
  if (complianceSubmit.disabled || pendingCompliancePayload) {
    return;
  }

  const asset = complianceAssetType.value;
  const price = document.getElementById('asset-price-flex').value;
  const nationality = document.getElementById('user-nationality-flex').value;
  const propertyLocation = document.getElementById('property-location-flex').value;
  const license = document.getElementById('license-input-flex').value.trim();
  const customSaei = document.getElementById('custom-saei-flex').value;
  const isRealEstate = asset === 'realestate_sale' || asset === 'realestate_rent';

  if (isRealEstate && (!nationality || !propertyLocation)) {
    complianceResult.textContent = 'اختر الجنسية وموقع العقار لإرسال طلب العقار.';
    complianceResult.dataset.state = 'error';
    return;
  }

  pendingCompliancePayload = {
    assetType: asset,
    price,
    licenseNumber: license,
    chamberOfCommerceStampAttached: document.getElementById(
      'chamber-stamp-checkbox',
    ).checked,
  };
  if (isRealEstate) {
    pendingCompliancePayload.userNationality = nationality;
    pendingCompliancePayload.propertyLocation = propertyLocation;
  }
  if (customSaei) {
    pendingCompliancePayload.customSaeiAmount = customSaei;
  }

  complianceResult.textContent = '';
  complianceResult.dataset.state = '';
  openContractModal(asset);
}

async function acceptContractDraft() {
  if (!pendingCompliancePayload || complianceSubmit.disabled) {
    return;
  }

  const payload = pendingCompliancePayload;
  closeContractModal(false);
  pendingCompliancePayload = null;
  await sendComplianceRequest(payload);
}

function updateEstimate() {
  const price = Number(assetPrice.value);
  const rate = rates[assetType.value];
  const total = Number.isFinite(price) && price > 0 && rate ? price * rate : 0;
  estimate.textContent = `${new Intl.NumberFormat('ar-SA', {
    maximumFractionDigits: 2,
  }).format(total)} ريال`;
}

function appendMessage(text, kind, statusText) {
  const message = document.createElement('div');
  message.className = `msg ${kind}`;
  message.append(document.createTextNode(text));

  if (statusText) {
    const status = document.createElement('span');
    status.className = 'message-status';
    status.textContent = statusText;
    message.append(status);
  }

  chatLog.append(message);
  chatLog.scrollTop = chatLog.scrollHeight;
  return message;
}

async function checkApiHealth() {
  try {
    const response = await fetch('/api/health', {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`Health check failed with HTTP ${response.status}`);
    }

    const data = await response.json();
    if (data.success !== true) {
      throw new Error('Health check returned an unsuccessful status');
    }

    apiStatus.textContent = 'الخادم متصل';
    apiStatus.dataset.state = 'online';
  } catch (error) {
    console.error('API health check failed:', error);
    apiStatus.textContent = 'الخادم غير متصل';
    apiStatus.dataset.state = 'offline';
  }
}

async function submitMessage(event) {
  event.preventDefault();
  const messageText = chatInput.value.trim();
  if (!messageText || sendButton.disabled) {
    return;
  }

  sendButton.disabled = true;
  chatInput.disabled = true;
  sendButton.textContent = 'جارٍ الفحص...';
  const messageElement = appendMessage(messageText, 'sent', 'جارٍ فحص الرسالة...');

  try {
    const response = await fetch('/api/ai/monitor-chat', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chatId: 'ROOM_101',
        messageText,
        senderId: 'web_client',
      }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        data?.message || `تعذر فحص الرسالة (HTTP ${response.status}).`,
      );
    }
    if (data?.success !== true || data?.analysed !== true) {
      throw new Error('أعاد الخادم نتيجة فحص غير صالحة.');
    }

    messageElement.querySelector('.message-status').textContent =
      data.suspicious ? 'اكتمل الفحص — رُصدت عبارة تحتاج إلى مراجعة.' : 'اكتمل الفحص.';

    if (data.suspicious) {
      const notice = data.notifiedDevelopers > 0
        ? 'وصل تنبيه للمطورين المتصلين.'
        : 'لم يكن هناك مطور موثّق متصل لتلقي التنبيه.';
      appendMessage(
        `تنبيه: رصد الفحص عبارة مشمولة بالسياسة. ${notice} الفحص لا يحظر الرسالة تلقائياً.`,
        'alert',
      );
    }
  } catch (error) {
    console.error('Chat message scan failed:', error);
    messageElement.querySelector('.message-status').textContent = 'تعذر إكمال الفحص.';
    appendMessage(
      error instanceof TypeError
        ? 'تعذر الاتصال بالخادم. لم تصل نتيجة فحص للرسالة؛ تحقق من تشغيل الخادم ثم أعد المحاولة.'
        : error.message,
      'error',
    );
  } finally {
    chatInput.value = '';
    chatInput.disabled = false;
    sendButton.disabled = false;
    sendButton.textContent = 'فحص وإرسال';
    chatInput.focus();
    chatLog.scrollTop = chatLog.scrollHeight;
  }
}

assetType.addEventListener('change', updateEstimate);
assetPrice.addEventListener('input', updateEstimate);
complianceForm.addEventListener('submit', submitComplianceRequest);
acceptContractButton.addEventListener('click', acceptContractDraft);
cancelContractButton.addEventListener('click', () => closeContractModal());
contractModal.addEventListener('click', (event) => {
  if (event.target === contractModal) {
    closeContractModal();
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !contractModal.hidden) {
    closeContractModal();
  }
});
new MutationObserver(() => {
  if (!contractModal.hidden && activeContractAsset) {
    renderContractDraft();
  }
}).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['lang'],
});
chatForm.addEventListener('submit', submitMessage);
updateEstimate();
checkApiHealth();
