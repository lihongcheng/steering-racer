import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Receiver } from '../server/receiver.js';
import { decode, encode, FLAGS, TYPES } from '../server/protocol.js';

function fixture() {
  let clock = 1000;
  const replies = [];
  const peer = { address: '192.0.2.10', port: 50000 };
  const receiver = new Receiver({ clock: () => clock, send: bytes => replies.push(decode(bytes, receiver.auth)) });
  const send = (packet, address = peer) => receiver.handle(encode({ time: clock, ...packet }, receiver.auth), address);
  const input = (seq, options = {}) => send({ type: TYPES.INPUT, seq, sampleSeq: seq, flags: 7, values: [0.5, 18.5, 1, 0, 100, 4], ...options });
  send({ type: TYPES.HELLO, seq: 1 });
  return { receiver, replies, peer, send, input, advance: ms => clock += ms };
}

test('requires pairing, fresh calibrated input, and an explicit arm command', () => {
  const f = fixture();
  f.send({ type: TYPES.COMMAND, seq: 1, values: [1] });
  assert.equal(f.replies.at(-1).values[0], -1);
  f.input(1); assert.equal(f.receiver.snapshot().steer, 0);
  f.send({ type: TYPES.COMMAND, seq: 2, values: [1] });
  assert.equal(f.receiver.snapshot().steer, 0.5);
  assert.equal(f.receiver.snapshot().throttle, 1);
});

test('old and reordered input cannot overwrite current steering; gap metric is explicit', () => {
  const f = fixture(); f.input(1); f.send({ type: TYPES.COMMAND, seq: 1, values: [1] });
  f.advance(20); f.input(3, { values: [-1, -35, 0, 1, 100, 4] });
  f.input(2); f.input(3);
  const s = f.receiver.snapshot();
  assert.equal(s.steer, -1); assert.equal(s.stats.old, 2); assert.equal(s.stats.missing, 1);
  assert.equal(s.stats.accepted, 2);
});

test('heartbeats and repeated samples cannot keep stale controls alive', () => {
  const f = fixture(); f.input(1); f.send({ type: TYPES.COMMAND, seq: 10, values: [1] });
  f.advance(260);
  f.send({ type: TYPES.PING, seq: 20 });
  f.input(2, { sampleSeq: 1, time: 1000 });
  assert.equal(f.receiver.snapshot().armed, false);
  assert.equal(f.receiver.snapshot().throttle, 0);
  // A delayed retry returns the old ACK but cannot re-arm the receiver.
  f.send({ type: TYPES.COMMAND, seq: 10, values: [1] });
  assert.equal(f.replies.at(-1).values[0], 1);
  assert.equal(f.receiver.snapshot().armed, false);
  f.advance(1); f.input(3);
  assert.equal(f.receiver.snapshot().armed, false);
  f.send({ type: TYPES.COMMAND, seq: 11, values: [1] });
  assert.equal(f.receiver.snapshot().armed, true);
});

test('queued sensor timestamps and invalid pose do not masquerade as live samples', () => {
  const f = fixture(); f.input(1); f.send({ type: TYPES.COMMAND, seq: 1, values: [1] });
  f.advance(600); f.input(2, { time: 1010 });
  assert.equal(f.receiver.snapshot().stats.stale, 1);
  assert.equal(f.receiver.snapshot().armed, false);
  f.advance(20); f.input(3, { flags: FLAGS.CALIBRATED | FLAGS.ACTIVE });
  assert.equal(f.receiver.snapshot().sampleAgeMs, 620);
});

test('a pause packet clears output, and command reordering cannot restart it', () => {
  const f = fixture(); f.input(1); f.send({ type: TYPES.COMMAND, seq: 10, values: [1] });
  f.send({ type: TYPES.COMMAND, seq: 11, values: [0] });
  f.send({ type: TYPES.COMMAND, seq: 10, values: [1] });
  assert.equal(f.receiver.snapshot().armed, false);
});

test('one live peer, recovery with a changed source port, and credential rotation', () => {
  const f = fixture(); const previous = f.receiver.auth;
  f.send({ type: TYPES.HELLO }, { address: f.peer.address, port: 50001 });
  assert.equal(f.receiver.peer.port, 50000);
  f.advance(2100); f.send({ type: TYPES.HELLO }, { address: f.peer.address, port: 50001 });
  assert.equal(f.receiver.peer.port, 50001); assert.equal(f.receiver.armed, false);
  f.receiver.rotate();
  f.receiver.handle(encode({ type: TYPES.HELLO }, previous), f.peer);
  assert.equal(f.receiver.peer, null);
});

test('sample and input sequence wrap remains live', () => {
  const f = fixture(); f.input(0xffffffff); f.send({ type: TYPES.COMMAND, seq: 1, values: [1] });
  f.advance(10); f.input(0);
  assert.equal(f.receiver.snapshot().stats.accepted, 2);
  assert.equal(f.receiver.sampleSeq, 0);
});
