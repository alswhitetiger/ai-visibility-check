import { useEffect, useRef, useState } from 'react';
import { guides, titleOf, dateOf } from './guides';
import ResultActions from './ResultActions';
import { ObservedInfo, ShopBuilder } from './ShopTools';
import MembershipGate from './MembershipGate';
import { API, sameOrigin, memberPageUrl, memberApi } from './member-api';
import './experience.css';
import LandingHero, { PublicGuide } from './LandingHero';
import './landing.css';

const VERSION = '2026-09-08.4';
const STORAGE = 'shop-check:last:';
const verdicts = {
  healthy: '기본 정보가 대체로 갖춰져 있어요',
  ai_invisible: 'AI에 제공할 정보를 먼저 보완해 보세요',
  leaking: '고객에게 보여줄 정보를 먼저 보완해 보세요',
  critical: '가게의 기본 정보부터 채워 보세요',
};

async function getJson(url, signal) {
  const r = await fetch(url, { signal, method: url.includes('/api/scan?') ? 'POST' : 'GET', credentials: sameOrigin ? 'same-origin' : 'omit' });
  let d;
  try { d = await r.json(); } catch { throw new Error('서버 응답을 읽지 못했습니다. 잠시 후 다시 시도해 주세요.'); }
  if (!r.ok || d.error) throw new Error(d.message || ({ INVALID_URL: '공개된 쇼핑몰 주소를 입력해 주세요.', FETCH_FAILED: '페이지를 읽지 못했습니다. 주소를 확인하거나 다른 페이지를 검사해 주세요.' }[d.error]) || '지금은 이 페이지를 검사할 수 없습니다. 잠시 후 다시 시도해 주세요.');
  return d;
}
function readPrevious(url) { try { return JSON.parse(localStorage.getItem(STORAGE + url)); } catch { return null; } }
function remember(d) {
  if (d.example || d.pageSkipped) return;
  try { localStorage.setItem(STORAGE + d.url, JSON.stringify({ version: d.version, scannedAt: d.scannedAt, aiScore: d.aiScore, uxScore: d.uxScore, checks: d.checks.map(c => ({ id: c.id, pass: c.pass })) })); } catch { /* Storage is optional. */ }
}

function statusText(value) { return value === true ? '확인됨' : value === false ? '보완 필요' : '미확인'; }

function FixChecklist({ url, fixes }) {
  const key = 'shop-check:fixes:' + url;
  const [done, setDone] = useState(() => { try { const saved = JSON.parse(localStorage.getItem(key) || '{}'); return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}; } catch { return {}; } });
  if (!fixes.length) return null;
  function toggle(id) {
    const next = { ...done, [id]: !done[id] };
    setDone(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* Storage is optional. */ }
  }
  const completed = fixes.filter(c => done[c.id]).length;
  return <section className="panel fix-checklist"><div className="checklist-heading"><div><p className="eyebrow">개선 체크리스트</p><h3>고친 항목을 표시해 두세요</h3></div><span>{completed} / {fixes.length}</span></div><ul>{fixes.map(c => <li key={c.id}><label><input type="checkbox" checked={!!done[c.id]} onChange={() => toggle(c.id)} /><span><b className={done[c.id] ? 'is-done' : ''}>{titleOf(c)}</b><small>{guides[c.id]?.action || c.why}</small></span></label></li>)}</ul><p className="muted">이 브라우저에 저장됩니다. 수정 후 다시 검사하면 점수와 상태 변화를 확인할 수 있어요.</p></section>;
}

function Copy({ text, label = '코드 예시 복사' }) {
  const [message, setMessage] = useState('');
  async function copy() {
    try { await navigator.clipboard.writeText(text); setMessage('복사했어요'); }
    catch { setMessage('복사하지 못했어요. 내용을 선택해 복사해 주세요.'); }
  }
  return <div className="copy-row"><button className="button small secondary" onClick={copy}>{label}</button><span role="status">{message}</span></div>;
}

