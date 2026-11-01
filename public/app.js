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
const rates = {
  realestate_sale: 0.01,
  realestate_rent: 0.05,
  stocks: 0.005,
  gold: 0.01,
  scrap: 0.02,
};

async function submitComplianceRequest(event) {
  event.preventDefault();
  if (complianceSubmit.disabled) {
    return;
  }

  const asset = document.getElementById('asset-type-flex').value;
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

  const payload = {
    assetType: asset,
    price,
    licenseNumber: license,
    chamberOfCommerceStampAttached: document.getElementById(
      'chamber-stamp-checkbox',
    ).checked,
  };
  if (isRealEstate) {
    payload.userNationality = nationality;
    payload.propertyLocation = propertyLocation;
  }
  if (customSaei) {
    payload.customSaeiAmount = customSaei;
  }

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
      body: JSON.stringify(payload),
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
chatForm.addEventListener('submit', submitMessage);
updateEstimate();
checkApiHealth();
