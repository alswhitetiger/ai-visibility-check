// 사전 계산 스크립트.
// Worker의 규칙 기반 엔진을 그대로 로컬에서 돌려 정적 JSON을 만든다.
// 이 결과는 AI 한도가 전부 소진돼도 화면에 항상 표시된다.
//
//   node scripts/precompute.mjs scripts/targets.json
//
// targets.json 형식: [{ "host": "example.com", "label": "예시몰", "optedIn": true }]
// optedIn 이 true 인 항목만 공개 목록에 들어간다.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { diagnose } from '../worker/src/diagnose.js';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../web/public/data/showcase.json');

const listPath = process.argv[2] || resolve(here, 'targets.json');
const targets = JSON.parse(await readFile(listPath, 'utf8'));

const items = [];
for (const t of targets) {
  if (!t.optedIn) {
    console.log('skip (not opted in):', t.host);
    continue;
  }
  const url = /^https?:\/\//.test(t.host) ? t.host : 'https://' + t.host;
  process.stdout.write('scan ' + t.host + ' ... ');
  try {
    const r = await diagnose(url);
    if (r.error) {
      console.log('failed:', r.error);
      continue;
    }
    items.push({
      host: r.host,
      label: t.label || r.host,
      ai_score: r.aiScore,
      ux_score: r.uxScore,
      quadrant: r.quadrant,
    });
    console.log('ai=' + r.aiScore + ' ux=' + r.uxScore);
  } catch (e) {
    console.log('error:', e.message);
  }
  await new Promise(r => setTimeout(r, 1500)); // 대상 사이트에 부담을 주지 않는다
}

items.sort((a, b) => b.ai_score - a.ai_score);
await writeFile(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), items }, null, 2) + '\n');
console.log('\nwrote', items.length, 'items ->', OUT);
