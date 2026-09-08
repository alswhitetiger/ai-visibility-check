import { DIAGNOSIS_VERSION, robotsAccess, isHtml, fileState, readPage } from './parse.js';
export { DIAGNOSIS_VERSION } from './parse.js';
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

function analyzeRobots(txt, url) {
  const answer = robotsAccess(txt, url, ANSWER_CRAWLERS);
  const training = robotsAccess(txt, url, TRAINING_CRAWLERS);
  const ours = robotsAccess(txt, url, OUR_AGENTS);
  return { answer, training,
    answerAllowed: answer.filter(c => c.access === 'allowed').length, answerTotal: answer.length,
    trainingAllowed: training.filter(c => c.access === 'allowed').length, trainingTotal: training.length,
    namedCount: [...answer,...training].filter(c => c.matchedBy === 'exact').length,
    namedBlock: ours.some(c => c.matchedBy === 'exact' && c.access === 'blocked'),
    wildcardAccess: ours[1].access,
  };
}

function hasType(blocks, type) {
  return blocks.some(b => {
    const t = b && b['@type'];
    return Array.isArray(t) ? t.includes(type) : t === type;
  });
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
  const robotsKnown = [404, 410].includes(robots.status) || (robots.ok && !isHtml(robots.text));
  const rb = robotsKnown ? analyzeRobots(robots.ok ? robots.text : '', u.href) : null;

  // 페이지를 가져오지 않는 두 경우.
  //  1) 우리를 이름으로 지목해 막은 경우 — 모드와 무관하게 따른다.
  //  2) `*` 전면 차단이면서 대량 수집 모드인 경우 — 그건 크롤링이므로 따른다.
  // 사용자가 직접 입력한 1회 조회는 `*` 차단만으로 멈추지 않는다.
  // 그 규칙은 목록을 훑는 크롤러를 향한 것이고, 우리는 그 한 페이지만 읽기 때문이다.
  const stop = !robotsKnown || (rb && (rb.namedBlock || (mode === 'crawl' && rb.wildcardAccess === 'blocked')));

  if (stop) {
    return {
      url: u.href,
      host: u.host,
      pageSkipped: true,
      skipReason: !robotsKnown ? 'robots_unavailable' : rb.namedBlock ? 'named_block' : 'wildcard_block',
      version: DIAGNOSIS_VERSION,
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
  const resource = async path => {
    const url = origin + path;
    const access = analyzeRobots(robots.ok ? robots.text : '', url);
    if (access.namedBlock || (mode === 'crawl' && access.wildcardAccess === 'blocked')) return { ok: false, status: 0, text: '' };
    return get(url, ua);
  };
  const [page, llms, sitemap] = await Promise.all([
    get(u.href, ua),
    resource('/llms.txt'),
    resource('/sitemap.xml'),
  ]);

  if (!page.ok) {
    return { error: 'FETCH_FAILED', status: page.status, url: u.href };
  }
  if (looksBlocked(page.text)) {
    return { error: 'BLOCKED_BY_SITE', status: page.status, url: u.href };
  }

  const { body, ld, title, desc, imgs, withAlt, altRatio, hasViewport, hasCanonical, hasOg, hasProductLd, hasPriceLd, brand, observed } = readPage(page.text);
  const llmsPass = fileState(llms, 'llms');
  const sitemapPass = fileState(sitemap, 'sitemap');

  // 상품 구조화 데이터와 가격은 상품 상세페이지에 있는 것이 정상이다.
  // 첫 화면에 없다고 감점하면 측정이 틀린다. 검사 대상이 상품 페이지일 때만 채점한다.
  const looksLikeProductPage =
    /\/product\/|\/goods\/|\/item\/|product_no=|goodsNo=|itemId=|\/dp\//i.test(u.href) ||
    (u.pathname !== '/' && hasType(ld, 'Product') && !hasType(ld, 'ItemList'));
  const hasOrgLd = hasType(ld, 'Organization') || hasType(ld, 'LocalBusiness');
  const priceInText = /[0-9][0-9,]{2,}\s*원/.test(body);
  const hasBizInfo = /사업자\s*등록\s*번호|사업자번호/.test(body);

  // axis: 'ai' = AI 가시성, 'ux' = 사람 구매여정
  const checks = [
    {
      id: 'ai_crawler', axis: 'ai', weight: 25,
      // 답변용 크롤러 기준으로만 판정한다. 학습용 차단은 정당한 선택이라 감점하지 않는다.
      pass: rb.answerAllowed === rb.answerTotal,
      label: 'AI 답변 크롤러 접근 허용',
      detail: !rb
        ? 'robots.txt 없음 (제한 없음)'
        : `답변용 ${rb.answerTotal}종 중 ${rb.answerAllowed}종 허용` +
          (rb.answerAllowed < rb.answerTotal
            ? ' · 차단: ' + rb.answer.filter(c => c.access === 'blocked').map(c => c.ua).join(', ')
            : ''),
      why: '사용자가 AI에게 물었을 때 사이트를 찾아가 인용하는 크롤러입니다. '
         + '게시된 접근 규칙을 확인하며 실제 AI 방문이나 검색 노출을 보장하지 않습니다.',
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
      id: 'llms_txt', axis: 'ai', weight: 0, pass: llmsPass,
      label: 'llms.txt 제공',
      detail: llmsPass === null ? '조회하지 못함' : llmsPass ? 'Markdown 제목과 웹 링크 확인' : '안내 파일 형식 미검출',
      why: '선택적인 AI 안내 파일입니다. 검색 노출의 필수 조건이 아니며 점수에 반영하지 않습니다.',
    },
    {
      id: 'jsonld_org', axis: 'ai', weight: 15, pass: hasOrgLd,
      label: '조직 구조화 데이터',
      detail: hasOrgLd ? '있음' : '없음',
      why: '브랜드 정보를 일정한 형식으로 제공하는지 확인합니다. 이 정보가 없어도 AI가 브랜드를 알 수 있습니다.',
    },
    {
      id: 'jsonld_product', axis: 'ai', weight: 15, pass: hasProductLd,
      applies: looksLikeProductPage,
      label: '상품 구조화 데이터',
      detail: hasProductLd ? '있음' : '없음',
      why: '상품 정보를 일정한 형식으로 제공하면 기계가 읽는 데 도움이 됩니다. 추천 여부를 보장하지는 않습니다.',
    },
    {
      id: 'js_dependency', axis: 'ai', weight: 20, pass: body.length >= 600,
      label: '자바스크립트 없이도 내용이 보임',
      detail: 'HTML 원본 텍스트 ' + body.length + '자',
      why: '원본 HTML 텍스트 600자 기준의 간이 점검입니다. 글의 품질이나 실제 렌더링을 시험하지 않습니다.',
    },
    {
      id: 'sitemap', axis: 'ai', weight: 8, pass: sitemapPass,
      label: 'sitemap.xml',
      detail: sitemapPass === null ? '조회하지 못함' : sitemapPass ? '사이트맵 형식과 주소 항목 확인' : '기본 경로에서 사이트맵 미검출',
      why: 'sitemap.xml 기본 경로를 확인합니다. 다른 주소에 사이트맵이 있을 수도 있습니다.',
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
      why: '브라우저에 표시할 제목의 길이(10~60자)를 점검합니다. 검색 결과에 그대로 쓰인다는 의미는 아닙니다.',
    },
    {
      id: 'description', axis: 'ux', weight: 12, pass: desc.length >= 40,
      label: '메타 설명',
      detail: desc ? desc.length + '자' : '없음',
      why: '가게나 페이지를 소개하는 문장입니다. 40자 이상인지 확인합니다.',
    },
    {
      id: 'viewport', axis: 'ux', weight: 15, pass: hasViewport,
      label: '모바일 뷰포트',
      detail: hasViewport ? '있음' : '없음',
      why: '모바일 화면 너비 설정을 확인합니다. 실제 휴대폰 화면이나 결제 기능의 동작 검사는 아닙니다.',
    },
    {
      id: 'img_alt', axis: 'ux', weight: 13, pass: altRatio === null ? null : altRatio >= 0.6,
      label: '이미지 대체 텍스트',
      detail: imgs.length
        ? withAlt + '/' + imgs.length + ' (' + Math.round(altRatio * 100) + '%)'
        : '이미지 없음',
      why: '이미지를 설명하는 alt 글의 비율을 확인합니다. 장식용 이미지의 빈 설명은 적절할 수 있습니다.',
    },
    {
      id: 'price', axis: 'ux', weight: 15, pass: hasPriceLd || priceInText,
      applies: looksLikeProductPage,
      label: '가격 정보 노출',
      detail: hasPriceLd ? '상품 offers에서 숫자 가격 확인' : priceInText ? '본문에 있음' : '확인 불가',
      why: '상품 데이터의 숫자 가격 또는 본문의 원화 표기를 확인합니다. 실제 결제 가격은 별도 확인이 필요합니다.',
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
      why: '사업자번호 관련 문구의 존재만 확인합니다. 번호의 유효성이나 법적 적합성 판정은 아닙니다.',
    },
  ];

  // applies 가 false 인 항목은 이 페이지에 해당하지 않으므로 채점에서 뺀다.
  const applicable = checks.filter(c => c.applies !== false);

  const score = (axis) => {
    const items = applicable.filter(c => c.axis === axis && c.pass !== null && c.weight > 0);
    const total = items.reduce((s, c) => s + c.weight, 0);
    const got = items.reduce((s, c) => s + (c.pass ? c.weight : 0), 0);
    return total ? Math.round((got / total) * 100) : null;
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
    version: DIAGNOSIS_VERSION,
    observed,
    brand: typeof brand === 'string' ? brand.slice(0, 120) : u.hostname,
    checks: applicable.map(({ applies, ...rest }) => ({ ...rest, evidenceUrl: rest.id.startsWith('ai_') ? origin + '/robots.txt' : rest.id === 'llms_txt' ? origin + '/llms.txt' : rest.id === 'sitemap' ? origin + '/sitemap.xml' : u.href })),
    fixes: applicable
      .filter(c => c.pass === false && c.weight > 0)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3)
      .map(c => ({ id: c.id, label: c.label, why: c.why })),
    scannedAt: Date.now(),
  };
}

export const QUADRANT_LABEL = {
  page_skipped: '부분 진단 — robots.txt 지시에 따라 페이지를 수집하지 않았습니다',
  healthy: '기본 정보가 대체로 갖춰져 있어요',
  ai_invisible: 'AI에 제공할 정보를 먼저 보완해 보세요',
  leaking: '고객에게 보여줄 정보를 먼저 보완해 보세요',
  critical: '가게의 기본 정보부터 채워 보세요',
};
