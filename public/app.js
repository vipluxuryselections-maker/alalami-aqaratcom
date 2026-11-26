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
const bankAccountsView = document.getElementById('bank-accounts-view');
const contactsView = document.getElementById('contacts-view');
const listingForm = document.getElementById('listing-form');
const listingKind = document.getElementById('listing-kind');
const listingCategory = document.getElementById('listing-category');
const customCategoryField = document.getElementById('custom-category-field');
const customCategory = document.getElementById('custom-category');
const listingSubmit = document.getElementById('listing-submit');
const listingStatus = document.getElementById('listing-status');
const listingResults = document.getElementById('listing-results');
const refreshListingsButton = document.getElementById('refresh-listings');
const listingPath = document.getElementById('listing-path');
const listingContactPhone = document.getElementById('listing-contact-phone');
const listingContactConsent = document.getElementById('listing-contact-consent');
const listingText = document.getElementById('listing-text');
const parserStatus = document.getElementById('parser-status');
const mapPreview = document.getElementById('map-preview');
const mediaInput = document.getElementById('listing-media');
const mediaDropZone = document.getElementById('media-drop-zone');
const mediaPreview = document.getElementById('media-preview');
const careerForm = document.getElementById('career-form');
const careerSubmit = document.getElementById('career-submit');
const careerStatus = document.getElementById('career-status');
const marketSort = document.getElementById('listing-sort');
const partnersList = document.getElementById('partners-list');
const mortgageForm = document.getElementById('mortgage-form');
const mortgageResult = document.getElementById('mortgage-result');
const weatherRegionSelect = document.getElementById('weather-region');
const weatherProvinceSelect = document.getElementById('weather-province');
const weatherCitySelect = document.getElementById('weather-city');
const weatherLocationSearch = document.getElementById('weather-location-search');
const listingRegionSelect = document.getElementById('listing-region');
const listingProvinceSelect = document.getElementById('listing-province');
const listingCitySelect = document.getElementById('listing-city');
const listingLocationSearch = document.getElementById('listing-location-search');
const marketLocationSelect = document.getElementById('market-location');
let pendingCompliancePayload = null;
let modalPreviousFocus = null;
let activeContractAsset = null;
let ledgerItems = [];
let selectedMarketFilter = 'all';
let selectedMarketLocation = '';
let mediaObjectUrls = [];
let selectedMediaFiles = [];
let pendingMediaListingId = null;
let pendingMediaPanorama = false;
let pendingMediaUploadToken = null;
let accessibilityScale = 1;
let staffAccessToken = null;
let superAdminAccessToken = '';
let weatherRequestSequence = 0;
let liveRoomId = null;
let liveSocket = null;
let liveLocalStream = null;
const livePeerConnections = new Map();
let panoramaYaw = 0;
let panoramaPitch = 0;
let panoramaRenderer = null;
let storyItems = [];
let activeStoryGroup = [];
let activeStoryIndex = 0;
let storyProgressTimer = null;
let storyProgressStartedAt = 0;
let storyProgressRemainingMs = 8000;
let storyProgressAnimation = null;
let productImageFiles = [];
let productImageUrls = [];
const favoriteStorageKey = 'aqarat-favorite-listings';
let favoriteIds = new Set();
try {
  const savedFavorites = JSON.parse(localStorage.getItem(favoriteStorageKey) || '[]');
  if (Array.isArray(savedFavorites)) {
    favoriteIds = new Set(savedFavorites.map(String));
  }
} catch (error) {
  console.warn('Could not read locally saved favorites:', error);
}
const rates = {
  realestate_sale: 0.01,
  realestate_rent: 0.05,
  stocks: 0.005,
  gold: 0.01,
  scrap: 0.02,
};
const listingCategories = Object.freeze({
  'real-estate': [
    'فلل',
    'أراضي',
    'شقق',
    'دور',
    'كمباوند',
    'أبراج',
    'قصور',
    'عمائر',
    'محلات',
    'أسواق تجارية',
    'مولات تجارية',
    'مكاتب إدارية',
    'شركات',
    'استراحات',
    'مزارع',
  ],
  asset: [
    'ذهب',
    'فضة',
    'نحاس',
    'حديد',
    'سكراب',
    'ألمنيوم',
    'مستودع',
    'مصنع',
    'بضائع مستوردة',
  ],
});

function addSelectOption(select, value, label, dataset = {}) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  Object.assign(option.dataset, dataset);
  select.append(option);
}

function populateGeographyPicker(regionSelect, provinceSelect, citySelect, onChange) {
  const regions = window.SAUDI_REGIONS;
  if (!Array.isArray(regions) || regions.length === 0) {
    throw new Error('بيانات المناطق الجغرافية غير متاحة.');
  }

  regionSelect.replaceChildren();
  for (const region of regions) addSelectOption(regionSelect, region.name, region.name);

  const updateProvinceOptions = () => {
    const region = regions.find((entry) => entry.name === regionSelect.value);
    provinceSelect.replaceChildren();
    for (const province of region?.provinces ?? []) {
      addSelectOption(provinceSelect, province.name, province.name);
    }
    updateCityOptions();
  };
  const updateCityOptions = () => {
    const region = regions.find((entry) => entry.name === regionSelect.value);
    const province = region?.provinces.find((entry) => entry.name === provinceSelect.value);
    citySelect.replaceChildren();
    for (const city of province?.localities ?? []) {
      addSelectOption(citySelect, city.name, city.name, {
        latitude: String(city.latitude),
        longitude: String(city.longitude),
        region: region.name,
        province: province.name,
      });
    }
    if (citySelect.options.length > 0) citySelect.selectedIndex = 0;
    onChange?.();
  };

  regionSelect.addEventListener('change', updateProvinceOptions);
  provinceSelect.addEventListener('change', updateCityOptions);
  citySelect.addEventListener('change', () => onChange?.());
  regionSelect.selectedIndex = 0;
  updateProvinceOptions();
}

function initializeGeography() {
  const syncListingLocation = () => {
    const selectedCity = listingCitySelect.selectedOptions[0];
    if (selectedCity) {
      document.getElementById('listing-location').value = selectedCity.value;
      document.getElementById('listing-latitude').value = selectedCity.dataset.latitude;
      document.getElementById('listing-longitude').value = selectedCity.dataset.longitude;
    }
  };
  populateGeographyPicker(
    listingRegionSelect,
    listingProvinceSelect,
    listingCitySelect,
    syncListingLocation,
  );
  populateGeographyPicker(
    weatherRegionSelect,
    weatherProvinceSelect,
    weatherCitySelect,
    updateWeather,
  );

  const allLocalities = window.SAUDI_REGIONS.flatMap((region) =>
    region.provinces.flatMap((province) =>
      province.localities.map((locality) => ({
        region: region.name,
        province: province.name,
        ...locality,
        label: `${region.name} / ${province.name} / ${locality.name}`,
      })),
    ),
  );
  const locationOptions = document.getElementById('saudi-location-options');
  const seenLocationOptions = new Set();
  for (const locality of allLocalities) {
    for (const value of [locality.label, locality.name, locality.province, locality.region]) {
      if (seenLocationOptions.has(value)) continue;
      seenLocationOptions.add(value);
      addSelectOption(locationOptions, value, value);
    }
  }

  const selectMatchingLocation = (searchValue, regionSelect, provinceSelect, citySelect) => {
    const query = searchValue.trim();
    if (!query) return false;
    const locality = allLocalities.find((entry) =>
      entry.label === query || entry.name === query,
    );
    if (locality) {
      regionSelect.value = locality.region;
      regionSelect.dispatchEvent(new Event('change'));
      provinceSelect.value = locality.province;
      provinceSelect.dispatchEvent(new Event('change'));
      citySelect.value = locality.name;
      citySelect.dispatchEvent(new Event('change'));
      return true;
    }

    const province = window.SAUDI_REGIONS
      .flatMap((region) => region.provinces.map((entry) => ({ region, entry })))
      .find(({ entry }) => entry.name === query);
    if (province) {
      regionSelect.value = province.region.name;
      regionSelect.dispatchEvent(new Event('change'));
      provinceSelect.value = province.entry.name;
      provinceSelect.dispatchEvent(new Event('change'));
      return true;
    }

    const region = window.SAUDI_REGIONS.find((entry) => entry.name === query);
    if (region) {
      regionSelect.value = region.name;
      regionSelect.dispatchEvent(new Event('change'));
      return true;
    }
    return false;
  };
  listingLocationSearch.addEventListener('input', () => {
    selectMatchingLocation(
      listingLocationSearch.value,
      listingRegionSelect,
      listingProvinceSelect,
      listingCitySelect,
    );
  });
  weatherLocationSearch.addEventListener('input', () => {
    selectMatchingLocation(
      weatherLocationSearch.value,
      weatherRegionSelect,
      weatherProvinceSelect,
      weatherCitySelect,
    );
  });
}

function updateListingCategories() {
  const categories = listingCategories[listingKind.value];
  listingCategory.replaceChildren();
  for (const category of categories) {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    listingCategory.append(option);
  }
  const otherOption = document.createElement('option');
  otherOption.value = '__other__';
  otherOption.textContent = 'أخرى — اكتب التصنيف';
  listingCategory.append(otherOption);
  updateCustomCategoryVisibility();
}

function updateCustomCategoryVisibility() {
  const isCustom = listingCategory.value === '__other__';
  customCategoryField.hidden = !isCustom;
  customCategory.required = isCustom;
  if (!isCustom) {
    customCategory.value = '';
  }
}

function renderLedgerListings() {
  listingResults.replaceChildren();
  const filtered = ledgerItems.filter((item) => {
    if (
      selectedMarketLocation &&
      !String(item.location || '').includes(selectedMarketLocation)
    ) return false;
    const type = String(item.item_type || '');
    switch (selectedMarketFilter) {
      case 'request':
        return type.includes('طلب');
      case 'listing':
        return type.includes('إعلان');
      case 'owner':
        return type.includes('مالك') || String(item.owner_type || '').includes('مالك');
      case 'opportunity':
        return type.includes('فرصة') || type.includes('صفقة');
      case 'featured':
        return item.is_featured === true;
      case 'favorites':
        return favoriteIds.has(String(item.id));
      default:
        return true;
    }
  });

  const sorters = {
    newest: (a, b) => new Date(b.created_at) - new Date(a.created_at),
    oldest: (a, b) => new Date(a.created_at) - new Date(b.created_at),
    serious: (a, b) => Number(b.seriousness_score || 0) - Number(a.seriousness_score || 0),
    'price-desc': (a, b) => Number(b.price || 0) - Number(a.price || 0),
    'price-asc': (a, b) => Number(a.price || 0) - Number(b.price || 0),
    'area-desc': (a, b) => Number(b.area || 0) - Number(a.area || 0),
    'interactions-desc': (a, b) => Number(b.interactions_count || 0) - Number(a.interactions_count || 0),
  };
  filtered.sort(sorters[marketSort.value] || sorters.newest);
  if (filtered.length === 0) {
    const emptyState = document.createElement('p');
    emptyState.className = 'muted';
    emptyState.textContent = selectedMarketFilter === 'favorites'
      ? 'لم تضف إعلانات إلى المفضلة على هذا الجهاز بعد.'
      : 'لا توجد نتائج مطابقة لهذا التصنيف.';
    listingResults.append(emptyState);
    return;
  }

  const formatPrice = new Intl.NumberFormat('ar-SA', { maximumFractionDigits: 2 });
  for (const item of filtered) {
    const card = document.createElement('article');
    card.className = 'listing-card';
    const favorite = document.createElement('button');
    favorite.className = 'favorite-button';
    favorite.type = 'button';
    favorite.setAttribute('aria-label', 'إضافة إلى المفضلة');
    favorite.setAttribute('aria-pressed', String(favoriteIds.has(String(item.id))));
    favorite.textContent = '♥';
    favorite.addEventListener('click', () => {
      const id = String(item.id);
      if (favoriteIds.has(id)) favoriteIds.delete(id);
      else favoriteIds.add(id);
      try {
        localStorage.setItem(favoriteStorageKey, JSON.stringify([...favoriteIds]));
      } catch (error) {
        console.error('Could not save favorites on this device:', error);
      }
      renderLedgerListings();
    });

    const badge = document.createElement('span');
    badge.className = 'listing-kind-badge';
    badge.textContent = [
      item.item_type || 'سجل',
      item.asset_category || 'تصنيف غير محدد',
      item.deal_type || 'غرض غير محدد',
    ].join(' • ');
    const title = document.createElement('h4');
    title.textContent = item.title || 'إعلان بدون عنوان';
    const location = document.createElement('p');
    location.textContent = `الموقع: ${item.location || 'غير محدد'}`;
    const price = document.createElement('p');
    price.textContent = `السعر: ${formatPrice.format(Number(item.price) || 0)} ريال`;
    const area = document.createElement('p');
    area.textContent = `المساحة: ${formatPrice.format(Number(item.area) || 0)} م²`;
    const contactNote = document.createElement('p');
    contactNote.className = 'footnote';
    contactNote.textContent = 'بيانات التواصل خاصة؛ لا تُعرض قبل تسجيل الدخول والتحقق من الصلاحيات.';
    card.append(favorite, badge, title, location, price, area, contactNote);
    for (const media of item.media || []) {
      const mediaUrl = `/api/listing-media/${encodeURIComponent(media.id)}`;
      if (media.isPanorama && media.contentType.startsWith('image/')) {
        const panorama = document.createElement('button');
        panorama.type = 'button';
        panorama.className = 'tool-button';
        panorama.textContent = `عرض بانوراما 360°: ${media.fileName}`;
        panorama.addEventListener('click', () => openPanorama(mediaUrl, media.fileName));
        card.append(panorama);
      } else if (media.contentType.startsWith('video/')) {
        const video = document.createElement('video');
        video.controls = true;
        video.preload = 'metadata';
        video.src = mediaUrl;
        video.setAttribute('aria-label', media.fileName);
        card.append(video);
      } else if (media.contentType.startsWith('image/')) {
        const image = document.createElement('img');
        image.src = mediaUrl;
        image.alt = media.fileName;
        image.loading = 'lazy';
        image.className = 'listing-media-thumb';
        card.append(image);
      } else {
        const fileLink = document.createElement('a');
        fileLink.href = mediaUrl;
        fileLink.textContent = `تنزيل ${media.fileName}`;
        fileLink.rel = 'noopener';
        card.append(fileLink);
      }
    }
    const livePreview = document.createElement('button');
    livePreview.type = 'button';
    livePreview.className = 'tool-button';
    livePreview.textContent = 'إنشاء رابط معاينة حية';
    livePreview.addEventListener('click', () => createLiveRoom());
    card.append(livePreview);
    listingResults.append(card);
  }
}

