const status = document.querySelector('#status');
const preview = document.querySelector('#preview');
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
    preview.textContent = JSON.stringify(result.result, null, 2); preview.hidden = false;
    status.textContent = '추출 미리보기입니다. 아직 서버로 전송하지 않았습니다.';
  } catch (error) { status.textContent = error.message || '현재 탭을 읽지 못했습니다.'; }
});
