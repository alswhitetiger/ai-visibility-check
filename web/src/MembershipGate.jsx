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
    <p className="eyebrow">가게 체크 회원 서비스</p>
    <h2 id="membership-title">회원가입 후 이용할 수 있어요</h2>
    <p id="membership-description">검사와 예시 보기, 내 사이트 관리는 로그인 후 이용할 수 있습니다. Q&A는 가입 없이 볼 수 있어요.</p>
    <div className="membership-dialog-actions"><button className="button secondary" onClick={onClose}>나중에</button><a className="button primary" href={memberPageUrl('signup', intent)}>회원가입 페이지로 이동 →</a></div>
    <a href={memberPageUrl('login', intent)}>이미 회원이라면 로그인</a>
  </dialog>;
}
