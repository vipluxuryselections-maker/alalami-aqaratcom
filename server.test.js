'use strict';

const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
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
  assert.ok(contentSecurityPolicy?.includes("script-src 'self'"));
  assert.equal(scriptResponse.status, 200);
  assert.match(script, /\/api\/ai\/monitor-chat/);
});

test('health endpoint reports the API as available', async () => {
  const response = await fetch(`${baseUrl}/api/health`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    service: 'aqarat-app-api',
  });
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
