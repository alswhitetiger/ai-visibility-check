export function failureHelp(code) {
  const cases = {
    ACCOUNT_LIMIT: { title: '오늘 계정의 검사 한도를 사용했어요', next: '한국 시간 자정 이후 다시 검사하세요. 내 사이트에서 저장된 검사 이력을 열거나 무료 예시를 볼 수 있어요.' },
    DAILY_LIMIT: { title: '서비스 전체 검사 한도에 도달했어요', next: '다음 날 다시 이용해 주세요. 저장된 검사 이력과 예시는 계속 볼 수 있어요.' },
    BLOCKED_BY_SITE: { title: '사이트의 접근 규칙 때문에 멈췄어요', next: '운영 담당자에게 robots.txt의 이 검사 도구 접근 규칙을 확인해 달라고 요청하세요. 다른 AI의 접근 여부를 뜻하지 않습니다.' },
    REFUSED_BY_SITE: { title: '사이트가 요청을 거부했어요', next: '로그인·접근 제한 또는 요청 제한이 있을 수 있어요. 운영 담당자에게 해당 주소의 응답을 확인해 달라고 요청하세요. 반복 요청으로 우회하지 않습니다.' },
    TIMEOUT: { title: '검사 응답을 기다리다 중단했어요', next: '사이트가 브라우저에서 열리는지 확인하고 잠시 후 다시 시도하세요. 서버 처리가 완료됐을 수 있으니 검사 이력도 확인하세요.', retry: true },
    FETCH_FAILED: { title: '페이지를 가져오지 못했어요', next: '주소와 사이트 접속 상태를 확인하세요. 잠시 후 다시 시도하거나 공개된 다른 페이지 주소를 입력해 보세요.', retry: true },
    INVALID_URL: { title: '검사할 주소를 확인해 주세요', next: '로그인 없이 열리는 공개 쇼핑몰 또는 상품 페이지 주소를 입력하세요.' },
    LOGIN_WALL: { title: '로그인 뒤의 내용은 직접 확인이 필요해요', next: '쇼핑몰 로그인·성인인증은 해당 사이트에서 직접 진행하세요. 브라우저 로그인 상태는 검사 서버에 전달되지 않으므로, 로그인 후 재검사해도 같은 화면이 나올 수 있어요. 공개 페이지 주소로 검사하거나 아래 수동 확인을 이용하세요.' },
    LOGIN_REQUIRED: { title: '로그인이 필요해요', next: '로그인 후 다시 검사하세요. 예시와 수정 안내는 가입 없이 이용할 수 있어요.' },
  };
  return cases[code] || { title: '요청을 완료하지 못했어요', next: '인터넷 연결을 확인하고 잠시 후 다시 시도하세요. 예시는 계속 이용할 수 있어요.', retry: true };
}
export function aiFailureHelp(ai) {
  const kinds = (ai?.tried || []).map(t => t.kind);
  if (kinds.includes('rate_limit')) return 'AI 제공사의 요청 한도로 추가 답변을 받지 못했어요. 계정의 일일 검사 한도와는 별개입니다.';
  if (kinds.includes('network') || kinds.includes('server')) return 'AI 제공사 연결 또는 응답 오류로 추가 답변을 받지 못했어요.';
  return '현재 AI 추가 답변을 받을 수 없습니다. 페이지의 기본 정보 검사는 별도로 처리됩니다.';
}
