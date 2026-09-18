import { useState } from 'react';
import { memberApi } from './member-api';

const fields = [
  ['offering', '무엇을 판매하거나 제공하나요?'],
  ['details', '상품·서비스의 핵심 특징이나 이용 조건은 무엇인가요?'],
  ['cost', '가격과 추가 비용은 어떻게 되나요?'],
  ['delivery', '배송 또는 서비스 제공은 어떻게 진행되나요?'],
  ['support', '교환·환불과 문의는 어떻게 처리하나요?'],
];

function faqJsonLd(faq) {
  return JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(item => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })) }, null, 2);
}

export default function OperatorInterview({ data }) {
  const [answers, setAnswers] = useState({}), [result, setResult] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      setResult(await memberApi('/api/interview', { url: data.url, answers: fields.map(([id]) => ({ id, answer: answers[id] || '' })) }));
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  function updateFaq(index, key, value) { setResult({ ...result, faq: result.faq.map((item, i) => i === index ? { ...item, [key]: value } : item) }); }
  return <section className="panel operator-interview"><p className="eyebrow">운영자 답변 → 실제 적용 초안</p><h2>정보가 부족한 부분을 직접 채워 보세요</h2>
    <p>페이지에서 확인하지 못한 내용을 운영자에게 묻고, 답변을 바탕으로 소개 문구와 FAQ 초안을 만듭니다. 생성된 내용은 직접 확인한 뒤 게시하세요.</p><p className="muted">입력한 답변과 생성 초안은 공용 검사 캐시나 계정 기록에 저장하지 않습니다.</p>
    {!result ? <form className="interview-form" onSubmit={submit}>{fields.map(([id, question]) => <label key={id}>{question}<textarea required maxLength={800} rows={3} value={answers[id] || ''} onChange={e => setAnswers({ ...answers, [id]: e.target.value })} placeholder="실제 운영 기준으로 답해 주세요." /></label>)}<button className="button primary" disabled={busy}>{busy ? '초안 만드는 중…' : '소개·FAQ 초안 만들기'}</button></form> : <div className="interview-result"><p className="muted">{result.provider} / {result.model} · 운영자가 입력한 답변 기반 초안</p><label>소개 문구<textarea rows={6} value={result.about} onChange={e => setResult({ ...result, about: e.target.value })} /></label><h3>FAQ 초안</h3>{result.faq.map((item, i) => <article className="fix-card" key={i}><label>질문<input value={item.question} onChange={e => updateFaq(i, 'question', e.target.value)} /></label><label>답변<textarea rows={4} value={item.answer} onChange={e => updateFaq(i, 'answer', e.target.value)} /></label></article>)}<p className="muted">FAQ 구조화 데이터는 질문·답변이 실제 정책과 일치하는지 확인한 뒤 사이트에 추가하세요.</p><pre>{faqJsonLd(result.faq)}</pre><button className="button secondary" onClick={() => { setResult(null); setError(''); }}>다시 답변하기</button></div>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
