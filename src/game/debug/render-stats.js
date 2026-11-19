export class RenderStats {
  constructor() { this.samples = []; this.last = null; this.result = {}; }
  frame(now, renderer) {
    if (this.last !== null && !document.hidden) {
      this.samples.push(now - this.last);
      if (this.samples.length > 600) this.samples.shift();
    }
    this.last = now;
    if (this.samples.length && (!this.at || now - this.at > 1000)) {
      const sorted = [...this.samples].sort((a, b) => a - b);
      this.result = {frames: sorted.length, fps: 1000 / (this.samples.reduce((a, b) => a + b, 0) / sorted.length),
        p95: sorted[Math.floor((sorted.length - 1) * .95)], max:sorted[sorted.length-1],slowFrames:sorted.filter(v=>v>33.4).length,calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures};
      this.at = now;
    }
    return this.result;
  }
  reset() { this.samples.length = 0; this.last = null; this.at = null; }
}
