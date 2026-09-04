// 사전 계산 스크립트.
//
// Worker의 규칙 기반 엔진을 로컬에서 그대로 돌려 정적 JSON을 만든다.
// 이 결과는 AI 한도나 지역 제한과 무관하게 화면에 항상 표시된다.
//
//   node scripts/precompute.mjs
//   GEMINI_API_KEY=... node scripts/precompute.mjs      # AI 응답까지 수집
//
// 산출물
//   web/public/data/stats.json     익명 집계. 이름을 밝히지 않는다.
//   web/public/data/showcase.json  옵트인한 사이트만. 순위가 아니라 점검 결과.
//   scripts/out/seed-ai.sql        D1 ai_answers 시드 (수집된 AI 응답)
//
// 로컬(한국)에서는 Gemini 지역 제한이 걸리지 않으므로, 여기서 모은 AI 응답을
// D1에 심어 두면 Worker가 지역 제한에 막혀도 그 호스트는 답을 보여줄 수 있다.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { diagnose } from '../worker/src/diagnose.js';
import { brandProbePrompt } from '../worker/src/ai.js';

const here = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(here, '../web/public/data');
const OUT = resolve(here, 'out');

const KEY = process.env.GEMINI_API_KEY || '';
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function probe(brand, host) {
  if (!KEY) return null;
  const { system, user } = brandProbePrompt(brand, host);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
        }),
      }
    );
    if (!res.ok) {
      console.log('    AI 실패', res.status);
      return null;
    }
    const d = await res.json();
    const text = d?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return JSON.parse(text);
  } catch (e) {
    console.log('    AI 오류', e.message);
    return null;
  }
}

const targets = JSON.parse(await readFile(resolve(here, 'targets.json'), 'utf8'));
const rows = [];

for (const t of targets) {
  const url = /^https?:\/\//.test(t.host) ? t.host : 'https://' + t.host;
  process.stdout.write(`scan ${t.host} ... `);
  let r;
  try {
    r = await diagnose(url);
  } catch (e) {
    console.log('오류:', e.message);
    continue;
  }

  if (r.error) {
    console.log(r.error);
    rows.push({ host: new URL(url).host, state: r.error, optedIn: !!t.optedIn, label: t.label });
    await sleep(1200);
    continue;
  }

  if (r.pageSkipped) {
    const rb = r.robots || {};
    console.log(`페이지 수집 생략 (답변 크롤러 ${rb.answerAllowed}/${rb.answerTotal} 허용)`);
    rows.push({
      host: r.host, state: 'page_skipped', optedIn: !!t.optedIn, label: t.label,
      checks: [], robots: rb,
    });
    await sleep(1200);
    continue;
  }

  console.log(`ai=${r.aiScore} ux=${r.uxScore} (${r.quadrant})`);
  const row = {
    host: r.host,
    state: 'ok',
    optedIn: !!t.optedIn,
    label: t.label,
    aiScore: r.aiScore,
    uxScore: r.uxScore,
    quadrant: r.quadrant,
    checks: r.checks.map(c => ({ id: c.id, axis: c.axis, pass: c.pass })),
    robots: r.robots || null,
  };

  // AI 응답은 옵트인한 사이트에 대해서만 수집·보관한다.
  if (t.optedIn) {
    const ans = await probe(t.label || r.host, r.host);
    if (ans) {
      row.ai = { provider: 'gemini', model: MODEL, answer: ans };
      console.log('    AI 응답 수집 완료');
    }
  }

  rows.push(row);
  await sleep(1500); // 대상 사이트에 부담을 주지 않는다
}

// ---- 익명 집계 -------------------------------------------------------------
// 개별 사이트를 지목하지 않는다. 실태만 드러낸다.
const scanned = rows.filter(r => r.state === 'ok' || r.state === 'page_skipped');
const measured = rows.filter(r => r.state === 'ok');

const checkIds = [...new Set(measured.flatMap(r => r.checks.map(c => c.id)))];
const byCheck = checkIds.map(id => {
  const items = measured.map(r => r.checks.find(c => c.id === id)).filter(Boolean);
  const passed = items.filter(c => c.pass).length;
  return {
    id,
    axis: items[0]?.axis,
    passed,
    total: items.length,
    passRate: items.length ? Math.round((passed / items.length) * 100) : null,
  };
});

const quadrants = ['healthy', 'ai_invisible', 'leaking', 'critical'].map(q => ({
  quadrant: q,
  count: measured.filter(r => r.quadrant === q).length,
}));

