'use strict';

const apiStatus = document.getElementById('api-status');
const assetType = document.getElementById('asset-type');
const assetPrice = document.getElementById('asset-price');
const estimate = document.getElementById('saei-live-view');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input-field');
const sendButton = document.getElementById('send-message');
const chatLog = document.getElementById('chat-box-msgs');
const rates = {
  realestate_sale: 0.01,
  realestate_rent: 0.05,
  stocks: 0.005,
  gold: 0.01,
  scrap: 0.02,
};

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
chatForm.addEventListener('submit', submitMessage);
updateEstimate();
checkApiHealth();
