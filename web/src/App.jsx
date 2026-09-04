import { useEffect, useState } from 'react';

// Worker 주소. 비어 있으면 정적 모드로 동작한다(사전 계산 결과만 표시).
const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

const QUADRANT = {
  page_skipped: {
    title: '부분 진단',
    desc: 'robots.txt 지시에 따라 페이지를 수집하지 않았습니다. AI 크롤러 허용 여부만 확인했습니다',
    tone: 'warn',
  },
  healthy: { title: '정상', desc: '사람도 AI도 찾을 수 있습니다', tone: 'ok' },
  ai_invisible: { title: 'AI 시대에 사라질 가게', desc: '지금은 팔리지만 AI가 못 찾습니다', tone: 'warn' },
  leaking: { title: '유입은 되는데 새는 중', desc: 'AI는 찾지만 사람이 못 삽니다', tone: 'warn' },
  critical: { title: '위험', desc: '양쪽 모두 막혀 있습니다', tone: 'bad' },
};

function ScoreBar({ label, value, hint }) {
  const tone = value >= 60 ? 'ok' : value >= 35 ? 'warn' : 'bad';
  return (
    <div className="score">
      <div className="score-head">
        <span>{label}</span>
        <strong className={'v ' + tone}>{value}</strong>
      </div>
      <div className="track"><div className={'fill ' + tone} style={{ width: value + '%' }} /></div>
      <p className="hint">{hint}</p>
    </div>
  );
}

function Quadrant({ ai, ux }) {
  // 좌하단이 원점. x축 = AI 가시성, y축 = 구매여정.
  const x = Math.min(Math.max(ai, 2), 98);
  const y = Math.min(Math.max(ux, 2), 98);
  return (
    <div className="quad">
      <div className="quad-grid">
        <div className="cell warn"><span>AI 시대에<br />사라질 가게</span></div>
        <div className="cell ok"><span>정상</span></div>
        <div className="cell bad"><span>위험</span></div>
        <div className="cell warn"><span>유입은 되는데<br />새는 중</span></div>
        <div className="dot" style={{ left: x + '%', bottom: y + '%' }} />
      </div>
      <div className="axis-x">AI 가시성 →</div>
      <div className="axis-y">구매여정 →</div>
    </div>
  );
}

