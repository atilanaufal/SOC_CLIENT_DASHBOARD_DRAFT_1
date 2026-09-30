import assert from 'assert';
import {
  signSessionToken,
  verifySessionToken,
  SESSION_MAX_IDLE_MS,
} from '../lib/session.ts';

async function runSessionUnitTests() {
  console.log('--- RUNNING CRYPTOGRAPHIC SESSION UNIT TESTS ---');

  const validPayload = {
    sessionId: 'test-session-uuid-1234',
    userId: 1,
    username: 'usertenanta',
    role: 'tenant',
    issuedAt: Date.now(),
    lastActive: Date.now(),
  };

  // Test 1: Sign and verify valid session
  const token = await signSessionToken(validPayload);
  assert(token.includes('.'), 'Token must contain signature delimiter "."');
  const verified = await verifySessionToken(token);
  assert(verified !== null, 'Valid token must be verified');
  assert.strictEqual(verified.sessionId, validPayload.sessionId);
  assert.strictEqual(verified.userId, 1);
  console.log('✓ PASS: Valid token successfully signed and verified');

  // Test 2: Tamper payload data (e.g. change userId from 1 to 2)
  const [dataB64, sig] = token.split('.');
  const rawJson = Buffer.from(dataB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
  const tamperedJson = rawJson.replace('"userId":1', '"userId":2');
  const tamperedB64 = Buffer.from(tamperedJson).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const tamperedToken = `${tamperedB64}.${sig}`;

  const tamperedResult = await verifySessionToken(tamperedToken);
  assert.strictEqual(tamperedResult, null, 'Tampered payload must be rejected');
  console.log('✓ PASS: Tampered payload rejected by HMAC verification');

  // Test 3: Tamper signature
  const brokenSigToken = `${dataB64}.${sig.substring(0, sig.length - 4)}ffff`;
  const brokenSigResult = await verifySessionToken(brokenSigToken);
  assert.strictEqual(brokenSigResult, null, 'Invalid signature must be rejected');
  console.log('✓ PASS: Invalid signature rejected');

  // Test 4: Missing lastActive attribute (Bypass attempt)
  const noLastActiveJson = rawJson.replace(/,"lastActive":\d+/, '');
  const noLastActiveB64 = Buffer.from(noLastActiveJson).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const tokenNoLastActive = await signSessionToken(JSON.parse(noLastActiveJson));
  const noLastActiveResult = await verifySessionToken(tokenNoLastActive);
  assert.strictEqual(noLastActiveResult, null, 'Payload without lastActive must be rejected');
  console.log('✓ PASS: Missing lastActive rejected (prevents immortal session)');

  // Test 5: Expired session (idle timeout > 15 mins)
  const expiredPayload = {
    ...validPayload,
    lastActive: Date.now() - (SESSION_MAX_IDLE_MS + 5000),
  };
  const expiredToken = await signSessionToken(expiredPayload);
  const expiredResult = await verifySessionToken(expiredToken);
  assert.strictEqual(expiredResult, null, 'Expired session must be rejected');
  console.log('✓ PASS: Inactivity timeout (>15 mins) strictly enforced server-side');

  // Test 6: Future clock manipulation attempt
  const futurePayload = {
    ...validPayload,
    lastActive: Date.now() + 10 * 60 * 1000, // 10 minutes in future
  };
  const futureToken = await signSessionToken(futurePayload);
  const futureResult = await verifySessionToken(futureToken);
  assert.strictEqual(futureResult, null, 'Future timestamp manipulation must be rejected');
  console.log('✓ PASS: Future clock manipulation rejected');

  // Test 7: Plaintext JSON injection attempt (from Pentest report)
  const pentestRawJson = JSON.stringify({
    id: 'cdb6eceleca04fa0b60be27f67f69d41',
    tenant_id: 3,
    username: 'usertenanta',
    database_name: 'tenant_c',
    last_active: Date.now(),
  });
  const pentestResult = await verifySessionToken(pentestRawJson);
  assert.strictEqual(pentestResult, null, 'Raw JSON injection must be rejected');
  console.log('✓ PASS: Pentest raw JSON cookie injection rejected');

  console.log('\nALL 7 SESSION UNIT TESTS PASSED SUCCESSFULLY!\n');
}

runSessionUnitTests().catch((err) => {
  console.error('Test failure:', err);
  process.exit(1);
});
