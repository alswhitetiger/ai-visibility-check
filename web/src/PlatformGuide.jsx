import { useState } from 'react';
const platforms = {
  cafe24: { name: '카페24', steps: ['관리자에서 쇼핑몰 설정 → 기본 설정 → 쇼핑몰 정보 → 검색 엔진 최적화(SEO)를 여세요.', '기본설정의 공통 페이지 SEO 태그에서 쇼핑몰 이름(Title)과 안내(Description)를 수정하세요.', '상품은 상품 → 상품목록 → 해당 상품 등록/수정 → 검색엔진 최적화에서 개별 설정을 확인하세요.'], href: 'https://support.cafe24.com/hc/ko/articles/8465663101721' },
  imweb: { name: '아임웹', steps: ['관리자 → 환경설정 → 일반에서 사이트 이름과 사이트 설명을 확인하세요.', '특정 페이지는 디자인 모드의 메뉴 설정에서 페이지 제목과 설명을 수정하세요.', 'canonical과 일부 공유 태그는 자동 생성됩니다. 코드 추가 전에 기존 출력 결과를 확인하세요.'], href: 'https://www.imweb.me/qna?mode=faq&q=71763' },
  shopify: { name: 'Shopify', steps: ['관리자 → 온라인 스토어 → 페이지에서 수정할 페이지를 여세요.', '검색 엔진 목록 영역의 편집을 눌러 페이지 제목과 메타 설명을 수정한 뒤 저장하세요.', '상품 페이지는 상품 관리에서 해당 상품의 검색 엔진 목록을 별도로 확인하세요.'], href: 'https://help.shopify.com/ko/manual/online-store/add-edit-pages' },
  custom: { name: '직접 제작 / 잘 모르겠어요', steps: ['사이트를 만든 담당자에게 사용하는 플랫폼과 수정 권한을 확인하세요.', '결과의 검사 근거와 코드 예시를 전달하고, 해당 페이지의 제목·설명·이미지 대체 텍스트를 확인해 달라고 요청하세요.', '현재 설정을 백업하고 수정한 뒤 같은 주소를 재검사하세요.'], href: null }
};
export default function PlatformGuide() {
  const [selected, setSelected] = useState('cafe24');
  const guide = platforms[selected];
  return <section className="panel platform-guide"><p className="eyebrow">플랫폼별 수정 안내 · 가입 없이 이용</p><h3>어디에서 수정하면 되나요?</h3><label>사용 중인 플랫폼 <select value={selected} onChange={e => setSelected(e.target.value)}>{Object.entries(platforms).map(([id,p]) => <option key={id} value={id}>{p.name}</option>)}</select></label><p className="muted">페이지 제목·소개부터 수정하는 안내입니다. 플랫폼은 직접 선택하며 자동 판정하지 않습니다.</p><ol>{guide.steps.map(step => <li key={step}>{step}</li>)}</ol>{guide.href && <a href={guide.href} target="_blank" rel="noreferrer">{guide.name} 공식 도움말 ↗</a>}<p className="muted">관리자 버전·권한에 따라 메뉴가 다를 수 있어요. 이미지 설명은 해당 이미지의 대체 텍스트 설정을, 구조화 데이터·접근 규칙은 테마와 플랫폼 지원 범위를 확인하세요. 저장 후 실제 페이지를 열어보고 재검사하세요.</p></section>;
}
