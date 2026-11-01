import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

export const TYPES = Object.freeze({ HELLO: 1, WELCOME: 2, INPUT: 3, PING: 4, PONG: 5, STATUS: 6, COMMAND: 7, ACK: 8, GAME_COMMAND: 9, GAME_ACK: 10, GAME_STATE: 11, GAME_LAPS: 12, GAME_FEEDBACK: 13 });
export const FLAGS = Object.freeze({ CALIBRATED: 1, ACTIVE: 2, FRESH: 4 });
export const PACKET_SIZE = 96;
export const now = () => performance.now();
export const credentials = () => ({ session: randomBytes(16), key: randomBytes(32) });
export const isNewer = (next, previous) => {
  const distance = (next - previous) >>> 0;
  return distance > 0 && distance < 0x80000000;
};

export function encode(packet, auth) {
  const bytes = Buffer.alloc(PACKET_SIZE);
  bytes.write('SWL1', 0, 'ascii');
  bytes[4] = packet.type;
  bytes[5] = packet.flags ?? 0;
  auth.session.copy(bytes, 8);
  bytes.writeUInt32LE((packet.seq ?? 0) >>> 0, 24);
  bytes.writeUInt32LE((packet.sampleSeq ?? 0) >>> 0, 28);
  bytes.writeDoubleLE(packet.time ?? 0, 32);
  for (let i = 0; i < 6; i++) bytes.writeFloatLE(packet.values?.[i] ?? 0, 40 + i * 4);
  createHmac('sha256', auth.key).update(bytes.subarray(0, 64)).digest().copy(bytes, 64);
  return bytes;
}

export function decode(bytes, auth) {
  if (bytes.length !== PACKET_SIZE || bytes.toString('ascii', 0, 4) !== 'SWL1') return null;
  if (bytes[4] < 1 || bytes[4] > 13 || bytes[5] > 7 || bytes.readUInt16LE(6) !== 0) return null;
  if (!timingSafeEqual(bytes.subarray(8, 24), auth.session)) return null;
  const signature = createHmac('sha256', auth.key).update(bytes.subarray(0, 64)).digest();
  if (!timingSafeEqual(signature, bytes.subarray(64))) return null;
  const time = bytes.readDoubleLE(32);
  const values = Array.from({ length: 6 }, (_, i) => bytes.readFloatLE(40 + i * 4));
  if (!Number.isFinite(time) || time < 0 || !values.every(Number.isFinite)) return null;
  const packet = { type: bytes[4], flags: bytes[5], seq: bytes.readUInt32LE(24), sampleSeq: bytes.readUInt32LE(28), time, values };
  if (packet.type === TYPES.INPUT && (Math.abs(values[0]) > 1 || Math.abs(values[1]) > 180 || values[2] < 0 || values[2] > 1 || values[3] < 0 || values[3] > 1 || values[4] < 0 || values[4] > 1000)) return null;
  return packet;
}
