# 가게 체크 · AI Visibility Check

쇼핑몰 URL로 AI가 읽을 기본 정보와 고객에게 보여줄 정보를 점검하는 원티드 AI Championship 2026 출품작입니다. 점수는 HTML과 접근 규칙의 준비 상태이며 실제 검색 순위·매출·구매 성공률을 측정하지 않습니다.

- [서비스 소개·예시](https://alswhitetiger.github.io/ai-visibility-check/)
- [로그인·실제 검사](https://ai-visibility.ai-visibility-worker.workers.dev/ai-visibility-check/)

## 구성

| 경로 | 역할 |
|---|---|
| `web/` | React + Vite 화면, 예시, 코드 생성, 회원 대시보드 |
| `worker/` | Cloudflare Worker API, D1 기록, 인증, 규칙 검사, AI 질의 |
| `extension/` | 사용자가 선택한 현재 탭의 정보를 읽는 Chrome 확장프로그램 |
| `scripts/` | 가상 예시 생성과 별도 실행하는 조사 스크립트 |
| `docs/` | 설정·제출·계정 안내 |

## 설치와 검증

Node.js 22.13 이상을 사용합니다. 테스트는 내장 SQLite를 사용하며 운영 DB나 유료 AI를 호출하지 않습니다.

```sh
npm --prefix web ci
npm --prefix worker ci
npm --prefix worker test
node scripts/build-example.mjs
npm --prefix web run build
```

프론트 화면 개발은 `npm --prefix web run dev`로 시작합니다. 회원·API 기능은 Worker와 같은 출처에서 실행해야 합니다. 로컬 DB와 인증 설정은 [계정 안내](docs/ACCOUNTS.md), 운영 설정은 [설정 가이드](docs/SETUP.md)를 참고하세요. 비밀 키는 `.dev.vars` 또는 Worker secrets로 관리합니다.

GitHub Actions는 `main`의 웹·서버·확장 소스 변경 시 테스트와 웹 빌드를 실행하고 GitHub Pages를 배포합니다. Worker 운영 배포는 별도입니다.

## 확장프로그램

Chrome의 `chrome://extensions`에서 개발자 모드를 켜고 `extension/` 폴더를 압축해제된 확장프로그램으로 로드하세요. 저장소 루트를 선택해도 같은 팝업 소스를 사용합니다.

1. 사용자가 쇼핑몰에서 로그인·성인인증을 직접 완료합니다.
2. 메인 또는 상품 페이지에서 **현재 탭 읽기**를 누릅니다.
3. 추출한 내용을 확인하고 **추출 결과로 점수 보기**를 누르면 검사 서버로 전송하고 홈페이지에 참고 결과를 표시합니다.

확장 점수는 공개 HTML 검사와 기준이 다릅니다. 비밀번호·쿠키는 읽지 않지만 URL·제목·설명·헤딩·이미지 정보·가격 후보를 읽으므로 계정·주문 페이지에서는 사용하지 마세요. 설치와 ZIP 생성은 [확장프로그램 안내](extension/README.md)를 참고하세요.
