import { useEffect, useState } from 'react';
import { memberApi, sameOrigin, loginUrl } from './member-api';
import './account.css';

const providers = { google: 'Google · Gmail', kakao: '카카오', naver: '네이버' };
export default function AccountPanel({ user, usage, onRefresh, onScan, onReport, revision, initialMode = 'login', callbackURL = location.origin + '/ai-visibility-check/account/' }) {
  const [config, setConfig] = useState({ providers: {} });
  const [mode, setMode] = useState(initialMode);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [sites, setSites] = useState([]), [history, setHistory] = useState([]), [more, setMore] = useState(false), [accounts, setAccounts] = useState([]);
  const [siteUrl, setSiteUrl] = useState(''), [siteLabel, setSiteLabel] = useState('');
  useEffect(() => { memberApi('/api/member/config').then(setConfig).catch(() => setMessage('회원 서비스를 연결하지 못했습니다. 잠시 후 새로고침해 주세요.')); }, []);
  useEffect(() => {
    let active = true;
    if (!user) { setSites([]); setHistory([]); setAccounts([]); return; }
    Promise.all([memberApi('/api/member/sites'), memberApi('/api/member/history'), memberApi('/api/auth/list-accounts')]).then(([s,h,a]) => {
      if (active) { setSites(s.items); setHistory(h.items); setMore(h.hasMore); setAccounts(a); }
    }).catch(e => { if (active) setMessage(e.message); });
    return () => { active = false; };
  }, [user?.id, revision]);
  async function act(fn) {
    setBusy(true); setMessage('');
    try { await fn(); } catch (e) { setMessage(e.message); } finally { setBusy(false); }
  }
  async function emailSubmit(e) {
    e.preventDefault(); const fields = Object.fromEntries(new FormData(e.currentTarget));
    await act(async () => {
      if (mode === 'reset') {
        await memberApi('/api/auth/request-password-reset', { email: fields.email, redirectTo: location.origin + '/ai-visibility-check/login/' });
        setMessage('가입된 이메일이면 비밀번호 재설정 안내를 보내드립니다.'); return;
      }
      if (mode === 'new-password') {
        await memberApi('/api/auth/reset-password', { newPassword: fields.password, token: new URLSearchParams(location.search).get('token') });
        window.history.replaceState({}, '', location.pathname + '#account'); setMode('login'); setMessage('비밀번호를 변경했어요. 다시 로그인해 주세요.'); return;
      }
      await memberApi(mode === 'signup' ? '/api/auth/sign-up/email' : '/api/auth/sign-in/email', { email: fields.email, password: fields.password, ...(mode === 'signup' ? { name: fields.name } : {}), callbackURL });
      if (mode === 'signup' && config.emailVerification) setMessage('이메일에 보낸 확인 링크를 눌러 가입을 완료해 주세요.');
      await onRefresh();
    });
  }
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('token')) setMode('new-password');
    if (params.get('error')) setMessage('로그인 연결을 완료하지 못했습니다. 기존 계정이 있다면 먼저 로그인한 뒤 연결해 주세요.');
  }, []);
  async function social(provider, link = false) {
    await act(async () => {
      const data = await memberApi(link ? '/api/auth/link-social' : '/api/auth/sign-in/social', { provider, callbackURL, errorCallbackURL: callbackURL, disableRedirect: true });
      if (data.url) location.assign(data.url);
    });
  }
  return <section id="account" className="panel account-panel" aria-label="회원과 내 사이트">
    <div className="section-heading"><div><p className="eyebrow">내 가게의 개선 과정을 한곳에</p><h2>{user ? `${user.name}님의 작업 공간` : '로그인하고 검사 기록을 모아 보세요'}</h2></div>{user && <button className="button secondary small" disabled={busy} onClick={() => act(async () => { await memberApi('/api/auth/sign-out', {}); await onRefresh(); })}>로그아웃</button>}</div>
    {!sameOrigin ? <><p>회원가입과 내 사이트 관리는 가게 체크의 로그인 페이지에서 이용할 수 있어요.</p><a className="button primary" href={loginUrl}>로그인 / 회원가입 →</a></> : !user ? <>
      <p className="muted">내 사이트를 저장하고 최근 90일의 검사 기록을 확인하세요. 계정당 하루 20회, 한국 시간 자정에 초기화됩니다.</p>
      <div className="account-tabs"><button className={'button '+(mode === 'login' ? 'primary' : 'secondary')} onClick={() => { setMode('login'); setMessage(''); }}>이메일 로그인</button><button className={'button '+(mode === 'signup' ? 'primary' : 'secondary')} onClick={() => { setMode('signup'); setMessage(''); }}>이메일 회원가입</button></div>
      <form className="account-form" onSubmit={emailSubmit} key={mode}>
        {mode === 'signup' && <label>이름 또는 닉네임<input name="name" required maxLength={80} autoComplete="nickname" /></label>}
        {mode !== 'new-password' && <label>이메일<input type="email" name="email" required maxLength={254} autoComplete="email" placeholder="name@example.com" /></label>}
        {mode !== 'reset' && <label>비밀번호{mode !== 'login' && ' · 12자 이상'}<input type="password" name="password" required minLength={mode === 'login' ? 1 : 12} maxLength={128} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>}
        {mode === 'signup' && <><p className="muted">이메일·이름·암호화된 비밀번호, 연결 계정 식별 정보와 검사 기록을 회원 기능 제공을 위해 저장합니다.</p><label className="account-consent"><input type="checkbox" required />회원 정보 저장 및 아래 개인정보 안내를 확인했어요.</label></>}
        <button className="button primary" disabled={busy || !config.emailReady}>{busy ? '처리 중…' : mode === 'signup' ? '회원가입' : mode === 'reset' ? '재설정 메일 받기' : mode === 'new-password' ? '새 비밀번호 저장' : '로그인'}</button>
      </form>
      {config.emailVerification ? <button className="text-button" onClick={() => setMode('reset')}>비밀번호를 잊었나요?</button> : <p className="muted">이메일·비밀번호로 가입할 수 있습니다. 이메일 인증·비밀번호 찾기는 메일 서비스 연결 후 제공됩니다.</p>}
      <div className="social-logins">{Object.entries(providers).map(([p,label]) => <button key={p} className={'button secondary social-'+p} disabled={busy || !config.providers[p]} onClick={() => social(p)}>{label}로 시작하기{!config.providers[p] && ' · 연결 준비 중'}</button>)}</div>
    </> : <>
      <div className="account-usage"><b>오늘 {usage?.used ?? 0} / {usage?.limit ?? 20}회 사용</b><span>남은 검사 {usage?.remaining ?? '—'}회 · 한국 시간 자정 초기화</span><p>새 검사와 재검사만 차감합니다. 실패한 검사·저장된 결과 조회는 차감하지 않습니다.</p></div>
      <div className="member-grid"><section><h3>내 사이트 <small>{sites.length} / 50</small></h3><form className="account-form" onSubmit={e => { e.preventDefault(); act(async () => { await memberApi('/api/member/sites', { url: siteUrl, label: siteLabel }); setSiteUrl(''); setSiteLabel(''); await onRefresh(); }); }}><label>사이트 이름<input value={siteLabel} onChange={e=>setSiteLabel(e.target.value)} maxLength={80} placeholder="예: 우리 가게" /></label><label>사이트 주소<input value={siteUrl} onChange={e=>setSiteUrl(e.target.value)} required maxLength={2048} placeholder="https://myshop.com" /></label><button className="button secondary" disabled={busy}>내 사이트에 저장</button></form>
        {!sites.length && <p className="muted">자주 검사하는 주소를 저장해 보세요.</p>}
        <ul className="member-list">{sites.map(s => <li key={s.id}><b>{s.label}</b><span className="muted">{s.url}</span><div><button className="text-button" disabled={busy} onClick={() => onScan(s.url)}>검사하기</button><button className="text-button" disabled={busy} onClick={() => act(async () => { await memberApi('/api/member/sites?id='+encodeURIComponent(s.id), null, 'DELETE'); await onRefresh(); })}>목록에서 삭제</button></div></li>)}</ul>
      </section><section><h3>검사 이력</h3><p className="muted">최근 90일 · 기록 조회는 횟수를 쓰지 않아요.</p>{!history.length && <p>첫 검사를 완료하면 여기에 기록됩니다.</p>}<ul className="member-list">{history.map(h=><li key={h.id}><b>{h.url}</b><span className="muted">{new Date(h.created_at).toLocaleString('ko-KR')} · AI 정보 {h.aiScore ?? '—'} / 고객 정보 {h.uxScore ?? '—'}</span><div><button className="text-button" onClick={() => onReport(null, h.id)}>결과 보기</button><button className="text-button" onClick={() => act(async () => { await memberApi('/api/member/history?id='+encodeURIComponent(h.id), null, 'DELETE'); await onRefresh(); })}>기록 삭제</button></div></li>)}</ul>{more && <button className="button secondary" disabled={busy} onClick={() => act(async () => { const d = await memberApi('/api/member/history?offset='+history.length); setHistory([...history,...d.items]); setMore(d.hasMore); })}>이전 기록 더 보기</button>}</section></div>
      <details><summary>로그인 계정 연결 및 비밀번호 변경</summary><p className="muted">연결한 계정으로 로그인하면 같은 사이트와 기록을 사용할 수 있어요. 이메일이 같아도 자동으로 합치지 않습니다.</p><div className="social-logins">{Object.entries(providers).map(([p,label]) => { const linked = accounts.some(a=>a.providerId===p); return <button className="button secondary" key={p} disabled={busy || linked || !config.providers[p]} onClick={()=>social(p,true)}>{label} {linked ? '연결됨' : config.providers[p] ? '연결하기' : '연결 준비 중'}</button>; })}</div>{accounts.some(a=>a.providerId==='credential') && <form className="account-form" onSubmit={e=>{e.preventDefault(); const form=e.currentTarget, data=Object.fromEntries(new FormData(form)); act(async()=>{await memberApi('/api/auth/change-password',{...data,revokeOtherSessions:true}); form.reset(); setMessage('비밀번호를 변경했습니다. 다른 기기의 로그인은 해제됩니다.');});}}><label>현재 비밀번호<input name="currentPassword" type="password" required autoComplete="current-password" /></label><label>새 비밀번호<input name="newPassword" type="password" required minLength={12} maxLength={128} autoComplete="new-password" /></label><button className="button secondary" disabled={busy}>비밀번호 변경</button></form>}</details>
    </>}
    <p role="status" className="account-message">{message}</p>
    <details className="privacy-note"><summary>개인정보 및 기록 저장 안내</summary><p>회원 식별과 로그인에 필요한 이메일·닉네임·계정 식별자, 비밀번호 해시, 로그인 세션과 보안 목적의 접속 정보가 서버에 저장됩니다. 소셜 로그인 시 동의한 정보만 받습니다. 비밀번호 원문은 저장하지 않습니다.</p><p>내 사이트와 검사 이력은 로그인한 본인만 볼 수 있습니다. 검사 이력은 최근 90일까지 조회할 수 있으며, 삭제 버튼으로 지울 수 있습니다. 공개 사이트의 검사 결과는 기존과 같이 공용 캐시로 재사용될 수 있습니다. 사이트 주소에 비밀 토큰이나 개인정보를 넣지 마세요.</p><p>Google 로그인은 Gmail 메일함 접근 권한을 요청하지 않습니다. 이메일 주소로 가입한 경우, 인증 완료 표시는 메일 확인을 마친 경우에만 적용됩니다.</p></details>
  </section>;
}
