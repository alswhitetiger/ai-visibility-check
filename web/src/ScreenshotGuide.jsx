import { useState } from 'react';

export default function ScreenshotGuide({ url }) {
  const [files, setFiles] = useState([]);
  return <section className="panel screenshot-guide"><p className="eyebrow">로그인 화면으로 확인할 수 없을 때</p><h3>화면 캡처로 확인할 자료를 준비해 주세요</h3><p>현재 서버가 쇼핑몰 계정으로 대신 로그인하지는 않습니다. 다음 화면을 캡처하면 운영자나 담당자가 공개 영역과 로그인 뒤 영역을 나누어 확인할 수 있습니다.</p><ol><li><b>메인 페이지</b> — 가게 이름·소개·주요 메뉴가 보이는 화면</li><li><b>로그인 또는 성인인증 페이지</b> — 로그인이 필요한 이유가 보이는 화면</li><li><b>상품 페이지</b> — 상품명·가격·설명·이미지·구매 안내가 보이는 화면</li></ol><p className="muted">아이디, 이름, 주소, 주문번호, 결제 정보와 브라우저 알림은 캡처 전에 가려 주세요. 비밀번호와 쿠키는 보내지 마세요.</p><label className="screenshot-picker">시험용 파일 미리보기<input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={e => setFiles([...e.target.files])} /></label>{files.length > 0 && <p className="muted">선택한 {files.length}개 파일은 이 화면에서만 확인하며 자동 업로드하지 않습니다.</p>}<p className="muted">현재 버전은 캡처만으로 자동 점수를 확정하지 않습니다. 정식 업로드·분석 기능은 개인정보 처리와 정확도를 검토한 뒤 추가합니다.</p>{url && <a href={url} target="_blank" rel="noreferrer">쇼핑몰 페이지를 직접 열기 ↗</a>}</section>;
}
