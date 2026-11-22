import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AdminAuthService, verifyCronSecretHeader } from './adminService';

test('AdminAuthService supports first-run scrypt claim, token issuance, and env override', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sparkqr-admin-'));
  const prevEnv = process.env.ADMIN_PASSCODE;
  delete process.env.ADMIN_PASSCODE;

  try {
    const auth = new AdminAuthService(tmpDir, 'server_secret_key_for_hmac');
    assert.equal(auth.getStatus().needsInitialClaim, true);

    const badClaim = auth.claimFirstRunPasscode('123');
    assert.equal(badClaim.ok, false);

    const claim = auth.claimFirstRunPasscode('spark-admin-2026');
    assert.equal(claim.ok, true);
    assert.ok(claim.token);
    assert.equal(auth.verifyAdminToken(claim.token), true);
    assert.equal(auth.verifyAdminToken('123.deadbeef'), false);

    assert.equal(auth.getStatus().needsInitialClaim, false);
    assert.equal(auth.verifyPasscode('spark-admin-2026'), true);
    assert.equal(auth.verifyPasscode('wrong-pass'), false);

    // Second claim must fail
    assert.equal(auth.claimFirstRunPasscode('another-pass').ok, false);

    // Env override takes precedence when set
    process.env.ADMIN_PASSCODE = 'env-master-code';
    assert.equal(auth.getStatus().configuredViaEnv, true);
    assert.equal(auth.verifyPasscode('env-master-code'), true);
    assert.equal(auth.verifyPasscode('spark-admin-2026'), false);
  } finally {
    if (prevEnv === undefined) {
      delete process.env.ADMIN_PASSCODE;
    } else {
      process.env.ADMIN_PASSCODE = prevEnv;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('verifyCronSecretHeader verifies Bearer and X-Cron-Secret headers securely', () => {
  assert.equal(verifyCronSecretHeader('Bearer my-cron-key', undefined, 'my-cron-key'), true);
  assert.equal(verifyCronSecretHeader(undefined, 'my-cron-key', 'my-cron-key'), true);
  assert.equal(verifyCronSecretHeader('Bearer wrong', undefined, 'my-cron-key'), false);
  assert.equal(verifyCronSecretHeader(undefined, undefined, 'my-cron-key'), false);
});
