import { DOMParser } from 'linkedom';
import { fetchPublicText, publicUrl } from './public-web.js';

const HEADERS = { Accept: 'application/xml,text/xml,text/plain;q=0.9,*/*;q=0.8', 'User-Agent': 'AIVisibilityCheck-User/0.1 (user-triggered; +https://github.com/alswhitetiger/ai-visibility-check)' };
const hostOf = url => new URL(url).hostname.replace(/^www\./, '').toLowerCase();
const sameHost = (url, host) => { try { return hostOf(url) === host; } catch { return false; } };
const locs = text => {
  const root = new DOMParser().parseFromString(text, 'text/xml')?.documentElement;
  return root && ['urlset', 'sitemapindex'].includes(root.localName) ? { kind: root.localName, urls: [...root.querySelectorAll('loc')].map(node => publicUrl(node.textContent?.trim() || '')).filter(Boolean) } : { kind: '', urls: [] };
};

export async function suggestSitePages(input) {
  const target = publicUrl(input);
  if (!target) return { error: 'INVALID_URL', message: '사이트 주소를 확인해 주세요.' };
  const origin = new URL(target).origin, host = hostOf(target);
  const robots = await fetchPublicText(origin + '/robots.txt', HEADERS, { sameOrigin: true });
  const declared = robots.ok ? [...robots.text.matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)].map(match => publicUrl(match[1])).filter(url => url && sameHost(url, host)) : [];
  const sitemapUrls = [...new Set([...declared, origin + '/sitemap.xml'])].slice(0, 3);
  const roots = await Promise.all(sitemapUrls.map(url => fetchPublicText(url, HEADERS, { sameOrigin: true })));
  const parsed = roots.filter(result => result.ok).map(result => locs(result.text));
  const childUrls = [...new Set(parsed.filter(item => item.kind === 'sitemapindex').flatMap(item => item.urls).filter(url => sameHost(url, host)))].slice(0, 3);
  const children = await Promise.all(childUrls.map(url => fetchPublicText(url, HEADERS, { sameOrigin: true })));
  const pages = [...new Set([...parsed, ...children.filter(result => result.ok).map(result => locs(result.text))].filter(item => item.kind === 'urlset').flatMap(item => item.urls).filter(url => sameHost(url, host)))].slice(0, 300);
  const readablePath = url => { try { return decodeURIComponent(new URL(url).pathname).toLowerCase(); } catch { return ''; } };
  const patterns = [/\/(product|products|goods|item|shop)\b|상품/, /shipping|delivery|배송/, /return|refund|exchange|교환|반품/, /faq|help|support|contact|customer|문의|고객/];
  const selected = [origin + '/'];
  for (const pattern of patterns) {
    const found = pages.find(url => !selected.includes(url) && pattern.test(readablePath(url)));
    if (found) selected.push(found);
  }
  for (const url of pages.sort((a, b) => readablePath(a).length - readablePath(b).length)) {
    if (selected.length >= 5) break;
    if (!selected.includes(url) && !/login|account|cart|order|search|blog|news/i.test(readablePath(url))) selected.push(url);
  }
  return { urls: selected.slice(0, 5), discovered: pages.length, sitemapFound: parsed.some(item => item.urls.length > 0) };
}
