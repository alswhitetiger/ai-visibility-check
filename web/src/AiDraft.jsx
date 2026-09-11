import { useState } from 'react';
import { API, sameOrigin } from './member-api';
import { copyText } from './ui-utils';

export default function AiDraft({ data }) {
  const [draft, setDraft] = useState(null);
  const [selected, setSelected] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function generate() {
    setBusy(true); setMessage('');
    try {
      const response = await fetch(API + '/api/draft?url=' + encodeURIComponent(data.url), { method: 'POST', credentials: sameOrigin ? 'same-origin' : 'omit' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '초안을 받지 못했습니다.');
      setDraft(result); setSelected(result.options[0]); setConfirmed(false);
    } catch (e) { setMessage(e.message); }
    finally { setBusy(false); }
  }
  async function copy() {
    try { await copyText(selected.title + '\n\n' + selected.description); setMessage('제목과 소개를 복사했습니다. 사이트 관리자에서 적용해 주세요.'); }
    catch { setMessage('자동 복사가 실패했습니다. 입력란에서 직접 복사해 주세요.'); }
  }
  return <section className="panel"><p className="eyebrow">페이지 정보 → AI 초안 → 직접 확인</p><h2>AI와 소개 문구 다듬기</h2>
    <p>검사한 제목·소개·본문 일부를 AI에 보내 초안 3개를 만듭니다. 고객 질문 검사와 합쳐 하루 5회이며 같은 검사의 초안은 재사용합니다.</p>
    <button className="button secondary" disabled={busy} onClick={generate}>{busy ? '초안 작성 중…' : draft ? '저장된 초안 다시 보기' : 'AI 수정안 3개 만들기'}</button>
    {draft && <><p className="muted">{draft.provider} / {draft.model} · {draft.cached ? '저장된 초안' : '생성한 초안'} · AI가 작성한 제안이므로 사실과 표현을 직접 확인하세요.</p>
      <div className="copy-row">{draft.options.map((option, i) => <button key={i} className="button secondary small" onClick={() => { setSelected({ ...option }); setConfirmed(false); setMessage(''); }}>초안 {i + 1}</button>)}</div>
      <div className="score-grid"><section><h3>현재 페이지</h3><b>{data.observed?.title || '제목 없음'}</b><p>{data.observed?.description || '소개 없음'}</p></section>
      <section><h3>수정안 미리보기</h3><label>제목<input maxLength={120} value={selected.title} onChange={e => { setSelected({ ...selected, title: e.target.value }); setConfirmed(false); }} /></label><label>소개<textarea rows={5} maxLength={600} value={selected.description} onChange={e => { setSelected({ ...selected, description: e.target.value }); setConfirmed(false); }} /></label><p>사이트에 적용되기 전의 문구 비교이며, 점수나 검색 결과 변화 예측은 아닙니다.</p></section></div>
      <details><summary>AI가 인용한 페이지 자료</summary>{draft.facts.filter(f => selected.sources.includes(f.id)).map(f => <p key={f.id}><b>{f.id}</b>: {f.text}</p>)}<p>출처 연결은 AI의 선택이며 내용의 정확성을 자동 보증하지 않습니다.</p></details>
      <label><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />실제 가게 정보와 일치하는지 확인했습니다.</label>
      <button className="button primary" disabled={!confirmed || !selected.title.trim() || !selected.description.trim()} onClick={copy}>확인한 문구 복사</button></>}
    {message && <p role="status">{message}</p>}
  </section>;
}
