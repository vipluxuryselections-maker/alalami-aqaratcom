'use strict';

const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
process.env.COMPLIANCE_BYPASS_TOKEN = 'test-compliance-bypass-token';
process.env.PLATFORM_ADMIN_TOKEN = 'test-platform-admin-token';
const { app, createFlexibleDeal } = require('./server');

let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test('website assets use same-origin CSP with an allowlisted Cairo font', async () => {
  const pageResponse = await fetch(`${baseUrl}/`);
  const page = await pageResponse.text();
  const scriptResponse = await fetch(`${baseUrl}/app.js`);
  const script = await scriptResponse.text();
  const stylesResponse = await fetch(`${baseUrl}/style.css`);
  const styles = await stylesResponse.text();
  const contentSecurityPolicy = pageResponse.headers.get('content-security-policy');

  assert.equal(pageResponse.status, 200);
  assert.match(page, /<script src="\/app\.js" defer><\/script>/);
  assert.match(page, /id="compliance-form"/);
  assert.match(page, /id="chamber-stamp-checkbox"/);
  assert.match(page, /id="custom-saei-flex"/);
  assert.match(page, /id="developer-bypass-checkbox" disabled/);
  assert.match(page, /id="contract-modal"/);
  assert.match(page, /id="accept-contract"/);
  assert.match(page, /id="listing-form"/);
  assert.match(page, /id="home-hub"/);
  assert.match(page, /id="live-clock"/);
  assert.match(page, /id="weather-city"/);
  assert.match(page, /id="contrast-toggle"/);
  assert.match(page, /id="career-form"/);
  assert.match(page, /id="listing-text"/);
  assert.match(page, /id="media-drop-zone"/);
  assert.match(page, /id="partners-list"/);
  assert.match(page, /id="mortgage-form"/);
  assert.match(page, /data-market-filter="favorites"/);
  assert.match(page, /value="استثمار"/);
  assert.match(page, /id="listing-results"/);
  assert.match(page, /id="bank-accounts-view"/);
  assert.match(page, /id="contacts-view"/);
  assert.match(page, /تحقق من هوية المستفيد وتفاصيل الدفع/);
  assert.doesNotMatch(page, /onclick=/i);
  assert.doesNotMatch(page, /<script>[\s\S]*<\/script>/);
  assert.ok(contentSecurityPolicy?.includes("script-src 'self'"));
  assert.ok(contentSecurityPolicy?.includes('https://fonts.googleapis.com'));
  assert.ok(contentSecurityPolicy?.includes('https://fonts.gstatic.com'));
  assert.ok(contentSecurityPolicy?.includes('https://api.open-meteo.com'));
  assert.ok(contentSecurityPolicy?.includes('blob:'));
  assert.equal(scriptResponse.status, 200);
  assert.equal(stylesResponse.status, 200);
  assert.match(styles, /#090d16/i);
  assert.match(script, /بضائع مستوردة/);
  assert.match(script, /\/api\/ledger\/add/);
  assert.match(script, /\/api\/ai\/monitor-chat/);
  assert.match(script, /\/api\/compliance\/validate-deal-flexible/);
  assert.match(script, /draftAcknowledged: true/);
  assert.match(script, /contractModal\.addEventListener/);
  assert.match(script, /\/api\/platform\/info/);
  assert.match(script, /function loadPlatformInfo/);
  assert.match(script, /function analyzeListingText/);
  assert.match(script, /function updateLiveClock/);
  assert.match(script, /function calculateMortgage/);
  assert.match(script, /function loadPartners/);
  assert.match(script, /\/api\/careers\/apply/);
  assert.match(script, /createTextNode/);
  assert.doesNotMatch(script, /\.innerHTML\s*=/);
  assert.doesNotMatch(script, /x-compliance-bypass-token/i);
});

test('health endpoint reports the API as available', async () => {
  const response = await fetch(`${baseUrl}/api/health`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    service: 'aqarat-app-api',
  });
});

