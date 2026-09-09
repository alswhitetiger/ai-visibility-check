import { useEffect, useState } from 'react';
import AccountPanel from './AccountPanel';
import { Onboarding } from './MemberDashboard';
import { memberApi, memberBase, memberPageUrl } from './member-api';
import './experience.css';

export default function AccountPage() {
  const [member, setMember] = useState(null), [revision, setRevision] = useState(0), [error, setError] = useState('');
  const [onboarding, setOnboarding] = useState(() => sessionStorage.getItem('shop-check:onboarding') === '1');
  const params = new URLSearchParams(location.search);
  const page = location.pathname.includes('/signup') ? 'signup' : location.pathname.includes('/login') ? 'login' : 'account';
  async function refresh() {
    const next = await memberApi('/api/member/me');
    if (next.user && !params.has('token') && (page !== 'account' || params.has('action'))) {
      const action = params.get('action');
      const destination = new URL(memberBase);
      if (['scan', 'example', 'history', 'project', 'research'].includes(action)) {
        destination.searchParams.set('action', action);
        if (action === 'scan' && params.get('url')) destination.searchParams.set('url', params.get('url'));
        if (action === 'history' && params.get('history')) destination.searchParams.set('history', params.get('history'));
      } else destination.pathname += 'account/';
      location.replace(destination.href); return;
    }
    setMember(next); setRevision(v=>v+1);
  }
  useEffect(() => { document.title = page === 'signup' ? '회원가입 · 가게 체크' : page === 'login' ? '로그인 · 가게 체크' : '내 사이트 · 가게 체크'; refresh().catch(e=>setError(e.message)); }, []);
  function openHome(action, value) {
    const destination = new URL(memberBase); destination.searchParams.set('action', action);
    destination.searchParams.set(action === 'history' ? 'history' : 'url', value);
    location.assign(destination.href);
  }
  function finishOnboarding() { sessionStorage.removeItem('shop-check:onboarding'); setOnboarding(false); }
  return <div className="app-shell account-page">
    <nav className="topbar"><a className="brand" href={memberBase}><span className="brand-mark" aria-hidden="true">✓</span>가게 체크</a><a href={memberBase}>← 첫 화면으로</a><a href={memberBase+'#how-it-works'}>Q&A</a></nav>
    <main>
      {!member && !error && <p role="status" className="notice">로그인 상태를 확인하고 있어요…</p>}
      {error && <div role="alert" className="notice"><p>{error}</p><button className="button secondary" onClick={()=>{setError('');refresh().catch(e=>setError(e.message));}}>다시 시도</button></div>}
      {member && <><AccountPanel user={member.user} usage={member.usage} initialMode={page === 'signup' ? 'signup' : 'login'} onRefresh={refresh} revision={revision} onScan={url=>openHome('scan',url)} onReport={(_data,id)=>openHome('history',id)} callbackURL={memberPageUrl('account', {action:params.get('action'),url:params.get('url'),id:params.get('history')})} />{onboarding && <Onboarding user={member.user} onFinish={finishOnboarding} onStartScan={url=>openHome('scan',url)} />}</>}
    </main>
    <footer className="site-footer"><p>가게 체크 · 내 사이트의 개선 과정을 기록하세요.</p></footer>
  </div>;
}
