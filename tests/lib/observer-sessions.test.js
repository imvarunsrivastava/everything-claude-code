/**
 * Tests for scripts/lib/observer-sessions.js
 *
 * Run with: node tests/lib/observer-sessions.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
    failed++;
  }
}

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-observer-sessions-test-'));
}

function cleanupDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

console.log('\n=== observer-sessions.js tests ===\n');

// ──────────────────────────────────────────────────────
// stopObserverForContext — pid file cleanup
// ──────────────────────────────────────────────────────

console.log('--- stopObserverForContext ---');

test('cleans up stale pid file when process does not exist', () => {
  const testDir = createTempDir();
  // Override HOME so getClaudeDir() points into the temp dir
  const origHome = process.env.HOME;
  process.env.HOME = testDir;
  try {
    const obs = require('../../scripts/lib/observer-sessions');
    const context = obs.resolveProjectContext(testDir);
    const pidFile = path.join(context.projectDir, '.observer.pid');
    // Write a PID that certainly does not exist
    fs.writeFileSync(pidFile, '99999999\n');
    const result = obs.stopObserverForContext(context);
    assert.strictEqual(result, false, 'should return false when process does not exist');
    assert.strictEqual(fs.existsSync(pidFile), false, 'should remove stale pid file');
  } finally {
    process.env.HOME = origHome;
    // Uncache module so HOME change takes effect in future requires
    delete require.cache[require.resolve('../../scripts/lib/observer-sessions')];
    cleanupDir(testDir);
  }
});

test('pid guard rejects leading-zero pids that resolve to PID 1', () => {
  const testDir = createTempDir();
  const origHome = process.env.HOME;
  process.env.HOME = testDir;
  try {
    const obs = require('../../scripts/lib/observer-sessions');
    const context = obs.resolveProjectContext(testDir);
    const pidFile = path.join(context.projectDir, '.observer.pid');
    fs.writeFileSync(pidFile, '01\n');
    const result = obs.stopObserverForContext(context);
    // pidNum = Number('01') = 1, should be rejected by pidNum <= 1 guard
    assert.strictEqual(result, false, 'should reject pid that resolves to 1');
    assert.strictEqual(fs.existsSync(pidFile), false, 'should remove invalid pid file');
  } finally {
    process.env.HOME = origHome;
    delete require.cache[require.resolve('../../scripts/lib/observer-sessions')];
    cleanupDir(testDir);
  }
});

// ──────────────────────────────────────────────────────
// listSessionLeases / writeSessionLease / removeSessionLease
// ──────────────────────────────────────────────────────

console.log('\n--- lease lifecycle ---');

test('writeSessionLease creates a lease file with correct sessionId', () => {
  const testDir = createTempDir();
  const origHome = process.env.HOME;
  const origSession = process.env.CLAUDE_SESSION_ID;
  process.env.HOME = testDir;
  process.env.CLAUDE_SESSION_ID = 'test-session-abc';
  try {
    const obs = require('../../scripts/lib/observer-sessions');
    const context = obs.resolveProjectContext(testDir);
    const leaseFile = obs.writeSessionLease(context, 'test-session-abc');
    assert.ok(leaseFile, 'should return the lease file path');
    assert.ok(fs.existsSync(leaseFile), 'lease file should exist');
    const payload = JSON.parse(fs.readFileSync(leaseFile, 'utf8'));
    assert.ok(payload.sessionId, 'lease should contain sessionId');
    assert.strictEqual(typeof payload.pid, 'number', 'lease should contain pid');
    assert.ok(payload.updatedAt, 'lease should contain updatedAt');
  } finally {
    process.env.HOME = origHome;
    process.env.CLAUDE_SESSION_ID = origSession;
    delete require.cache[require.resolve('../../scripts/lib/observer-sessions')];
    cleanupDir(testDir);
  }
});

test('listSessionLeases returns empty array when no leases exist', () => {
  const testDir = createTempDir();
  const origHome = process.env.HOME;
  process.env.HOME = testDir;
  try {
    const obs = require('../../scripts/lib/observer-sessions');
    const context = obs.resolveProjectContext(testDir);
    const leases = obs.listSessionLeases(context);
    assert.deepStrictEqual(leases, [], 'should return empty array when no leases exist');
  } finally {
    process.env.HOME = origHome;
    delete require.cache[require.resolve('../../scripts/lib/observer-sessions')];
    cleanupDir(testDir);
  }
});

test('removeSessionLease removes an existing lease file', () => {
  const testDir = createTempDir();
  const origHome = process.env.HOME;
  process.env.HOME = testDir;
  try {
    const obs = require('../../scripts/lib/observer-sessions');
    const context = obs.resolveProjectContext(testDir);
    obs.writeSessionLease(context, 'session-to-remove');
    assert.strictEqual(obs.listSessionLeases(context).length, 1, 'one lease should exist before removal');
    obs.removeSessionLease(context, 'session-to-remove');
    assert.strictEqual(obs.listSessionLeases(context).length, 0, 'no leases should remain after removal');
  } finally {
    process.env.HOME = origHome;
    delete require.cache[require.resolve('../../scripts/lib/observer-sessions')];
    cleanupDir(testDir);
  }
});

// ──────────────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────────────

console.log('\n=== Test Results ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed + failed}\n`);

process.exit(failed > 0 ? 1 : 0);
