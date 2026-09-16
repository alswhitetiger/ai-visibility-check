import { useEffect, useRef, useState } from 'react';
import { memberApi, sameOrigin, loginUrl, memberBase, markSessionActive, clearSessionActive } from './member-api';
import { HistoryComparison, HistorySparkline, ScoreSummary } from './MemberDashboard';
import PrivacyConsent from './PrivacyConsent';
import { copyText, useAction } from './ui-utils';
import './account.css';

const providers = { google: '구글', kakao: '카카오', naver: '네이버' };
export default function AccountPanel({ user, usage, onRefresh, onScan, onReport, revision, initialMode = 'login', callbackURL = location.origin + '/ai-visibility-check/account/' }) {
  const [config, setConfig] = useState({ providers: {} });
  const [mode, setMode] = useState(initialMode);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [sites, setSites] = useState([]), [history, setHistory] = useState([]), [more, setMore] = useState(false), [accounts, setAccounts] = useState([]);
  const [siteUrl, setSiteUrl] = useState(''), [siteLabel, setSiteLabel] = useState('');
  const [deleteText, setDeleteText] = useState(''), [deletePassword, setDeletePassword] = useState('');
  const [compareBase, setCompareBase] = useState(null), [comparison, setComparison] = useState(null);
  const [compareShare, setCompareShare] = useState({ busy: false, link: '', message: '' });
  const messageRef = useRef(null);
  useEffect(() => { setCompareBase(null); setComparison(null); setCompareShare({ busy: false, link: '', message: '' }); }, [user?.id]);
  useEffect(() => { memberApi('/api/member/config').then(setConfig).catch(() => setMessage('회원 서비스를 연결하지 못했습니다. 잠시 후 새로고침해 주세요.')); }, []);
  useEffect(() => {
    let active = true;
    if (!user) { setSites([]); setHistory([]); setAccounts([]); return; }
    Promise.all([memberApi('/api/member/sites'), memberApi('/api/member/history'), memberApi('/api/auth/list-accounts')]).then(([s,h,a]) => {
      if (active) { setSites(s.items); setHistory(h.items); setMore(h.hasMore); setAccounts(a); }
    }).catch(e => { if (active) setMessage(e.message); });
    return () => { active = false; };
  }, [user?.id, revision]);
  const act = useAction(setBusy, setMessage);
  async function emailSubmit(e) {
    e.preventDefault(); const fields = Object.fromEntries(new FormData(e.currentTarget));
    await act(async () => {
      if (mode === 'verify') {
        await memberApi('/api/auth/email-otp/verify-email', { email: fields.email, otp: fields.otp.replace(/\D/g, '') });
        markSessionActive(); sessionStorage.setItem('shop-check:onboarding', '1'); setMessage('이메일 인증과 회원가입을 완료했습니다.'); await onRefresh(); return;
      }
      if (mode === 'reset') {
        await memberApi('/api/auth/request-password-reset', { email: fields.email, redirectTo: location.origin + '/ai-visibility-check/login/' });
        setMessage('가입된 이메일이면 비밀번호 재설정 안내를 보내드립니다.'); return;
      }
      if (mode === 'find-id') {
        await memberApi('/api/auth/find-id', { email: fields.email });
        setMessage('입력한 주소가 가입 이메일이면 아이디 확인 메일을 보내드립니다.'); return;
      }
      if (mode === 'new-password') {
        await memberApi('/api/auth/reset-password', { newPassword: fields.password, token: new URLSearchParams(location.search).get('token') });
        window.history.replaceState({}, '', location.pathname + '#account'); setMode('login'); setMessage('비밀번호를 변경했어요. 다시 로그인해 주세요.'); return;
      }
      try { await memberApi(mode === 'signup' ? '/api/auth/sign-up/email' : '/api/auth/sign-in/email', { email: fields.email, password: fields.password, rememberMe: false, ...(mode === 'signup' ? { name: fields.name } : {}), callbackURL }); }
      catch (error) {
        if (error.code === 'EMAIL_ALREADY_REGISTERED') { setMode('login'); setMessage('이미 가입된 이메일입니다. 로그인해 주세요.'); return; }
        if (error.code !== 'EMAIL_NOT_VERIFIED') throw error;
        await memberApi('/api/auth/email-otp/send-verification-otp', { email: fields.email, type: 'email-verification' });
        setVerificationEmail(fields.email); setMode('verify'); setMessage('새 인증번호를 보냈습니다. 이메일을 확인해 주세요.'); return;
      }
      if (mode === 'signup') {
        await memberApi('/api/auth/email-otp/send-verification-otp', { email: fields.email, type: 'email-verification' });
        setVerificationEmail(fields.email); setMode('verify'); setMessage('인증번호를 보냈습니다. 이메일을 확인해 주세요.'); return;
      }
      markSessionActive();
      await onRefresh();
    });
  }
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('token')) setMode('new-password');
    if (params.get('error')) setMessage('로그인 연결을 완료하지 못했습니다. 기존 계정이 있다면 먼저 로그인한 뒤 연결해 주세요.');
  }, []);
  useEffect(() => {
    if (!message) return;
    messageRef.current?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
  }, [message]);
  async function social(provider, link = false) {
    await act(async () => {
      markSessionActive();
      const data = await memberApi(link ? '/api/auth/link-social' : '/api/auth/sign-in/social', { provider, callbackURL, errorCallbackURL: callbackURL, disableRedirect: true });
      if (data.url) location.assign(data.url);
    });
  }
  async function deleteAccount(e) {
    e.preventDefault();
    if (deleteText !== '탈퇴') { setMessage('확인란에 탈퇴라고 입력해 주세요.'); return; }
    await act(async () => {
      const credential = accounts.some(a => a.providerId === 'credential');
      await memberApi('/api/auth/delete-user', credential ? { password: deletePassword } : {});
      clearSessionActive(); sessionStorage.removeItem('shop-check:onboarding');
      location.assign(memberBase + '?accountDeleted=1');
    });
  }
  function compareHistory(item) {
    setCompareShare({ busy: false, link: '', message: '' });
    if (!compareBase) { setCompareBase(item); setComparison(null); return; }
    if (compareBase.id === item.id) { setCompareBase(null); setComparison(null); return; }
    if (compareBase.url !== item.url) { setCompareBase(item); setComparison(null); setMessage('같은 주소의 검사끼리 비교할 수 있어 새 기준을 선택했습니다.'); return; }
    act(async () => {
      const reports = await Promise.all([compareBase.id,item.id].map(id=>memberApi('/api/member/history?id='+encodeURIComponent(id))));
      reports.sort((a,b)=>(a.scannedAt || 0)-(b.scannedAt || 0)); setComparison({ before: reports[0], after: reports[1], ids: [compareBase.id, item.id] });
    });
  }
  async function shareComparison() {
    if (!comparison?.ids) return;
    setCompareShare({ busy: true, link: '', message: '' });
    try {
      const created = await memberApi('/api/member/share', { result: { comparison: comparison.ids } });
      const link = `${memberBase}?share=${encodeURIComponent(created.token)}`;
      try { await copyText(link); setCompareShare({ busy: false, link, message: '30일 동안 열 수 있는 비교 링크를 복사했습니다.' }); }
      catch { setCompareShare({ busy: false, link, message: '링크를 만들었습니다. 아래 주소를 선택해 복사해 주세요.' }); }
    } catch (error) { setCompareShare({ busy: false, link: '', message: error.message }); }
  }
  return <section id="account" className="panel account-panel" aria-label="회원과 내 사이트">
    <div className="section-heading"><div><p className="eyebrow">내 가게의 개선 과정을 한곳에</p><h2>{user ? `${user.name}님의 작업 공간` : '로그인하고 검사 기록을 모아 보세요'}</h2></div>{user && <button className="button secondary small" disabled={busy} onClick={() => act(async () => { await memberApi('/api/auth/sign-out', {}); clearSessionActive(); await onRefresh(); })}>로그아웃</button>}</div>
    <p ref={messageRef} role="status" aria-live="polite" className="account-message">{message}</p>
    {!sameOrigin ? <><p>회원가입과 내 사이트 관리는 가게 체크의 로그인 페이지에서 이용할 수 있어요.</p><a className="button primary" href={loginUrl}>로그인 / 회원가입 →</a></> : !user ? <>
      <p className="muted">내 사이트를 저장하고 최근 90일의 검사 기록을 확인하세요. 계정당 하루 20회, 한국 시간 자정에 초기화됩니다.</p>
      <div className="account-tabs"><button className={'button '+(mode === 'login' ? 'primary' : 'secondary')} onClick={() => { setMode('login'); setMessage(''); }}>이메일 로그인</button><button className={'button '+(['signup','verify'].includes(mode) ? 'primary' : 'secondary')} onClick={() => { setMode('signup'); setMessage(''); }}>이메일 회원가입</button></div>
      {mode === 'verify' ? <form className="account-form otp-form" onSubmit={emailSubmit}>
        <div className="otp-heading"><b>이메일 인증</b><span>받은 편지함과 스팸함을 확인해 주세요.</span></div>
        <label>이메일<input type="email" name="email" required maxLength={254} autoComplete="email" value={verificationEmail} onChange={e=>setVerificationEmail(e.target.value)} /></label>
        <label>6자리 인증번호<input className="otp-input" name="otp" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="000000" /></label>
        <p className="muted">번호는 발급 후 10분 동안 유효하며 5회 잘못 입력하면 새 번호를 받아야 합니다.</p>
        <button className="button primary" disabled={busy}>인증하고 로그인</button>
        <button type="button" className="text-button" disabled={busy || !verificationEmail} onClick={() => act(() => memberApi('/api/auth/email-otp/send-verification-otp', { email: verificationEmail, type: 'email-verification' }), '새 인증번호를 보냈습니다.')}>인증번호 다시 받기</button>
      </form> : <form className="account-form" onSubmit={emailSubmit} key={mode}>
        {mode === 'signup' && <label>이름 또는 닉네임<input name="name" required maxLength={80} autoComplete="nickname" /></label>}
        {mode === 'find-id' && <p className="muted">이메일 회원의 아이디는 가입할 때 인증한 이메일 주소입니다. 기억나는 주소를 입력하면 가입된 주소에만 확인 메일을 보냅니다. 소셜 회원은 구글·카카오·네이버 로그인 버튼을 이용해 주세요.</p>}
        {mode !== 'new-password' && <label>이메일<input type="email" name="email" required maxLength={254} autoComplete="email" placeholder="name@example.com" /></label>}
        {!['reset','find-id'].includes(mode) && <label>비밀번호{mode !== 'login' && ' · 12자 이상'}<input type="password" name="password" required minLength={mode === 'login' ? 1 : 12} maxLength={128} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>}
        {mode === 'signup' && <><p className="muted">인증 메일의 발신자 이름은 ‘가게체크’로 표시됩니다. 받은편지함과 스팸함을 확인해 주세요.</p><PrivacyConsent checkbox /></>}
        <button className="button primary" disabled={busy || !config.emailReady || (mode === 'signup' && !config.emailVerification)}>{busy ? '처리 중…' : mode === 'signup' ? '인증번호 받고 가입하기' : mode === 'find-id' ? '아이디 확인 메일 받기' : mode === 'reset' ? '재설정 메일 받기' : mode === 'new-password' ? '새 비밀번호 저장' : '로그인'}</button>
      </form>
      }
      {config.emailVerification ? <div className="account-help-buttons">{mode !== 'verify' && <button className="text-button" onClick={() => setMode('verify')}>이미 인증번호를 받았나요?</button>}<button className="text-button" onClick={() => setMode('find-id')}>아이디를 잊었나요?</button><button className="text-button" onClick={() => setMode('reset')}>비밀번호를 잊었나요?</button></div> : <p className="email-unavailable">이메일 회원가입은 인증 메일 서비스 연결 후 사용할 수 있습니다. 아래 소셜 로그인은 계속 이용할 수 있습니다.</p>}
      <div className="social-logins">{Object.entries(providers).map(([p,label]) => <button key={p} className={'button secondary social-'+p} disabled={busy || !config.providers[p]} onClick={() => social(p)}>{label} 로그인{!config.providers[p] && ' · 연결 준비 중'}</button>)}</div>
    </> : <>
      <section className="dashboard-hero"><div><p className="eyebrow">내 대시보드</p><h2>오늘의 개선 상황</h2><p className="muted">사이트를 등록하고 검사 결과의 변화를 이어서 확인하세요.</p></div><div className="dashboard-quota"><strong>{usage?.remaining ?? '—'}</strong><span>오늘 남은 검사</span><small>{usage?.used ?? 0} / {usage?.limit ?? 20}회 사용</small></div></section>
      <ScoreSummary history={history}/><HistorySparkline history={history}/><HistoryComparison value={comparison} onShare={shareComparison} shareBusy={compareShare.busy} shareLink={compareShare.link} shareMessage={compareShare.message} onClear={()=>{setCompareBase(null);setComparison(null);setCompareShare({ busy: false, link: '', message: '' });}}/>
      <div className="account-usage"><b>검사 이용량</b><span>한국 시간 자정에 초기화됩니다.</span><p>새 검사와 재검사만 차감합니다. 실패한 검사·저장된 결과 조회는 차감하지 않습니다.</p></div>
      <div className="member-grid"><section><h3>내 사이트 <small>{sites.length} / 50</small></h3><form className="account-form" onSubmit={e => { e.preventDefault(); act(async () => { await memberApi('/api/member/sites', { url: siteUrl, label: siteLabel }); setSiteUrl(''); setSiteLabel(''); await onRefresh(); }); }}><label>사이트 이름<input value={siteLabel} onChange={e=>setSiteLabel(e.target.value)} maxLength={80} placeholder="예: 우리 가게" /></label><label>사이트 주소<input value={siteUrl} onChange={e=>setSiteUrl(e.target.value)} required maxLength={2048} placeholder="https://myshop.com" /></label><button className="button secondary" disabled={busy}>내 사이트에 저장</button></form>
        {!sites.length && <p className="muted">자주 검사하는 주소를 저장해 보세요.</p>}
        <ul className="member-list">{sites.map(s => <li key={s.id}><b>{s.label}</b><span className="muted">{s.url}</span><div><button className="text-button" disabled={busy} onClick={() => onScan(s.url)}>검사하기</button><button className="text-button" disabled={busy} onClick={() => act(async () => { await memberApi('/api/member/sites?id='+encodeURIComponent(s.id), null, 'DELETE'); await onRefresh(); })}>목록에서 삭제</button></div></li>)}</ul>
      </section><section><h3>검사 이력</h3><p className="muted">최근 90일 · 기록 조회는 횟수를 쓰지 않아요.{compareBase && ` ${new Date(compareBase.created_at).toLocaleDateString('ko-KR')} 결과와 비교할 다른 검사를 선택하세요.`}</p>{!history.length && <p>첫 검사를 완료하면 여기에 기록됩니다.</p>}<ul className="member-list">{history.map(h=><li key={h.id}><b>{h.url}</b><span className="muted">{new Date(h.created_at).toLocaleString('ko-KR')} · AI 정보 {h.aiScore ?? '—'} / 고객 정보 {h.uxScore ?? '—'}</span><div><button className="text-button" onClick={() => onReport(null, h.id)}>결과 보기</button><button className="text-button" disabled={busy} onClick={()=>compareHistory(h)}>{compareBase?.id===h.id?'기준 선택됨':'전후 비교'}</button><button className="text-button" onClick={() => act(async () => { await memberApi('/api/member/history?id='+encodeURIComponent(h.id), null, 'DELETE'); await onRefresh(); })}>기록 삭제</button></div></li>)}</ul>{more && <button className="button secondary" disabled={busy} onClick={() => act(async () => { const d = await memberApi('/api/member/history?offset='+history.length); setHistory([...history,...d.items]); setMore(d.hasMore); })}>이전 기록 더 보기</button>}</section></div>
      <details><summary>로그인 계정 연결 및 비밀번호 변경</summary><p className="muted">연결한 계정으로 로그인하면 같은 사이트와 기록을 사용할 수 있어요. 이메일이 같아도 자동으로 합치지 않습니다.</p><div className="social-logins">{Object.entries(providers).map(([p,label]) => { const linked = accounts.some(a=>a.providerId===p); return <button className="button secondary" key={p} disabled={busy || linked || !config.providers[p]} onClick={()=>social(p,true)}>{label} {linked ? '연결됨' : config.providers[p] ? '연결하기' : '연결 준비 중'}</button>; })}</div>{accounts.some(a=>a.providerId==='credential') && <form className="account-form" onSubmit={e=>{e.preventDefault(); const form=e.currentTarget, data=Object.fromEntries(new FormData(form)); act(async()=>{await memberApi('/api/auth/change-password',{...data,revokeOtherSessions:true}); form.reset(); setMessage('비밀번호를 변경했습니다. 다른 기기의 로그인은 해제됩니다.');});}}><label>현재 비밀번호<input name="currentPassword" type="password" required autoComplete="current-password" /></label><label>새 비밀번호<input name="newPassword" type="password" required minLength={12} maxLength={128} autoComplete="new-password" /></label><button className="button secondary" disabled={busy}>비밀번호 변경</button></form>}</details>
      <details className="danger-zone"><summary>회원 탈퇴</summary><p>탈퇴하면 계정, 연결된 로그인, 내 사이트, 검사 이력, 이용 기록, 개선 체크리스트와 공유 보고서가 영구 삭제되며 복구할 수 없습니다.</p><form className="account-form" onSubmit={deleteAccount}><label>확인을 위해 ‘탈퇴’ 입력<input value={deleteText} onChange={e=>setDeleteText(e.target.value)} required autoComplete="off" /></label>{accounts.some(a=>a.providerId==='credential') && <label>현재 비밀번호<input type="password" value={deletePassword} onChange={e=>setDeletePassword(e.target.value)} required autoComplete="current-password" /></label>}<button className="button danger" disabled={busy || deleteText !== '탈퇴' || (accounts.some(a=>a.providerId==='credential') && !deletePassword)}>회원 탈퇴하고 데이터 삭제</button></form></details>
    </>}
    {mode !== 'signup' && <details className="privacy-note"><summary>개인정보 수집·이용 안내</summary><PrivacyConsent /></details>}
  </section>;
}