test('career applications require valid data and explicit privacy consent', async () => {
  const invalidBodies = [
    {
      fullName: 'Candidate',
      email: 'candidate@example.com',
      phone: '+966500000000',
      role: 'technology',
      note: 'Experience',
      privacyConsent: false,
    },
    {
      fullName: 'Candidate',
      email: 'not-an-email',
      phone: '+966500000000',
      role: 'technology',
      note: 'Experience',
      privacyConsent: true,
    },
  ];

  for (const body of invalidBodies) {
    const response = await fetch(`${baseUrl}/api/careers/apply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).success, false);
  }
});

test('career application reports unavailable database without claiming a save', async () => {
  const response = await fetch(`${baseUrl}/api/careers/apply`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      fullName: 'Candidate',
      email: 'candidate@example.com',
      phone: '+966500000000',
      role: 'technology',
      note: 'Relevant experience',
      privacyConsent: true,
    }),
  });
  const data = await response.json();

  assert.equal(response.status, 503);
  assert.equal(data.success, false);
  assert.equal(data.code, 'DATABASE_NOT_CONFIGURED');
  assert.equal(data.emailNotificationSent, undefined);
});

test('public platform info returns empty defaults without invented financial details', async () => {
  const response = await fetch(`${baseUrl}/api/platform/info`);
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(data, {
    success: true,
    settings: {
      bankAccounts: [],
      contactNumbers: [],
      socialMedia: {
        twitter: '',
        tiktok: '',
        instagram: '',
        email: '',
      },
    },
  });
});

test('partner directory returns informational entries without claiming affiliation', async () => {
  const response = await fetch(`${baseUrl}/api/partners`);
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.success, true);
  assert.ok(Array.isArray(data.partners));
  assert.ok(data.partners.some((partner) => partner.name.includes('الهيئة العامة للعقار')));
  assert.ok(data.partners.some((partner) => partner.category === 'بنوك سعودية'));
});

test('platform settings can only be updated with the server-side admin token', async () => {
  const response = await fetch(`${baseUrl}/api/admin/update-settings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      secretAdminToken: 'test-platform-admin-token',
      newSettings: { contactNumbers: [] },
    }),
  });

  assert.equal(response.status, 403);
  assert.equal((await response.json()).success, false);
});

test('authorized platform settings updates validate fields and are publicly readable', async () => {
  const response = await fetch(`${baseUrl}/api/admin/update-settings`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-platform-admin-token': 'test-platform-admin-token',
    },
    body: JSON.stringify({
      newSettings: {
        bankAccounts: [],
        contactNumbers: [
          { title: 'Support', value: '+966500000000' },
        ],
        socialMedia: {
          twitter: 'https://x.example',
          email: 'support@example.com',
        },
      },
    }),
  });
  const updateData = await response.json();

  assert.equal(response.status, 200);
  assert.equal(updateData.success, true);
  assert.match(updateData.message, /لن تبقى بعد إعادة تشغيله/);

  const infoResponse = await fetch(`${baseUrl}/api/platform/info`);
  const infoData = await infoResponse.json();
  assert.deepEqual(infoData.settings.contactNumbers, [
    { title: 'Support', value: '+966500000000' },
  ]);
  assert.equal(infoData.settings.socialMedia.twitter, 'https://x.example');
  assert.equal(infoData.settings.socialMedia.email, 'support@example.com');

  const clearResponse = await fetch(`${baseUrl}/api/admin/update-settings`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-platform-admin-token': 'test-platform-admin-token',
    },
    body: JSON.stringify({
      newSettings: {
        contactNumbers: [],
        socialMedia: { twitter: '', email: '' },
      },
    }),
  });
  assert.equal(clearResponse.status, 200);
});