function CheckList({ title, items }) {
  return (
    <section className="checks">
      <h3>{title}</h3>
      <ul>
        {items.map(c => (
          <li key={c.id} className={c.pass ? 'pass' : 'fail'}>
            <span className="mark">{c.pass ? '통과' : '보완'}</span>
            <div>
              <strong>{c.label}</strong>
              <span className="detail">{c.detail}</span>
              {!c.pass && <p className="why">{c.why}</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AiAnswer({ ai }) {
  if (!ai) return null;
  if (ai.unavailable) {
    return (
      <section className="ai-box muted">
        <h3>AI 실제 응답</h3>
        <p>실시간 질의는 대기 중입니다. 위 진단 결과는 AI 호출 없이 산출된 것으로, 그대로 유효합니다.</p>
      </section>
    );
  }
  const a = ai.answer || {};
  return (
    <section className="ai-box">
      <h3>AI 실제 응답</h3>
      <p className="knows">{a.knows ? '이 브랜드를 알고 있습니다.' : '이 브랜드를 모릅니다.'}</p>
      {a.what_is_it && <p>{a.what_is_it}</p>}
      {Array.isArray(a.competitors_named_first) && a.competitors_named_first.length > 0 && (
        <p className="rivals">
          같은 카테고리에서 먼저 언급된 브랜드: {a.competitors_named_first.join(', ')}
        </p>
      )}
      {a.possible_misinformation && (
        <p className="misinfo">잘못 알고 있을 수 있는 내용: {a.possible_misinformation}</p>
      )}
      <p className="provenance">
        분석 모델: {ai.provider} / {ai.model}
        {ai.stale && ai.collectedAt &&
          ` · ${new Date(ai.collectedAt).toLocaleDateString('ko-KR')} 수집분`}
      </p>
    </section>
  );
}

const CHECK_LABEL = {
  ai_crawler: 'AI 답변 크롤러 허용',
  llms_txt: 'llms.txt 제공',
  jsonld_org: '조직 구조화 데이터',
  jsonld_product: '상품 구조화 데이터',
  js_dependency: 'JS 없이도 내용이 보임',
  sitemap: 'sitemap.xml',
  canonical: 'canonical 지정',
  title: '페이지 제목 품질',
  description: '메타 설명',
  viewport: '모바일 뷰포트',
  img_alt: '이미지 대체 텍스트',
  price: '가격 정보 노출',
  og: '공유용 OG 태그',
  business_info: '사업자 정보 표기',
  ai_training: '학습용 크롤러 (참고)',
};

// 개별 사이트를 지목하지 않는 익명 집계. 이름을 밝히는 것은 옵트인 목록에서만 한다.
function Survey({ stats }) {
  if (!stats || !stats.robotsRead) return null;
  const ac = stats.answerCrawler;
  const bars = [
    { label: '답변 크롤러 전면 허용', n: ac.fullyOpen, tone: 'ok' },
    { label: '일부 차단', n: ac.partlyBlocked, tone: 'warn' },
    { label: '전면 차단', n: ac.fullyBlocked, tone: 'bad' },
  ];
  const max = Math.max(...bars.map(b => b.n), 1);

  return (
    <section className="survey">
      <h3>국내 쇼핑몰 AI 가시성 실태</h3>
      <p className="hint">
        국내 쇼핑몰 {stats.scanned + stats.unreachable}곳을 점검했습니다.
        개별 사이트는 밝히지 않고 집계만 공개합니다.
      </p>

      <div className="survey-bars">
        {bars.map(b => (
          <div key={b.label} className="sbar">
            <span className="sbar-label">{b.label}</span>
            <div className="sbar-track">
              <div className={'sbar-fill ' + b.tone} style={{ width: (b.n / max) * 100 + '%' }} />
            </div>
            <strong className="sbar-n">{b.n}</strong>
          </div>
        ))}
      </div>
      <p className="hint">
        robots.txt를 읽을 수 있었던 {stats.robotsRead}곳 기준.
        이 중 <b>{stats.namedAiBots}곳</b>은 AI 봇을 이름으로 지정해 관리하고 있었고,
        <b> {stats.blocksUnnamedCrawlers}곳</b>은 이름 없는 크롤러를 차단하고 있었습니다.
      </p>

      {stats.measured > 0 && (
        <>
          <div className="survey-avg">
            <div><span>평균 AI 가시성</span><strong>{stats.avgAiScore}</strong></div>
            <div><span>평균 구매여정</span><strong>{stats.avgUxScore}</strong></div>
            <div><span>전체 진단 가능</span><strong>{stats.measured}곳</strong></div>
          </div>

          <h4>가장 많이 빠져 있는 항목</h4>
          <ul className="survey-checks">
            {stats.byCheck
              .filter(c => c.id !== 'ai_training' && c.passRate !== null)
              .slice(0, 6)
              .map(c => (
                <li key={c.id}>
                  <span>{CHECK_LABEL[c.id] || c.id}</span>
                  <div className="sbar-track small">
                    <div
                      className={'sbar-fill ' + (c.passRate >= 60 ? 'ok' : c.passRate >= 30 ? 'warn' : 'bad')}
                      style={{ width: c.passRate + '%' }}
                    />
                  </div>
                  <strong>{c.passRate}%</strong>
                </li>
              ))}
          </ul>
          <p className="hint">막대는 해당 항목을 통과한 사이트 비율입니다.</p>
        </>
      )}
    </section>
  );
}

export default function App() {
  const [url, setUrl] = useState('');
  const [state, setState] = useState({ status: 'idle' });
  const [showcase, setShowcase] = useState([]);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const base = import.meta.env.BASE_URL;
    fetch(base + 'data/showcase.json')
      .then(r => r.json())
      .then(d => setShowcase(d.items || []))
      .catch(() => setShowcase([]));
    fetch(base + 'data/stats.json')
      .then(r => r.json())
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  async function run(e) {
    e.preventDefault();
    if (!url.trim()) return;
    if (!API_BASE) {
      setState({ status: 'static' });
      return;
    }
    setState({ status: 'loading' });
    try {
      const res = await fetch(API_BASE + '/api/scan?url=' + encodeURIComponent(url.trim()));
      const data = await res.json();
      // 한도 초과(429)와 사이트 차단(200 + error) 모두 안내 문구로 처리한다.
      if (!res.ok || data.error) {
        setState({ status: 'limited', message: data.message || '지금은 분석할 수 없습니다.' });
        return;
      }
      setState({ status: 'done', data });
    } catch {
      setState({ status: 'limited', message: '분석 서버에 연결하지 못했습니다.' });
    }
  }

  const d = state.data;
  const q = d && QUADRANT[d.quadrant];

  return (
    <div className="wrap">
      <header>
        <h1>AI는 우리 브랜드를 뭐라고 말할까</h1>
        <p className="sub">
          쇼핑몰 주소 하나로 두 가지를 동시에 봅니다 —
          <b> AI가 우리를 찾을 수 있는가</b>, 그리고 <b>사람이 들어와서 살 수 있는가</b>.
        </p>
      </header>

      <form className="finder" onSubmit={run}>
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="example.com"
          aria-label="쇼핑몰 주소"
        />
        <button type="submit" disabled={state.status === 'loading'}>
          {state.status === 'loading' ? '분석 중…' : '진단하기'}
        </button>
      </form>

      {state.status === 'static' && (
        <p className="notice">
          실시간 분석은 준비 중입니다. 아래 저장된 분석 결과를 먼저 확인하세요.
        </p>
      )}
      {state.status === 'limited' && <p className="notice">{state.message}</p>}

      {state.status === 'done' && d && (
        <main className="result">
          <div className={'verdict ' + q.tone}>
            <h2>{q.title}</h2>
            <p>{q.desc}</p>
            <span className="host">{d.host}</span>
          </div>

          {/* 페이지를 수집하지 못한 경우 점수를 매기지 않는다. 대신 robots.txt 로 알 수 있는 것만 보여준다. */}
          {!d.pageSkipped && (
            <>
              <Quadrant ai={d.aiScore} ux={d.uxScore} />
              <div className="scores">
                <ScoreBar label="AI 가시성" value={d.aiScore} hint="AI가 우리를 찾고 이해할 수 있는가" />
                <ScoreBar label="구매여정" value={d.uxScore} hint="사람이 들어와서 살 수 있는가" />
              </div>
            </>
          )}
          {d.pageSkipped && d.robots && (
            <section className="ai-box">
              <h3>robots.txt 로 확인한 것</h3>
              <p className="knows">
                AI 답변 크롤러 {d.robots.answerTotal}종 중 <b>{d.robots.answerAllowed}종</b>이 접근 가능합니다.
              </p>
              <p className="rivals">
                학습용 크롤러는 {d.robots.trainingTotal}종 중 {d.robots.trainingAllowed}종 허용.
              </p>
              <p className="provenance">
                이 사이트는 robots.txt 에서 이름 없는 크롤러를 차단하고 있습니다.
                그 지시를 따라 페이지는 수집하지 않았고, 그래서 나머지 항목은 측정하지 못했습니다.
              </p>
            </section>
          )}

          {d.fixes?.length > 0 && (
            <section className="fixes">
              <h3>먼저 고칠 것</h3>
              <ol>
                {d.fixes.map(f => (
                  <li key={f.id}><strong>{f.label}</strong><p>{f.why}</p></li>
                ))}
              </ol>
            </section>
          )}

          <AiAnswer ai={d.ai} />

          <CheckList title="AI 가시성 항목" items={d.checks.filter(c => c.axis === 'ai')} />
          <CheckList title="구매여정 항목" items={d.checks.filter(c => c.axis === 'ux')} />

          {d.cached && <p className="provenance">저장된 결과입니다 (최대 24시간 캐시).</p>}
        </main>
      )}

      <Survey stats={stats} />

      {showcase.length > 0 && (
        <section className="showcase">
          <h3>미리 분석해 둔 결과</h3>
          <p className="hint">
            공개에 동의한 사이트만 표시합니다. 순위가 아니라 점검 항목의 통과 여부입니다.
          </p>
          <table>
            <thead>
              <tr><th>사이트</th><th>AI 가시성</th><th>구매여정</th></tr>
            </thead>
            <tbody>
              {showcase.map(s => (
                <tr key={s.host}>
                  <td>{s.label || s.host}</td>
                  <td>{s.ai_score}</td>
                  <td>{s.ux_score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <footer>
        <p>
          공개된 웹페이지만 수집하며, 대상 사이트의 robots.txt를 따릅니다.
          진단 결과는 참고용이며 법률 자문이 아닙니다.
        </p>
        <p>원티드 AI Championship 2026 출품작</p>
      </footer>
    </div>
  );
}
