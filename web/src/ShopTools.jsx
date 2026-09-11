import { useState } from 'react';
import { buildShopCode } from './shop-code';

export function ObservedInfo({ data }) {
  const o = data.observed;
  if (!o) return null;
  const rows = [
    ['가게 이름', o.brand || '브랜드 데이터와 사이트 이름 태그에서 찾지 못했어요'],
    ['페이지 제목', o.title || '제목을 찾지 못했어요'],
    ['가게·페이지 소개', o.description || '페이지 소개 태그에서 찾지 못했어요'],
    ['상품 가격', data.browserExtracted ? o.prices.filter(p => typeof p === 'string').join(', ') || '가격 후보를 찾지 못했어요' : !data.isProductPage ? '일반 페이지입니다. 상품 페이지 주소를 넣으면 가격도 확인해요.' :
      o.prices.length ? o.prices.map(p => `${p.value} ${p.currency || '(통화 미표기)'} · ${p.source}`).join('\n') :
      o.textPrices.length ? o.textPrices.join(', ')+' · 본문에서 발견한 금액 (판매가인지 확인 필요)' : '상품 데이터와 본문에서 가격을 찾지 못했어요'],
    ['이미지 설명', o.images.total ? `${o.images.total}개 이미지 중 ${o.images.described}개에 글 설명이 있어요` : '검사할 이미지가 없어요'],
  ];
  return <section className="panel observed"><p className="eyebrow">점수의 바탕이 된 내용</p><h2>이 페이지에서 읽힌 정보</h2>
    <p className="muted">{data.browserExtracted ? '확장프로그램이 현재 브라우저 페이지에서 읽은 내용입니다.' : '검사기가 HTML 원본에서 읽은 내용입니다.'} 실제 AI의 인식 결과나 내용의 사실 여부를 검증한 것은 아닙니다.</p>
    <dl>{rows.map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <details><summary>읽힌 글과 이미지 설명 예시</summary><p className="observed-excerpt">{o.textExcerpt || '원본에서 본문 글을 찾지 못했어요.'}</p>{(o.images.samples || []).length > 0 && <ul>{o.images.samples.map((s,i)=><li key={i}>{s}</li>)}</ul>}<p className="muted">본문은 앞부분 최대 350자, 이미지 설명은 최대 3개만 보여드려요.</p></details>
  </section>;
}

export function ShopBuilder({ data, onScan }) {
  const [name,setName] = useState(data.observed?.brand || '');
  const [url,setUrl] = useState(() => { try { return new URL(data.url).origin+'/'; } catch { return ''; } });
  const [description,setDescription] = useState(data.observed?.description || '');
  const [confirmed,setConfirmed] = useState(false);
  const [result,setResult] = useState(null);
  const [error,setError] = useState('');
  const [copied,setCopied] = useState('');
  const [platform,setPlatform] = useState('general');
  function edit(setter,value) { setter(value); setResult(null); setConfirmed(false); setError(''); setCopied(''); }
  function generate(e) {
    e.preventDefault(); setCopied('');
    if(!confirmed) { setError('입력한 정보가 맞는지 확인해 주세요.'); return; }
    try { setResult(buildShopCode({name,url,description})); setError(''); } catch(e) {setError(e.message);}
  }
  async function copy() {
    try { await navigator.clipboard.writeText(result.code); setCopied('완성된 코드를 복사했어요.'); }
    catch { setCopied('자동 복사가 되지 않았어요. 아래 코드를 선택해 복사해 주세요.'); }
  }
  return <section className="panel shop-builder" id="shop-builder"><p className="eyebrow">입력 → 확인 → 코드 완성 → 적용</p><h2>우리 가게 소개 정보 만들기</h2>
    <p>가게 이름과 공식 주소를 입력하면, 기계가 읽을 수 있는 소개 코드를 만들어 드려요.</p>
    <p className="muted">이름·소개가 미리 채워져 있다면 페이지에서 읽은 내용입니다. 운영자가 확인한 사실만 입력하세요. 입력값은 코드 생성 과정에서 서버나 AI로 전송하지 않습니다.</p>
    {data.example && <p className="code-note">지금은 가상 가게 예시입니다. 실제 적용할 때는 본인 가게의 정보로 바꿔 주세요.</p>}
    <form onSubmit={generate}>
      <div className="builder-fields"><label htmlFor="brand-name">가게 이름 <span>필수</span><input id="brand-name" required maxLength={120} value={name} onChange={e=>edit(setName,e.target.value)} placeholder="예: 우리옷가게" /></label>
      <label htmlFor="brand-url">공식 홈페이지 주소 <span>필수</span><input id="brand-url" required type="url" value={url} onChange={e=>edit(setUrl,e.target.value)} placeholder="https://myshop.cafe24.com/" /></label></div>
      <label htmlFor="brand-description">가게 소개 <span>선택 · 600자 이내</span><textarea id="brand-description" rows={3} maxLength={600} value={description} onChange={e=>edit(setDescription,e.target.value)} placeholder="실제로 판매하는 상품과 가게의 특징을 적어 주세요." /></label>
      <label className="confirm-info"><input type="checkbox" checked={confirmed} onChange={e=>{setConfirmed(e.target.checked);setResult(null);setCopied('');}} />입력한 이름·주소·소개가 맞는지 확인했어요.</label>
      <button className="button primary" type="submit">확인한 정보로 코드 만들기</button>
      {error && <p role="alert">{error}</p>}
    </form>
    {result && <div className="builder-result"><h3>소개 코드가 완성됐어요</h3><p>이 코드는 브랜드 정보(JSON-LD)를 추가합니다. 화면에 보이는 소개글이나 검색용 메타 설명을 자동으로 바꾸지는 않습니다.</p>
      <pre>{result.code}</pre><div className="copy-row"><button className="button secondary" onClick={copy}>완성된 코드 복사</button><span role="status">{copied}</span></div>
      <label htmlFor="shop-platform">어디에 적용하나요?<select id="shop-platform" value={platform} onChange={e=>setPlatform(e.target.value)}><option value="general">직접 만든 사이트 / 잘 모르겠어요</option><option value="cafe24">카페24</option></select></label>
      <ol className="apply-steps"><li>{platform==='cafe24' ? '카페24 디자인 편집에서 사용 중인 공통 레이아웃을 확인하세요. 스킨마다 위치가 다르므로 찾기 어려우면 디자인 담당자에게 코드를 전달하세요.' : '사이트의 공통 레이아웃이나 홈페이지 HTML을 여세요. 직접 편집할 수 없다면 운영·개발 담당자에게 코드를 전달하세요.'}</li>
      <li>기존 Organization / LocalBusiness 코드가 있으면 새로 중복 추가하지 말고 기존 정보를 수정하세요. 편집 전 원본을 보관하세요.</li>
      <li>새로 추가하는 경우 <code>&lt;/head&gt;</code> 바로 앞에 넣고 저장·게시하세요. 상품명·가격용 코드는 별도로 설정해야 합니다.</li>
      <li>홈페이지를 다시 검사해 브랜드 정보가 읽히는지 확인하세요. 코드를 만드는 것만으로 사이트가 바뀌지는 않습니다.</li></ol>
      {!data.example && <button className="button secondary" onClick={()=>onScan(result.data.url,true)}>적용한 홈페이지 다시 검사</button>}
    </div>}
  </section>;
}