async function loadLedgerListings() {
  try {
    const response = await fetch('/api/ledger', {
      headers: { Accept: 'application/json' },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.success !== true || !Array.isArray(data.items)) {
      throw new Error(
        data?.message || `تعذر تحميل السجلات (HTTP ${response.status}).`,
      );
    }

    ledgerItems = data.items;
    renderLedgerListings();
  } catch (error) {
    console.error('Ledger listing request failed:', error);
    const errorMessage = document.createElement('p');
    errorMessage.className = 'listing-status';
    errorMessage.dataset.state = 'error';
    errorMessage.textContent =
      error instanceof TypeError
        ? 'تعذر الاتصال بالخادم؛ لم يتم تحميل سجلات محلية بديلة.'
        : error.message;
    listingResults.replaceChildren(errorMessage);
  }
}

async function submitListing(event) {
  event.preventDefault();
  if (listingSubmit.disabled) return;
  if (pendingMediaListingId !== null) {
    listingStatus.textContent = 'أعد رفع وسائط الإعلان المحفوظ قبل إضافة إعلان آخر.';
    listingStatus.dataset.state = 'error';
    return;
  }

  const category = listingCategory.value === '__other__'
    ? customCategory.value.trim()
    : listingCategory.value;
  if (!category) {
    listingStatus.textContent = 'أدخل التصنيف المخصص قبل الحفظ.';
    listingStatus.dataset.state = 'error';
    return;
  }

  listingSubmit.disabled = true;
  listingStatus.textContent = 'جارٍ حفظ الإعلان في قاعدة البيانات...';
  listingStatus.dataset.state = 'pending';
  try {
    const response = await fetch('/api/ledger/add', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
          itemType: listingPath.value,
        status: 'جديد',
        title: document.getElementById('listing-title').value.trim(),
        assetCategory: category,
        dealType: document.getElementById('listing-deal-type').value,
        price: Number(document.getElementById('listing-price').value),
        area: Number(document.getElementById('listing-area').value || 0),
        location: document.getElementById('listing-location').value.trim(),
        latitude: document.getElementById('listing-latitude').value
          ? Number(document.getElementById('listing-latitude').value)
          : undefined,
        longitude: document.getElementById('listing-longitude').value
          ? Number(document.getElementById('listing-longitude').value)
          : undefined,
        ownerType: document.getElementById('listing-owner-type').value.trim(),
        contactPhone: listingContactPhone.value.trim() || undefined,
        contactConsent: listingContactConsent.checked,
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.success !== true) {
      throw new Error(
        data?.message || `تعذر حفظ الإعلان (HTTP ${response.status}).`,
      );
    }
    const savedMediaFiles = selectedMediaFiles.slice();
    if (
      savedMediaFiles.length &&
      (!Number.isSafeInteger(Number(data.item?.id)) ||
        Number(data.item.id) < 1 ||
        typeof data.mediaUploadToken !== 'string')
    ) {
      throw new Error('حُفظ الإعلان، لكن بيانات رفع الوسائط غير متاحة.');
    }
    pendingMediaListingId = savedMediaFiles.length ? data.item?.id : null;
    pendingMediaUploadToken = savedMediaFiles.length ? data.mediaUploadToken : null;
    pendingMediaPanorama = document.getElementById('listing-panorama').checked;
    listingForm.reset();
    listingText.value = '';
    document.getElementById('listing-latitude').value = '';
    document.getElementById('listing-longitude').value = '';
    mapPreview.replaceChildren();
    mapPreview.hidden = true;
    updateListingCategories();
    if (pendingMediaListingId !== null) {
      document.getElementById('media-upload-retry').hidden = false;
      try {
        await uploadSelectedMedia(
          pendingMediaListingId,
          pendingMediaPanorama,
          pendingMediaUploadToken,
        );
        pendingMediaListingId = null;
        pendingMediaPanorama = false;
        pendingMediaUploadToken = null;
        document.getElementById('media-upload-retry').hidden = true;
        clearMediaPreview();
        listingStatus.textContent = `${data.message || 'تم حفظ الإعلان.'} وتم حفظ الوسائط في قاعدة البيانات.`;
        listingStatus.dataset.state = 'success';
      } catch (mediaError) {
        console.error('Listing media upload failed after listing save:', mediaError);
        listingStatus.textContent = `تم حفظ الإعلان، لكن تعذر رفع الوسائط: ${mediaError.message} استخدم زر إعادة الرفع.`;
        listingStatus.dataset.state = 'error';
      }
    } else {
      clearMediaPreview();
      listingStatus.textContent = data.message || 'تم حفظ الإعلان.';
      listingStatus.dataset.state = 'success';
    }
    await loadLedgerListings();
  } catch (error) {
    console.error('Ledger listing save failed:', error);
    listingStatus.textContent =
      error instanceof TypeError
        ? 'تعذر الاتصال بالخادم؛ لم يتم حفظ الإعلان.'
        : error.message;
    listingStatus.dataset.state = 'error';
  } finally {
    listingSubmit.disabled = false;
  }
}

async function retryListingMediaUpload() {
  if (
    pendingMediaListingId === null ||
    !pendingMediaUploadToken ||
    selectedMediaFiles.length === 0
  ) return;
  const retryButton = document.getElementById('media-upload-retry');
  retryButton.disabled = true;
  listingStatus.textContent = 'جارٍ إعادة رفع الوسائط...';
  listingStatus.dataset.state = 'pending';
  try {
    await uploadSelectedMedia(
      pendingMediaListingId,
      pendingMediaPanorama,
      pendingMediaUploadToken,
    );
    pendingMediaListingId = null;
    pendingMediaPanorama = false;
    pendingMediaUploadToken = null;
    retryButton.hidden = true;
    clearMediaPreview();
    listingStatus.textContent = 'تم رفع الوسائط للإعلان المحفوظ.';
    listingStatus.dataset.state = 'success';
    await loadLedgerListings();
  } catch (error) {
    console.error('Listing media retry failed:', error);
    listingStatus.textContent = error instanceof TypeError
      ? 'تعذر الاتصال بالخادم؛ أعد المحاولة لاحقاً.'
      : error.message;
    listingStatus.dataset.state = 'error';
  } finally {
    retryButton.disabled = false;
  }
}

function normalizeArabicDigits(value) {
  return value
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[٫٬،]/g, (separator) => separator === '٫' ? '.' : ',');
}

