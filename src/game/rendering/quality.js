export const QUALITY = Object.freeze({
  low: {label: '流畅', pixelRatio: 1, shadowSize: 1024, shadowRadius: 52, ao: false, bloom: false, reflectionSize: 64, reflectionInterval: 0, treeDistance: 110},
  medium: {label: '均衡', pixelRatio: 1.25, shadowSize: 2048, shadowRadius: 66, ao: false, bloom: true, reflectionSize: 128, reflectionInterval: 1.5, treeDistance: 160},
  high: {label: '精细', pixelRatio: 1.5, shadowSize: 4096, shadowRadius: 90, ao: true, bloom: true, reflectionSize: 256, reflectionInterval: .75, treeDistance: 220}
});
export const normalizeQuality = value => Object.hasOwn(QUALITY, value) ? value : 'medium';

export function readQuality() {
  try { return normalizeQuality(localStorage.getItem('greyport.quality')); }
  catch { return 'medium'; }
}
