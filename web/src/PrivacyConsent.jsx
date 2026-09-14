import { memberBase } from './member-api';

export default function PrivacyConsent({ checkbox = false }) {
  return <section className="privacy-consent-box" aria-labelledby={checkbox ? 'signup-privacy-title' : undefined}>
    <div className="privacy-consent-heading"><strong id={checkbox ? 'signup-privacy-title' : undefined}>개인정보 수집·이용 안내</strong><span>시행일 2026. 9. 14.</span></div>
    <dl>
      <div><dt>수집 목적</dt><dd>계정 생성과 로그인, 이메일 소유 확인, 비밀번호 재설정, 부정 이용 방지와 계정 보안</dd></div>
      <div><dt>필수 항목</dt><dd>이름 또는 닉네임, 이메일 주소, 비밀번호 해시, 이메일 인증 여부, 가입·수정 시각</dd></div>
      <div><dt>자동 생성</dt><dd>세션 토큰, 로그인 시각, IP 주소, 브라우저·기기 정보(User-Agent)</dd></div>
      <div><dt>보유 기간</dt><dd>회원 정보는 회원 탈퇴 또는 삭제 요청 처리 시까지, 로그인 세션은 최대 7일 또는 로그아웃 시까지</dd></div>
    </dl>
    <p>인증번호는 6자리이며 10분 동안 유효합니다. DB에는 번호 원문 대신 해시와 실패 횟수를 저장하고, 인증 성공·만료 확인·재발급 때 기존 값을 삭제하거나 교체합니다. 인증 메일은 운영자의 Gmail SMTP를 통해 발송되며 수신 주소와 인증번호가 Google의 메일 서버로 전달됩니다.</p>
    <p>사이트 저장과 검사를 이용하면 사이트 주소·표시 이름·검사 결과·검사 시각이 추가로 저장됩니다. 검사 이력은 최근 90일 범위로 제공되며 사용자가 먼저 삭제할 수 있습니다. 공개 페이지 검사 결과는 중복 호출을 줄이기 위한 공용 캐시에 재사용될 수 있으므로 주소에 개인정보나 비밀 토큰을 넣지 마세요.</p>
    <p><b>동의를 거부할 권리가 있습니다.</b> 다만 필수 정보 수집에 동의하지 않으면 이메일 회원가입과 회원 전용 기록 기능을 이용할 수 없습니다.</p>
    <a className="privacy-document-link" href={new URL('privacy-consent.md', memberBase)} target="_blank" rel="noreferrer">전체 고지문을 Markdown 원문으로 보기 ↗</a>
    {checkbox && <label className="account-consent"><input type="checkbox" name="privacyConsent" value="agreed" required /><span><b>[필수]</b> 위 개인정보 수집·이용 내용을 읽고 동의합니다.</span></label>}
  </section>;
}
