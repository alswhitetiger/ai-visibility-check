export const guides = {
  ai_crawler: { title: 'AI가 페이지에 접근하도록 허용했나요?', term: 'robots.txt', action: '차단된 AI 이름과 검사 주소를 확인하세요. 허용할 서비스만 운영 정책에 맞게 조정한 뒤 다시 검사하세요.' },
  ai_training: { title: 'AI 학습용 수집 설정', term: '학습용 크롤러', action: '학습용 수집을 허용할지는 운영자가 결정합니다. 이 항목은 점수에 포함하지 않습니다.' },
  llms_txt: { title: 'AI용 안내 파일이 있나요?', term: 'llms.txt · 선택 항목', action: '필요한 경우 브랜드 소개와 주요 페이지 링크를 담은 안내 파일을 만드세요. AI 검색 노출의 필수 조건이 아니며 점수에 포함하지 않습니다.' },
  jsonld_org: { title: '브랜드 정보를 기계가 읽을 수 있나요?', term: '조직 구조화 데이터 · JSON-LD', action: '브랜드명과 공식 주소를 아래 형식으로 정리하세요. 카페24는 디자인 편집의 공통 레이아웃에서 <head> 영역을 확인하고, 적용 위치가 불분명하면 운영·개발 담당자에게 전달하세요. 기존 설정과 중복되지 않도록 먼저 확인하세요.', code: '<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "Organization",\n  "name": "실제 브랜드명으로 교체",\n  "url": "https://공식-도메인으로-교체"\n}\n</script>' },
  jsonld_product: { title: '상품 정보를 기계가 읽을 수 있나요?', term: '상품 구조화 데이터 · Product', action: '쇼핑몰 관리자에서 상품별 구조화 데이터 기능을 확인하세요. 상품명·가격·통화·재고는 실제 상품 정보와 연결해야 합니다. 모든 상품에 같은 값을 붙여 넣으면 안 됩니다.' },
  js_dependency: { title: '원본 페이지에 읽을 글이 충분한가요?', term: 'HTML 원본 텍스트', action: '브랜드 소개와 상품 설명을 이미지 안에만 넣지 말고 글로도 제공하세요. 화면에는 글이 있는데 원본에는 없다면 개발 담당자에게 서버 렌더링 여부를 확인해 달라고 요청하세요.' },
  sitemap: { title: '페이지 목록 파일이 있나요?', term: 'sitemap.xml', action: '관리자의 검색 최적화 설정에서 사이트맵 제공 여부를 확인하세요. 이 검사는 /sitemap.xml만 확인하므로 다른 주소에 있다면 오류로 단정하지 마세요.' },
  canonical: { title: '대표 페이지 주소가 정해져 있나요?', term: 'canonical', action: '각 페이지가 자신의 대표 주소를 가리키도록 설정하세요. 상품 페이지까지 모두 홈페이지를 가리키게 만들면 안 됩니다.', code: '<link rel="canonical" href="https://이-페이지의-실제-대표주소로-교체" />' },
  title: { title: '페이지 제목이 적절한 길이인가요?', term: 'title · 10~60자 기준', action: '브랜드명과 취급 상품을 알 수 있게 작성하세요. 상품 상세페이지에는 해당 상품명을 사용하세요.', code: '<title>실제 브랜드명 | 주요 취급 상품</title>' },
  description: { title: '가게를 소개하는 설명이 있나요?', term: '메타 설명 · 40자 이상 기준', action: '무엇을 파는지, 어떤 고객을 위한 가게인지 1~2문장으로 적어 검색 최적화 설정에 입력하세요. 사실로 확인할 수 없는 혜택이나 수치는 넣지 마세요.', code: '<meta name="description" content="실제 취급 상품과 고객에게 제공하는 가치를 설명하는 문장으로 교체하세요." />' },
  viewport: { title: '모바일 화면 설정이 있나요?', term: 'viewport', action: '공통 레이아웃의 <head>에 설정이 있는지 확인하세요. 적용 후 휴대폰에서 글·버튼·결제 화면을 직접 점검하세요.', code: '<meta name="viewport" content="width=device-width, initial-scale=1" />' },
  img_alt: { title: '이미지에 글로 된 설명이 있나요?', term: '이미지 alt', action: '상품 사진에 색상·형태 등 실제 보이는 정보를 짧게 적으세요. 장식만을 위한 이미지는 빈 alt가 적절할 수 있습니다.', code: '<img src="실제-이미지-주소" alt="이 사진에 실제로 보이는 상품 설명" />' },
  price: { title: '상품 가격을 글로 읽을 수 있나요?', term: '가격 표기 / offers.price', action: '가격을 이미지에만 넣지 말고 본문 글로도 표시하세요. 상품 구조화 데이터의 가격이 실제 판매가와 일치하는지 확인하세요.' },
  og: { title: '공유할 때 표시할 제목이 있나요?', term: 'og:title', action: '메신저로 링크를 보낼 때 보여줄 제목을 입력하세요. 쇼핑몰 관리자의 소셜 공유 또는 검색 최적화 설정에서 확인할 수 있습니다.', code: '<meta property="og:title" content="실제 브랜드명과 페이지 제목" />' },
  business_info: { title: '사업자 정보 안내가 있나요?', term: '사업자번호 관련 문구', action: '하단 사업자 정보가 이미지가 아닌 글로 표시되는지 확인하세요. 이 도구는 관련 문구만 확인하며 번호의 유효성을 검증하지 않습니다.' },
};
export const titleOf = check => guides[check.id]?.title || check.label;
export const dateOf = value => value ? new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '기록 없음';