function FixCard({ check, index }) {
  const guide = guides[check.id];
  return <article className="fix-card">
    <div className="fix-number">{String(index + 1).padStart(2, '0')}</div>
    <div><h3>{titleOf(check)}</h3><p>{guide?.action || check.why}</p>
      <details><summary>검사 근거{guide?.code ? '와 코드 예시' : ' 보기'}</summary>
        <p className="muted">{check.detail} · {guide?.term}</p><p>{check.why}</p>
        {check.evidenceUrl && <a href={check.evidenceUrl} target="_blank" rel="noreferrer">검사한 원본 열기 ↗</a>}
        {guide?.code && <><p className="code-note">형식을 보여주는 예시입니다. 교체 문구를 실제 정보로 바꾸고 기존 설정을 확인한 뒤 적용하세요.</p><pre>{guide.code}</pre><Copy text={guide.code} /></>}
      </details>
    </div>
  </article>;
}

function CheckGroup({ name, checks }) {
  return <section className="check-group"><h3>{name}</h3>{checks.map(c => <details className="check-row" key={c.id}>
    <summary><span className={'status '+(c.weight === 0 ? 'info' : c.pass === null ? 'info' : c.pass ? 'ok' : 'fix')}>{c.weight === 0 ? '참고' : c.pass === null ? '미확인' : c.pass ? '확인' : '보완'}</span><span>{titleOf(c)}</span><span className="expand">＋</span></summary>
    <div className="check-detail"><p>{c.detail}</p><p className="muted">{c.why}</p><p className="muted">기술 용어: {guides[c.id]?.term || c.id} · 배점 {c.weight ?? '—'}점</p>{c.evidenceUrl && <a target="_blank" rel="noreferrer" href={c.evidenceUrl}>검사한 원본 열기 ↗</a>}</div>
  </details>)}</section>;
}

function AiAnswer({ ai, example }) {
  const answer = ai?.answer;
  return <details className="panel ai-panel"><summary>추가 확인 · AI에게 이 브랜드를 물어봤어요</summary>
    <p className="muted">브랜드 이름을 알려주고 API 모델에게 물은 답변입니다. 웹 검색을 사용하지 않았으며, 실제 검색 추천 순위나 노출률을 뜻하지 않습니다.</p>
    {example ? <p>이 예시에는 실제 AI 응답을 넣지 않았습니다.</p> : !answer ? <p>현재 AI 답변을 가져오지 못했습니다. 위 페이지 검사는 별도로 완료됐습니다.</p> : <>
      <p><b>{answer.knows === true ? '모델이 브랜드를 알고 있다고 답했습니다.' : answer.knows === false ? '모델이 브랜드를 모른다고 답했습니다.' : '브랜드 인지 여부를 확인하지 못했습니다.'}</b></p>
      {typeof answer.what_is_it === 'string' && <p>{answer.what_is_it}</p>}
      {Array.isArray(answer.competitors_named_first) && <p>같은 분야로 함께 답한 브랜드: {answer.competitors_named_first.filter(x => typeof x === 'string').join(', ') || '없음'}</p>}
      <p className="muted">{ai.provider} / {ai.model} · {ai.stale ? '이전에 저장한 답변' : '이번에 받은 답변'} · {dateOf(ai.collectedAt)}</p>
      <p className="muted">AI 답변은 사실과 다를 수 있으며 위 두 점수에는 반영하지 않습니다.</p>
    </>}
  </details>;
}