function extractMapUrl(text) {
  const candidate = text.match(/https?:\/\/[^\s<>"']+/i)?.[0]?.replace(/[),،.]+$/, '');
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    const isAllowedHost = [
      'maps.app.goo.gl',
      'maps.google.com',
      'www.google.com',
      'google.com',
    ].includes(url.hostname.toLowerCase());
    return url.protocol === 'https:' && isAllowedHost ? url.href : null;
  } catch {
    return null;
  }
}

function extractMapCoordinates(text) {
  const coordinatePatterns = [
    /![34]d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/i,
    /@(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/,
    /(?:[?&](?:q|query|destination)=)(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/i,
    /(-?\d{1,2}\.\d+)\s*[,،]\s*(-?\d{1,3}\.\d+)/,
  ];
  for (const pattern of coordinatePatterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const latitude = Number(match[1]);
    const longitude = Number(match[2]);
    if (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude >= 16 &&
      latitude <= 33 &&
      longitude >= 34 &&
      longitude <= 56
    ) {
      return { latitude, longitude };
    }
  }
  return null;
}

function selectLocationFromText(text) {
  const regions = window.SAUDI_REGIONS;
  const localityMatch = regions
    .flatMap((region) =>
      region.provinces.flatMap((province) =>
        province.localities.map((locality) => ({ region, province, locality })),
      ),
    )
    .sort((a, b) => b.locality.name.length - a.locality.name.length)
    .find(({ locality }) => text.includes(locality.name));
  if (localityMatch) {
    listingRegionSelect.value = localityMatch.region.name;
    listingRegionSelect.dispatchEvent(new Event('change'));
    listingProvinceSelect.value = localityMatch.province.name;
    listingProvinceSelect.dispatchEvent(new Event('change'));
    listingCitySelect.value = localityMatch.locality.name;
    listingCitySelect.dispatchEvent(new Event('change'));
    return localityMatch.locality.name;
  }

  const provinceMatch = regions
    .flatMap((region) => region.provinces.map((province) => ({ region, province })))
    .sort((a, b) => b.province.name.length - a.province.name.length)
    .find(({ province }) => text.includes(province.name));
  if (provinceMatch) {
    listingRegionSelect.value = provinceMatch.region.name;
    listingRegionSelect.dispatchEvent(new Event('change'));
    listingProvinceSelect.value = provinceMatch.province.name;
    listingProvinceSelect.dispatchEvent(new Event('change'));
    document.getElementById('listing-latitude').value = '';
    document.getElementById('listing-longitude').value = '';
    return provinceMatch.province.name;
  }

  const regionMatch = regions.find((region) => text.includes(region.name));
  if (regionMatch) {
    listingRegionSelect.value = regionMatch.name;
    listingRegionSelect.dispatchEvent(new Event('change'));
    document.getElementById('listing-latitude').value = '';
    document.getElementById('listing-longitude').value = '';
    return regionMatch.name;
  }
  return null;
}

function analyzeListingText() {
  const text = normalizeArabicDigits(listingText.value.trim());
  if (!text) {
    parserStatus.textContent = 'الصق نص الإعلان أولاً.';
    return;
  }

  const filled = [];
  const categoryMatches = [
    ...listingCategories['real-estate'].map((value) => ({ value, kind: 'real-estate' })),
    ...listingCategories.asset.map((value) => ({ value, kind: 'asset' })),
    { value: 'أراضي', match: 'أرض', kind: 'real-estate' },
    { value: 'فلل', match: 'فيلا', kind: 'real-estate' },
    { value: 'عمائر', match: 'عمارة', kind: 'real-estate' },
    { value: 'شقق', match: 'شقة', kind: 'real-estate' },
  ].sort((a, b) => b.value.length - a.value.length);
  const category = categoryMatches.find(({ value, match }) => text.includes(match || value));
  if (category) {
    listingKind.value = category.kind;
    updateListingCategories();
    listingCategory.value = category.value;
    updateCustomCategoryVisibility();
    filled.push('التصنيف');
  }

  const purpose = [
    ['إيجار', /إيجار|للإيجار|للايجار/],
    ['شراء', /شراء|مطلوب\s+(?:شراء|عقار|أرض)/],
    ['استثمار', /استثمار|استثماري/],
    ['بيع', /بيع|للبيع/],
  ].find(([, pattern]) => pattern.test(text));
  if (purpose) {
    document.getElementById('listing-deal-type').value = purpose[0];
    filled.push('الغرض');
  }

  const priceMatches = [...text.matchAll(/([\d,]+(?:\.\d+)?)\s*(مليار|مليون|ألف|الف|ريال)/g)];
  const priceMatch = priceMatches.find((match) => match[2] !== 'ريال') || priceMatches[0];
  if (priceMatch) {
    const amount = Number(priceMatch[1].replace(/,/g, ''));
    const multiplier = { مليار: 1e9, مليون: 1e6, ألف: 1e3, الف: 1e3, ريال: 1 }[priceMatch[2]];
    if (Number.isFinite(amount * multiplier) && amount * multiplier <= 9999999999999.99) {
      document.getElementById('listing-price').value = String(amount * multiplier);
      filled.push('السعر');
    }
  }

  const areaMatch = text.match(/([\d,]+(?:\.\d+)?)\s*(?:متر(?:\s+مربع)?|م²|م2)/);
  if (areaMatch) {
    const area = Number(areaMatch[1].replace(/,/g, ''));
    if (Number.isFinite(area) && area <= 9999999999999.99) {
      document.getElementById('listing-area').value = String(area);
      filled.push('المساحة');
    }
  }

  const city = selectLocationFromText(text);
  if (city) {
    document.getElementById('listing-location').value = city;
    filled.push('المدينة');
  }

  const phoneMatch = text.match(/(?:\+?966|00966)?[\s-]*0?5(?:[\s-]*\d){8}/);
  if (phoneMatch) {
    let phone = phoneMatch[0].replace(/[\s-]/g, '');
    if (phone.startsWith('00966')) phone = `+966${phone.slice(5)}`;
    else if (phone.startsWith('966')) phone = `+${phone}`;
    listingContactPhone.value = phone;
    listingContactConsent.required = true;
    filled.push('رقم التواصل');
  }

  const title = text.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  if (title && !document.getElementById('listing-title').value.trim()) {
    document.getElementById('listing-title').value = title.slice(0, 200);
    filled.push('العنوان');
  }

  const mapUrl = extractMapUrl(text);
  const coordinates = extractMapCoordinates(text);
  mapPreview.replaceChildren();
  if (mapUrl) {
    const link = document.createElement('a');
    link.href = mapUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'فتح موقع الإعلان في خرائط Google';
    mapPreview.append(link);
    filled.push('رابط الخريطة');
  }
  if (coordinates) {
    document.getElementById('listing-latitude').value = String(coordinates.latitude);
    document.getElementById('listing-longitude').value = String(coordinates.longitude);
    const pin = document.createElement('a');
    pin.href = `https://www.google.com/maps?q=${coordinates.latitude},${coordinates.longitude}`;
    pin.target = '_blank';
    pin.rel = 'noopener noreferrer';
    pin.textContent = `دبوس الموقع: ${coordinates.latitude}, ${coordinates.longitude}`;
    mapPreview.append(pin);
    filled.push('إحداثيات الموقع');
  }
  mapPreview.hidden = mapPreview.childElementCount === 0;

  parserStatus.textContent = filled.length
    ? `تحليل محلي تقريبي؛ راجع القيم قبل الحفظ. تم تعبئة: ${filled.join('، ')}.`
    : 'لم أتعرف على حقول مدعومة. يمكنك إدخالها يدوياً.';
}

function clearMediaPreview() {
  for (const objectUrl of mediaObjectUrls) URL.revokeObjectURL(objectUrl);
  mediaObjectUrls = [];
  selectedMediaFiles = [];
  mediaPreview.replaceChildren();
  mediaInput.value = '';
}

function showMediaPreview(files) {
  const fileList = [...files];
  clearMediaPreview();
  const allowedTypes = new Set([
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/webm', 'video/quicktime', 'application/pdf',
  ]);
  const validFiles = fileList.filter((file) =>
    allowedTypes.has(file.type) && file.size > 0 && file.size <= 3 * 1024 * 1024
  ).slice(0, 5);
  selectedMediaFiles = validFiles;
  if (validFiles.length !== fileList.length) {
    parserStatus.textContent = 'تم تجاهل ملفات غير مدعومة أو أكبر من 3 ميغابايت؛ الحد الأقصى 5 ملفات.';
  }

  for (const file of validFiles) {
    const figure = document.createElement('figure');
    let preview;
    if (file.type === 'application/pdf') {
      preview = document.createElement('span');
      preview.textContent = 'ملف PDF';
    } else {
      const objectUrl = URL.createObjectURL(file);
      mediaObjectUrls.push(objectUrl);
      preview = document.createElement(file.type.startsWith('video/') ? 'video' : 'img');
      preview.src = objectUrl;
    }
    if (preview instanceof HTMLVideoElement) {
      preview.controls = true;
      preview.preload = 'metadata';
    } else if (preview instanceof HTMLImageElement) {
      preview.alt = file.name;
    }
    const caption = document.createElement('figcaption');
    caption.textContent = file.name;
    figure.append(preview, caption);
    mediaPreview.append(figure);
  }
}

function fileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error(`تعذر قراءة الملف ${file.name}.`));
        return;
      }
      resolve(reader.result.slice(reader.result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new Error(`تعذر قراءة الملف ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

async function uploadSelectedMedia(listingId, isPanorama, uploadToken) {
  const files = await Promise.all(selectedMediaFiles.map(async (file) => ({
    name: file.name,
    contentType: file.type,
    data: await fileAsBase64(file),
  })));
  const response = await fetch('/api/listing-media', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${uploadToken}`,
    },
    body: JSON.stringify({ listingId, files, isPanorama }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.success !== true) {
    throw new Error(data?.message || `تعذر رفع الوسائط (HTTP ${response.status}).`);
  }
  return data.media;
}

function openPanorama(url, title) {
  const dialog = document.getElementById('panorama-dialog');
  const image = document.getElementById('panorama-image');
  image.alt = `صورة بانورامية: ${title}`;
  image.hidden = true;
  document.getElementById('panorama-canvas').hidden = false;
  panoramaYaw = 0;
  panoramaPitch = 0;
  image.onload = () => {
    try {
      panoramaRenderer ??= createPanoramaRenderer(
        document.getElementById('panorama-canvas'),
      );
      panoramaRenderer.setImage(image);
      panoramaRenderer.draw(panoramaYaw, panoramaPitch);
    } catch (error) {
      console.error('Panorama renderer initialization failed:', error);
      document.getElementById('panorama-canvas').hidden = true;
      image.hidden = false;
      image.style.transform = 'translateX(0px)';
      image.dataset.offset = '0';
    }
  };
  image.onerror = () => {
    image.hidden = false;
    document.getElementById('panorama-canvas').hidden = true;
  };
  image.src = url;
  dialog.showModal();
}

function createPanoramaRenderer(canvas) {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
  if (!gl) throw new Error('WebGL is unavailable.');

  const compileShader = (type, source) => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Unable to allocate a panorama shader.');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(message || 'Panorama shader compilation failed.');
    }
    return shader;
  };
  const vertexShader = compileShader(
    gl.VERTEX_SHADER,
    'attribute vec2 a_position; varying vec2 v_uv; void main(){ v_uv=a_position*0.5+0.5; gl_Position=vec4(a_position,0.0,1.0); }',
  );
  const fragmentShader = compileShader(
    gl.FRAGMENT_SHADER,
    'precision mediump float; varying vec2 v_uv; uniform sampler2D u_image; uniform vec2 u_resolution; uniform float u_yaw; uniform float u_pitch; void main(){ float aspect=u_resolution.x/u_resolution.y; vec3 ray=normalize(vec3((v_uv.x*2.0-1.0)*aspect,(1.0-v_uv.y*2.0),1.15)); float cy=cos(u_yaw); float sy=sin(u_yaw); ray=vec3(ray.x*cy+ray.z*sy,ray.y,-ray.x*sy+ray.z*cy); float cp=cos(u_pitch); float sp=sin(u_pitch); ray=vec3(ray.x,ray.y*cp-ray.z*sp,ray.y*sp+ray.z*cp); float u=fract(0.5+atan(ray.x,ray.z)/6.28318530718); float v=0.5-asin(clamp(ray.y,-1.0,1.0))/3.14159265359; gl_FragColor=texture2D(u_image,vec2(u,v)); }',
  );
  const program = gl.createProgram();
  if (!program) throw new Error('Unable to allocate a panorama program.');
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || 'Panorama shader linking failed.');
  }
  gl.useProgram(program);

  const positionAttribute = gl.getAttribLocation(program, 'a_position');
  const positionBuffer = gl.createBuffer();
  const texture = gl.createTexture();
  if (positionAttribute < 0 || !positionBuffer || !texture) {
    throw new Error('Unable to initialize the panorama renderer.');
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(positionAttribute);
  gl.vertexAttribPointer(positionAttribute, 2, gl.FLOAT, false, 0, 0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  return {
    setImage(image) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    },
    draw(yaw, pitch) {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = Math.max(1, Math.floor(canvas.clientWidth * pixelRatio));
      const height = Math.max(1, Math.floor(canvas.clientHeight * pixelRatio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
      gl.useProgram(program);
      gl.uniform1i(gl.getUniformLocation(program, 'u_image'), 0);
      gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), width, height);
      gl.uniform1f(gl.getUniformLocation(program, 'u_yaw'), yaw);
      gl.uniform1f(gl.getUniformLocation(program, 'u_pitch'), pitch);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
  };
}

async function submitCareerApplication(event) {
  event.preventDefault();
  if (careerSubmit.disabled) return;
  const resumeFile = document.getElementById('career-resume').files[0];
  if (
    resumeFile &&
    (resumeFile.type !== 'application/pdf' || resumeFile.size > 2 * 1024 * 1024)
  ) {
    careerStatus.textContent = 'السيرة الذاتية يجب أن تكون PDF وألا تتجاوز 2 ميغابايت.';
    careerStatus.dataset.state = 'error';
    return;
  }
  careerSubmit.disabled = true;
  careerStatus.textContent = 'جارٍ إرسال الطلب إلى الخادم...';
  careerStatus.dataset.state = 'pending';
  try {
    const resume = resumeFile
      ? {
          name: resumeFile.name,
          contentType: resumeFile.type,
          data: await fileAsBase64(resumeFile),
        }
      : undefined;
    const response = await fetch('/api/careers/apply', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: document.getElementById('career-name').value.trim(),
        email: document.getElementById('career-email').value.trim(),
        phone: document.getElementById('career-phone').value.trim(),
        role: document.getElementById('career-role').value,
        note: document.getElementById('career-note').value.trim(),
        resume,
        privacyConsent: document.getElementById('career-consent').checked,
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.success !== true) {
      throw new Error(data?.message || `تعذر إرسال الطلب (HTTP ${response.status}).`);
    }
    careerStatus.textContent = data.emailNotificationSent
      ? `تم حفظ الطلب${data.resumeReceived ? ' والسيرة الذاتية' : ''} وإرسال إشعار البريد.`
      : `تم حفظ الطلب${data.resumeReceived ? ' والسيرة الذاتية' : ''} في قاعدة البيانات؛ إشعار البريد غير مهيأ حالياً.`;
    careerStatus.dataset.state = 'success';
    careerForm.reset();
  } catch (error) {
    console.error('Career application failed:', error);
    careerStatus.textContent = error instanceof TypeError
      ? 'تعذر الاتصال بالخادم؛ لم يتم إرسال الطلب.'
      : error.message;
    careerStatus.dataset.state = 'error';
  } finally {
    careerSubmit.disabled = false;
  }
}

async function submitStaffAccount(event) {
  event.preventDefault();
  const status = document.getElementById('staff-admin-status');
  superAdminAccessToken = document.getElementById('super-admin-token').value;
  const permissions = Object.fromEntries(
    [...document.querySelectorAll('[name="staff-permission"]')].map((checkbox) => [
      checkbox.value,
      checkbox.checked,
    ]),
  );
  status.textContent = 'جارٍ إنشاء حساب الموظف...';
  status.dataset.state = 'pending';
  try {
    const response = await fetch('/api/admin/staff-users', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-super-admin-token': superAdminAccessToken,
      },
      body: JSON.stringify({
        username: document.getElementById('staff-username').value.trim(),
        fullName: document.getElementById('staff-name').value.trim(),
        password: document.getElementById('staff-password').value,
        permissions,
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.success !== true) {
      throw new Error(data?.message || `تعذر إنشاء الموظف (HTTP ${response.status}).`);
    }
    status.textContent = `تم إنشاء حساب ${data.staff.full_name} بصلاحياته المحددة.`;
    status.dataset.state = 'success';
    document.getElementById('staff-create-form').reset();
    await loadStaffUsers();
  } catch (error) {
    console.error('Staff account creation failed:', error);
    status.textContent = error instanceof TypeError
      ? 'تعذر الاتصال بالخادم.'
      : error.message;
    status.dataset.state = 'error';
  }
}

async function loadStaffUsers() {
  const results = document.getElementById('staff-admin-results');
  const status = document.getElementById('staff-admin-status');
  if (!superAdminAccessToken) {
    status.textContent = 'أدخل رمز المالك الأعلى أولاً.';
    status.dataset.state = 'error';
    return;
  }
  try {
    const response = await fetch('/api/admin/staff-users', {
      headers: { Accept: 'application/json', 'x-super-admin-token': superAdminAccessToken },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.success !== true || !Array.isArray(data.staff)) {
      throw new Error(data?.message || `تعذر تحميل الموظفين (HTTP ${response.status}).`);
    }
    results.replaceChildren();
    for (const staff of data.staff) {
      const card = document.createElement('article');
      card.className = 'partner-card';
      const name = document.createElement('h4');
      name.textContent = `${staff.full_name} (@${staff.username})`;
      const detail = document.createElement('p');
      const permissions = Object.entries(staff.permissions || {})
        .filter(([, enabled]) => enabled)
        .map(([permission]) => permission)
        .join('، ') || 'بدون صلاحيات تشغيلية';
      detail.textContent = `الصلاحيات: ${permissions} · ${staff.is_active ? 'نشط' : 'موقوف'}`;
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'tool-button';
      toggle.textContent = staff.is_active ? 'إيقاف الحساب' : 'إعادة تفعيل الحساب';
      toggle.addEventListener('click', async () => {
        try {
          const updateResponse = await fetch(`/api/admin/staff-users/${encodeURIComponent(staff.id)}`, {
            method: 'PATCH',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              'x-super-admin-token': superAdminAccessToken,
            },
            body: JSON.stringify({ isActive: !staff.is_active }),
          });
          const updateData = await updateResponse.json().catch(() => null);
          if (!updateResponse.ok || updateData?.success !== true) {
            throw new Error(updateData?.message || 'تعذر تحديث الحساب.');
          }
          await loadStaffUsers();
        } catch (error) {
          console.error('Staff status update failed:', error);
          status.textContent = error.message;
          status.dataset.state = 'error';
        }
      });
      card.append(name, detail, toggle);
      results.append(card);
    }
    status.textContent = `عدد حسابات الموظفين: ${data.staff.length}.`;
    status.dataset.state = 'success';
  } catch (error) {
    console.error('Staff account list request failed:', error);
    status.textContent = error instanceof TypeError ? 'تعذر الاتصال بالخادم.' : error.message;
    status.dataset.state = 'error';
  }
}

function renderStaffRecords(records, section) {
  const results = document.getElementById('staff-results');
  results.replaceChildren();
  if (records.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'لا توجد سجلات حالياً.';
    results.append(empty);
    return;
  }

  for (const record of records) {
    const card = document.createElement('article');
    card.className = 'partner-card';
    const title = document.createElement('h4');
    title.textContent =
      record.title || record.name || record.creatorName ||
      record.full_name || record.client_name || 'سجل';
    const detail = document.createElement('p');
    detail.textContent = [
      record.role,
      record.category,
      record.creatorName,
      record.caption,
      record.topic,
      record.location,
      record.status,
      record.created_at,
    ].filter(Boolean).join(' · ');
    card.append(title, detail);

    if (section === 'stories') {
      const pin = document.createElement('button');
      pin.type = 'button';
      pin.className = 'tool-button';
      pin.textContent = record.isPinned ? 'إلغاء تثبيت القصة' : 'تثبيت القصة VIP';
      pin.addEventListener('click', async () => {
        const updated = await requestStaffArea(
          `/api/staff/stories/${encodeURIComponent(record.id)}/pin`,
          'PATCH',
          { pinned: !record.isPinned },
        );
        if (updated?.success) {
          await requestStaffArea('/api/staff/stories', 'GET', null, 'stories');
          await loadStories();
        }
      });
      card.append(pin);
    }

    if (section === 'products') {
      const stock = document.createElement('input');
      stock.type = 'number';
      stock.min = '0';
      stock.step = '1';
      stock.value = String(record.stockQuantity);
      stock.setAttribute('aria-label', `المخزون الجديد للمنتج ${record.name}`);
      const update = document.createElement('button');
      update.type = 'button';
      update.className = 'tool-button';
      update.textContent = record.isActive ? 'تحديث المخزون / إيقاف' : 'تحديث المخزون / تفعيل';
      update.addEventListener('click', async () => {
        const updated = await requestStaffArea(
          `/api/staff/products/${encodeURIComponent(record.id)}`,
          'PATCH',
          { isActive: !record.isActive, stockQuantity: Number(stock.value) },
        );
        if (updated?.success) {
          await requestStaffArea('/api/staff/products', 'GET', null, 'products');
          await loadProducts();
        }
      });
      card.append(stock, update);
    }

    if (section === 'applications' && record.resume_name) {
      const resumeButton = document.createElement('button');
      resumeButton.type = 'button';
      resumeButton.className = 'tool-button';
      resumeButton.textContent = `تنزيل السيرة الذاتية: ${record.resume_name}`;
      resumeButton.addEventListener('click', async () => {
        try {
          const response = await fetch(
            `/api/staff/job-applications/${encodeURIComponent(record.id)}/resume`,
            { headers: { Authorization: `Bearer ${staffAccessToken}` } },
          );
          if (!response.ok) {
            const data = await response.json().catch(() => null);
            throw new Error(data?.message || `تعذر تنزيل الملف (HTTP ${response.status}).`);
          }
          const objectUrl = URL.createObjectURL(await response.blob());
          const download = document.createElement('a');
          download.href = objectUrl;
          download.download = record.resume_name;
          download.click();
          window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
        } catch (error) {
          console.error('Resume download failed:', error);
          document.getElementById('staff-status').textContent =
            error instanceof TypeError ? 'تعذر الاتصال بالخادم.' : error.message;
          document.getElementById('staff-status').dataset.state = 'error';
        }
      });
      card.append(resumeButton);
    }

    if (section === 'listings') {
      const reviewStatus = document.createElement('select');
      for (const value of ['قيد المراجعة', 'مقبول', 'مرفوض', 'منشور']) {
        addSelectOption(reviewStatus, value, value);
      }
      reviewStatus.value = ['قيد المراجعة', 'مقبول', 'مرفوض', 'منشور'].includes(record.status)
        ? record.status
        : 'قيد المراجعة';
      const save = document.createElement('button');
      save.type = 'button';
      save.className = 'tool-button';
      save.textContent = 'حفظ قرار المراجعة';
      save.addEventListener('click', async () => {
        await requestStaffArea(
          `/api/staff/listings/${encodeURIComponent(record.id)}`,
          'PATCH',
          { status: reviewStatus.value },
        );
        await requestStaffArea('/api/staff/listings', 'GET', null, 'listings');
      });
      card.append(reviewStatus, save);
    }
    results.append(card);
  }
}

async function requestStaffArea(url, method = 'GET', payload = null, section = '') {
  const status = document.getElementById('staff-status');
  try {
    const response = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        ...(payload ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `Bearer ${staffAccessToken}`,
      },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.success !== true) {
      throw new Error(data?.message || `تعذر إكمال العملية (HTTP ${response.status}).`);
    }
    if (section) {
      const records = data.applications || data.requests || data.listings || data.customers || [];
      renderStaffRecords(records, section);
      status.textContent = `تم تحميل ${records.length} سجل.`;
      status.dataset.state = 'success';
    }
    return data;
  } catch (error) {
    console.error('Staff operation failed:', error);
    status.textContent = error instanceof TypeError ? 'تعذر الاتصال بالخادم.' : error.message;
    status.dataset.state = 'error';
    return null;
  }
}

async function signInStaff(event) {
  event.preventDefault();
  const status = document.getElementById('staff-status');
  try {
    const response = await fetch('/api/staff/login', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: document.getElementById('staff-login-username').value.trim(),
        password: document.getElementById('staff-login-password').value,
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.success !== true || typeof data.accessToken !== 'string') {
      throw new Error(data?.message || `تعذر تسجيل الدخول (HTTP ${response.status}).`);
    }
    staffAccessToken = data.accessToken;
    document.getElementById('staff-login-form').hidden = true;
    document.getElementById('staff-console').hidden = false;
    document.getElementById('staff-session-label').textContent =
      `مرحباً ${data.staff.fullName} — صلاحيات الوصول محدودة حسب التفويض.`;
    const tools = document.getElementById('staff-tools');
    tools.replaceChildren();
    const areas = [
      ['recruitment', 'طلبات التوظيف', '/api/staff/job-applications', 'applications'],
      ['manageRequests', 'الطلبات والمواعيد', '/api/staff/requests', 'requests'],
      ['reviewListings', 'مراجعة الإعلانات', '/api/staff/listings', 'listings'],
      ['crm', 'متابعة العملاء', '/api/staff/crm', 'customers'],
      ['manageProducts', 'إدارة المنتجات', '/api/staff/products', 'products'],
      ['manageStories', 'إدارة القصص', '/api/staff/stories', 'stories'],
    ];
    for (const [permission, label, url, key] of areas) {
      if (data.staff.permissions[permission] !== true) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'market-tab';
      button.textContent = label;
      button.addEventListener('click', () => {
        document.getElementById('staff-crm-form').hidden = permission !== 'crm';
        requestStaffArea(url, 'GET', null, key);
      });
      tools.append(button);
    }
    document.getElementById('staff-crm-form').hidden =
      data.staff.permissions.crm !== true;
    document.getElementById('product-create-details').hidden =
      data.staff.permissions.manageProducts !== true;
    status.textContent = 'تم تسجيل الدخول؛ صلاحياتك محددة من الإدارة.';
    status.dataset.state = 'success';
  } catch (error) {
    console.error('Staff sign-in failed:', error);
    status.textContent = error instanceof TypeError ? 'تعذر الاتصال بالخادم.' : error.message;
    status.dataset.state = 'error';
  }
}

async function submitCrmFollowup(event) {
  event.preventDefault();
  const data = await requestStaffArea('/api/staff/crm', 'POST', {
    fullName: document.getElementById('crm-name').value.trim(),
    phone: document.getElementById('crm-phone').value.trim(),
    status: document.getElementById('crm-status').value,
    note: document.getElementById('crm-note').value.trim(),
    privacyConsent: document.getElementById('crm-consent').checked,
  });
  if (data?.success) {
    document.getElementById('staff-crm-form').reset();
    await requestStaffArea('/api/staff/crm', 'GET', null, 'customers');
  }
}

function updateLiveStatus(message, state = '') {
  const status = document.getElementById('live-room-status');
  status.textContent = message;
  status.dataset.state = state;
}

function addLiveChatMessage(sender, text) {
  const entry = document.createElement('p');
  entry.textContent = `${sender}: ${text}`;
  document.getElementById('live-chat-log').append(entry);
}

function getLiveRoomId(value) {
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed, window.location.origin);
    const fromUrl = url.searchParams.get('live');
    if (fromUrl && /^[a-f0-9]{64}$/.test(fromUrl)) return fromUrl;
  } catch (error) {
    console.warn('Live invite URL could not be parsed:', error);
  }
  return /^[a-f0-9]{64}$/.test(trimmed) ? trimmed : null;
}

