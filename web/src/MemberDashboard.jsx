import { useEffect, useState } from 'react';
import { memberApi } from './member-api';

function scoreLabel(value) {
  if (value == null) return '미확인';
  if (value >= 80) return '좋아요';
  if (value >= 50) return '보완 중';
  return '먼저 고쳐요';
}

export function ScoreRing({ value, label, tone = 'blue' }) {
  const score = Number.isFinite(Number(value)) ? Math.max(0, Math.min(100, Number(value))) : null;
  return <div className={'score-ring score-ring-'+tone} style={{ '--score': `${score ?? 0}%` }} aria-label={`${label} ${score == null ? '미확인' : score+'점'}`}>
    <div className="score-ring-inner"><strong>{score == null ? '—' : score}</strong><span>{label}</span></div>
  </div>;
}

export function ScoreSummary({ history }) {
  const latest = history?.[0];
  if (!latest) return <div className="dashboard-empty"><b>첫 검사로 내 기준을 만들어 보세요</b><span>검사 결과가 쌓이면 점수 변화와 개선 흐름을 보여드려요.</span></div>;
  return <div className="score-summary">
    <div className="score-summary-copy"><p className="eyebrow">최근 검사</p><h3>지금 고칠 부분을 한눈에 확인하세요</h3><p className="muted">{new Date(latest.created_at).toLocaleDateString('ko-KR')} · {latest.url}</p><span className="score-status">AI 정보 {scoreLabel(latest.aiScore)} · 고객 정보 {scoreLabel(latest.uxScore)}</span></div>
    <div className="score-rings"><ScoreRing value={latest.aiScore} label="AI 정보" tone="blue"/><ScoreRing value={latest.uxScore} label="고객 정보" tone="green"/></div>
  </div>;
}

export function Onboarding({ user, onFinish, onStartScan }) {
  const [url, setUrl] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  async function start() {
    setBusy(true); setMessage('');
    try {
      if (url.trim()) await memberApi('/api/member/sites', { url: url.trim(), label: new URL(/^https?:\/\//i.test(url.trim()) ? url.trim() : 'https://' + url.trim()).hostname });
      onFinish();
      if (url.trim()) onStartScan(url.trim());
    } catch (e) { setMessage(e.message); } finally { setBusy(false); }
  }
  return <div className="onboarding-backdrop"><section className="onboarding-card" role="dialog" aria-labelledby="onboarding-title" aria-modal="true">
    <p className="eyebrow">가입을 환영해요</p><h2 id="onboarding-title">{user?.name || '가게 운영자'}님의 첫 점검을 시작해 볼까요?</h2><p className="muted">3단계로 가게의 개선 기준을 만들 수 있어요.</p>
    <ol className="onboarding-steps"><li><b>사이트 등록</b><span>자주 확인할 주소를 저장해요.</span></li><li><b>첫 검사</b><span>AI와 고객이 읽을 정보를 확인해요.</span></li><li><b>개선 확인</b><span>다음 검사에서 달라진 점을 비교해요.</span></li></ol>
    <label className="onboarding-url">사이트 주소 <span className="muted">선택</span><input value={url} onChange={e=>setUrl(e.target.value)} placeholder="예: https://myshop.com" inputMode="url" /></label>
    {message && <p role="alert" className="account-message">{message}</p>}<div className="onboarding-actions"><button className="button secondary" onClick={onFinish} disabled={busy}>나중에</button><button className="button primary" onClick={start} disabled={busy}>{busy ? '준비 중…' : url.trim() ? '등록하고 첫 검사 →' : '대시보드 열기 →'}</button></div>
  </section></div>;
}

export function HistorySparkline({ history }) {
  const points = (history || []).slice(0, 7).reverse().map((h, i, all) => {
    const value = h.aiScore == null ? null : Number(h.aiScore);
    return value == null ? null : `${i * (100 / Math.max(1, all.length - 1))},${100 - value}`;
  }).filter(Boolean).join(' ');
  if (!points) return null;
  return <div className="history-chart"><div className="history-chart-heading"><b>AI 정보 점수 변화</b><span className="muted">최근 {Math.min(history.length, 7)}회</span></div><svg viewBox="0 0 100 100" role="img" aria-label="최근 AI 정보 점수 변화 그래프" preserveAspectRatio="none"><polyline points={points} fill="none" stroke="currentColor" strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round"/></svg></div>;
}
