// 규칙 기반 진단 엔진. LLM을 전혀 쓰지 않는다.
// 전체 진단 항목의 약 70%가 여기서 판정된다.

const UA = 'AIVisibilityCheck/0.1 (+https://github.com/alswhitetiger/ai-visibility-check)';
const AI_CRAWLERS = ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'CCBot', 'anthropic-ai'];

async function get(url, timeoutMs = 10000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctl.signal, redirect: 'follow' });
    return { ok: res.ok, status: res.status, text: res.ok ? await res.text() : '' };
  } catch {
    return { ok: false, status: 0, text: '' };
  } finally {
    clearTimeout(timer);
  }
}

// robots.txt를 파싱해 각 AI 크롤러가 차단됐는지 본다.
function parseRobots(txt) {
  const groups = [];
  let cur = null;
  for (const raw of txt.split('\n')) {
    const line = raw.split('#')[0].trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();
    if (key === 'user-agent') {
      if (!cur || cur.rules.length) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val);
    } else if (cur && (key === 'allow' || key === 'disallow')) {
      cur.rules.push({ type: key, path: val });
    }
  }
  const blocked = [];
  for (const bot of AI_CRAWLERS) {
    const g = groups.find(x => x.agents.some(a => a.toLowerCase() === bot.toLowerCase()));
    if (g && g.rules.some(r => r.type === 'disallow' && r.path === '/')) blocked.push(bot);
  }
  const star = groups.find(x => x.agents.includes('*'));
  const blockedAll = !!star && star.rules.some(r => r.type === 'disallow' && r.path === '/');
  return { blocked, blockedAll };
}

function textOf(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function jsonLdBlocks(html) {
  const out = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try { out.push(JSON.parse(m[1].trim())); } catch { /* 깨진 JSON-LD는 무시 */ }
  }
  return out.flatMap(b => (Array.isArray(b) ? b : b && b['@graph'] ? b['@graph'] : [b]));
}

function hasType(blocks, type) {
  return blocks.some(b => {
    const t = b && b['@type'];
    return Array.isArray(t) ? t.includes(type) : t === type;
  });
}

function attr(html, re) {
  const m = html.match(re);
  return m ? m[1].trim() : '';
}

// 봇 차단/자동화 검사 페이지를 실제 콘텐츠로 오인하지 않기 위한 판별.
// 이걸 놓치면 "차단당해서 못 읽은 것"을 "AI가 읽을 수 없는 사이트"로 잘못 진단한다.
const CHALLENGE_MARKERS = [
  'Attention Required! | Cloudflare',
  '/cdn-cgi/challenge-platform',
  'cf-browser-verification',
  'Just a moment...',
  'Checking your browser before accessing',
  'Request unsuccessful. Incapsula',
  'captcha-delivery.com',
];

function looksBlocked(html) {
  return CHALLENGE_MARKERS.some(m => html.includes(m));
}