function ensureLivePeerConnection(peerId) {
  if (livePeerConnections.has(peerId)) return livePeerConnections.get(peerId);
  if (!liveSocket || typeof RTCPeerConnection !== 'function') {
    throw new Error('هذا المتصفح لا يدعم اتصال WebRTC المطلوب.');
  }

  const peer = {
    connection: new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    }),
    pendingCandidates: [],
  };
  livePeerConnections.set(peerId, peer);
  if (liveLocalStream) {
    for (const track of liveLocalStream.getTracks()) {
      peer.connection.addTrack(track, liveLocalStream);
    }
  }
  peer.connection.onicecandidate = (event) => {
    if (event.candidate && liveSocket?.connected) {
      liveSocket.emit('live_signal', {
        targetId: peerId,
        signal: event.candidate.toJSON(),
      });
    }
  };
  peer.connection.ontrack = (event) => {
    const remoteVideo = document.getElementById('live-remote-video');
    if (event.streams[0]) remoteVideo.srcObject = event.streams[0];
  };
  peer.connection.onnegotiationneeded = async () => {
    if (
      !liveSocket?.connected ||
      liveSocket.id.localeCompare(peerId) > 0 ||
      peer.connection.signalingState !== 'stable'
    ) return;
    try {
      await peer.connection.setLocalDescription();
      liveSocket.emit('live_signal', {
        targetId: peerId,
        signal: peer.connection.localDescription.toJSON(),
      });
    } catch (error) {
      console.error('WebRTC offer creation failed:', error);
      updateLiveStatus('تعذر بدء تفاوض الاتصال؛ تحقق من أذونات الكاميرا والشبكة.', 'error');
    }
  };
  peer.connection.onconnectionstatechange = () => {
    if (peer.connection.connectionState === 'connected') {
      updateLiveStatus('تم الاتصال المباشر بين الطرفين.', 'success');
    } else if (['failed', 'disconnected'].includes(peer.connection.connectionState)) {
      updateLiveStatus(
        'تعذر الوصول للطرف الآخر مباشرة؛ قد تتطلب الشبكة خادم TURN.',
        'error',
      );
    }
  };
  return peer;
}

