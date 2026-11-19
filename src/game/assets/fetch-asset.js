export async function fetchAsset(url, {signal, attempts = 2, timeout = 20000} = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, {once: true});
    const timer = setTimeout(() => controller.abort(new Error('资源加载超时')), timeout);
    try {
      const response = await fetch(url, {signal: controller.signal});
      if (!response.ok) throw new Error(`资源返回 ${response.status}`);
      return await response.arrayBuffer();
    } catch (error) {
      if (signal?.aborted || attempt === attempts - 1) throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }
}
