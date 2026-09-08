import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnose, DIAGNOSIS_VERSION } from '../src/diagnose.js';
import worker from '../src/index.js';

const page = (ld = '', extra = '') => '<!doctype html><html><head><title>Example shop page title</title>'+extra+'</head><body>'+('상품 안내입니다. '.repeat(100))+'<script type="application/ld+json">'+ld+'</script></body></html>';
function network(t, { html = page(), robots = '', robotsStatus = 200, files = {} } = {}) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async url => {
    calls.push(String(url));
    const path = new URL(url).pathname;
    if (path === '/robots.txt') return new Response(robots, { status: robotsStatus });
    if (path in files) return new Response(files[path], { status: 200 });
    if (['/llms.txt','/sitemap.xml'].includes(path)) return new Response('', { status: 404 });
    return new Response(html);
  });
  return calls;
}
const check = (d,id) => d.checks.find(c => c.id === id);

test('HTML error pages are not llms.txt or sitemap files', async t => {
  network(t,{files:{'/llms.txt':page(),'/sitemap.xml':page()}});
  const d=await diagnose('https://shop.example/');
  assert.equal(check(d,'llms_txt').pass,false); assert.equal(check(d,'sitemap').pass,false);
  assert.equal(check(d,'llms_txt').weight,0);
});
test('valid Markdown and XML resources are recognized', async t => {
  network(t,{files:{'/llms.txt':'# Shop\n[Home](https://shop.example/)','/sitemap.xml':'<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://shop.example/</loc></url></urlset>'}});
  const d=await diagnose('https://shop.example/');
  assert.equal(check(d,'llms_txt').pass,true); assert.equal(check(d,'sitemap').pass,true);
});
test('503 robots response remains unknown and stops collection', async t => {
  const calls=network(t,{robotsStatus:503}); const d=await diagnose('https://shop.example/');
  assert.equal(d.pageSkipped,true); assert.equal(d.skipReason,'robots_unavailable'); assert.equal(d.aiScore,null);
  assert.equal(calls.length,1); assert.equal(d.version,DIAGNOSIS_VERSION);
});
test('404 robots has no published restrictions', async t => {
  network(t,{robotsStatus:404}); const d=await diagnose('https://shop.example/');
  assert.equal(check(d,'ai_crawler').pass,true);
});
test('crawl respects disallowed product paths and longest Allow exception', async t => {
  network(t,{robots:'User-agent: *\nDisallow: /product/\nAllow: /product/open\n'});
  assert.equal((await diagnose('https://shop.example/product/1',{mode:'crawl'})).pageSkipped,true);
  assert.notEqual((await diagnose('https://shop.example/product/open',{mode:'crawl'})).pageSkipped,true);
});
test('named restriction is honored for user-triggered scans too', async t => {
  network(t,{robots:'User-agent: AIVisibilityCheck-User\nDisallow: /private/\n'});
  assert.equal((await diagnose('https://shop.example/private/')).pageSkipped,true);
});
test('robots combines repeated groups and prefers explicit AI rule over wildcard', async t => {
  network(t,{robots:'User-agent: *\nDisallow: /\nUser-agent: OAI-SearchBot\nDisallow: /other/\nUser-agent: OAI-SearchBot\nAllow: /product/\n'});
  const d=await diagnose('https://shop.example/product/');
  assert.equal(d.robots.answer.find(c=>c.ua==='OAI-SearchBot').access,'allowed');
  assert.equal(d.robots.answer.find(c=>c.ua==='Claude-User').access,'blocked');
});
test('homepage excludes product and price from scoring', async t => {
  network(t); const d=await diagnose('https://shop.example/');
  assert.equal(check(d,'jsonld_product'),undefined); assert.equal(check(d,'price'),undefined);
});
test('Product without an offer price does not pass price check', async t => {
  network(t,{html:page('{"@type":"Product","name":"Shirt"}')});
  const d=await diagnose('https://shop.example/product/1');
  assert.equal(check(d,'jsonld_product').pass,true); assert.equal(check(d,'price').pass,false);
});
test('homepage product recommendations do not turn the homepage into a product page', async t => {
  network(t,{html:page('{"@type":"ItemList","itemListElement":[{"@type":"Product","name":"Shirt"}]}')});
  const d=await diagnose('https://shop.example/');
  assert.equal(d.isProductPage,false); assert.equal(check(d,'price'),undefined);
});
test('actual price in nested graph offer is recognized', async t => {
  network(t,{html:page('{"@graph":[{"@type":"Product","offers":{"@type":"Offer","price":"19000"}}]}')});
  assert.equal(check(await diagnose('https://shop.example/product/1'),'price').pass,true);
});
test('HTML attribute order and nested Organization do not cause false negatives', async t => {
  network(t,{html:page('{"@graph":[{"@type":"Organization","name":"Real Brand"}]}','<meta content="'+('소개 문장 '.repeat(20))+'" name="description"><meta content="width=device-width" name="viewport">')});
  const d=await diagnose('https://shop.example/');
  assert.equal(d.brand,'Real Brand'); assert.equal(check(d,'description').pass,true); assert.equal(check(d,'viewport').pass,true);
});
test('no images is unknown rather than an invented perfect alt score', async t => {
  network(t); const d=await diagnose('https://shop.example/');
  assert.equal(check(d,'img_alt').pass,null); assert.ok(!d.fixes.some(c=>c.id==='img_alt'));
});

function db(row) {
  return { prepare(sql) { return { bind() { return this; }, async first() {
    if(sql.includes('SELECT * FROM scans')) return row;
    if(sql.includes('ai_answers')) return null;
    return {count:1};
  }, async run() { return {}; } }; } };
}
test('old version cache is recomputed, current version reused, refresh recomputes', async t => {
  const calls=network(t);
  const cached={version:'old',url:'https://shop.example/',checks:[],aiScore:99};
  const env={DB:db({created_at:Date.now(),result_json:JSON.stringify(cached)})};
  const request=()=>new Request('https://worker.example/api/scan?url=https://shop.example/');
  const fresh=await (await worker.fetch(request(),env)).json();
  assert.equal(fresh.version,DIAGNOSIS_VERSION); assert.notEqual(fresh.aiScore,99); assert.ok(calls.length>0);
  const current={...fresh,aiScore:99}; env.DB=db({created_at:Date.now(),result_json:JSON.stringify(current)});
  const count=calls.length;
  assert.equal((await (await worker.fetch(request(),env)).json()).cached,true); assert.equal(calls.length,count);
  const refreshed=await (await worker.fetch(new Request(request().url+'&refresh=1'),env)).json();
  assert.notEqual(refreshed.aiScore,99); assert.ok(calls.length>count);
});
