import { useEffect, useRef } from 'react';
import { memberPageUrl } from './member-api';
import './account.css';

export default function MembershipGate({ intent, onClose }) {
  const dialog = useRef(null);
  useEffect(() => {
    const node = dialog.current; node.showModal();
    return () => node.close();
  }, []);
  return <dialog ref={dialog} className="membership-dialog" aria-labelledby="membership-title" aria-describedby="membership-description" onCancel={onClose}>
    <div className="membership-dialog-header"><span className="membership-dialog-icon" aria-hidden="true">✓</span><div><p className="eyebrow">가게 체크 회원 서비스</p><span className="membership-dialog-kicker">내 사이트 개선 기록</span></div></div>
    <h2 id="membership-title">검사 결과를 저장하고<br/>다음 수정을 이어가세요</h2>
    <p id="membership-description">실제 사이트 검사와 검사 이력은 회원 전용으로 제공됩니다. 결과 예시와 수정 방법, Q&amp;A는 가입 없이 계속 확인할 수 있어요.</p>
    {intent?.action === 'scan' && <div className="membership-alternative"><b>로그인 없이 회원 전용 페이지를 확인하려면</b><p>쇼핑몰에 직접 로그인한 뒤 확장프로그램으로 현재 탭을 읽거나, 메인·로그인·상품 페이지를 캡처해 준비할 수 있습니다.</p><a className="text-button" href={`${import.meta.env.BASE_URL}ai-visibility-check-extension-connected.zip`} download>확장프로그램 ZIP 다운로드 ↗</a><small>비밀번호·쿠키는 제출하지 마세요. 캡처에는 아이디·주문번호·결제정보를 가려 주세요.</small></div>}
    <div className="membership-dialog-actions"><a className="button primary" href={memberPageUrl('signup', intent)}>회원가입하고 시작하기 <span aria-hidden="true">→</span></a><button className="button secondary" onClick={onClose}>나중에 둘러보기</button></div>
    <p className="membership-dialog-login">이미 회원이라면 <a href={memberPageUrl('login', intent)}>로그인하기</a></p>
  </dialog>;
}