async function handleLiveSignal({ from, signal }) {
  try {
    const peer = ensureLivePeerConnection(from);
    if (signal.type === 'offer') {
      await peer.connection.setRemoteDescription(signal);
      for (const candidate of peer.pendingCandidates.splice(0)) {
        await peer.connection.addIceCandidate(candidate);
      }
      await peer.connection.setLocalDescription();
      liveSocket.emit('live_signal', {
        targetId: from,
        signal: peer.connection.localDescription.toJSON(),
      });
    } else if (signal.type === 'answer') {
      await peer.connection.setRemoteDescription(signal);
      for (const candidate of peer.pendingCandidates.splice(0)) {
        await peer.connection.addIceCandidate(candidate);
      }
    } else if (typeof signal.candidate === 'string') {
      const candidate = new RTCIceCandidate(signal);
      if (peer.connection.remoteDescription) {
        await peer.connection.addIceCandidate(candidate);
      } else {
        peer.pendingCandidates.push(candidate);
      }
    }
  } catch (error) {
    console.error('WebRTC signal handling failed:', error);
    updateLiveStatus('تعذر إنشاء اتصال الفيديو؛ أعد المحاولة أو تحقق من أذونات المتصفح.', 'error');
  }
}

function connectLiveRoom(roomId) {
  if (typeof window.io !== 'function') {
    updateLiveStatus('مكتبة الاتصال المباشر غير متاحة من الخادم.', 'error');
    return;
  }
  if (liveSocket || liveLocalStream) leaveLiveRoom();
  liveRoomId = roomId;
  document.getElementById('live-controls').hidden = false;
  document.getElementById('live-chat-log').replaceChildren();
  const inviteUrl = new URL(window.location.href);
  inviteUrl.searchParams.set('live', roomId);
  inviteUrl.hash = 'live-section';
  document.getElementById('live-invite-link').value = inviteUrl.href;
  liveSocket = window.io({
    auth: { liveRoomId: roomId },
    reconnection: true,
    reconnectionAttempts: 5,
  });
  liveSocket.on('connect', () => {
    liveSocket.emit('start_realtime_stream', { propertyId: roomId });
    updateLiveStatus('اتصلت بالغرفة؛ بانتظار الطرف الآخر أو تشغيل الكاميرا...', 'pending');
  });
  liveSocket.on('connect_error', (error) => {
    console.error('Live room connection failed:', error);
    updateLiveStatus('رابط المعاينة غير صالح أو انتهت صلاحيته.', 'error');
  });
  liveSocket.on('live_stream_joined', () => {
    updateLiveStatus('انضممت إلى غرفة المعاينة. شارك الرابط مع الطرف الآخر.', 'success');
  });
  liveSocket.on('live_peers', (peers) => {
    for (const peerId of peers) ensureLivePeerConnection(peerId);
  });
  liveSocket.on('live_peer_joined', ({ socketId }) => {
    ensureLivePeerConnection(socketId);
  });
  liveSocket.on('live_signal', handleLiveSignal);
  liveSocket.on('live_chat_received', ({ sender, text }) => {
    addLiveChatMessage(sender, text);
  });
  liveSocket.on('realtime_error', ({ message }) => {
    updateLiveStatus(message || 'حدث خطأ في غرفة المعاينة.', 'error');
  });
}

async function createLiveRoom() {
  const status = document.getElementById('live-room-status');
  status.textContent = 'جارٍ إنشاء غرفة مؤقتة...';
  status.dataset.state = 'pending';
  try {
    const response = await fetch('/api/live/rooms', {
      method: 'POST',
      headers: { Accept: 'application/json' },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.success !== true || !/^[a-f0-9]{64}$/.test(data.roomId)) {
      throw new Error(data?.message || `تعذر إنشاء غرفة المعاينة (HTTP ${response.status}).`);
    }
    document.getElementById('live-join-link').value = data.roomId;
    connectLiveRoom(data.roomId);
    document.getElementById('live-section').scrollIntoView({ behavior: 'smooth' });
  } catch (error) {
    console.error('Live room creation failed:', error);
    updateLiveStatus(error instanceof TypeError ? 'تعذر الاتصال بالخادم.' : error.message, 'error');
  }
}

function joinLiveRoom() {
  const roomId = getLiveRoomId(document.getElementById('live-join-link').value);
  if (!roomId) {
    updateLiveStatus('أدخل رابط دعوة صحيحاً أو رمز غرفة صالحاً.', 'error');
    return;
  }
  connectLiveRoom(roomId);
}

async function startLiveCamera() {
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('الكاميرا والميكروفون يحتاجان متصفحاً آمناً يدعم WebRTC.');
    }
    liveLocalStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: { facingMode: 'environment' },
    });
    document.getElementById('live-local-video').srcObject = liveLocalStream;
    for (const peer of livePeerConnections.values()) {
      for (const track of liveLocalStream.getTracks()) {
        peer.connection.addTrack(track, liveLocalStream);
      }
    }
    updateLiveStatus('الكاميرا والميكروفون يعملان. شارك رابط الغرفة مع الطرف الآخر.', 'success');
  } catch (error) {
    console.error('Unable to start the live camera:', error);
    updateLiveStatus(error instanceof Error ? error.message : 'تعذر تشغيل الكاميرا.', 'error');
  }
}

function leaveLiveRoom() {
  for (const peer of livePeerConnections.values()) peer.connection.close();
  livePeerConnections.clear();
  liveLocalStream?.getTracks().forEach((track) => track.stop());
  liveLocalStream = null;
  liveSocket?.disconnect();
  liveSocket = null;
  liveRoomId = null;
  document.getElementById('live-local-video').srcObject = null;
  document.getElementById('live-remote-video').srcObject = null;
  document.getElementById('live-controls').hidden = true;
  updateLiveStatus('انتهى الاتصال من هذا الجهاز.');
}

async function sendLiveChatMessage(event) {
  event.preventDefault();
  if (!liveSocket?.connected || !liveRoomId) {
    updateLiveStatus('انضم إلى غرفة المعاينة قبل إرسال الرسائل.', 'error');
    return;
  }
  const input = document.getElementById('live-chat-input');
  liveSocket.emit('send_live_chat_message', {
    propertyId: liveRoomId,
    senderName: document.getElementById('live-sender-name').value.trim() || 'زائر',
    messageText: input.value.trim(),
  });
  input.value = '';
}

async function copyLiveInviteLink() {
  try {
    await navigator.clipboard.writeText(document.getElementById('live-invite-link').value);
    updateLiveStatus('تم نسخ رابط الدعوة.');
  } catch (error) {
    console.error('Could not copy live invite URL:', error);
    updateLiveStatus('تعذر النسخ تلقائياً؛ حدّد رابط الدعوة وانسخه يدوياً.', 'error');
  }
}

function restoreLiveRoomFromUrl() {
  const roomId = new URLSearchParams(window.location.search).get('live');
  if (roomId && /^[a-f0-9]{64}$/.test(roomId)) connectLiveRoom(roomId);
}

async function signOutStaff() {
  if (staffAccessToken) {
    await fetch('/api/staff/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${staffAccessToken}` },
    });
  }
  staffAccessToken = null;
  document.getElementById('staff-console').hidden = true;
  document.getElementById('staff-login-form').hidden = false;
  document.getElementById('product-create-details').hidden = true;
  document.getElementById('staff-results').replaceChildren();
  document.getElementById('staff-status').textContent = 'تم تسجيل الخروج.';
}

function storyMediaUrl(story) {
  return `/api/stories/${encodeURIComponent(story.shareToken)}/media`;
}

function renderStoriesBar() {
  const bar = document.getElementById('stories-bar');
  bar.replaceChildren();
  const groups = new Map();
  for (const story of storyItems) {
    const key = story.creatorName || 'VIP';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(story);
  }
  for (const [creator, stories] of groups) {
    const bubble = document.createElement('button');
    bubble.type = 'button';
    bubble.className = 'story-bubble';
    bubble.setAttribute('role', 'listitem');
    bubble.setAttribute('aria-label', `${creator} — ${stories.length} قصة`);
    const preview = document.createElement(
      stories[0].contentType.startsWith('video/') ? 'video' : 'img',
    );
    preview.src = storyMediaUrl(stories[0]);
    preview.alt = stories[0].caption || `قصة ${creator}`;
    if (preview instanceof HTMLVideoElement) preview.muted = true;
    const name = document.createElement('span');
    name.textContent = `${creator}${stories.some((story) => story.isPinned) ? ' ★' : ''}`;
    bubble.append(preview, name);
    bubble.addEventListener('click', () => openStoryGroup(stories));
    bar.append(bubble);
  }
  if (groups.size === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'لا توجد قصص نشطة بعد. كن أول من ينشر قصة.';
    bar.append(empty);
  }
}

async function restoreSharedStoryFromUrl() {
  const token = window.location.pathname.match(/^\/stories\/([a-f0-9]{64})\/?$/)?.[1];
  if (!token) return;
  try {
    const response = await fetch(`/api/stories/${encodeURIComponent(token)}`, {
      headers: { Accept: 'application/json' },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.success !== true) {
      throw new Error(data?.message || 'انتهت القصة أو لم تعد متاحة.');
    }
    const story = data.story;
    storyItems = [story, ...storyItems.filter((item) => item.shareToken !== token)];
    openStoryGroup([story]);
    document.getElementById('stories-section').scrollIntoView({ behavior: 'smooth' });
  } catch (error) {
    console.error('Shared VIP story could not be opened:', error);
    const status = document.getElementById('stories-status');
    status.textContent = error instanceof TypeError ? 'تعذر الاتصال بالخادم.' : error.message;
    status.dataset.state = 'error';
  }
}

async function loadStories() {
  const status = document.getElementById('stories-status');
  try {
    const response = await fetch('/api/stories', {
      headers: { Accept: 'application/json' },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.success !== true || !Array.isArray(data.stories)) {
      throw new Error(data?.message || `تعذر تحميل القصص (HTTP ${response.status}).`);
    }
    storyItems = data.stories;
    renderStoriesBar();
    status.textContent = `قصص نشطة: ${storyItems.length}.`;
  } catch (error) {
    console.error('VIP stories request failed:', error);
    status.textContent = error instanceof TypeError ? 'تعذر الاتصال بالخادم.' : error.message;
    status.dataset.state = 'error';
  }
}

function stopStoryProgress() {
  if (storyProgressTimer !== null) window.clearTimeout(storyProgressTimer);
  if (storyProgressAnimation !== null) window.cancelAnimationFrame(storyProgressAnimation);
  storyProgressTimer = null;
  storyProgressAnimation = null;
}

function scheduleStoryProgress() {
  stopStoryProgress();
  storyProgressStartedAt = performance.now();
  const progress = document.getElementById('story-progress');
  const animate = () => {
    const elapsed = performance.now() - storyProgressStartedAt;
    const currentWidth = Math.min(100, (elapsed / storyProgressRemainingMs) * 100);
    progress.style.width = `${currentWidth}%`;
    if (currentWidth < 100) {
      storyProgressAnimation = window.requestAnimationFrame(animate);
    }
  };
  storyProgressAnimation = window.requestAnimationFrame(animate);
  storyProgressTimer = window.setTimeout(
    showNextStory,
    storyProgressRemainingMs,
  );
}

function showStoryAt(index) {
  if (index < 0 || index >= activeStoryGroup.length) {
    closeStoryViewer();
    return;
  }
  activeStoryIndex = index;
  storyProgressRemainingMs = 8000;
  const story = activeStoryGroup[activeStoryIndex];
  const content = document.getElementById('story-content');
  content.replaceChildren();
  const media = document.createElement(
    story.contentType.startsWith('video/') ? 'video' : 'img',
  );
  media.src = storyMediaUrl(story);
  if (media instanceof HTMLVideoElement) {
    media.autoplay = true;
    media.controls = true;
    media.playsInline = true;
    media.addEventListener('ended', showNextStory, { once: true });
    media.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(media.duration) && media.duration > 0) {
        storyProgressRemainingMs = Math.min(30000, media.duration * 1000);
        scheduleStoryProgress();
      }
    }, { once: true });
  } else {
    media.alt = `قصة ${story.creatorName}`;
  }
  content.append(media);
  document.getElementById('story-viewer-caption').textContent =
    `${story.creatorName}${story.isPinned ? ' ★ قصة مثبتة' : ''}${story.caption ? ` — ${story.caption}` : ''}`;
  document.getElementById('story-progress').style.width = '0%';
  scheduleStoryProgress();
}

