export function buildShopCode({name, url, description = ''}) {
  const cleanName = name.trim(), cleanDescription = description.trim();
  if (!cleanName || cleanName.length > 120) throw new Error('가게 이름을 1~120자로 입력해 주세요.');
  if (cleanDescription.length > 600) throw new Error('소개는 600자 이내로 입력해 주세요.');
  let official;
  try {
    official = new URL(url.trim());
    if (!['http:', 'https:'].includes(official.protocol) || official.username || official.password || !official.hostname.includes('.')) throw new Error();
    official.hash = '';
  } catch { throw new Error('https://로 시작하는 공식 웹 주소를 확인해 주세요.'); }
  const data = { '@context': 'https://schema.org', '@type': 'Organization', name: cleanName, url: official.href };
  if (cleanDescription) data.description = cleanDescription;
  // HTML script elements must never contain a literal closing tag from user input.
  const json = JSON.stringify(data, null, 2).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');
  return { data, code: '<script type="application/ld+json">\n'+json+'\n</script>' };
}
