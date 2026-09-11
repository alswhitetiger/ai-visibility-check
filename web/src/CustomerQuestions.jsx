import { useState } from 'react';
import { API, sameOrigin } from './member-api';

const labels = { answered: '답변 근거 있음', partial: '일부 정보만 확인', unknown: '자료에서 확인 못함' };
export default function CustomerQuestions({ data }) {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function check() {
    setBusy(true); setError('');
    try {
      const response = await fetch(API + '/api/questions?url=' + encodeURIComponent(data.url), { method: 'POST', credentials: sameOrigin ? 'same-origin' : 'omit' });
      const value = await response.json();
      if (!response.ok) throw new Error(value.message || '질문 검사를 완료하지 못했습니다.');
      setResult(value);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <section className="panel"><p className="eyebrow">고객의 질문으로 살펴보기</p><h2>구매 전에 궁금한 정보, 찾을 수 있나요?</h2>
    <p>상품·서비스, 사양·조건, 비용, 배송·제공, 교환·문의에 대한 질문 5개를 AI가 살펴봅니다. 검사에서 수집한 제목·소개·본문 일부만 전송합니다.</p>
    <p className="muted">수집한 글 일부에 대한 점검입니다. 여기서 확인하지 못해도 다른 페이지나 본문 뒷부분에 정보가 있을 수 있습니다. AI 초안과 합쳐 하루 5회이며 저장된 결과는 재사용합니다.</p>
    <button className="button secondary" disabled={busy} onClick={check}>{busy ? '질문별 근거 확인 중…' : result ? '저장된 질문 검사 보기' : '고객 질문 5개로 검사하기'}</button>
    {error && <p role="alert">{error}</p>}
    {result && <div aria-live="polite"><p>{result.provider} / {result.model} · {result.cached ? '저장된 결과' : '이번 분석'} · {new Date(result.generatedAt).toLocaleString('ko-KR')}</p>
      <p>근거 있음 {result.answers.filter(a => a.status === 'answered').length}개 · 일부 확인 {result.answers.filter(a => a.status === 'partial').length}개 · 미확인 {result.answers.filter(a => a.status === 'unknown').length}개</p>
      {result.answers.map(item => <article className="fix-card customer-answer" key={item.id}><div><h3>{item.question}</h3><b>{labels[item.status]}</b><p>{item.answer}</p>
        {!!item.evidence.length && <details><summary>페이지에서 찾은 근거</summary>{item.evidence.map((e, i) => <blockquote key={i}>{e.quote}<small> ({e.source})</small></blockquote>)}</details>}
        {item.suggestion && <p><b>확인 후 보완할 내용:</b> {item.suggestion}</p>}</div></article>)}
      <p className="muted">인용문이 수집 자료에 있는지 검증했습니다. 질문에 충분히 답하는지와 내용의 사실 여부는 운영자가 확인해 주세요. 기존 점수에는 반영하지 않습니다.</p></div>}
  </section>;
}
