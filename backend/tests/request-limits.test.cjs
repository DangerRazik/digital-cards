const test = require('node:test');
const assert = require('node:assert/strict');
const { RequestLimiter, getClientAddress, getLoginKey } = require('../src/auth/request-limits.ts');

test('Limits are isolated by user, account, and operation; windows expire', () => {
  const limiter = new RequestLimiter();
  assert.equal(limiter.consume('write:user-a', 2, 60000, 1000), 0);
  assert.equal(limiter.consume('write:user-a', 2, 60000, 1000), 0);
  assert.equal(limiter.consume('write:user-a', 2, 60000, 1000), 60);
  assert.equal(limiter.consume('write:user-b', 2, 60000, 1000), 0);
  assert.equal(limiter.consume('upload:user-a', 2, 60000, 1000), 0);
  assert.equal(limiter.consume('write:user-a', 2, 60000, 61000), 0);
  assert.notEqual(getLoginKey('office', {email: 'a@example.com'}), getLoginKey('office', {email: 'b@example.com'}));
  assert.equal(getLoginKey('office', {email: ' A@example.com '}), getLoginKey('office', {email: 'a@example.com'}));
});

test('Only an explicitly trusted loopback proxy can supply an IP', () => {
  const previous = process.env.TRUST_LOCAL_PROXY;
  const request = {
    socket: { remoteAddress: '127.0.0.1' },
    headers: { 'x-real-ip': '192.0.2.10' },
  };
  try {
    delete process.env.TRUST_LOCAL_PROXY;
    assert.equal(getClientAddress(request), '127.0.0.1');
    process.env.TRUST_LOCAL_PROXY = 'true';
    assert.equal(getClientAddress(request), '192.0.2.10');
    request.socket.remoteAddress = '192.0.2.20';
    assert.equal(getClientAddress(request), '192.0.2.20');
    request.socket.remoteAddress = '127.0.0.1';
    request.headers['x-real-ip'] = '192.0.2.10, 192.0.2.20';
    assert.equal(getClientAddress(request), '127.0.0.1');
  } finally {
    if (previous === undefined) {
      delete process.env.TRUST_LOCAL_PROXY;
    } else {
      process.env.TRUST_LOCAL_PROXY = previous;
    }
  }
});