function openStoryGroup(stories, index = 0) {
  activeStoryGroup = stories;
  const dialog = document.getElementById('story-viewer');
  if (!dialog.open) dialog.showModal();
  showStoryAt(index);
}

function closeStoryViewer() {
  stopStoryProgress();
  const dialog = document.getElementById('story-viewer');
  if (dialog.open) dialog.close();
  document.getElementById('story-content').replaceChildren();
  activeStoryGroup = [];
  activeStoryIndex = 0;
}

function showNextStory() {
  showStoryAt(activeStoryIndex + 1);
}

function getStoryShareUrl() {
  const story = activeStoryGroup[activeStoryIndex];
  if (!story) return '';
  return new URL(`/stories/${story.shareToken}`, window.location.origin).href;
}

async function shareStory(method) {
  const story = activeStoryGroup[activeStoryIndex];
  const url = getStoryShareUrl();
  if (!story || !url) return;
  const text = `شاهد قصة ${story.creatorName} على بورصة العالمي VIP`;
  const encoded = encodeURIComponent(`${text} ${url}`);
  const targets = {
    whatsapp: `https://wa.me/?text=${encoded}`,
    x: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
    snapchat: `https://www.snapchat.com/scan?attachmentUrl=${encodeURIComponent(url)}`,
    instagram: 'https://www.instagram.com/',
  };
  if (method === 'copy') {
    await copyText(url, 'تم نسخ رابط القصة المباشر.');
    return;
  }
  if (method === 'native' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: text, text, url });
      return;
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error('Native story sharing failed:', error);
    }
  }
  if (method === 'native') {
    await copyText(url, 'المشاركة غير مدعومة هنا؛ نُسخ الرابط المباشر.');
    return;
  }
  window.open(targets[method], '_blank', 'noopener,noreferrer');
}

async function submitStory(event) {
  event.preventDefault();
  const status = document.getElementById('stories-status');
  const submit = document.getElementById('story-submit');
  const file = document.getElementById('story-media').files[0];
  if (
    !file ||
    !['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'].includes(file.type) ||
    file.size > 5 * 1024 * 1024
  ) {
    status.textContent = 'اختر صورة أو فيديو مدعوماً لا يتجاوز 5 ميغابايت.';
    status.dataset.state = 'error';
    return;
  }

  submit.disabled = true;
  status.textContent = 'جارٍ نشر القصة...';
  status.dataset.state = 'pending';
  try {
    const response = await fetch('/api/stories', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creatorName: document.getElementById('story-creator-name').value.trim(),
        caption: document.getElementById('story-caption').value.trim(),
        media: { name: file.name, contentType: file.type, data: await fileAsBase64(file) },
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.success !== true) {
      throw new Error(data?.message || `تعذر نشر القصة (HTTP ${response.status}).`);
    }
    document.getElementById('story-form').reset();
    status.textContent = data.message;
    status.dataset.state = 'success';
    await loadStories();
    const group = storyItems.filter((story) => story.creatorName === data.story.creatorName);
    openStoryGroup(group, group.findIndex((story) => story.shareToken === data.story.shareToken));
  } catch (error) {
    console.error('VIP story publish failed:', error);
    status.textContent = error instanceof TypeError ? 'تعذر الاتصال بالخادم.' : error.message;
    status.dataset.state = 'error';
  } finally {
    submit.disabled = false;
  }
}

async function loadProducts() {
  const results = document.getElementById('products-results');
  try {
    const response = await fetch('/api/products', {
      headers: { Accept: 'application/json' },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.success !== true || !Array.isArray(data.products)) {
      throw new Error(data?.message || `تعذر تحميل المنتجات (HTTP ${response.status}).`);
    }
    renderProducts(data.products);
  } catch (error) {
    console.error('Affiliate products request failed:', error);
    results.replaceChildren();
    const status = document.createElement('p');
    status.className = 'listing-status';
    status.dataset.state = 'error';
    status.textContent = error instanceof TypeError ? 'تعذر الاتصال بالخادم.' : error.message;
    results.append(status);
  }
}

function renderProducts(products) {
  const results = document.getElementById('products-results');
  const categoryFilter = document.getElementById('product-category-filter').value;
  results.replaceChildren();
  const filtered = products.filter((product) =>
    !categoryFilter || product.category === categoryFilter ||
    product.customCategory === categoryFilter,
  );
  if (filtered.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = categoryFilter
      ? 'لا توجد منتجات ضمن هذا التصنيف حالياً.'
      : 'لا توجد منتجات منشورة حالياً.';
    results.append(empty);
    return;
  }
  const formatter = new Intl.NumberFormat('ar-SA', { maximumFractionDigits: 2 });
  for (const product of filtered) {
    const card = document.createElement('article');
    card.className = 'product-card';
    const gallery = document.createElement('div');
    gallery.className = 'product-gallery';
    for (const imageData of product.media || []) {
      const image = document.createElement('img');
      image.loading = 'lazy';
      image.alt = product.name;
      image.src = `/api/products/${encodeURIComponent(product.id)}/media/${encodeURIComponent(imageData.id)}`;
      gallery.append(image);
    }
    const title = document.createElement('h3');
    title.textContent = product.name;
    const category = document.createElement('span');
    category.className = 'listing-kind-badge';
    category.textContent = product.customCategory || product.category;
    const price = document.createElement('p');
    price.textContent = `السعر: ${formatter.format(Number(product.price))} ريال`;
    const commission = document.createElement('p');
    commission.textContent = product.commissionType === 'percent'
      ? `عمولة المسوق: ${formatter.format(Number(product.commissionValue))}%`
      : `عمولة المسوق: ${formatter.format(Number(product.commissionValue))} ريال`;
    const stock = document.createElement('p');
    stock.textContent = `المخزون: ${formatter.format(product.stockQuantity)} · البائع: ${product.sellerName}`;
    const description = document.createElement('p');
    description.textContent = product.description || '';
    const variations = document.createElement('p');
    variations.textContent = [
      product.sizes?.length ? `المقاسات: ${product.sizes.join('، ')}` : '',
      product.colors?.length ? `الألوان: ${product.colors.join('، ')}` : '',
      `الشحن: ${(product.shippingOptions || []).join('، ')}`,
    ].filter(Boolean).join(' · ');
    const actions = document.createElement('div');
    actions.className = 'product-actions';
    const digits = String(product.sellerPhone).replace(/\D/g, '');
    const international = digits.startsWith('0') ? `966${digits.slice(1)}` : digits;
    const phone = document.createElement('a');
    phone.className = 'tool-button';
    phone.href = `tel:${product.sellerPhone}`;
    phone.textContent = 'اتصال';
    const whatsapp = document.createElement('a');
    whatsapp.className = 'tool-button';
    whatsapp.href = `https://wa.me/${international}?text=${encodeURIComponent(`مرحباً ${product.sellerName}، أود الاستفسار عن ${product.name}`)}`;
    whatsapp.target = '_blank';
    whatsapp.rel = 'noopener noreferrer';
    whatsapp.textContent = 'واتساب';
    const message = document.createElement('a');
    message.className = 'tool-button';
    message.href = `sms:${product.sellerPhone}?body=${encodeURIComponent(`مرحباً، أود الاستفسار عن ${product.name}`)}`;
    message.textContent = 'رسالة';
    const meeting = document.createElement('button');
    meeting.className = 'tool-button';
    meeting.type = 'button';
    meeting.textContent = 'اجتماع مرئي';
    meeting.addEventListener('click', () => createSellerMeeting(product));
    actions.append(phone, whatsapp, message, meeting);
    card.append(gallery, category, title, price, commission, stock, variations, description, actions);
    results.append(card);
  }
}

async function createSellerMeeting(product) {
  try {
    const response = await fetch('/api/live/rooms', { method: 'POST' });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.success !== true) {
      throw new Error(data?.message || 'تعذر إنشاء رابط الاجتماع.');
    }
    const inviteUrl = new URL(window.location.href);
    inviteUrl.searchParams.set('live', data.roomId);
    inviteUrl.hash = 'live-section';
    const phone = String(product.sellerPhone).replace(/\D/g, '');
    const international = phone.startsWith('0') ? `966${phone.slice(1)}` : phone;
    window.open(
      `https://wa.me/${international}?text=${encodeURIComponent(`للاجتماع المرئي حول ${product.name}: ${inviteUrl.href}`)}`,
      '_blank',
      'noopener,noreferrer',
    );
    connectLiveRoom(data.roomId);
    document.getElementById('live-section').scrollIntoView({ behavior: 'smooth' });
  } catch (error) {
    console.error('Seller meeting creation failed:', error);
    document.getElementById('product-status').textContent =
      error instanceof TypeError ? 'تعذر الاتصال بالخادم.' : error.message;
  }
}

async function renderProductImagePreview(files) {
  const preview = document.getElementById('product-image-preview');
  for (const url of productImageUrls) URL.revokeObjectURL(url);
  productImageUrls = [];
  productImageFiles = [...files].filter((file) =>
    ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) &&
    file.size > 0 && file.size <= 3 * 1024 * 1024,
  ).slice(0, 5);
  preview.replaceChildren();
  for (const file of productImageFiles) {
    const figure = document.createElement('figure');
    const image = document.createElement('img');
    const url = URL.createObjectURL(file);
    productImageUrls.push(url);
    image.src = url;
    image.alt = file.name;
    const caption = document.createElement('figcaption');
    caption.textContent = file.name;
    figure.append(image, caption);
    preview.append(figure);
  }
  if (productImageFiles.length !== files.length) {
    document.getElementById('product-status').textContent =
      'تُقبل حتى 5 صور JPEG أو PNG أو WebP، بحد 3 ميغابايت للصورة.';
  }
}

async function submitAffiliateProduct(event) {
  event.preventDefault();
  if (!staffAccessToken) {
    document.getElementById('product-status').textContent = 'سجّل الدخول بصلاحية إدارة المنتجات أولاً.';
    return;
  }
  const customCategory = document.getElementById('product-custom-category').value.trim();
  const images = await Promise.all(productImageFiles.map(async (file) => ({
    name: file.name,
    contentType: file.type,
    data: await fileAsBase64(file),
  })));
  const payload = {
    name: document.getElementById('product-name').value.trim(),
    category: document.getElementById('product-category').value,
    customCategory: customCategory || undefined,
    description: document.getElementById('product-description').value.trim(),
    price: Number(document.getElementById('product-price').value),
    commissionType: document.getElementById('product-commission-type').value,
    commissionValue: Number(document.getElementById('product-commission-value').value),
    sizes: document.getElementById('product-sizes').value.split(',').map((value) => value.trim()).filter(Boolean),
    colors: document.getElementById('product-colors').value.split(',').map((value) => value.trim()).filter(Boolean),
    stockQuantity: Number(document.getElementById('product-stock').value),
    shippingOptions: [...document.querySelectorAll('[name="product-shipping"]:checked')].map((input) => input.value),
    sellerName: document.getElementById('product-seller-name').value.trim(),
    sellerPhone: document.getElementById('product-seller-phone').value.trim(),
    images,
  };
  const submit = document.getElementById('product-submit');
  const status = document.getElementById('product-status');
  submit.disabled = true;
  status.textContent = 'جارٍ حفظ المنتج في قاعدة البيانات...';
  status.dataset.state = 'pending';
  try {
    const response = await fetch('/api/staff/products', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${staffAccessToken}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.success !== true) {
      throw new Error(data?.message || `تعذر حفظ المنتج (HTTP ${response.status}).`);
    }
    document.getElementById('product-form').reset();
    productImageFiles = [];
    document.getElementById('product-image-preview').replaceChildren();
    status.textContent = data.message;
    status.dataset.state = 'success';
    await loadProducts();
    await requestStaffArea('/api/staff/products', 'GET', null, 'products');
  } catch (error) {
    console.error('Affiliate product save failed:', error);
    status.textContent = error instanceof TypeError ? 'تعذر الاتصال بالخادم.' : error.message;
    status.dataset.state = 'error';
  } finally {
    submit.disabled = false;
  }
}