const avg = (key) =>
  measured.length ? Math.round(measured.reduce((s, r) => s + r[key], 0) / measured.length) : null;

// robots.txt 를 읽을 수 있었던 모든 곳(수집 생략 포함)에서 답변 크롤러 허용 현황을 센다.
const withRobots = rows.filter(r => r.robots && r.robots.answerTotal);
const answerFullyOpen = withRobots.filter(r => r.robots.answerAllowed === r.robots.answerTotal).length;
const answerPartlyBlocked = withRobots.filter(
  r => r.robots.answerAllowed > 0 && r.robots.answerAllowed < r.robots.answerTotal).length;
const answerFullyBlocked = withRobots.filter(r => r.robots.answerAllowed === 0).length;

const stats = {
  generatedAt: new Date().toISOString(),
  robotsRead: withRobots.length,
  answerCrawler: {
    fullyOpen: answerFullyOpen,
    partlyBlocked: answerPartlyBlocked,
    fullyBlocked: answerFullyBlocked,
  },
  namedAiBots: withRobots.filter(r => r.robots.namedCount > 0).length,
  blocksUnnamedCrawlers: rows.filter(r => r.robots && r.robots.selfAccess === 'blocked').length,
  scanned: scanned.length,
  measured: measured.length,
  pageSkipped: rows.filter(r => r.state === 'page_skipped').length,
  unreachable: rows.filter(r => r.state !== 'ok' && r.state !== 'page_skipped').length,
  avgAiScore: avg('aiScore'),
  avgUxScore: avg('uxScore'),
  quadrants,
  byCheck: byCheck.sort((a, b) => a.passRate - b.passRate),
};

// ---- 옵트인 공개 목록 ------------------------------------------------------
const showcase = {
  generatedAt: stats.generatedAt,
  note: '공개에 동의한 사이트만 표시합니다. 순위가 아니라 점검 항목의 통과 여부입니다.',
  items: rows
    .filter(r => r.optedIn && r.state === 'ok')
    .map(r => ({
      host: r.host,
      label: r.label || r.host,
      ai_score: r.aiScore,
      ux_score: r.uxScore,
      quadrant: r.quadrant,
    }))
    .sort((a, b) => b.ai_score - a.ai_score),
};

await mkdir(DATA, { recursive: true });
await writeFile(resolve(DATA, 'stats.json'), JSON.stringify(stats, null, 2) + '\n');
await writeFile(resolve(DATA, 'showcase.json'), JSON.stringify(showcase, null, 2) + '\n');

// ---- D1 시드 ---------------------------------------------------------------
const withAi = rows.filter(r => r.ai);
if (withAi.length) {
  const esc = s => String(s).replace(/'/g, "''");
  const now = Date.now();
  const sql = withAi.map(r =>
    `INSERT INTO ai_answers (host, answer_json, provider, model, created_at) VALUES ` +
    `('${esc(r.host)}', '${esc(JSON.stringify(r.ai.answer))}', 'gemini', '${esc(r.ai.model)}', ${now}) ` +
    `ON CONFLICT(host) DO UPDATE SET answer_json=excluded.answer_json, provider=excluded.provider, ` +
    `model=excluded.model, created_at=excluded.created_at;`
  ).join('\n');
  await mkdir(OUT, { recursive: true });
  await writeFile(resolve(OUT, 'seed-ai.sql'), sql + '\n');
}

console.log('\n---- 요약 ----');
console.log(`측정 ${stats.measured}곳 / 수집 생략 ${stats.pageSkipped}곳 / 접근 불가 ${stats.unreachable}곳`);
console.log(`robots 확인 ${stats.robotsRead}곳 — 답변 크롤러 전면허용 ${stats.answerCrawler.fullyOpen} / 일부차단 ${stats.answerCrawler.partlyBlocked} / 전면차단 ${stats.answerCrawler.fullyBlocked}`);
console.log(`AI 봇을 이름으로 명시한 곳 ${stats.namedAiBots} · 무명 크롤러를 막는 곳 ${stats.blocksUnnamedCrawlers}`);
console.log(`평균 AI 가시성 ${stats.avgAiScore} · 평균 구매여정 ${stats.avgUxScore}`);
console.log(`공개 목록 ${showcase.items.length}건 · AI 응답 수집 ${withAi.length}건`);
if (withAi.length) console.log('D1 시드: scripts/out/seed-ai.sql');
