'use strict';

const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
process.env.COMPLIANCE_BYPASS_TOKEN = 'test-compliance-bypass-token';
const { app } = require('./server');

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

test('website and external client script are served with same-origin CSP', async () => {
  const pageResponse = await fetch(`${baseUrl}/`);
  const page = await pageResponse.text();
  const scriptResponse = await fetch(`${baseUrl}/app.js`);
  const script = await scriptResponse.text();
  const contentSecurityPolicy = pageResponse.headers.get('content-security-policy');

  assert.equal(pageResponse.status, 200);
  assert.match(page, /<script src="\/app\.js" defer><\/script>/);
  assert.match(page, /id="compliance-form"/);
  assert.match(page, /id="chamber-stamp-checkbox"/);
  assert.match(page, /id="custom-saei-flex"/);
  assert.match(page, /id="developer-bypass-checkbox" disabled/);
  assert.match(page, /id="contract-modal"/);
  assert.match(page, /id="accept-contract"/);
  assert.doesNotMatch(page, /onclick=/i);
  assert.doesNotMatch(page, /<script>[\s\S]*<\/script>/);
  assert.ok(contentSecurityPolicy?.includes("script-src 'self'"));
  assert.equal(scriptResponse.status, 200);
  assert.match(script, /\/api\/ai\/monitor-chat/);
  assert.match(script, /\/api\/compliance\/validate-deal-flexible/);
  assert.match(script, /draftAcknowledged: true/);
  assert.match(script, /contractModal\.addEventListener/);
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

  assert.equal(response.status, 201);
  assert.equal(data.saeiAmount, 10000);
  assert.equal(data.platformShare, 5000);
  assert.deepEqual(data.brokerShares, [
    { brokerId: 'broker_1', amount: 2500 },
    { brokerId: 'broker_2', amount: 2500 },
  ]);
  assert.equal(data.status, 'awaiting_payment');
  assert.equal(data.payoutsExecuted, false);
});

test('flexible deal supports a custom saei and reports unassigned broker share', async () => {
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

  assert.equal(response.status, 201);
  assert.equal(data.saeiAmount, 80.25);
  assert.equal(data.platformShare, 40.13);
  assert.equal(data.unassignedBrokerShare, 40.12);
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