export async function diagnose(targetUrl) {
  const u = new URL(targetUrl);
  const origin = u.origin;

  // robots.txt 를 먼저 본다. 우리를 막고 있으면 페이지를 아예 가져오지 않는다.
  // 화면에 "robots.txt 를 따릅니다"라고 밝힌 이상 실제로 따라야 한다.
  const robots = await get(origin + '/robots.txt');
  const robotsInfo = robots.ok ? parseRobots(robots.text) : { blocked: [], blockedAll: false };

  if (robotsInfo.blockedAll) {
    return {
      url: u.href,
      host: u.host,
      crawlBlocked: true,
      quadrant: 'crawl_blocked',
      aiScore: 0,
      uxScore: null,
      checks: [],
      fixes: [{
        id: 'ai_crawler',
        label: 'robots.txt 가 모든 크롤러를 차단하고 있습니다',
        why: 'AI 크롤러도 여기서 막힙니다. 검색과 AI 답변 양쪽에서 사이트가 보이지 않게 되므로, '
           + '차단이 의도한 것인지 먼저 확인해야 합니다. 우리도 이 지시를 따라 페이지를 수집하지 않았습니다.',
      }],
      scannedAt: Date.now(),
    };
  }

  const [page, llms, sitemap] = await Promise.all([
    get(u.href),
    get(origin + '/llms.txt'),
    get(origin + '/sitemap.xml'),
  ]);

  if (!page.ok) {
    return { error: 'FETCH_FAILED', status: page.status, url: u.href };
  }
  if (looksBlocked(page.text)) {
    return { error: 'BLOCKED_BY_SITE', status: page.status, url: u.href };
  }

  const html = page.text;
  const body = textOf(html);
  const ld = jsonLdBlocks(html);

  const title = attr(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const desc = attr(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i);
  const imgs = html.match(/<img\b[^>]*>/gi) || [];
  const withAlt = imgs.filter(t => /\balt\s*=\s*["'][^"']+["']/i.test(t)).length;
  const altRatio = imgs.length ? withAlt / imgs.length : 1;

  const hasViewport = /<meta[^>]+name=["']viewport["']/i.test(html);
  const hasCanonical = /<link[^>]+rel=["']canonical["']/i.test(html);
  const hasOg = /<meta[^>]+property=["']og:title["']/i.test(html);
  const hasProductLd = hasType(ld, 'Product') || hasType(ld, 'ItemList');
  const hasOrgLd = hasType(ld, 'Organization') || hasType(ld, 'LocalBusiness');
  const priceInText = /[0-9][0-9,]{2,}\s*원/.test(body);
  const hasBizInfo = /사업자\s*등록\s*번호|사업자번호/.test(body);

  // axis: 'ai' = AI 가시성, 'ux' = 사람 구매여정
  const checks = [
    {
      id: 'ai_crawler', axis: 'ai', weight: 25,
      pass: !robotsInfo.blockedAll && robotsInfo.blocked.length === 0,
      label: 'AI 크롤러 접근 허용',
      detail: robotsInfo.blockedAll
        ? 'robots.txt가 모든 크롤러를 차단하고 있습니다'
        : robotsInfo.blocked.length
          ? '차단 중: ' + robotsInfo.blocked.join(', ')
          : 'AI 크롤러를 막고 있지 않습니다',
      why: 'AI가 페이지를 읽지 못하면 어떤 최적화도 소용이 없습니다. 가장 먼저 확인할 항목입니다.',
    },
    {
      id: 'llms_txt', axis: 'ai', weight: 10, pass: llms.ok,
      label: 'llms.txt 제공',
      detail: llms.ok ? '있음' : '없음',
      why: 'AI에게 사이트의 핵심 정보를 요약해 전달하는 규격입니다. 아직 선택 사항이지만 채택이 늘고 있습니다.',
    },
    {
      id: 'jsonld_org', axis: 'ai', weight: 15, pass: hasOrgLd,
      label: '조직 구조화 데이터',
      detail: hasOrgLd ? '있음' : '없음',
      why: 'AI가 이 브랜드가 무엇인지 확신을 갖고 답하려면 기계가 읽을 수 있는 신원 정보가 필요합니다.',
    },
    {
      id: 'jsonld_product', axis: 'ai', weight: 15, pass: hasProductLd,
      label: '상품 구조화 데이터',
      detail: hasProductLd ? '있음' : '없음',
      why: '가격·재고·리뷰를 구조화해 두면 AI가 상품을 직접 추천할 수 있습니다.',
    },
    {
      id: 'js_dependency', axis: 'ai', weight: 20, pass: body.length >= 600,
      label: '자바스크립트 없이도 내용이 보임',
      detail: 'HTML 원본 텍스트 ' + body.length + '자',
      why: 'AI 크롤러 상당수는 자바스크립트를 실행하지 않습니다. 원본 HTML이 비어 있으면 빈 페이지로 인식됩니다.',
    },
    {
      id: 'sitemap', axis: 'ai', weight: 8, pass: sitemap.ok,
      label: 'sitemap.xml',
      detail: sitemap.ok ? '있음' : '없음',
      why: '크롤러가 페이지 전체를 빠짐없이 찾아가는 경로입니다.',
    },
    {
      id: 'canonical', axis: 'ai', weight: 7, pass: hasCanonical,
      label: 'canonical 지정',
      detail: hasCanonical ? '있음' : '없음',
      why: '중복 주소가 있을 때 어느 것이 정본인지 알려줍니다.',
    },
    {
      id: 'title', axis: 'ux', weight: 15,
      pass: title.length >= 10 && title.length <= 60,
      label: '페이지 제목 품질',
      detail: title ? title.length + '자 · ' + title.slice(0, 40) : '없음',
      why: '검색 결과와 AI 답변에 그대로 인용되는 문장입니다.',
    },
    {
      id: 'description', axis: 'ux', weight: 12, pass: desc.length >= 40,
      label: '메타 설명',
      detail: desc ? desc.length + '자' : '없음',
      why: '브랜드를 한 문장으로 규정하는 자리입니다. 비어 있으면 AI가 임의로 요약합니다.',
    },
    {
      id: 'viewport', axis: 'ux', weight: 15, pass: hasViewport,
      label: '모바일 뷰포트',
      detail: hasViewport ? '있음' : '없음',
      why: '구매의 대부분이 모바일에서 일어납니다.',
    },
    {
      id: 'img_alt', axis: 'ux', weight: 13, pass: altRatio >= 0.6,
      label: '이미지 대체 텍스트',
      detail: imgs.length
        ? withAlt + '/' + imgs.length + ' (' + Math.round(altRatio * 100) + '%)'
        : '이미지 없음',
      why: '상세 정보가 이미지에만 있으면 AI도 스크린리더도 읽지 못합니다.',
    },
    {
      id: 'price', axis: 'ux', weight: 15, pass: hasProductLd || priceInText,
      label: '가격 정보 노출',
      detail: hasProductLd ? '구조화 데이터에 있음' : priceInText ? '본문에 있음' : '확인 불가',
      why: '가격이 안 보이면 사람도 AI도 비교 후보에서 제외합니다.',
    },
    {
      id: 'og', axis: 'ux', weight: 10, pass: hasOg,
      label: '공유용 OG 태그',
      detail: hasOg ? '있음' : '없음',
      why: '링크가 공유될 때 어떻게 보이는지를 결정합니다.',
    },
    {
      id: 'business_info', axis: 'ux', weight: 10, pass: hasBizInfo,
      label: '사업자 정보 표기',
      detail: hasBizInfo ? '있음' : '확인 불가',
      why: '전자상거래법상 필수 표기이며, 신뢰도 판단 근거가 됩니다.',
    },
  ];

  const score = (axis) => {
    const items = checks.filter(c => c.axis === axis);
    const total = items.reduce((s, c) => s + c.weight, 0);
    const got = items.reduce((s, c) => s + (c.pass ? c.weight : 0), 0);
    return Math.round((got / total) * 100);
  };

  const aiScore = score('ai');
  const uxScore = score('ux');
  const quadrant =
    aiScore >= 60 && uxScore >= 60 ? 'healthy' :
    aiScore < 60 && uxScore >= 60 ? 'ai_invisible' :
    aiScore >= 60 && uxScore < 60 ? 'leaking' : 'critical';

  return {
    url: u.href,
    host: u.host,
    aiScore,
    uxScore,
    quadrant,
    checks: checks.map(({ weight, ...rest }) => rest),
    fixes: checks
      .filter(c => !c.pass)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5)
      .map(c => ({ id: c.id, label: c.label, why: c.why })),
    scannedAt: Date.now(),
  };
}

export const QUADRANT_LABEL = {
  crawl_blocked: '수집 차단 — robots.txt 가 모든 크롤러를 막고 있어 AI도 읽지 못합니다',
  healthy: '정상 — 사람도 AI도 찾을 수 있습니다',
  ai_invisible: 'AI 시대에 사라질 가게 — 지금은 팔리지만 AI가 못 찾습니다',
  leaking: '유입은 되는데 새는 중 — AI는 찾지만 사람이 못 삽니다',
  critical: '위험 — 양쪽 모두 막혀 있습니다',
};
