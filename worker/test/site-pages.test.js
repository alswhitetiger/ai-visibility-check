import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestSitePages } from '../src/site-pages.js';

test('site page suggestions follow a same-host sitemap index and choose useful paths', async t => {
  t.mock.method(globalThis, 'fetch', async url => {
    const path = new URL(url).pathname;
    if (path === '/robots.txt') return new Response('Sitemap: https://shop.example/sitemap-index.xml');
    if (path === '/sitemap-index.xml') return new Response('<sitemapindex><sitemap><loc>https://shop.example/pages.xml</loc></sitemap><sitemap><loc>https://other.example/private.xml</loc></sitemap></sitemapindex>');
    if (path === '/pages.xml') return new Response('<urlset><url><loc>https://shop.example/product/cup</loc></url><url><loc>https://shop.example/shipping</loc></url><url><loc>https://shop.example/faq</loc></url></urlset>');
    return new Response('', { status: 404 });
  });
  const result = await suggestSitePages('https://shop.example/start');
  assert.deepEqual(result.urls, ['https://shop.example/', 'https://shop.example/product/cup', 'https://shop.example/shipping', 'https://shop.example/faq']);
  assert.equal(result.discovered, 3);
  assert.equal(result.sitemapFound, true);
});

test('site page suggestions reject private targets and keep the homepage when no sitemap exists', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 404 }));
  assert.equal((await suggestSitePages('http://127.0.0.1')).error, 'INVALID_URL');
  assert.deepEqual((await suggestSitePages('https://shop.example/')).urls, ['https://shop.example/']);
});