test('platform settings reject malformed bank, contact, and social data', async () => {
  for (const newSettings of [
    {
      bankAccounts: [
        {
          bankName: 'Test bank',
          accountName: 'Test account',
          iban: 'SA6210000000000000000000',
        },
      ],
    },
    {
      contactNumbers: [
        { title: 'Support', value: '+966500000000', secret: 'unexpected' },
      ],
    },
    { socialMedia: { twitter: 'http://insecure.example' } },
    { adminToken: 'unexpected' },
  ]) {
    const response = await fetch(`${baseUrl}/api/admin/update-settings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-platform-admin-token': 'test-platform-admin-token',
      },
      body: JSON.stringify({ newSettings }),
    });

    assert.equal(response.status, 400);
    assert.equal((await response.json()).success, false);
  }
});

test('regulatory action endpoint previews all five options without claiming integration', async () => {
  for (const chosenAction of ['Sell', 'Rent', 'Mortgage', 'Develop', 'Invest']) {
    const response = await fetch(`${baseUrl}/api/regulatory/mega-connect`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        nationalId: '1234567890',
        propertyDeedNumber: 'DEED-TEST',
        chosenAction,
      }),
    });
    const data = await response.json();

    assert.equal(response.status, 200);
    assert.equal(data.previewOnly, true);
    assert.equal(data.submittedToAuthorities, false);
    assert.equal(data.deedVerified, false);
    assert.equal(data.currentAction, chosenAction);
    assert.equal(data.systemStatus, 'Not_Submitted');
    assert.equal(data.nationalId, undefined);
  }
});

test('regulatory action endpoint rejects malformed identity, deed, and action values', async () => {
  for (const body of [
    { nationalId: '123', propertyDeedNumber: 'DEED-TEST', chosenAction: 'Sell' },
    { nationalId: '1234567890', propertyDeedNumber: '', chosenAction: 'Sell' },
    {
      nationalId: '1234567890',
      propertyDeedNumber: 'DEED-TEST',
      chosenAction: 'toString',
    },
  ]) {
    const response = await fetch(`${baseUrl}/api/regulatory/mega-connect`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    assert.equal(response.status, 400);
    assert.equal((await response.json()).success, false);
  }
});

test('subscription request does not claim activation before payment is integrated', async () => {
  const response = await fetch(`${baseUrl}/api/subscriptions/subscribe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId: 'owner_1', planType: 'monthly' }),
  });
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.plan.price, 99);
  assert.equal(data.subscriptionActivated, false);
  assert.equal(data.paymentRequired, true);
});

