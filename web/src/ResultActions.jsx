import { useState } from 'react';
export default function ResultActions({ data, apiBase }) {
  const [copied, setCopied] = useState(false);
  const [optin, setOptin] = useState(null); // null | {token, howto} | {status}
  const [busy, setBusy] = useState(false);

  const shareUrl = `${location.origin}${location.pathname}?url=${encodeURIComponent(data.url || data.host)}`;

  async function copyShare() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  async function startOptin() {
    if (!apiBase) return;
    setBusy(true);
    try {
      const r = await fetch(`${apiBase}/api/optin?url=${encodeURIComponent(data.host)}`);
      setOptin(await r.json());
    } catch {
      setOptin({ error: 'NETWORK', message: '연결하지 못했습니다.' });
    }
    setBusy(false);
  }

  async function confirmOptin() {
    setBusy(true);
    try {
      const r = await fetch(`${apiBase}/api/optin?url=${encodeURIComponent(data.host)}`, { method: 'POST' });
      const j = await r.json();
      setOptin(prev => ({ ...prev, ...j }));
    } catch {
      setOptin(prev => ({ ...prev, error: 'NETWORK', message: '연결하지 못했습니다.' }));
    }
    setBusy(false);
  }

  return (
    <section className="actions">
      <div className="action-row">
        <button className="btn" onClick={copyShare}>
          {copied ? '복사했습니다' : '결과 링크 복사'}
        </button>
        {apiBase && !optin && (
          <button className="btn ghost" onClick={startOptin} disabled={busy}>
            이 사이트를 공개 목록에 등록
          </button>
        )}
      </div>

      {optin && optin.ok && (
        <p className="notice">
          공개 목록에 등록했습니다. 소유 확인은 {optin.via === 'meta' ? '메타태그' : '파일'}로 이루어졌습니다.
        </p>
      )}

      {optin && !optin.ok && optin.token && (
        <div className="optin-box">
          <p>
            <b>{data.host}</b> 를 공개 목록에 올리려면 이 사이트를 운영한다는 것을 확인해야 합니다.
            아래 둘 중 <b>하나</b>만 하시면 됩니다.
          </p>
          <ol>
            <li>
              첫 화면 <code>&lt;head&gt;</code> 안에 넣기
              <pre>{optin.howto?.meta}</pre>
            </li>
            <li>
              또는 <code>/.well-known/ai-visibility-check.txt</code> 파일에 이 값 넣기
              <pre>{optin.token}</pre>
            </li>
          </ol>
          <button className="btn" onClick={confirmOptin} disabled={busy}>
            {busy ? '확인 중…' : '등록했습니다. 확인해 주세요'}
          </button>
          {optin.message && <p className="hint">{optin.message}</p>}
        </div>
      )}

      {optin && optin.error === 'SCAN_FIRST' && <p className="hint">{optin.message}</p>}
    </section>
  );
}

