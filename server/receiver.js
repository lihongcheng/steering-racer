import { credentials, decode, encode, FLAGS, isNewer, now, TYPES } from './protocol.js';

export class Receiver {
  constructor({ clock = now, send = () => {}, timeoutMs = 250 } = {}) {
    this.clock = clock;
    this.send = send;
    this.timeoutMs = timeoutMs;
    this.auth = credentials();
    this.reset();
  }

  reset() {
    this.onReset?.();
    this.clientId = 0;
    this.peer = null;
    this.source = null;
    this.armed = false;
    this.reason = '等待手机连接';
    this.input = { steer: 0, angle: 0, throttle: 0, brake: 0, sensorHz: 0, rttMs: -1 };
    this.lastSeq = null;
    this.sampleSeq = null;
    this.sampleTime = -1;
    this.sampleAt = null;
    this.lastPacketAt = null;
    this.offset = null;
    this.calibrated = false;
    this.lastCommand = null;
    this.commandAck = null;
    this.stats = { accepted: 0, missing: 0, rejected: 0, old: 0, stale: 0 };
    this.arrivals = [];
    this.replySeq = 0;
  }

  rotate() { this.auth = credentials(); this.reset(); }
  stop(reason) { this.armed = false; this.reason = reason; }
  samePeer(peer) { return this.peer?.address === peer.address && this.peer?.port === peer.port; }

  reply(type, request, values = [], flags = 0) {
    if (!this.peer) return;
    this.send(encode({ type, seq: request.seq, sampleSeq: this.sampleSeq ?? 0, time: request.time, values, flags }, this.auth), this.peer);
  }

  handle(bytes, peer, source = 'iphone') {
    const packet = decode(bytes, this.auth);
    if (!packet) { this.stats.rejected++; return; }
    const t = this.clock();
    if (packet.type === TYPES.HELLO) {
      if (this.samePeer(peer) && this.clientId !== packet.sampleSeq) this.reset();
      // A suspended/restarted App may get a new source port. Never replace a live peer.
      if (this.peer && !this.samePeer(peer) && peer.address === this.peer.address && t - this.lastPacketAt > 2000) this.reset();
      if (this.peer && !this.samePeer(peer)) { this.stats.rejected++; return; }
      if (!this.peer) {
        this.peer = { address: peer.address, port: peer.port };
        this.source = source;
        this.clientId = packet.sampleSeq;
        this.offset = t - packet.time;
        this.reason = '已连接，请在手机上校准并开始';
      }
      this.lastPacketAt = t;
      this.reply(TYPES.WELCOME, packet, [3]);
      return;
    }
    if (!this.samePeer(peer)) { this.stats.rejected++; return; }
    if (packet.type === TYPES.GAME_COMMAND) {
      if (packet.sampleSeq !== this.clientId || this.source !== 'iphone') { this.stats.rejected++; return; }
      this.lastPacketAt = t;
      this.onGameCommand?.(packet);
      return;
    }
    if (packet.type === TYPES.PING) {
      this.lastPacketAt = t;
      this.reply(TYPES.PONG, packet);
      return;
    }
    if (packet.type === TYPES.COMMAND) {
      if (![0, 1].includes(packet.values[0])) { this.stats.rejected++; return; }
      // Retries return the original result; a replay can never re-arm after a timeout.
      if (this.lastCommand === packet.seq) {
        this.reply(TYPES.ACK, packet, [this.commandAck]);
        return;
      }
      if (this.lastCommand !== null && !isNewer(packet.seq, this.lastCommand)) return;
      this.tick();
      this.lastCommand = packet.seq;
      const requested = packet.values[0] === 1;
      const fresh = this.sampleAt !== null && t - this.sampleAt < this.timeoutMs;
      this.commandAck = requested && (!this.calibrated || !fresh) ? -1 : (requested ? 1 : 0);
      if (this.commandAck === 1) { this.armed = true; this.reason = '体感控制中'; }
      if (this.commandAck === 0) this.stop('已暂停');
      this.reply(TYPES.ACK, packet, [this.commandAck]);
      return;
    }
    if (packet.type !== TYPES.INPUT) return;
    if (this.lastSeq !== null && !isNewer(packet.seq, this.lastSeq)) { this.stats.old++; return; }
    if (this.lastSeq !== null) this.stats.missing += Math.min(((packet.seq - this.lastSeq) >>> 0) - 1, 100000);
    this.lastSeq = packet.seq;
    this.lastPacketAt = t;
    this.stats.accepted++;
    this.arrivals.push(t);
    this.offset = Math.min(this.offset ?? Infinity, t - packet.time);
    const age = t - (packet.time + this.offset);
    const freshFlag = Boolean(packet.flags & FLAGS.FRESH);
    const newSample = this.sampleSeq === null || isNewer(packet.sampleSeq, this.sampleSeq);
    if (freshFlag && newSample && packet.time > this.sampleTime && age < this.timeoutMs) {
      this.sampleSeq = packet.sampleSeq;
      this.sampleTime = packet.time;
      this.sampleAt = Math.min(t, packet.time + this.offset);
      this.calibrated = Boolean(packet.flags & FLAGS.CALIBRATED);
      const [steer, angle, throttle, brake, sensorHz, rttMs] = packet.values;
      this.input = { steer, angle, throttle, brake, sensorHz, rttMs };
    } else if (newSample) this.stats.stale++;
    // An inactive packet is also a persistent pause request, independently of command ACKs.
    if (!(packet.flags & FLAGS.ACTIVE) && this.armed) this.stop('手机已暂停');
    if (!(packet.flags & FLAGS.CALIBRATED)) {
      this.calibrated = false;
      if (this.armed) this.stop('需要重新校准');
    }
    this.tick();
  }

  tick() {
    const t = this.clock();
    while (this.arrivals.length && this.arrivals[0] < t - 1000) this.arrivals.shift();
    if (this.armed && (this.sampleAt === null || t - this.sampleAt >= this.timeoutMs)) this.stop('体感超时，已自动暂停');
    if (this.peer && this.lastPacketAt !== null && t - this.lastPacketAt > 2000) this.stop('连接中断，请在手机上重新连接');
  }

  statusPacket() {
    this.tick();
    const s = this.snapshot();
    this.reply(TYPES.STATUS, { seq: this.replySeq++ >>> 0, time: this.clock() }, [this.armed ? 1 : 0, s.gapPercent, s.receiveHz, s.sampleAgeMs ?? -1], this.armed ? FLAGS.ACTIVE : 0);
  }

  snapshot() {
    this.tick();
    const age = this.sampleAt === null ? null : Math.max(0, this.clock() - this.sampleAt);
    return {
      source: this.source, connected: this.peer !== null && this.clock() - this.lastPacketAt < 2000,
      peer: this.peer?.address ?? null, armed: this.armed, calibrated: this.calibrated,
      reason: this.reason, sampleAgeMs: age, receiveHz: this.arrivals.length,
      gapPercent: this.stats.accepted + this.stats.missing ? 100 * this.stats.missing / (this.stats.accepted + this.stats.missing) : 0,
      stats: { ...this.stats }, rawAngle: this.input.angle,
      ...this.input, steer: this.armed ? this.input.steer : 0,
      angle: this.armed ? this.input.angle : 0,
      throttle: this.armed ? this.input.throttle : 0, brake: this.armed ? this.input.brake : 0,
      timeoutMs: this.timeoutMs
    };
  }
}