function Comparison({ data, previous }) {
  if (!previous || !Array.isArray(previous.checks) || previous.version !== data.version || previous.scannedAt === data.scannedAt || data.cached) return null;
  const changed = data.checks.filter(c => previous.checks.some(old => old.id === c.id && old.pass !== c.pass));
  const delta = (now, old) => typeof now === 'number' && typeof old === 'number' && Number.isFinite(now) && Number.isFinite(old) ? Number(now) - Number(old) : null;
  const aiDelta = delta(data.aiScore, previous.aiScore), uxDelta = delta(data.uxScore, previous.uxScore);
  return <section className="panel comparison"><h3>이전 검사와 비교</h3><p className="muted">{data.example ? '가상 쇼핑몰에서 브랜드 정보·페이지 소개·이미지 설명을 추가하기 전과 후를 비교했습니다.' : `이 브라우저에 저장된 ${dateOf(previous.scannedAt)} 검사와 비교했습니다.`}</p>
    <div className="comparison-deltas">{aiDelta !== null && <span>AI 정보 <b>{aiDelta > 0 ? '+' : ''}{aiDelta}점</b></span>}{uxDelta !== null && <span>고객 정보 <b>{uxDelta > 0 ? '+' : ''}{uxDelta}점</b></span>}</div>
    {changed.length ? <ul>{changed.map(c => { const old = previous.checks.find(x => x.id === c.id); return <li key={c.id}>{titleOf(c)} <span>{statusText(old?.pass)} → <b>{statusText(c.pass)}</b></span></li>; })}</ul> : <p>확인된 항목에 변화가 없습니다.</p>}
    <p className="muted">페이지의 정보 변화이며 실제 AI 추천이나 매출의 변화는 아닙니다.</p>
  </section>;
}

function Report({ data, previous, onScan, onExample }) {
  const blocked = data.pageSkipped;
  const checks = data.checks || [];
  const fixes = checks.filter(c => c.pass === false && c.weight > 0).sort((a,b) => b.weight-a.weight);
  const unknown = checks.filter(c => c.pass === null && c.weight > 0).length;
  return <main id="report" tabIndex={-1}>
    <div className="report-heading"><div><p className="eyebrow">{data.example ? '사용법을 보여주는 가상 예시' : '페이지 검사 결과'}</p><h2>{blocked ? '페이지를 검사하지 못했어요' : verdicts[data.quadrant] || '검사 결과를 확인해 보세요'}</h2><p className="muted target">{data.example ? '예시 가게 · 실제 쇼핑몰의 측정값이 아닙니다' : data.url}</p></div><span className="report-badge">{data.example ? '예시' : data.cached ? '저장된 검사' : '검사 완료'}</span></div>
    {data.example && <div className="notice example-notice">화면과 수정 과정을 이해하기 위한 가상 쇼핑몰입니다. 실제로 파일을 수정하지 않습니다.<button className="text-button" onClick={onExample}>{data.exampleAfter ? '수정 전 예시로 돌아가기' : '수정 후 예시와 비교하기 →'}</button></div>}
    {blocked ? <div className="notice"><p>{data.skipReason === 'robots_unavailable' ? '사이트의 접근 규칙(robots.txt)을 읽지 못해 검사를 멈췄습니다. 허용 여부를 모르는 상태를 통과로 처리하지 않습니다.' : '사이트가 게시한 접근 제한에 따라 페이지를 가져오지 않았습니다.'}</p>{data.robots && <p>게시된 규칙상 AI {data.robots.answerTotal}종 중 {data.robots.answerAllowed}종은 입력한 주소에 접근 허용으로 표시됩니다. 실제 접근 성공 여부는 별개입니다.</p>}</div> : <>
      <div className="score-grid">{[['AI가 읽을 기본 정보', data.aiScore, '접근 규칙 · 브랜드 정보 · 원본 텍스트'], ['고객에게 보여줄 기본 정보', data.uxScore, '페이지 소개 · 모바일 설정 · 이미지 설명']].map(([name,score,hint]) => <section className="score-card" key={name}><p>{name}</p><div><strong>{score ?? '—'}</strong><span>/ 100</span></div><progress value={score ?? 0} max="100" aria-label={name} /><p className="muted">{hint}</p></section>)}</div>
      <p className="measurement-note">점수는 이 페이지의 기본 설정을 점검한 값입니다. 실제 AI 검색 노출·추천 여부나 구매 성공률은 측정하지 않습니다.{unknown > 0 && ` 미확인 ${unknown}개 항목은 점수에서 제외했습니다.`}</p>
      {data.shared && <p className="notice">공유된 검사 결과입니다. 현재 사이트 상태와 다를 수 있습니다. 링크 만료: {dateOf(data.shareExpiresAt)}</p>}
      <Comparison data={data} previous={previous} />
      <ObservedInfo data={data} />
      <section className="next-steps"><div className="section-heading"><div><p className="eyebrow">이제 무엇을 하면 되나요?</p><h2>{fixes.length ? '먼저 이 부분부터 고쳐 보세요' : '확인한 기본 항목을 통과했어요'}</h2></div>{fixes.length > 0 && <span className="muted">보완 {fixes.length}개 중 우선 {Math.min(fixes.length,3)}개</span>}</div>
        {fixes.length ? fixes.slice(0,3).map((c,i) => <FixCard check={c} index={i} key={c.id} />) : <p>실제 휴대폰 화면과 구매 동작도 직접 확인해 보세요. 기본 검사 통과가 모든 기능의 정상 동작을 뜻하지는 않습니다.</p>}
        {!data.example && <div className="recheck"><p><b>사이트를 수정했나요?</b><br/><span className="muted">다시 검사하면 이 브라우저의 이전 결과와 비교합니다. 재검사는 일일 이용 횟수에 포함됩니다.</span></p><button className="button secondary" onClick={() => onScan(data.url, true)}>수정 후 다시 검사</button></div>}
      </section>
      <FixChecklist key={data.url} url={data.url} fixes={fixes.slice(0, 3)} />
      <ShopBuilder key={data.url + ':' + data.scannedAt} data={data} onScan={onScan} />
      <details className="panel all-checks"><summary>전체 {checks.length}개 점검 항목과 근거 보기</summary><CheckGroup name="AI가 읽을 기본 정보" checks={checks.filter(c => c.axis === 'ai')} /><CheckGroup name="고객에게 보여줄 기본 정보" checks={checks.filter(c => c.axis === 'ux')} /></details>
      {!data.isProductPage && <p className="muted page-hint">지금은 일반 페이지를 검사했습니다. 상품 주소를 입력하면 상품 데이터와 가격도 점검합니다.</p>}
      <AiAnswer ai={data.ai} example={data.example} />
    </>}
    {!data.example && <><ResultActions key={data.url + ":" + data.scannedAt} data={data} apiBase={API} /><button className="text-button print-button" onClick={() => window.print()}>결과 인쇄 / PDF로 저장</button><p className="muted">페이지 검사: {dateOf(data.scannedAt)} · {data.cached ? '최대 24시간 보관된 결과' : '현재 기준'} · 검사 기준 {data.version}</p></>}
  </main>;
}

