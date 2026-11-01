import dgram from 'node:dgram';
import { encode, FLAGS, now, TYPES } from './protocol.js';

// This deliberately travels through the actual UDP socket and authentication parser.
export class Simulator {
  constructor(auth, port) {
    this.auth = auth; this.port = port; this.socket = dgram.createSocket('udp4');
    this.seq = 0; this.sampleSeq = 0; this.angle = 0; this.throttle = 0; this.brake = 0;
    this.running = false; this.armed = false; this.command = 10;
  }
  async start() {
    await new Promise((resolve, reject) => { this.socket.once('error', reject); this.socket.bind(0, '127.0.0.1', resolve); });
    this.socket.on('error', () => {});
    this.running = true;
    this.send({ type: TYPES.HELLO, seq: 1 });
    this.interval = setInterval(() => this.input(), 1000 / 60);
    this.armTimer = setTimeout(() => {
      this.armed = true;
      this.send({ type: TYPES.COMMAND, seq: this.command++, values: [1] });
    }, 150);
  }
  send(packet) {
    if (this.running) this.socket.send(encode({ time: now(), ...packet }, this.auth), this.port, '127.0.0.1');
  }
  input() {
    const steer = Math.sign(this.angle) * Math.max(0, Math.min(1, (Math.abs(this.angle) - 2) / 33));
    this.send({ type: TYPES.INPUT, seq: this.seq++ >>> 0, sampleSeq: this.sampleSeq++ >>> 0,
      flags: FLAGS.CALIBRATED | FLAGS.FRESH | (this.armed ? FLAGS.ACTIVE : 0),
      values: [steer, this.angle, this.throttle, this.brake, 60, -1] });
  }
  stop() {
    clearInterval(this.interval); clearTimeout(this.armTimer);
    this.running = false; this.socket.close();
  }
}
