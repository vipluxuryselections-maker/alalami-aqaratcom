'use strict';

const profile = document.getElementById('seller-profile');

function appendDetail(container, label, value) {
  if (!value) return;
  const row = document.createElement('p');
  const heading = document.createElement('strong');
  heading.textContent = `${label}: `;
  row.append(heading, document.createTextNode(String(value)));
  container.append(row);
}

function safeExternalLink(label, href) {
  try {
    const url = new URL(href);
    if (url.protocol !== 'https:') return null;
    const link = document.createElement('a');
    link.className = 'tool-button';
    link.href = url.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = label;
    return link;
  } catch {
    return null;
  }
}

async function loadSellerProfile() {
  const productId = new URLSearchParams(location.search).get('id');
  if (!productId || !/^\d+$/.test(productId)) {
    throw new Error('رابط صفحة التاجر غير صالح.');
  }
  const response = await fetch('/api/products', { headers: { Accept: 'application/json' } });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.success !== true || !Array.isArray(data.products)) {
    throw new Error(data?.message || `تعذر تحميل بيانات التاجر (HTTP ${response.status}).`);
  }
  const product = data.products.find((entry) => String(entry.id) === productId);
  if (!product) throw new Error('المنتج غير متاح أو لم يعد منشوراً.');

  profile.replaceChildren();
  const heading = document.createElement('h2');
  heading.textContent = product.sellerName;
  const name = document.createElement('h3');
  name.textContent = product.name;
  profile.append(heading, name);

  const gallery = document.createElement('div');
  gallery.className = 'product-gallery';
  for (const media of product.media || []) {
    const image = document.createElement('img');
    image.loading = 'lazy';
    image.alt = product.name;
    image.src = `/api/products/${encodeURIComponent(product.id)}/media/${encodeURIComponent(media.id)}`;
    gallery.append(image);
  }
  profile.append(gallery);
  appendDetail(profile, 'التصنيف', product.customCategory || product.category);
  appendDetail(profile, 'الوصف', product.description);
  appendDetail(profile, 'السعر', `${product.price} ريال`);
  appendDetail(profile, 'الكمية المتاحة', product.stockQuantity);
  appendDetail(profile, 'المقاسات', (product.sizes || []).join('، '));
  appendDetail(profile, 'الألوان', (product.colors || []).join('، '));
  appendDetail(profile, 'وسائل الدفع لدى التاجر', (product.paymentOptions || []).join('، '));
  appendDetail(profile, 'الشحن والتوصيل', [
    ...(product.shippingOptions || []),
    ...(product.shippingCarriers || []),
  ].join('، '));
  appendDetail(
    profile,
    'العمولة وحصة المنصة',
    `عمولة المسوق: ${product.commissionValue}${product.commissionType === 'percent' ? '%' : ' ريال'}؛ حصة المنصة من العمولة: ${product.platformCommissionPercent}%`,
  );
  const actions = document.createElement('div');
  actions.className = 'product-actions';
  const phone = document.createElement('a');
  phone.className = 'tool-button';
  phone.href = `tel:${product.sellerPhone}`;
  phone.textContent = 'اتصال بالتاجر';
  actions.append(phone);
  const store = safeExternalLink('متجر التاجر', product.sellerStoreUrl);
  if (store) actions.append(store);
  for (const [index, url] of (product.socialLinks || []).entries()) {
    const social = safeExternalLink(`حساب التاجر ${index + 1}`, url);
    if (social) actions.append(social);
  }
  profile.append(actions);
  const notice = document.createElement('p');
  notice.className = 'compliance-note';
  notice.textContent = 'المدفوعات والشحن والتقسيط تُعرض كخيارات يعلنها التاجر؛ لا تنفذ المنصة دفعاً أو حجزاً أو تسوية مالية.';
  profile.append(notice);
}

loadSellerProfile().catch((error) => {
  console.error('Seller profile request failed:', error);
  profile.replaceChildren();
  const message = document.createElement('p');
  message.className = 'listing-status';
  message.dataset.state = 'error';
  message.textContent = error instanceof TypeError ? 'تعذر الاتصال بالخادم.' : error.message;
  profile.append(message);
});
