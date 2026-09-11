// Public hostnames only. DNS rebinding additionally requires network-level protection.
export function publicUrl(input) {
  try {
    const text = input.trim();
    const url = new URL(/^https?:\/\//i.test(text) ? text : 'https://' + text);
    const host = url.hostname.replace(/\.$/, '').toLowerCase();
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.href.length > 2048 ||
        !host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':') || /(?:^|\.)(localhost|local|internal|home|test|invalid)$/.test(host)) return null;
    url.hash = '';
    return url.href;
  } catch { return null; }
}

export async function fetchPublicText(input, headers, { timeoutMs = 10000, sameOrigin = false } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const limit = 2 * 1024 * 1024;
  try {
    let url = publicUrl(input);
    if (!url) throw new Error('Invalid URL');
    const origin = new URL(url).origin;
    for (let redirects = 0; redirects <= 5; redirects++) {
      const response = await fetch(url, { headers, redirect: 'manual', signal: controller.signal });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        const location = response.headers.get('location');
        url = location && publicUrl(new URL(location, url).href);
        if (!url || (sameOrigin && new URL(url).origin !== origin)) throw new Error('Invalid redirect');
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        return { ok: false, status: response.status, finalUrl: url, text: '' };
      }
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let size = 0, text = '';
      if (reader) while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) { await reader.cancel(); throw new Error('Page too large'); }
        text += decoder.decode(value, { stream: true });
      }
      return { ok: true, status: response.status, finalUrl: url, text: text + decoder.decode() };
    }
  } catch { /* Unreachable or unsafe resources remain unknown. */ }
  finally { clearTimeout(timer); }
  return { ok: false, status: 0, text: '' };
}