test('subscription route rejects unknown plans', async () => {
  const response = await fetch(`${baseUrl}/api/subscriptions/subscribe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId: 'owner_1', planType: 'toString' }),
  });

  assert.equal(response.status, 400);
});

test('flexible deal uses the asset rate and divides broker shares exactly', async () => {
  const deal = createFlexibleDeal({
    assetType: 'realestate_sale',
    price: '1000000',
    brokerIds: ['broker_1', 'broker_2'],
  });
  assert.equal(deal.saeiAmount, 10000);
  assert.equal(deal.platformShare, 5000);
  assert.deepEqual(deal.brokerShares, [
    { brokerId: 'broker_1', amount: 2500 },
    { brokerId: 'broker_2', amount: 2500 },
  ]);
  assert.equal(deal.status, 'awaiting_payment');
  assert.equal(deal.payoutsExecuted, false);

  const response = await fetch(`${baseUrl}/api/deals/create-flexible`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      assetType: 'realestate_sale',
      price: '1000000',
      brokerIds: ['broker_1', 'broker_2'],
    }),
  });
  const data = await response.json();

  assert.equal(response.status, 503);
  assert.equal(data.code, 'DATABASE_NOT_CONFIGURED');
});

test('flexible deal supports a custom saei and reports unassigned broker share', async () => {
  const deal = createFlexibleDeal({
    assetType: 'gold',
    price: 1000,
    customSaeiAmount: '80.25',
    brokerIds: [],
  });
  assert.equal(deal.saeiAmount, 80.25);
  assert.equal(deal.platformShare, 40.13);
  assert.equal(deal.unassignedBrokerShare, 40.12);

  const response = await fetch(`${baseUrl}/api/deals/create-flexible`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      assetType: 'gold',
      price: 1000,
      customSaeiAmount: '80.25',
      brokerIds: [],
    }),
  });
  const data = await response.json();

  assert.equal(response.status, 503);
  assert.equal(data.code, 'DATABASE_NOT_CONFIGURED');
});

test('flexible deal rejects invalid asset types and broker lists', async () => {
  const response = await fetch(`${baseUrl}/api/deals/create-flexible`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      assetType: 'unknown',
      price: 1000,
      brokerIds: ['broker_1', 'broker_1'],
    }),
  });

  assert.equal(response.status, 400);
});

test('office profile refuses to report success without a configured database', async () => {
  const response = await fetch(`${baseUrl}/api/office/profile`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fullName: 'Test', phone: '+966500000000' }),
  });
  const data = await response.json();

  assert.equal(response.status, 503);
  assert.equal(data.success, false);
  assert.equal(data.code, 'DATABASE_NOT_CONFIGURED');
});

test('ledger accepts custom commercial categories and supported deal purposes', async () => {
  const response = await fetch(`${baseUrl}/api/ledger/add`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      itemType: 'إعلان عقاري',
      title: 'مقر شركة تجاري',
      assetCategory: 'مقر شركة تقنية',
      dealType: 'استثمار',
      price: 2500000,
      area: 1200,
      location: 'الرياض',
      ownerType: 'مالك',
    }),
  });
  const data = await response.json();

  assert.equal(response.status, 503);
  assert.equal(data.success, false);
  assert.equal(data.code, 'DATABASE_NOT_CONFIGURED');
});

test('ledger rejects unsupported deal purposes and overlong custom categories', async () => {
  for (const invalidFields of [
    { dealType: 'تداول' },
    { assetCategory: 'x'.repeat(101) },
  ]) {
    const response = await fetch(`${baseUrl}/api/ledger/add`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        itemType: 'عرض أصل',
        title: 'فرصة تجارية',
        assetCategory: 'مستودع',
        dealType: 'شراء',
        ...invalidFields,
      }),
    });

    assert.equal(response.status, 400);
    assert.equal((await response.json()).success, false);
  }
});

test('ledger does not accept a contact number without explicit privacy consent', async () => {
  const response = await fetch(`${baseUrl}/api/ledger/add`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      itemType: 'إعلان عقاري',
      title: 'إعلان تجريبي',
      assetCategory: 'أراضي',
      dealType: 'بيع',
      contactPhone: '+966500000000',
    }),
  });

  assert.equal(response.status, 400);
  assert.equal((await response.json()).success, false);
});

test('assistant endpoint reports that no AI provider is configured', async () => {
  const response = await fetch(`${baseUrl}/api/ai/assistant`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'أريد نصيحة عقارية' }),
  });
  const data = await response.json();

  assert.equal(response.status, 503);
  assert.equal(data.code, 'AI_ASSISTANT_NOT_CONFIGURED');
});

test('compliance route requires license information and a chamber stamp for metals', async () => {
  const missingLicenseResponse = await fetch(
    `${baseUrl}/api/compliance/validate-deal-flexible`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ assetType: 'gold', price: 10000 }),
    },
  );
  assert.equal(missingLicenseResponse.status, 422);

  const missingStampResponse = await fetch(
    `${baseUrl}/api/compliance/validate-deal-flexible`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        assetType: 'gold',
        price: 10000,
        licenseNumber: 'REG-123',
        chamberOfCommerceStampAttached: false,
      }),
    },
  );
  assert.equal(missingStampResponse.status, 422);
  assert.equal(
    (await missingStampResponse.json()).code,
    'CHAMBER_STAMP_INFORMATION_REQUIRED',
  );
});

test('compliance route accepts documentation for manual review without claiming verification', async () => {
  const response = await fetch(`${baseUrl}/api/compliance/validate-deal-flexible`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      assetType: 'gold',
      price: '10000',
      licenseNumber: 'REG-123',
      chamberOfCommerceStampAttached: true,
    }),
  });
  const data = await response.json();

  assert.equal(response.status, 202);
  assert.equal(data.calculatedSaei, 100);
  assert.equal(data.complianceVerified, false);
  assert.equal(data.manualReviewRequired, true);
  assert.equal(data.isBypassed, false);
  assert.equal(data.draftAcknowledged, false);
});

test('compliance route records draft acknowledgment without claiming a signature', async () => {
  const response = await fetch(`${baseUrl}/api/compliance/validate-deal-flexible`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      assetType: 'gold',
      price: '10000',
      licenseNumber: 'REG-123',
      chamberOfCommerceStampAttached: true,
      draftAcknowledged: true,
    }),
  });
  const data = await response.json();

  assert.equal(response.status, 202);
  assert.equal(data.draftAcknowledged, true);
  assert.equal(data.complianceVerified, false);
  assert.equal(data.manualReviewRequired, true);
});

test('compliance route rejects malformed draft acknowledgment', async () => {
  const response = await fetch(`${baseUrl}/api/compliance/validate-deal-flexible`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      assetType: 'gold',
      price: '10000',
      licenseNumber: 'REG-123',
      chamberOfCommerceStampAttached: true,
      draftAcknowledged: 'yes',
    }),
  });

  assert.equal(response.status, 400);
});

test('compliance route applies the configured real-estate location policy', async () => {
  const response = await fetch(`${baseUrl}/api/compliance/validate-deal-flexible`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      assetType: 'realestate_sale',
      price: 100000,
      userNationality: 'Non-Saudi',
      propertyLocation: 'Makkah',
      licenseNumber: 'LIC-123',
    }),
  });

  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'REQUIRES_LEGAL_REVIEW');
});

test('compliance bypass requires its server-side token and remains pending manual review', async () => {
  const payload = {
    assetType: 'realestate_sale',
    price: 100000,
    isSuperDeveloperBypass: true,
  };
  const unauthorizedResponse = await fetch(
    `${baseUrl}/api/compliance/validate-deal-flexible`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  assert.equal(unauthorizedResponse.status, 403);

  const authorizedResponse = await fetch(
    `${baseUrl}/api/compliance/validate-deal-flexible`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-compliance-bypass-token': 'test-compliance-bypass-token',
      },
      body: JSON.stringify({ ...payload, customSaeiAmount: '123.45' }),
    },
  );
  const data = await authorizedResponse.json();

  assert.equal(authorizedResponse.status, 202);
  assert.equal(data.calculatedSaei, 123.45);
  assert.equal(data.isBypassed, true);
  assert.equal(data.complianceVerified, false);
  assert.equal(data.manualReviewRequired, true);
});

test('compliance route rejects malformed amounts and bypass flags', async () => {
  const response = await fetch(`${baseUrl}/api/compliance/validate-deal-flexible`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      assetType: 'gold',
      price: '1e6',
      isSuperDeveloperBypass: 'true',
    }),
  });

  assert.equal(response.status, 400);
});

test('deal compliance route requires licenses and scrap security-clearance information', async () => {
  const missingLicenseResponse = await fetch(
    `${baseUrl}/api/compliance/validate-deal`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ assetType: 'gold', price: 10000 }),
    },
  );
  assert.equal(missingLicenseResponse.status, 422);
  assert.match(
    (await missingLicenseResponse.json()).requiredLicense,
    /شهادة مطابقة العيار والدمغة/,
  );

  const missingSecurityClearanceResponse = await fetch(
    `${baseUrl}/api/compliance/validate-deal`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        assetType: 'scrap',
        price: 10000,
        licenseNumber: 'LICENSE-1',
        securityClearanceAttached: false,
      }),
    },
  );
  assert.equal(missingSecurityClearanceResponse.status, 422);
  assert.equal(
    (await missingSecurityClearanceResponse.json()).code,
    'SECURITY_CLEARANCE_INFORMATION_REQUIRED',
  );
});

test('deal compliance route records a manual-review request without claiming a signed draft', async () => {
  const response = await fetch(`${baseUrl}/api/compliance/validate-deal`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      assetType: 'scrap',
      price: '10000',
      licenseNumber: 'LICENSE-1',
      securityClearanceAttached: true,
    }),
  });
  const data = await response.json();

  assert.equal(response.status, 202);
  assert.equal(data.calculatedSaei, 200);
  assert.equal(data.complianceStatus, 'pending_manual_review');
  assert.equal(data.complianceVerified, false);
  assert.equal(data.draftStatus, 'not_generated');
  assert.equal(data.contractSigned, false);
  assert.equal(data.communicationUnlocked, false);
  assert.match(data.disclaimer, /لا ينشئ عقداً أو توقيعاً إلكترونياً/);
});

test('deal compliance route sends restricted-location cases for legal review', async () => {
  const response = await fetch(`${baseUrl}/api/compliance/validate-deal`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      assetType: 'realestate_rent',
      price: 100000,
      userNationality: 'Non-Saudi',
      propertyLocation: 'Madinah',
      licenseNumber: 'LICENSE-2',
    }),
  });
  const data = await response.json();

  assert.equal(response.status, 403);
  assert.equal(data.actionRequired, 'MANUAL_LEGAL_REVIEW');
  assert.doesNotMatch(data.message, /تم قفل|تحويل العقد/);
});

test('deal compliance route validates real-estate fields and amount', async () => {
  const missingLocationResponse = await fetch(
    `${baseUrl}/api/compliance/validate-deal`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        assetType: 'realestate_sale',
        price: 100000,
        licenseNumber: 'LICENSE-3',
      }),
    },
  );
  assert.equal(missingLocationResponse.status, 400);

  const invalidPriceResponse = await fetch(
    `${baseUrl}/api/compliance/validate-deal`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        assetType: 'stocks',
        price: 'Infinity',
        licenseNumber: 'LICENSE-4',
      }),
    },
  );
  assert.equal(invalidPriceResponse.status, 400);
});

test('Google Meet route does not return a fabricated meeting link', async () => {
  const response = await fetch(`${baseUrl}/api/meetings/google-meet`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  const data = await response.json();

  assert.equal(response.status, 501);
  assert.equal(data.success, false);
  assert.equal(data.code, 'GOOGLE_MEET_NOT_CONFIGURED');
  assert.equal(data.meetUrl, undefined);
});

test('chat monitor accepts browser requests from the same origin', async () => {
  const response = await fetch(`${baseUrl}/api/ai/monitor-chat`, {
    method: 'POST',
    headers: {
      origin: baseUrl,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      chatId: 'ROOM_101',
      messageText: 'مرحباً',
      senderId: 'web_client',
    }),
  });

  assert.equal(response.status, 200);
  assert.equal((await response.json()).suspicious, false);
});

test('chat monitor flags configured phrases and reports keyword analysis', async () => {
  const response = await fetch(`${baseUrl}/api/ai/monitor-chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chatId: 'ROOM_101',
      messageText: 'أرسل لي رقمي للتواصل',
      senderId: 'user_client',
    }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    analysed: true,
    suspicious: true,
    notifiedDevelopers: 0,
    analysisMethod: 'keyword-match',
  });
});

test('chat monitor rejects missing fields', async () => {
  const response = await fetch(`${baseUrl}/api/ai/monitor-chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chatId: 'ROOM_101', messageText: 'مرحبا' }),
  });

  assert.equal(response.status, 400);
  assert.equal((await response.json()).success, false);
});

test('finance endpoint returns an exact allocation preview without claiming payment', async () => {
  const response = await fetch(`${baseUrl}/api/finance/split-saei-payment`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dealId: 'DEAL_1', totalSaeiPaid: '1000.25' }),
  });
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.platformAmount, 500.13);
  assert.equal(data.mainBrokerAmount, 300.08);
  assert.equal(data.additionalBrokerAmount, 200.04);
  assert.equal(
    data.platformAmount + data.mainBrokerAmount + data.additionalBrokerAmount,
    data.totalSaeiPaid,
  );
  assert.equal(data.payoutsExecuted, false);
});

test('finance endpoint rejects invalid amounts', async () => {
  const response = await fetch(`${baseUrl}/api/finance/split-saei-payment`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dealId: 'DEAL_1', totalSaeiPaid: -10 }),
  });

  assert.equal(response.status, 400);
  assert.equal((await response.json()).success, false);
});
