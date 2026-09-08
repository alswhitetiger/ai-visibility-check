// Deterministic, fictional demonstration. No third-party site or paid AI call.
import { writeFile } from 'node:fs/promises';
import { diagnose } from '../worker/src/diagnose.js';
const originalFetch=globalThis.fetch;
const html = improved => `<!doctype html><html lang="ko"><head><title>예시 가게 | 편안한 일상 의류 쇼핑몰</title><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="canonical" href="https://sample-shop.example/"><meta property="og:title" content="예시 가게">${improved ? '<meta name="description" content="매일 입기 편한 의류를 소개하는 가상 쇼핑몰입니다. 상품의 소재와 세탁 방법, 사이즈 정보를 안내하는 사용법 예시입니다."><script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"예시 가게","url":"https://sample-shop.example/"}</script>' : ''}</head><body><h1>예시 가게</h1><p>${'가상 쇼핑몰의 사용법을 보여주는 페이지입니다. 상품의 소재와 사이즈, 관리 방법을 글로 소개합니다. '.repeat(12)}</p><p>사업자등록번호: 가상 예시</p><img src="shirt.jpg" alt="${improved ? '흰색 면 셔츠 정면 사진' : ''}"></body></html>`;
async function sample(improved) {
  globalThis.fetch=async url => {
    const path=new URL(url).pathname;
    if(path==='/robots.txt') return new Response('User-agent: *\nAllow: /');
    if(path==='/sitemap.xml') return new Response('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://sample-shop.example/</loc></url></urlset>');
    if(path==='/llms.txt') return new Response('',{status:404});
    return new Response(html(improved));
  };
  const d=await diagnose('https://sample-shop.example/');
  d.example=true; d.exampleAfter=improved; d.scannedAt=Date.parse(improved ? '2026-09-08T03:05:00Z' : '2026-09-08T03:00:00Z');
  d.checks.forEach(c=>{delete c.evidenceUrl;});
  return d;
}
try { await writeFile(new URL('../web/public/data/example.json',import.meta.url),JSON.stringify({before:await sample(false),after:await sample(true)},null,2)+'\n'); }
finally { globalThis.fetch=originalFetch; }
