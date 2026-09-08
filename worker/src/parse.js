import { parseHTML, DOMParser } from 'linkedom';
import robotsParser from 'robots-parser';

export const DIAGNOSIS_VERSION = '2026-09-08.3';

export function robotsAccess(txt, url, agents) {
  const parser = robotsParser(new URL('/robots.txt', url).href, txt);
  const named = [...txt.matchAll(/^\s*user-agent\s*:\s*([^#\r\n]+)/gim)].map(m => m[1].trim().toLowerCase());
  return agents.map(ua => ({ ua, access: parser.isAllowed(url, ua) === false ? 'blocked' : 'allowed',
    matchedBy: named.includes(ua.toLowerCase()) ? 'exact' : named.includes('*') ? 'wildcard' : 'none',
    line: parser.getMatchingLineNumber(url, ua) }));
}

export const isHtml = text => /<!doctype\s+html|<html\b|<body\b/i.test(text);
export function fileState(res, kind) {
  if (!res.ok) return [404, 410].includes(res.status) ? false : null;
  if (isHtml(res.text)) return false;
  if (kind === 'llms') return /^#\s+\S/m.test(res.text) && /\[[^\]]+\]\(https?:\/\/[^)]+\)/.test(res.text);
  const root = new DOMParser().parseFromString(res.text, 'text/xml').documentElement;
  return !!root && ['urlset', 'sitemapindex'].includes(root.localName) && !!root.querySelector('loc');
}

export function flatten(v, out = []) {
  if (Array.isArray(v)) v.forEach(x => flatten(x, out));
  else if (v && typeof v === 'object') {
    out.push(v);
    Object.values(v).forEach(x => { if (typeof x === 'object') flatten(x, out); });
  }
  return out;
}
const typeIs = (v, name) => [v?.['@type']].flat().includes(name);
const validPrice = v => ['number', 'string'].includes(typeof v) && String(v).trim() !== '' && Number.isFinite(Number(v)) && Number(v) >= 0;

export function readPage(html) {
  const { document } = parseHTML(html);
  const ld = [...document.querySelectorAll('script[type="application/ld+json"]')].flatMap(el => {
    try { return flatten(JSON.parse(el.textContent)); } catch { return []; }
  });
  document.querySelectorAll('script,style,template').forEach(el => el.remove());
  const body = (document.body?.textContent || document.textContent || '').replace(/\s+/g, ' ').trim();
  const meta = name => [...document.querySelectorAll('meta')].find(el => (el.getAttribute('name') || el.getAttribute('property') || '').toLowerCase() === name)?.getAttribute('content')?.trim() || '';
  const title = document.querySelector('title')?.textContent.trim() || '';
  const imgs = [...document.querySelectorAll('img')];
  const withAlt = imgs.filter(el => el.getAttribute('alt')?.trim()).length;
  const hasProductLd = ld.some(v => typeIs(v, 'Product'));
  const hasPriceLd = ld.filter(v => typeIs(v, 'Product')).some(p => flatten(p.offers).some(o => [o.price, o.lowPrice, o.highPrice].some(validPrice)));
  return { body, ld, title, desc: meta('description'), imgs, withAlt, hasProductLd, hasPriceLd,
    altRatio: imgs.length ? withAlt / imgs.length : null,
    hasViewport: !!meta('viewport'), hasOg: !!meta('og:title'),
    hasCanonical: [...document.querySelectorAll('link')].some(el => (el.getAttribute('rel') || '').toLowerCase().split(/\s+/).includes('canonical') && !!el.getAttribute('href')),
    brand: ld.find(v => typeIs(v, 'Organization') || typeIs(v, 'LocalBusiness'))?.name || meta('og:site_name') };
}