const inviteMessage =
  'أدعوك لاكتشاف بورصة العالمي الدولية للأصول والعقارات VIP للعقارات والمنتجات والفرص الاستثمارية. تابع الرابط: ';

async function copyText(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
    document.getElementById('invite-status').textContent = successMessage;
    document.getElementById('invite-status').dataset.state = 'success';
  } catch (error) {
    console.error('Clipboard operation failed:', error);
    document.getElementById('invite-status').textContent =
      'تعذر النسخ تلقائياً؛ حدّد الرابط أو النص وانسخه يدوياً.';
    document.getElementById('invite-status').dataset.state = 'error';
  }
}

function getInviteText() {
  return `${inviteMessage}${window.location.origin}`;
}

async function pickInviteContacts() {
  const status = document.getElementById('invite-status');
  if (!('contacts' in navigator) || typeof navigator.contacts?.select !== 'function') {
    status.textContent = 'اختيار جهات الاتصال غير مدعوم في هذا المتصفح؛ استخدم نسخ الدعوة أو المشاركة.';
    status.dataset.state = 'error';
    return;
  }
  try {
    const contacts = await navigator.contacts.select(['name', 'tel'], { multiple: true });
    const actions = document.getElementById('invite-contact-actions');
    actions.replaceChildren();
    for (const contact of contacts) {
      for (const telephone of contact.tel || []) {
        const digits = telephone.replace(/\D/g, '');
        if (digits.length < 7) continue;
        const name = contact.name?.[0] || telephone;
        const whatsapp = document.createElement('a');
        whatsapp.className = 'tool-button';
        whatsapp.href = `https://wa.me/${digits}?text=${encodeURIComponent(`${getInviteText()} — مرحباً ${name}`)}`;
        whatsapp.target = '_blank';
        whatsapp.rel = 'noopener noreferrer';
        whatsapp.textContent = `WhatsApp · ${name}`;
        const sms = document.createElement('a');
        sms.className = 'tool-button';
        sms.href = `sms:${telephone}?body=${encodeURIComponent(`${getInviteText()} — مرحباً ${name}`)}`;
        sms.textContent = `SMS · ${name}`;
        actions.append(whatsapp, sms);
      }
    }
    actions.hidden = actions.childElementCount === 0;
    status.textContent = actions.hidden
      ? 'لم تتوفر أرقام هاتف ضمن جهات الاتصال المختارة.'
      : 'اختر قناة الإرسال؛ لن تُرسل البيانات إلى الخادم.';
    status.dataset.state = actions.hidden ? 'error' : 'success';
  } catch (error) {
    if (error.name === 'AbortError') return;
    console.error('Contact picker failed:', error);
    status.textContent = 'تعذر فتح جهات الاتصال؛ تحقق من أذونات المتصفح.';
    status.dataset.state = 'error';
  }
}

