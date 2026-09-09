import { useEffect, useState } from 'react';
import { memberApi } from './member-api';
import { guides, titleOf } from './guides';
export default function FixChecklist({ url, fixes, cloud }) {
  const [done, setDone] = useState({}), [busy, setBusy] = useState(false), [ready, setReady] = useState(!cloud), [message, setMessage] = useState('');
  async function load() {
    setBusy(true); setMessage('');
    try { const data = await memberApi('/api/member/checklist?url=' + encodeURIComponent(url)); setDone(data.items); setReady(true); }
    catch { setReady(false); setMessage('체크리스트를 불러오지 못했습니다. 다시 불러와 주세요.'); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (!cloud) return;
    let alive = true;
    setReady(false); setBusy(true);
    memberApi('/api/member/checklist?url=' + encodeURIComponent(url)).then(data => { if (alive) { setDone(data.items); setReady(true); } }).catch(() => { if (alive) setMessage('체크리스트를 불러오지 못했습니다. 다시 불러와 주세요.'); }).finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [url, cloud]);
  async function toggle(id) {
    if (busy || !ready) return;
    if (!cloud) { setDone(old => ({ ...old, [id]: !old[id] })); return; }
    setBusy(true); setMessage('저장 중…');
    try { const data = await memberApi('/api/member/checklist', { url, id, done: !done[id] }); setDone(data.items); setMessage('계정에 저장했습니다.'); }
    catch { setMessage('저장하지 못했습니다. 완료 상태는 변경되지 않았습니다. 다시 선택해 주세요.'); }
    finally { setBusy(false); }
  }
  if (!fixes.length) return null;
  return <section className="panel fix-checklist"><div className="checklist-heading"><div><p className="eyebrow">개선 체크리스트</p><h3>고친 항목을 표시해 두세요</h3></div><span>{fixes.filter(c => done[c.id]).length} / {fixes.length}</span></div>
    <p className="muted">{cloud ? '계정에 저장되어 다른 기기에서도 이어서 볼 수 있어요. 최신 상태는 다시 불러오기로 확인하세요.' : '예시·공유 화면의 체크는 체험용이며 계정에 저장하지 않습니다.'} 체크 표시는 운영자가 기록한 상태입니다. 실제 반영 여부는 재검사로 확인하세요.</p>
    {cloud && <button className="text-button" onClick={load} disabled={busy}>다시 불러오기</button>}
    <ul>{fixes.map(c => <li key={c.id}><label><input type="checkbox" disabled={busy || !ready} checked={!!done[c.id]} onChange={() => toggle(c.id)} /><span><b className={done[c.id] ? 'is-done' : ''}>{titleOf(c)}</b><small>{guides[c.id]?.action || c.why}</small></span></label></li>)}</ul><p role="status">{message}</p>
  </section>;
}
