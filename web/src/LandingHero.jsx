import { useState } from 'react';

export default function LandingHero({ url, setUrl, scan, example, loading, limit, children }) {
  const [after, setAfter] = useState(false);
  return <header className="landing-hero">
    <div className="hero-message">
      <p className="hero-kicker"><span /> 쇼핑몰을 위한 AI 준비도 점검</p>
      <h1>우리 쇼핑몰,<br/><em>AI도 읽을 수</em><br/>있을까요?</h1>
      <p className="hero-description">주소 하나로 빠진 정보를 발견하세요.<br/>고객과 AI에게 필요한 정보, 고치는 방법까지.</p>
      <form className="hero-search" onSubmit={e => { e.preventDefault(); scan(url); }}>
        <label htmlFor="shop-url">쇼핑몰 또는 상품 페이지 주소</label>
        <div><input id="shop-url" required type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="myshop.cafe24.com" value={url} onChange={e => setUrl(e.target.value)} /><button className="button primary" disabled={loading}>{loading ? '검사 중…' : '검사 시작 ↗'}</button></div>
        <p>로그인 없이 하루 1회 체험 · 로그인하면 계정당 하루 {limit}회</p><small className="hero-limit-note">로그인·성인인증 뒤의 내용은 서버가 대신 로그인하지 않아 확인할 수 없습니다. 공개 페이지가 있으면 공개 영역을 먼저 검사합니다.</small>
      </form>
      {children}
      <button className="hero-example" onClick={() => example()}>심사위원 3분 체험 · 예시 결과 보기 <span>→</span></button>
    </div>
    <div className="preview-stage" aria-label="가상 쇼핑몰 검사 결과 미리보기">
      <div className="preview-caption"><span>YOUR NEXT STEP, MADE CLEAR.</span><span>가상 예시</span></div>
      <div className="preview-report">
        <div className="preview-top"><span className="mini-brand">✓</span><div><b>샘플 스토어</b><small>sample-shop.example</small></div><span className="preview-status">점검 완료</span></div>
        <div className="preview-title"><h2>작은 수정이 만드는<br/>더 선명한 가게.</h2><p>기본 정보를 채우면 달라지는 결과를 확인하세요.</p></div>
        <div className="preview-toggle" aria-label="예시 비교"><button aria-pressed={!after} onClick={() => setAfter(false)}>수정 전</button><button aria-pressed={after} onClick={() => setAfter(true)}>수정 후</button></div>
        <div className="preview-scores">{[['AI가 읽을 정보', after ? 100 : 80], ['고객이 볼 정보', after ? 100 : 67]].map(([label, value]) => <div key={label}><div className="preview-ring" style={{ '--score': value + '%' }}><strong>{value}<small>/ 100</small></strong></div><b>{label}</b></div>)}</div>
        <div className="preview-task"><span>{after ? '✓' : '↗'}</span><div><b>{after ? '기본 정보 보완 완료' : '다음 할 일 · 페이지 소개 채우기'}</b><p>{after ? '수정한 정보가 검사 결과에 반영됐어요.' : '어떤 가게인지 한두 문장으로 알려주세요.'}</p></div></div>
        <button className="preview-detail" onClick={() => example(after)}>검사 근거와 수정 방법 보기 <span>→</span></button>
      </div>
      <p className="preview-note">실제 측정이 아닌 가상 예시 · AI 추천 여부를 뜻하지 않습니다.</p>
    </div>
  </header>;
}

export function PublicGuide({ example }) {
  return <section id="public-guide" className="public-guide">
    <div className="guide-heading"><p className="eyebrow">발견에서 수정까지</p><h2>점수를 확인한 다음,<br/>무엇을 할지도 분명하게.</h2><p>개발 용어를 몰라도 시작할 수 있어요.<br/>이 안내와 결과 예시는 가입 없이 둘러보세요.</p><button className="button secondary" onClick={() => example()}>예시로 수정 과정 살펴보기 ↗</button></div>
    <div className="guide-steps"><article><span>01</span><div><h3>빠진 정보를 찾으세요</h3><p>브랜드 소개, 페이지 설명, 이미지 설명처럼 보완할 항목과 검사 근거를 함께 확인합니다.</p></div></article><article><span>02</span><div><h3>내 가게의 말로 채우세요</h3><p>쇼핑몰 관리자에서 소개와 설명을 수정하세요. 코드 설정은 제공된 예시를 개발 담당자에게 전달할 수 있어요.</p><div className="guide-example"><small>페이지 소개 작성 예시</small><p>매일 쓰기 좋은 도자기 그릇을 만드는 가게입니다. 제품 소재와 관리 방법을 확인해 보세요.</p></div></div></article><article><span>03</span><div><h3>회원 전용 페이지는 확장프로그램으로 확인하세요</h3><p>쇼핑몰에 직접 로그인한 뒤 확장프로그램에서 현재 탭을 읽으면, 결과가 이 홈페이지의 상세 결과 화면으로 열립니다. 비밀번호와 쿠키는 읽지 않습니다.</p><div className="guide-example"><small>사용 순서</small><p>ZIP 다운로드 → Chrome 개발자 모드에서 설치 → 로그인한 페이지에서 현재 탭 읽기 → 홈페이지 결과 확인</p><a className="button secondary" href={`${import.meta.env.BASE_URL}ai-visibility-check-extension-connected.zip`} download>확장프로그램 ZIP 다운로드 ↗</a></div></div></article><article><span>04</span><div><h3>다시 검사하고, 변화를 확인하세요</h3><p>수정한 사이트를 재검사해 점수와 항목 변화를 비교하세요. 실제 검사와 기록 관리는 로그인 후 이용합니다.</p></div></article></div>
  </section>;
}