async function shareInvite() {
  const text = getInviteText();
  try {
    if (typeof navigator.share === 'function') {
      await navigator.share({ title: 'دعوة بورصة العالمي VIP', text, url: window.location.origin });
      document.getElementById('invite-status').textContent = 'تم فتح قائمة المشاركة.';
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  } catch (error) {
    if (error.name === 'AbortError') return;
    console.error('Invite share failed:', error);
    document.getElementById('invite-status').textContent = 'تعذرت مشاركة الدعوة.';
  }
}

function updateLiveClock() {
  const now = new Date();
  document.getElementById('live-clock').textContent = new Intl.DateTimeFormat('ar-SA', {
    timeZone: 'Asia/Riyadh',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(now);
  const gregorian = new Intl.DateTimeFormat('ar-SA', {
    timeZone: 'Asia/Riyadh',
    dateStyle: 'medium',
  }).format(now);
  let hijri = '';
  try {
    hijri = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
      timeZone: 'Asia/Riyadh',
      dateStyle: 'medium',
    }).format(now);
  } catch (error) {
    console.warn('Hijri calendar is not supported in this browser:', error);
  }
  document.getElementById('live-date').textContent = hijri
    ? `${gregorian} · ${hijri}`
    : gregorian;
}

async function updateWeather() {
  const selectedCity = weatherCitySelect.selectedOptions[0];
  if (!selectedCity) return;
  const requestSequence = ++weatherRequestSequence;
  const latitude = selectedCity.dataset.latitude;
  const longitude = selectedCity.dataset.longitude;
  const status = document.getElementById('weather-status');
  status.textContent = 'جارٍ تحميل الطقس...';
  try {
    const query = new URLSearchParams({
      latitude,
      longitude,
      current: 'temperature_2m,weather_code',
      timezone: 'Asia/Riyadh',
    });
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query}`);
    const data = await response.json();
    if (requestSequence !== weatherRequestSequence) return;
    if (!response.ok || !Number.isFinite(data?.current?.temperature_2m)) {
      throw new Error('تعذر جلب بيانات الطقس.');
    }
    const weatherDescriptions = {
      0: 'سماء صافية',
      1: 'غائم جزئياً',
      2: 'غائم جزئياً',
      3: 'غائم',
      45: 'ضباب',
      48: 'ضباب متجمد',
      51: 'رذاذ خفيف',
      53: 'رذاذ',
      55: 'رذاذ كثيف',
      61: 'مطر خفيف',
      63: 'مطر',
      65: 'مطر غزير',
      71: 'ثلوج خفيفة',
      73: 'ثلوج',
      75: 'ثلوج كثيفة',
      80: 'زخات مطر',
      81: 'زخات مطر',
      82: 'زخات مطر غزيرة',
      95: 'عواصف رعدية',
      96: 'عواصف رعدية مع برد',
      99: 'عواصف رعدية شديدة',
    };
    status.textContent = `${selectedCity.textContent}: ${data.current.temperature_2m}°C · ${weatherDescriptions[data.current.weather_code] || 'حالة جوية متغيرة'}`;
  } catch (error) {
    if (requestSequence !== weatherRequestSequence) return;
    console.warn('Weather request failed:', error);
    status.textContent = 'الطقس غير متاح؛ تحقق من الاتصال.';
  }
}

function initializeAccessibilityTools() {
  try {
    const isLight = localStorage.getItem('aqarat-theme') === 'light';
    document.body.classList.toggle('light-theme', isLight);
    const themeButton = document.getElementById('theme-toggle');
    themeButton.setAttribute('aria-pressed', String(isLight));
    themeButton.textContent = isLight ? 'الوضع الليلي' : 'الوضع النهاري';
  } catch (error) {
    console.warn('Could not restore theme preference:', error);
  }
  document.getElementById('theme-toggle').addEventListener('click', (event) => {
    const isLight = document.body.classList.toggle('light-theme');
    event.currentTarget.setAttribute('aria-pressed', String(isLight));
    event.currentTarget.textContent = isLight ? 'الوضع الليلي' : 'الوضع النهاري';
    try {
      localStorage.setItem('aqarat-theme', isLight ? 'light' : 'dark');
    } catch (error) {
      console.error('Could not save theme preference:', error);
    }
  });
  document.getElementById('font-increase').addEventListener('click', () => {
    accessibilityScale = Math.min(1.3, accessibilityScale + 0.1);
    document.documentElement.style.setProperty('--accessibility-scale', accessibilityScale);
  });
  document.getElementById('font-decrease').addEventListener('click', () => {
    accessibilityScale = Math.max(0.8, accessibilityScale - 0.1);
    document.documentElement.style.setProperty('--accessibility-scale', accessibilityScale);
  });
  document.getElementById('contrast-toggle').addEventListener('click', (event) => {
    const enabled = document.body.classList.toggle('high-contrast');
    event.currentTarget.setAttribute('aria-pressed', String(enabled));
  });
  document.getElementById('speak-page').addEventListener('click', () => {
    if (!('speechSynthesis' in window)) {
      parserStatus.textContent = 'القراءة الصوتية غير مدعومة في هذا المتصفح.';
      return;
    }
    window.speechSynthesis.cancel();
    const headingText = [...document.querySelectorAll('main h1, main h2')]
      .map((heading) => heading.textContent.trim()).filter(Boolean).join('. ');
    const utterance = new SpeechSynthesisUtterance(headingText);
    utterance.lang = 'ar-SA';
    window.speechSynthesis.speak(utterance);
  });
}

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

function addInfoEntry(container, values) {
  const entry = document.createElement('div');
  entry.className = 'platform-info-entry';
  for (const [label, value] of values) {
    const line = document.createElement('p');
    const labelElement = document.createElement('strong');
    labelElement.textContent = `${label}: `;
    line.append(labelElement, document.createTextNode(value));
    entry.append(line);
  }
  container.append(entry);
}

function createExternalLink(label, href) {
  if (typeof href !== 'string' || !href) {
    return null;
  }

  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') {
    return null;
  }

  const link = document.createElement('a');
  link.href = url.href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = label;
  return link;
}

async function loadPlatformInfo() {
  try {
    const response = await fetch('/api/platform/info', {
      headers: { Accept: 'application/json' },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.success !== true || !data.settings) {
      throw new Error(
        data?.message || `تعذر تحميل بيانات المنصة (HTTP ${response.status}).`,
      );
    }

    const { bankAccounts, contactNumbers, socialMedia } = data.settings;
    if (!Array.isArray(bankAccounts) || !Array.isArray(contactNumbers)) {
      throw new Error('أعاد الخادم بيانات حسابات أو تواصل بتنسيق غير صالح.');
    }

    bankAccountsView.replaceChildren();
    const validBankAccounts = bankAccounts.filter(
      (account) =>
        account &&
        typeof account.bankName === 'string' &&
        typeof account.accountName === 'string' &&
        typeof account.iban === 'string',
    );
    if (validBankAccounts.length === 0) {
      const emptyState = document.createElement('p');
      emptyState.className = 'platform-info-status';
      emptyState.textContent = 'لا توجد بيانات حسابات بنكية متاحة حالياً.';
      bankAccountsView.append(emptyState);
    } else {
      for (const account of validBankAccounts) {
        addInfoEntry(bankAccountsView, [
          ['البنك', account.bankName],
          ['اسم المستفيد', account.accountName],
          ['IBAN', account.iban],
        ]);
      }
    }

    contactsView.replaceChildren();
    const validContacts = contactNumbers.filter(
      (contact) =>
        contact &&
        typeof contact.title === 'string' &&
        typeof contact.value === 'string',
    );
    for (const contact of validContacts) {
      addInfoEntry(contactsView, [[contact.title, contact.value]]);
    }

    const linksContainer = document.createElement('div');
    linksContainer.className = 'platform-info-links';
    const socialLabels = [
      ['tiktok', 'TikTok'],
      ['twitter', 'X'],
      ['instagram', 'Instagram'],
    ];
    for (const [key, label] of socialLabels) {
      const link = createExternalLink(label, socialMedia?.[key]);
      if (link) {
        linksContainer.append(link);
      }
    }
    const email = socialMedia?.email;
    if (typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      const emailLink = document.createElement('a');
      emailLink.href = `mailto:${email}`;
      emailLink.textContent = email;
      linksContainer.append(emailLink);
    }
    if (linksContainer.childElementCount > 0) {
      contactsView.append(linksContainer);
    }
    if (contactsView.childElementCount === 0) {
      const emptyState = document.createElement('p');
      emptyState.className = 'platform-info-status';
      emptyState.textContent = 'لا توجد قنوات تواصل متاحة حالياً.';
      contactsView.append(emptyState);
    }
  } catch (error) {
    console.error('Platform info request failed:', error);
    for (const container of [bankAccountsView, contactsView]) {
      const errorMessage = document.createElement('p');
      errorMessage.className = 'platform-info-status';
      errorMessage.textContent =
        error instanceof TypeError
          ? 'تعذر الاتصال بالخادم لتحميل البيانات.'
          : error.message;
      container.replaceChildren(errorMessage);
    }
  }
}

async function loadPartners() {
  try {
    const response = await fetch('/api/partners', {
      headers: { Accept: 'application/json' },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.success !== true || !Array.isArray(data.partners)) {
      throw new Error(data?.message || `تعذر تحميل دليل الجهات (HTTP ${response.status}).`);
    }

    partnersList.replaceChildren();
    for (const partner of data.partners) {
      if (
        !partner ||
        typeof partner.name !== 'string' ||
        typeof partner.category !== 'string' ||
        typeof partner.desc !== 'string'
      ) continue;
      const card = document.createElement('article');
      card.className = 'partner-card';
      const category = document.createElement('span');
      category.className = 'listing-kind-badge';
      category.textContent = partner.category;
      const name = document.createElement('h5');
      name.textContent = partner.name;
      const description = document.createElement('p');
      description.textContent = partner.desc;
      card.append(category, name, description);
      if (typeof partner.phone === 'string' && partner.phone) {
        const phone = document.createElement('p');
        phone.textContent = `الهاتف: ${partner.phone}`;
        card.append(phone);
      }
      const link = createExternalLink('الموقع الرسمي', partner.url);
      if (link) card.append(link);
      partnersList.append(card);
    }
    if (!partnersList.childElementCount) {
      partnersList.textContent = 'لا توجد جهات متاحة حالياً.';
    }
  } catch (error) {
    console.error('Partner directory request failed:', error);
    partnersList.textContent = error instanceof TypeError
      ? 'تعذر الاتصال بالخادم لتحميل الجهات.'
      : error.message;
  }
}

function calculateMortgage(event) {
  event.preventDefault();
  const price = Number(document.getElementById('mortgage-price').value);
  const downPercent = Number(document.getElementById('mortgage-down').value);
  const annualRate = Number(document.getElementById('mortgage-rate').value);
  const years = Number(document.getElementById('mortgage-years').value);
  if (
    !Number.isFinite(price) || price <= 0 ||
    !Number.isFinite(downPercent) || downPercent < 0 || downPercent >= 100 ||
    !Number.isFinite(annualRate) || annualRate < 0 ||
    !Number.isInteger(years) || years < 1 || years > 50
  ) {
    mortgageResult.textContent = 'راجع قيمة العقار والدفعة والنسبة والمدة.';
    mortgageResult.dataset.state = 'error';
    return;
  }

  const principal = price * (1 - downPercent / 100);
  const months = years * 12;
  const monthlyRate = annualRate / 1200;
  const monthlyPayment = monthlyRate === 0
    ? principal / months
    : principal * monthlyRate / (1 - (1 + monthlyRate) ** -months);
  const format = new Intl.NumberFormat('ar-SA', { maximumFractionDigits: 2 });
  mortgageResult.textContent =
    `القسط الشهري التقديري: ${format.format(monthlyPayment)} ريال · إجمالي الأقساط: ${format.format(monthlyPayment * months)} ريال.`;
  mortgageResult.dataset.state = 'success';
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
listingKind.addEventListener('change', updateListingCategories);
listingCategory.addEventListener('change', updateCustomCategoryVisibility);
listingForm.addEventListener('submit', submitListing);
refreshListingsButton.addEventListener('click', loadLedgerListings);
loadPartners();
loadPlatformInfo();
loadLedgerListings();
checkApiHealth();
document.getElementById('analyze-listing').addEventListener('click', analyzeListingText);
careerForm.addEventListener('submit', submitCareerApplication);
document.getElementById('staff-create-form').addEventListener('submit', submitStaffAccount);
document.getElementById('staff-refresh').addEventListener('click', () => {
  superAdminAccessToken = document.getElementById('super-admin-token').value;
  loadStaffUsers();
});
document.getElementById('staff-login-form').addEventListener('submit', signInStaff);
document.getElementById('staff-crm-form').addEventListener('submit', submitCrmFollowup);
document.getElementById('staff-logout').addEventListener('click', signOutStaff);
document.getElementById('live-create-room').addEventListener('click', createLiveRoom);
document.getElementById('live-join-room').addEventListener('click', joinLiveRoom);
document.getElementById('live-start-camera').addEventListener('click', startLiveCamera);
document.getElementById('live-leave-room').addEventListener('click', leaveLiveRoom);
document.getElementById('live-copy-link').addEventListener('click', copyLiveInviteLink);
document.getElementById('live-chat-form').addEventListener('submit', sendLiveChatMessage);
document.getElementById('stories-refresh').addEventListener('click', loadStories);
document.getElementById('story-form').addEventListener('submit', submitStory);
document.getElementById('story-close').addEventListener('click', closeStoryViewer);
document.getElementById('story-viewer').addEventListener('cancel', (event) => {
  event.preventDefault();
  closeStoryViewer();
});
document.getElementById('story-next').addEventListener('click', showNextStory);
document.getElementById('story-previous').addEventListener('click', () => {
  showStoryAt(activeStoryIndex - 1);
});
document.getElementById('story-share-native').addEventListener('click', () => shareStory('native'));
document.getElementById('story-share-whatsapp').addEventListener('click', () => shareStory('whatsapp'));
document.getElementById('story-share-snapchat').addEventListener('click', () => shareStory('snapchat'));
document.getElementById('story-share-instagram').addEventListener('click', () => shareStory('instagram'));
document.getElementById('story-share-x').addEventListener('click', () => shareStory('x'));
document.getElementById('story-copy-link').addEventListener('click', () => shareStory('copy'));
document.getElementById('product-form').addEventListener('submit', submitAffiliateProduct);
document.getElementById('product-images').addEventListener('change', (event) =>
  renderProductImagePreview(event.currentTarget.files),
);
document.getElementById('product-category').addEventListener('change', (event) => {
  const isCustom = event.currentTarget.value === 'أخرى';
  document.getElementById('product-custom-category-field').hidden = !isCustom;
  document.getElementById('product-custom-category').required = isCustom;
});
document.getElementById('product-category-filter').addEventListener('change', loadProducts);
document.getElementById('products-refresh').addEventListener('click', loadProducts);
document.getElementById('invite-contacts').addEventListener('click', pickInviteContacts);
document.getElementById('invite-copy').addEventListener('click', () =>
  copyText(getInviteText(), 'تم نسخ رسالة الدعوة.'),
);
document.getElementById('invite-share').addEventListener('click', shareInvite);
document.getElementById('story-media').addEventListener('change', (event) => {
  const preview = document.getElementById('story-preview');
  preview.replaceChildren();
  const file = event.currentTarget.files[0];
  if (!file) return;
  const figure = document.createElement('figure');
  const media = document.createElement(file.type.startsWith('video/') ? 'video' : 'img');
  const url = URL.createObjectURL(file);
  mediaObjectUrls.push(url);
  media.src = url;
  if (media instanceof HTMLVideoElement) media.controls = true;
  else media.alt = file.name;
  const caption = document.createElement('figcaption');
  caption.textContent = file.name;
  figure.append(media, caption);
  preview.append(figure);
});
const productImageDropZone = document.getElementById('product-image-drop-zone');
productImageDropZone.addEventListener('dragover', (event) => {
  event.preventDefault();
  productImageDropZone.classList.add('is-dragging');
});
productImageDropZone.addEventListener('dragleave', (event) => {
  if (!productImageDropZone.contains(event.relatedTarget)) {
    productImageDropZone.classList.remove('is-dragging');
  }
});
productImageDropZone.addEventListener('drop', (event) => {
  event.preventDefault();
  productImageDropZone.classList.remove('is-dragging');
  if (event.dataTransfer.files.length > 0) {
    renderProductImagePreview(event.dataTransfer.files);
  }
});
listingContactPhone.addEventListener('input', () => {
  const hasPhone = listingContactPhone.value.trim().length > 0;
  listingContactConsent.required = hasPhone;
  if (!hasPhone) listingContactConsent.checked = false;
});
marketSort.addEventListener('change', renderLedgerListings);
mortgageForm.addEventListener('submit', calculateMortgage);
document.querySelectorAll('[data-market-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    selectedMarketFilter = button.dataset.marketFilter;
    document.querySelectorAll('[data-market-filter]').forEach((tab) => {
      tab.classList.toggle('is-active', tab === button);
      tab.setAttribute('aria-pressed', String(tab === button));
    });
    renderLedgerListings();
  });
});
marketLocationSelect.addEventListener('input', () => {
  selectedMarketLocation = marketLocationSelect.value.split('/').pop().trim();
  renderLedgerListings();
});
mediaInput.addEventListener('change', () => showMediaPreview(mediaInput.files));
mediaDropZone.addEventListener('dragover', (event) => {
  event.preventDefault();
  mediaDropZone.classList.add('is-dragging');
});
mediaDropZone.addEventListener('dragleave', (event) => {
  if (!mediaDropZone.contains(event.relatedTarget)) {
    mediaDropZone.classList.remove('is-dragging');
  }
});
mediaDropZone.addEventListener('drop', (event) => {
  event.preventDefault();
  mediaDropZone.classList.remove('is-dragging');
  if (event.dataTransfer.files.length > 0) {
    showMediaPreview(event.dataTransfer.files);
    return;
  }
  const droppedText =
    event.dataTransfer.getData('text/plain') ||
    event.dataTransfer.getData('text/uri-list');
  if (droppedText) {
    listingText.value = droppedText.trim();
    analyzeListingText();
  }
});
listingText.addEventListener('paste', () => {
  window.setTimeout(analyzeListingText, 0);
});
listingText.addEventListener('dragover', (event) => event.preventDefault());
listingText.addEventListener('drop', (event) => {
  event.preventDefault();
  if (event.dataTransfer.files.length > 0) {
    showMediaPreview(event.dataTransfer.files);
    return;
  }
  const droppedText =
    event.dataTransfer.getData('text/plain') ||
    event.dataTransfer.getData('text/uri-list');
  if (droppedText) {
    listingText.value = droppedText.trim();
    analyzeListingText();
  }
});
document.getElementById('media-upload-retry').addEventListener('click', retryListingMediaUpload);
document.getElementById('panorama-close').addEventListener('click', () => {
  document.getElementById('panorama-dialog').close();
});
const panoramaStage = document.getElementById('panorama-stage');
const panoramaImage = document.getElementById('panorama-image');
const panoramaCanvas = document.getElementById('panorama-canvas');
let panoramaDragStart = null;
panoramaStage.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  panoramaStage.setPointerCapture(event.pointerId);
  panoramaDragStart = {
    x: event.clientX,
    y: event.clientY,
    yaw: panoramaYaw,
    pitch: panoramaPitch,
    offset: Number(panoramaImage.dataset.offset || 0),
  };
});
panoramaStage.addEventListener('pointermove', (event) => {
  if (!panoramaDragStart) return;
  if (panoramaRenderer && !panoramaCanvas.hidden) {
    panoramaYaw = panoramaDragStart.yaw + (event.clientX - panoramaDragStart.x) * 0.005;
    panoramaPitch = Math.max(
      -1.2,
      Math.min(1.2, panoramaDragStart.pitch + (event.clientY - panoramaDragStart.y) * 0.005),
    );
    panoramaRenderer.draw(panoramaYaw, panoramaPitch);
    return;
  }
  const maximumOffset = Math.max(0, panoramaImage.offsetWidth - panoramaStage.clientWidth);
  const offset = Math.max(
    0,
    Math.min(maximumOffset, panoramaDragStart.offset - (event.clientX - panoramaDragStart.x)),
  );
  panoramaImage.dataset.offset = String(offset);
  panoramaImage.style.transform = `translateX(-${offset}px)`;
});
for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  panoramaStage.addEventListener(eventName, () => {
    panoramaDragStart = null;
  });
}
document.getElementById('offer-ticker').addEventListener('click', (event) => {
  event.currentTarget.classList.toggle('is-paused');
});
initializeAccessibilityTools();
initializeGeography();
restoreLiveRoomFromUrl();
loadStories();
loadProducts();
restoreSharedStoryFromUrl();
updateLiveClock();
window.setInterval(updateLiveClock, 1000);
updateListingCategories();
updateEstimate();