export default function Experience() {
  const [member, setMember] = useState({ user: null, usage: null });
  const [gate, setGate] = useState(null);
  async function refreshMember() {
    if (!sameOrigin) return;
    const next = await memberApi('/api/member/me');
    if (member.user && next.user?.id !== member.user.id) {
      active.current?.abort(); ++serial.current; latest.current = null; setState({ status: 'idle' });
    }
    setMember(next);
  }
  useEffect(() => { refreshMember().catch(() => {}); }, []);
  const [url, setUrl] = useState('');
  const [state, setState] = useState({ status: 'idle' });
  const active = useRef(null);
  const serial = useRef(0);
  const latest = useRef(null);
  const dataUrl = name => `${import.meta.env.BASE_URL}data/${name}.json?v=${__BUILD_ID__}`;
  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams(location.search);
    const shared = params.get('url'), shareToken = params.get('share'), action = params.get('action');
    if (shareToken) {
      getJson(API + '/api/share?token=' + encodeURIComponent(shareToken)).then(d => { if (alive) { setUrl(d.url || ''); setState({ status: 'done', data: d, previous: null }); } }).catch(e => { if (alive) setState({ status: 'error', message: e.message }); });
    } else if (shared) { setUrl(shared); scan(shared); }
    else if (action === 'example') example();
    else if (action === 'history' && params.get('history')) openHistory(params.get('history'));
    else if (action === 'project' || action === 'research') openReference(action);
    return () => { alive = false; active.current?.abort(); };
  }, []);
  useEffect(() => { if (state.status === 'done') { const report = document.getElementById('report'); report?.focus({ preventScroll: true }); report?.scrollIntoView({ block: 'start' }); } }, [state.status]);

  async function access(intent) {
    if (sameOrigin) {
      try {
        const next = await memberApi('/api/member/me');
        setMember(next);
        if (next.user) return true;
      } catch {
        setState({ status: 'error', message: '로그인 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.' });
        return false;
      }
    }
    setGate(intent); return false;
  }
  async function openMember() {
    if (await access({ action: 'account' })) location.assign(memberPageUrl('account'));
  }
  async function openReference(action) {
    location.assign('https://github.com/alswhitetiger/ai-visibility-check' + (action === 'research' ? '/tree/main/web/public/data' : ''));
  }
  async function openHistory(id) {
    if (!await access({ action: 'history', id })) return;
    try {
      const data = await memberApi('/api/member/history?id='+encodeURIComponent(id));
      latest.current = data; setState({ status: 'done', data: { ...data, cached: true } });
    } catch(e) { setState({ status: 'error', message: e.message }); }
  }
  async function scan(value, refresh = false) {
    if (!await access({ action: 'scan', url: value.trim() })) return;
    const target = value.trim();
    if (!target) { setState({ status: 'error', message: '검사할 쇼핑몰 주소를 입력해 주세요.' }); return; }
    active.current?.abort();
    const id = ++serial.current;
    const controller = new AbortController(); active.current = controller;
    setState({ status: 'loading', target });
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const d = await getJson(API+'/api/scan?url='+encodeURIComponent(target)+(refresh ? '&refresh=1' : ''), controller.signal);
      if (id !== serial.current) return;
      if (d.version !== VERSION) throw new Error('검사 서버를 업데이트하고 있습니다. 잠시 후 다시 시도하거나 예시 결과를 확인해 주세요.');
      const previous = readPrevious(d.url);
      remember(d); latest.current = d;
      setState({ status: 'done', data: d, previous });
    } catch (e) { if (id === serial.current) setState({ status: 'error', message: e.name === 'AbortError' ? '검사 시간이 길어져 중단했습니다. 잠시 후 다시 시도해 주세요.' : e.message }); }
    finally { clearTimeout(timer); refreshMember().catch(() => {}); }
  }
  async function example(after = false) {
    active.current?.abort(); const id = ++serial.current;
    try {
      const samples = await getJson(dataUrl('example'));
      if (id !== serial.current) return;
      const d = after ? samples.after : samples.before;
      setState({ status: 'done', data: d, previous: after ? samples.before : null });
    } catch { if (id === serial.current) setState({ status: 'error', message: '예시를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.' }); }
  }
  return <div className="app-shell">
    <nav className="topbar"><a className="brand" href={import.meta.env.BASE_URL}><span className="brand-mark" aria-hidden="true">✓</span>가게 체크<span className="brand-en">AI Visibility Check</span></a><div className="nav-links"><a href="#public-guide">수정 방법</a><a href="#how-it-works">Q&A</a></div><a href={memberPageUrl("account")} onClick={e=>{e.preventDefault();openMember();}}>{member.user ? "내 사이트" : "로그인 / 회원가입"}</a></nav>
    <LandingHero url={url} setUrl={setUrl} scan={scan} example={example} loading={state.status === 'loading'} limit={member.usage?.limit || 20} />
    {gate && <MembershipGate intent={gate} onClose={()=>setGate(null)} />}
    {state.status === 'loading' && <div className="notice loading" role="status"><span className="spinner"/><div><b>페이지의 기본 정보를 확인하고 있어요</b><p>사이트 응답과 AI 질의에 따라 최대 1분 정도 걸릴 수 있어요.</p></div><button className="text-button" onClick={() => { ++serial.current; active.current?.abort(); setState({status:'idle'}); }}>취소</button></div>}
    {state.status === 'error' && <div className="notice" role="alert"><p>{state.message}</p><button className="text-button" onClick={() => example()}>예시 결과 보기 →</button>{latest.current && <button className="text-button" onClick={() => setState({status:'done',data:latest.current})}>직전 결과 다시 보기</button>}</div>}
    {state.status === 'done' && <Report data={state.data} previous={state.previous} onScan={scan} onExample={() => example(!state.data.exampleAfter)} />}
    {state.status === 'idle' && <section className="overview"><article><span>01</span><h2>AI가 읽을 정보</h2><p>AI 접근 규칙, 브랜드 소개 등<br/>기계가 읽을 기본 정보를 확인해요.</p></article><article><span>02</span><h2>고객이 볼 정보</h2><p>페이지 설명, 모바일 설정 등<br/>고객 안내에 필요한 항목을 확인해요.</p></article><article><span>03</span><h2>고치는 방법</h2><p>보완할 항목과 수정 안내를 보고<br/>다시 검사해 변화를 확인해요.</p></article></section>}
    <PublicGuide example={example} />
    <section id="how-it-works" className="about"><p className="eyebrow">검사 결과, 이렇게 읽어 주세요</p><h2>점수보다 중요한 건<br/>빠진 정보를 채우는 일이에요.</h2><div className="faq"><details><summary>이 점수가 높으면 AI가 우리 가게를 추천하나요?</summary><p>추천을 보장하지 않습니다. 점수는 입력한 페이지의 HTML과 접근 규칙 등 기본 준비 상태를 나타냅니다. 실제 검색 노출·매출·결제 성공 여부는 측정하지 않습니다.</p></details><details><summary>무엇을 가져와서 검사하나요?</summary><p>입력한 페이지와 사이트의 robots.txt, llms.txt, sitemap.xml을 조회합니다. 상품 목록을 자동으로 순회하지 않습니다. 사용자 요청 검사에서는 저희 도구를 명시적으로 차단한 규칙을 따르며, 대량 조사에서는 일반 크롤러 차단 규칙도 따릅니다.</p></details><details><summary>개발을 몰라도 고칠 수 있나요?</summary><p>브랜드 소개나 이미지 설명은 쇼핑몰 관리자에서 수정할 수 있는 경우가 많습니다. 코드 설정이 필요한 항목은 안내와 예시를 운영·개발 담당자에게 전달하세요. 자동으로 사이트를 수정하지는 않습니다.</p></details><details><summary>점수는 어떻게 계산하나요?</summary><p>항목별 가중치를 합산해 100점으로 환산합니다. 배점과 근거는 전체 점검 항목에서 확인할 수 있습니다. 미확인 항목은 제외하고, 상품 데이터·가격은 상품 페이지에서만 검사합니다. llms.txt와 학습용 AI 설정은 참고 항목입니다. 외부에서 인증된 평가 척도는 아닙니다.</p></details><details><summary>이전 검사 기록은 어디에 저장되나요?</summary><p>서버는 페이지 검사를 최대 24시간 재사용합니다. 전후 비교에는 이 브라우저에 저장된 마지막 실제 검사 항목을 사용합니다. 회원의 검사 이력은 계정에 저장되어 다른 기기에서도 최근 90일의 결과를 열 수 있습니다. 위 자동 비교는 이 브라우저의 직전 결과를 기준으로 합니다. 사이트 변경이 없을 때는 저장된 결과를 이용하면 호출을 줄일 수 있습니다.</p></details></div></section>
    <footer className="site-footer"><span>가게 체크 · AI Visibility Check</span><a href="https://github.com/alswhitetiger/ai-visibility-check" onClick={e=>{e.preventDefault();openReference("project");}}>프로젝트와 검사 기준 ↗</a><p>원티드 AI Championship 2026 출품작 · 결과는 기본 정보 점검을 위한 참고 자료입니다.</p><button className="text-button" onClick={()=>openReference("research")}>이전 조사 자료 ↗</button></footer>
  </div>;
}
