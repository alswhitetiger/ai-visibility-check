import test from 'node:test';
import assert from 'node:assert/strict';
import { readPage } from '../src/parse.js';
import { buildShopCode } from '../../web/src/shop-code.js';

test('observed information includes actual extracted values, never a guessed brand',()=>{
  const o=readPage('<html><head><title>A &amp; B</title><meta content="Real description" name="description"></head><body><p>12,000원</p><img alt="Blue shirt"><img></body></html>').observed;
  assert.equal(o.brand,''); assert.equal(o.title,'A & B'); assert.equal(o.description,'Real description');
  assert.deepEqual(o.textPrices,['12,000원']); assert.deepEqual(o.images,{total:2,described:1,samples:['Blue shirt']});
});
test('observed price preserves currency and source; scripts are excluded from excerpt',()=>{
  const o=readPage('<html><body>Public text<script type="application/ld+json">{"@type":"Product","offers":{"price":"15000","priceCurrency":"KRW"}}</script><script>secretMarker()</script></body></html>').observed;
  assert.deepEqual(o.prices,[{value:'15000',currency:'KRW',source:'상품 데이터 · price'}]);
  assert.equal(o.textExcerpt,'Public text');
});
test('builder round trip is parseable and recognized by the diagnostic engine',()=>{
  const result=buildShopCode({name:' 우리 가게 ',url:'https://shop.example/',description:'직접 확인한 소개'});
  const o=readPage('<html><head>'+result.code+'</head><body></body></html>').observed;
  assert.equal(o.brand,'우리 가게'); assert.equal(result.data.description,'직접 확인한 소개');
  assert.equal(buildShopCode({name:'가게',url:'https://shop.example/'}).data.description,undefined);
});
test('builder escapes closing scripts without altering the intended text',()=>{
  const name='</script><img src=x onerror=alert(1)> & "';
  const result=buildShopCode({name,url:'https://shop.example/'});
  assert.equal((result.code.match(/<\/script>/g)||[]).length,1);
  assert.equal(readPage('<html><head>'+result.code+'</head><body></body></html>').observed.brand,name);
});
test('builder rejects empty names, non-web URLs, credentials and oversized descriptions',()=>{
  for(const fields of [{name:' ',url:'https://shop.example/'},{name:'가게',url:'javascript:alert(1)'},{name:'가게',url:'https://user:password@shop.example/'},{name:'가게',url:'https://shop.example/',description:'a'.repeat(601)}]) assert.throws(()=>buildShopCode(fields));
});
