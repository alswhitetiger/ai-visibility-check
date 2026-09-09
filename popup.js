const status = document.querySelector('#status');
const preview = document.querySelector('#preview');
const send = document.querySelector('#send');
let extracted = null;
document.querySelector('#scan').addEventListener('click', async () => {
  status.textContent = '현재 탭의 공개 정보만 읽는 중…'; preview.hidden = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:/.test(tab.url || '')) throw new Error('일반 웹페이지에서 실행해 주세요.');
    const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => ({
      url: location.href, title: document.title,
      description: document.querySelector('meta[name="description"]')?.content || '',
      headings: [...document.querySelectorAll('h1,h2')].slice(0, 20).map(x => x.innerText.trim()).filter(Boolean),
      images: [...document.images].slice(0, 100).map(x => ({ alt: x.alt || '', src: x.currentSrc || x.src })).filter(x => x.src),
      prices: [...document.body.innerText.matchAll(/[0-9][0-9,.]*\s*(?:원|₩|USD|달러)/g)].slice(0, 30).map(x => x[0]),
      loginForm: !!document.querySelector('input[type="password"]')
    }) });
    extracted = result.result;
    preview.textContent = JSON.stringify(extracted, null, 2); preview.hidden = false; send.disabled = false;
    status.textContent = '추출 미리보기입니다. 내용을 확인한 뒤 점수 보기를 눌러 주세요.';
  } catch (error) { status.textContent = error.message || '현재 탭을 읽지 못했습니다.'; }
});
send.addEventListener('click', async () => {
  if (!extracted) return;
  send.disabled = true; status.textContent = '브라우저에서 읽은 정보로 점수를 계산하는 중…';
  try {
    const response = await fetch('https://ai-visibility.ai-visibility-worker.workers.dev/api/extension/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(extracted) });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.message || '점수를 계산하지 못했습니다.');
    const compact = { url: data.url, host: data.host, version: data.version, browserExtracted: true, aiScore: data.aiScore, uxScore: data.uxScore, observed: data.observed, scannedAt: data.scannedAt, checks: data.checks || [] };
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(compact))));
    const resultUrl = 'https://alswhitetiger.github.io/ai-visibility-check/?extensionResult=' + encodeURIComponent(encoded);
    preview.textContent = JSON.stringify({ 안내: '검사가 완료되었습니다. 홈페이지 결과 화면을 여는 중입니다.', AI정보점수: data.aiScore, 고객정보점수: data.uxScore }, null, 2);
    status.textContent = '홈페이지에서 상세 결과를 확인하세요.';
    chrome.tabs.create({ url: resultUrl });
  } catch (error) { status.textContent = error.message || '점수를 계산하지 못했습니다.'; }
  finally { send.disabled = false; }
});
