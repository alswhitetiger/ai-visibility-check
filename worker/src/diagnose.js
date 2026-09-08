// 규칙 기반 진단 엔진. LLM을 전혀 쓰지 않는다.
// 전체 진단 항목의 약 70%가 여기서 판정된다.

// 우리는 두 가지 방식으로 동작하고, 각각 robots.txt 를 다르게 대한다.
//
// 'user'  — 사람이 주소를 입력한 그 순간, 그 한 페이지만 가져온다.
//           ChatGPT-User / Claude-User 와 같은 user-triggered fetch 범주다.
//           `User-agent: *` 의 전면 차단은 대량 크롤러를 향한 것으로 보고 진행하되,
//           우리를 이름으로 지목해 막으면 즉시 멈춘다.
// 'crawl' — 사전 계산처럼 목록을 훑는 대량 수집. 이건 진짜 크롤링이므로
//           `*` 차단을 포함해 robots.txt 를 그대로 따른다.
//
// 어느 모드든 서버가 403 으로 거부하면 멈춘다. User-Agent 를 위장하지 않는다.
const UA_USER = 'AIVisibilityCheck-User/0.1 (user-triggered; +https://github.com/alswhitetiger/ai-visibility-check)';
const UA_CRAWL = 'AIVisibilityCheck/0.1 (+https://github.com/alswhitetiger/ai-visibility-check)';

// robots.txt 에서 우리를 지목할 때 쓸 수 있는 이름들.
const OUR_AGENTS = ['AIVisibilityCheck-User', 'AIVisibilityCheck'];

// AI 크롤러는 목적이 둘로 나뉜다. 섞어서 세면 진단이 틀린다.
//
// 답변용: 사용자가 질문했을 때 사이트를 찾아가 인용하는 크롤러.
//         이게 막히면 AI 답변에 우리 가게가 등장하지 못한다. 점수에 반영한다.
// 학습용: 모델 학습 데이터를 모으는 크롤러.
//         막는 것은 정당한 사업 판단이라 점수화하지 않고 현황만 알린다.
const ANSWER_CRAWLERS = [
  'OAI-SearchBot', 'ChatGPT-User',
  'Claude-User', 'Claude-SearchBot',
  'PerplexityBot', 'Perplexity-User',
  'Gemini-Deep-Research',
];
const TRAINING_CRAWLERS = [
  'GPTBot', 'ClaudeBot', 'anthropic-ai',
  'Google-Extended', 'CCBot', 'Applebot-Extended', 'meta-externalagent',
];

// 정상적인 HTTP 클라이언트라면 보내는 헤더들.
// 이걸 빠뜨리면 형식이 어긋난 요청으로 보여 방화벽이 403 을 내는 경우가 많다.
// 실측에서 이 헤더만 채워도 거부하던 사이트 절반이 정상 응답했다.
// User-Agent 는 그대로 우리 이름이다. 신원을 숨기는 것이 아니라 요청을 바르게 만드는 것이다.
const BASE_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
};

async function get(url, ua, timeoutMs = 10000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { ...BASE_HEADERS, 'User-Agent': ua },
      signal: ctl.signal,
      redirect: 'follow',
    });
    return { ok: res.ok, status: res.status, text: res.ok ? await res.text() : '' };
  } catch {
    return { ok: false, status: 0, text: '' };
  } finally {
    clearTimeout(timer);
  }
}

// robots.txt 를 그룹 단위로 파싱한다.
// 연속된 User-agent 줄은 하나의 그룹을 공유한다(표준). 규칙이 한 번 나온 뒤
// 다시 User-agent 가 나오면 새 그룹이다.
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
  return groups;
}

// 특정 UA 에 적용되는 그룹을 찾는다. 정확히 일치하는 그룹이 우선이고,
// 없으면 `*` 그룹이 적용된다. 둘 다 없으면 제한이 없다는 뜻이다.
function groupFor(groups, ua) {
  const exact = groups.find(g => g.agents.some(a => a.toLowerCase() === ua.toLowerCase()));
  if (exact) return { group: exact, matchedBy: 'exact' };
  const star = groups.find(g => g.agents.includes('*'));
  if (star) return { group: star, matchedBy: 'wildcard' };
  return { group: null, matchedBy: 'none' };
}

