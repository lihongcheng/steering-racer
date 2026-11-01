import { test } from 'node:test';
import assert from 'node:assert/strict';
import { credentials, decode, encode, FLAGS, isNewer, PACKET_SIZE, TYPES } from '../server/protocol.js';

test('packet preserves little-endian values, sequence and HMAC across encode/decode', () => {
  const auth = credentials();
  const packet = { type: TYPES.INPUT, flags: FLAGS.CALIBRATED | FLAGS.FRESH, seq: 0xffffffff, sampleSeq: 901, time: 123456.25, values: [-0.5, -18.5, 1, 0, 99.5, 3.5] };
  const bytes = encode(packet, auth);
  assert.equal(bytes.length, PACKET_SIZE);
  assert.deepEqual(decode(bytes, auth), packet);
});

test('tampering, a different key/session, wrong length and non-finite values are rejected', () => {
  const auth = credentials(); const bytes = encode({ type: TYPES.INPUT }, auth);
  const changed = Buffer.from(bytes); changed[40] ^= 1;
  assert.equal(decode(changed, auth), null);
  assert.equal(decode(bytes, credentials()), null);
  assert.equal(decode(bytes.subarray(1), auth), null);
  assert.equal(decode(Buffer.concat([bytes, Buffer.of(0)]), auth), null);
  for (const value of [NaN, Infinity, 1.1, -1.1]) assert.equal(decode(encode({ type: TYPES.INPUT, values: [value] }, auth), auth), null);
  assert.equal(decode(encode({ type: 99 }, auth), auth), null);
});

test('sequence comparison handles uint32 wrap and rejects old/ambiguous sequences', () => {
  assert.equal(isNewer(0, 0xffffffff), true);
  assert.equal(isNewer(4, 4), false);
  assert.equal(isNewer(0xffffffff, 0), false);
  assert.equal(isNewer(0x80000000, 0), false);
});
