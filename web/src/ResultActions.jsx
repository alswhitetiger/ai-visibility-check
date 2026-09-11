import { useState } from 'react';
import { memberApi, sameOrigin } from './member-api';
import { copyText, useAction } from './ui-utils';
export default function ResultActions({ data, apiBase }) {
  const [copied, setCopied] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [shareBusy, setShareBusy] = useState(false), [shareMessage, setShareMessage] = useState('');
  const [optin, setOptin] = useState(null); // null | {token, howto} | {status}
  const [busy, setBusy] = useState(false);
  const run = useAction(setBusy, message => setShareMessage(message));

  async function copyShare() {
    if (!sameOrigin) { setShareMessage('로그인 후 공유 링크를 만들 수 있어요.'); return; }
    setShareBusy(true); setShareMessage('');
    try {
      let shareUrl = shareLink;
      if (!shareUrl) {
        const created = await memberApi('/api/member/share', { result: { url: data.url, scannedAt: data.scannedAt } });
        shareUrl = `${location.origin}${location.pathname}?share=${encodeURIComponent(created.token)}`;
        setShareLink(shareUrl);
      }
      try { await copyText(shareUrl); }
      catch { setShareMessage('링크가 생성됐습니다. 아래 주소를 선택해 복사해 주세요.'); return; }
      setCopied(true);
      setShareMessage('30일 동안 열 수 있는 읽기 전용 링크를 복사했습니다.');
      setTimeout(() => setCopied(false), 2000);
    } catch (e) { setCopied(false); setShareMessage(e.message); }
    finally { setShareBusy(false); }
  }

  async function updateOptin(method = 'GET') {
    await run(async () => {
      const response = await fetch(`${apiBase}/api/optin?url=${encodeURIComponent(data.url)}`, { method });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '등록 정보를 확인하지 못했습니다.');
      setOptin(previous => ({ ...previous, message: '', ...result }));
    });
  }

  return (
    <section className="actions">
      <div className="action-row">
        <button className="btn" onClick={copyShare} disabled={shareBusy}>
          {shareBusy ? '링크 만드는 중…' : copied ? '복사했습니다' : '공유 링크 만들기'}
        </button>
        {!optin?.token && !optin?.ok && (
          <button className="btn ghost" onClick={() => updateOptin()} disabled={busy}>
            이 사이트를 공개 목록에 등록
          </button>
        )}
      </div>
      {shareLink && <p><label>공유 주소 <input aria-label="공유 주소" readOnly value={shareLink} onFocus={e => e.target.select()} style={{ width: '100%' }} /></label></p>}
      {shareMessage && <p className="hint" role="status">{shareMessage}</p>}

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
          <button className="btn" onClick={() => updateOptin('POST')} disabled={busy}>
            {busy ? '확인 중…' : '등록했습니다. 확인해 주세요'}
          </button>
          {optin.message && <p className="hint">{optin.message}</p>}
        </div>
      )}

      {optin?.message && !optin.token && <p className="hint" role="status">{optin.message}</p>}
    </section>
  );
}