// 루트 접근 기준 판정.
//   allowed : 전면 차단이 없다
//   partial : 전면 차단이지만 일부 경로를 Allow 로 열어 두었다
//   blocked : 전면 차단이고 열어 준 경로가 없다
function accessOf(group) {
  if (!group) return 'allowed';
  const denyAll = group.rules.some(r => r.type === 'disallow' && r.path === '/');
  if (!denyAll) return 'allowed';
  return group.rules.some(r => r.type === 'allow' && r.path) ? 'partial' : 'blocked';
}

// 이 사이트가 AI 크롤러에게 열려 있는지, 그리고 우리 진단 크롤러가 접근해도 되는지를
// 나눠서 판단한다. 국내 대형몰은 필요한 봇만 허용하고 `*` 를 막는 경우가 많은데,
// 이 둘을 뭉뚱그리면 "AI 크롤러 차단"으로 잘못 읽게 된다.
function analyzeRobots(txt) {
  const groups = parseRobots(txt);
  const scan = list => list.map(ua => {
    const { group, matchedBy } = groupFor(groups, ua);
    return { ua, access: accessOf(group), matchedBy };
  });

  const answer = scan(ANSWER_CRAWLERS);
  const training = scan(TRAINING_CRAWLERS);
  const openAnswer = answer.filter(c => c.access !== 'blocked');

  return {
    answer,
    training,
    answerAllowed: openAnswer.length,
    answerTotal: answer.length,
    trainingAllowed: training.filter(c => c.access !== 'blocked').length,
    trainingTotal: training.length,
    // 이름으로 따로 허용해 준 봇이 있으면, 사이트가 AI 접근을 의식하고 있다는 신호다.
    namedCount: [...answer, ...training].filter(c => c.matchedBy === 'exact').length,
    // 우리 크롤러는 이름이 없으므로 `*` 그룹을 따른다.
    // 우리를 이름으로 지목한 규칙이 있으면 그것이 최우선이다. 어느 모드든 따른다.
    namedBlock: OUR_AGENTS.some(a => {
      const g = groups.find(x => x.agents.some(v => v.toLowerCase() === a.toLowerCase()));
      return g ? accessOf(g) === 'blocked' : false;
    }),
    // 이름 없는 크롤러 전체에 적용되는 `*` 규칙.
    wildcardAccess: accessOf(groups.find(x => x.agents.includes('*')) || null),
  };
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

/**
 * @param {string} targetUrl
 * @param {{ mode?: 'user' | 'crawl' }} [opts]
 *   'user'  사람이 그 주소를 입력해서 부른 1회 조회 (기본값)
 *   'crawl' 목록을 훑는 대량 수집. robots.txt 를 전면 준수한다.
 */
export async function diagnose(targetUrl, opts = {}) {
  const mode = opts.mode === 'crawl' ? 'crawl' : 'user';
  const ua = mode === 'crawl' ? UA_CRAWL : UA_USER;

  const u = new URL(targetUrl);
  const origin = u.origin;

  const robots = await get(origin + '/robots.txt', ua);
  const rb = robots.ok ? analyzeRobots(robots.text) : null;

  // 페이지를 가져오지 않는 두 경우.
  //  1) 우리를 이름으로 지목해 막은 경우 — 모드와 무관하게 따른다.
  //  2) `*` 전면 차단이면서 대량 수집 모드인 경우 — 그건 크롤링이므로 따른다.
  // 사용자가 직접 입력한 1회 조회는 `*` 차단만으로 멈추지 않는다.
  // 그 규칙은 목록을 훑는 크롤러를 향한 것이고, 우리는 그 한 페이지만 읽기 때문이다.
  const stop = rb && (rb.namedBlock || (mode === 'crawl' && rb.wildcardAccess === 'blocked'));

  if (stop) {
    return {
      url: u.href,
      host: u.host,
      pageSkipped: true,
      skipReason: rb.namedBlock ? 'named_block' : 'wildcard_block',
      quadrant: 'page_skipped',
      aiScore: null,
      uxScore: null,
      robots: rb,
      checks: [],
      fixes: [],
      scannedAt: Date.now(),
    };
  }

  // 사용자 요청 조회에서는 요청한 그 페이지만 본다. sitemap 순회 같은 건 하지 않는다.
  const [page, llms, sitemap] = await Promise.all([
    get(u.href, ua),
    get(origin + '/llms.txt', ua),
    get(origin + '/sitemap.xml', ua),
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

  // 상품 구조화 데이터와 가격은 상품 상세페이지에 있는 것이 정상이다.
  // 첫 화면에 없다고 감점하면 측정이 틀린다. 검사 대상이 상품 페이지일 때만 채점한다.
  const looksLikeProductPage =
    /\/product\/|\/goods\/|\/item\/|product_no=|goodsNo=|itemId=|\/dp\//i.test(u.href) ||
    hasType(ld, 'Product');
  const hasOrgLd = hasType(ld, 'Organization') || hasType(ld, 'LocalBusiness');
  const priceInText = /[0-9][0-9,]{2,}\s*원/.test(body);
  const hasBizInfo = /사업자\s*등록\s*번호|사업자번호/.test(body);

  // axis: 'ai' = AI 가시성, 'ux' = 사람 구매여정
  const checks = [
    {
      id: 'ai_crawler', axis: 'ai', weight: 25,
      // 답변용 크롤러 기준으로만 판정한다. 학습용 차단은 정당한 선택이라 감점하지 않는다.
      pass: !rb || rb.answerAllowed === rb.answerTotal,
      label: 'AI 답변 크롤러 접근 허용',
      detail: !rb
        ? 'robots.txt 없음 (제한 없음)'
        : `답변용 ${rb.answerTotal}종 중 ${rb.answerAllowed}종 허용` +
          (rb.answerAllowed < rb.answerTotal
            ? ' · 차단: ' + rb.answer.filter(c => c.access === 'blocked').map(c => c.ua).join(', ')
            : ''),
      why: '사용자가 AI에게 물었을 때 사이트를 찾아가 인용하는 크롤러입니다. '
         + '여기가 막히면 AI 답변에 우리 가게가 등장할 수 없습니다.',
    },
    {
      id: 'ai_training', axis: 'ai', weight: 0,
      pass: true, // 정보성 항목. 점수에 넣지 않는다.
      label: '학습용 크롤러 (참고)',
      detail: !rb
        ? '제한 없음'
        : `학습용 ${rb.trainingTotal}종 중 ${rb.trainingAllowed}종 허용`,
      why: '모델 학습 데이터 수집용입니다. 막는 것도 정당한 선택이라 점수에 반영하지 않습니다.',
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
      applies: looksLikeProductPage,
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
      applies: looksLikeProductPage,
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

  // applies 가 false 인 항목은 이 페이지에 해당하지 않으므로 채점에서 뺀다.
  const applicable = checks.filter(c => c.applies !== false);

  const score = (axis) => {
    const items = applicable.filter(c => c.axis === axis);
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
    robots: rb,
    isProductPage: looksLikeProductPage,
    checks: applicable.map(({ weight, applies, ...rest }) => rest),
    fixes: applicable
      .filter(c => !c.pass)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5)
      .map(c => ({ id: c.id, label: c.label, why: c.why })),
    scannedAt: Date.now(),
  };
}

export const QUADRANT_LABEL = {
  page_skipped: '부분 진단 — robots.txt 지시에 따라 페이지를 수집하지 않았습니다',
  healthy: '정상 — 사람도 AI도 찾을 수 있습니다',
  ai_invisible: 'AI 시대에 사라질 가게 — 지금은 팔리지만 AI가 못 찾습니다',
  leaking: '유입은 되는데 새는 중 — AI는 찾지만 사람이 못 삽니다',
  critical: '위험 — 양쪽 모두 막혀 있습니다',
};
