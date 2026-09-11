export function readExtensionResult(encoded) {
  const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded), c => c.charCodeAt(0))));
  const url = new URL(data.url);
  const observed = data.observed, images = observed?.images;
  if (!data.browserExtracted || !['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      ![data.aiScore, data.uxScore].every(score => Number.isFinite(score) && score >= 0 && score <= 100) ||
      !Number.isFinite(data.scannedAt) || Math.abs(data.scannedAt) > 8.64e15 ||
      typeof observed?.title !== 'string' || typeof observed?.description !== 'string' || !Array.isArray(observed?.prices) ||
      !Number.isInteger(images?.total) || images.total < 0 || images.total > 100 ||
      !Number.isInteger(images?.described) || images.described < 0 || images.described > images.total) {
    throw new Error('확장프로그램 결과 형식이 올바르지 않습니다.');
  }
  return {
    url: url.href, host: url.host, browserExtracted: true, checks: [],
    aiScore: data.aiScore, uxScore: data.uxScore, scannedAt: data.scannedAt,
    observed: { title: observed.title.slice(0, 200), description: observed.description.slice(0, 600),
      prices: observed.prices.filter(p => typeof p === 'string').slice(0, 30).map(p => p.slice(0, 80)),
      images: { total: images.total, described: images.described } },
  };
}
