import { useState } from 'react';
import { memberApi } from './member-api';

function urlsOf(text, current) {
  const values = text.split(/\r?\n/).map(value=>value.trim()).filter(Boolean).map(value=>new URL(/^https?:\/\//i.test(value) ? value : 'https://'+value));
  const unique = [...new Map(values.map(url=>[url.href,url])).values()];
  if (unique.length < 2 || unique.length > 5) throw new Error('같은 쇼핑몰의 핵심 페이지 주소를 2~5개 입력해 주세요.');
  const host = new URL(current).hostname.replace(/^www\./,'');
  if (unique.some(url=>url.hostname.replace(/^www\./,'') !== host)) throw new Error('한 쇼핑몰에 속한 페이지 주소만 함께 검사할 수 있습니다.');
  return unique.map(url=>url.href);
}

export default function SiteBundleAudit({ data }) {
  const [text, setText] = useState(data.url+'\n'), [items, setItems] = useState([]), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(''); setItems([]);
    try {
      const urls = urlsOf(text, data.url), next = [];
      for (const url of urls) {
        try { next.push(url === data.url ? data : await memberApi('/api/scan?url='+encodeURIComponent(url), {})); }
        catch (failure) { next.push({ url, error: failure.message }); }
        setItems([...next]);
      }
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  const origin = new URL(data.url).origin;
  return <section className="panel bundle-audit"><p className="eyebrow">한 페이지에서 쇼핑몰 전체 흐름으로</p><h2>핵심 페이지를 묶어서 확인하세요</h2><p>메인·상품·배송·교환/환불·FAQ 주소를 한 줄에 하나씩 입력하면 페이지별 점수와 빠진 정보를 함께 보여줍니다.</p>
    <form onSubmit={submit}><label>같은 쇼핑몰의 페이지 주소 2~5개<textarea required rows={5} value={text} onChange={event=>setText(event.target.value)} placeholder={`${origin}/\n${origin}/product/example`}/></label><button className="button secondary" disabled={busy}>{busy ? `검사 중 · ${items.length}개 완료` : '핵심 페이지 묶음 검사'}</button></form>
    <p className="muted">저장된 결과는 횟수를 쓰지 않으며, 새로 검사하는 페이지마다 회원 검사 횟수 1회를 사용합니다.</p>{error && <p role="alert" className="account-message">{error}</p>}
    {items.length > 0 && <div className="bundle-results">{items.map(item=><article key={item.url}><b>{new URL(item.url).pathname || '/'}</b>{item.error ? <p className="bad">{item.error}</p> : <><span>AI 정보 {item.aiScore ?? '—'} · 고객 정보 {item.uxScore ?? '—'}</span><p>{(item.checks || []).filter(check=>check.pass===false).slice(0,3).map(check=>check.label).join(' · ') || '기본 점검 항목을 통과했습니다.'}</p></>}</article>)}</div>}
  </section>;
}
