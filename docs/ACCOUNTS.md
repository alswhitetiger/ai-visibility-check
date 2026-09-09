# 회원 기능 설정과 배포

현재 구현: 이메일·비밀번호 가입 및 로그인, 보안 쿠키 세션, 내 사이트 최대 50개, 최근 90일 검사 이력 조회·삭제, 계정당 하루 20회 검사. 한국 시간 자정에 초기화하며 저장된 결과 조회와 실패한 검사는 차감하지 않는다. 전체 서비스 한도는 하루 400회다. 계정별/전체 한도 모두 하나의 원자적 SQL 예약으로 검사 시작 전에 적용한다.

인증 라이브러리는 Better Auth 1.7.3, DB는 기존 Cloudflare D1이다. 비밀번호는 라이브러리의 scrypt 해시로 저장하고 OAuth 토큰은 AUTH_SECRET으로 암호화한다. AUTH_SECRET은 회원이 생긴 후 임의로 교체하지 않는다. 쿠키는 HttpOnly, HTTPS에서는 Secure, SameSite=Lax로 설정한다. 이메일이 일치한다는 이유로 계정을 자동 합치지 않으며 로그인한 사용자가 명시적으로 소셜 계정을 연결한다.

## 공개 주소

- 기존 소개/예시: https://alswhitetiger.github.io/ai-visibility-check/
- 회원 기능과 실제 검사: https://ai-visibility.ai-visibility-worker.workers.dev/ai-visibility-check/
- API와 회원 화면을 같은 Worker 도메인에서 제공해 브라우저의 제3자 쿠키 차단에 의존하지 않는다. GitHub Pages의 회원 버튼은 위 회원 화면으로 이동한다.

## 배포 순서

Node.js 22.13 이상을 사용한다. 실행 환경이 허용된 상태에서 저장소 루트에서 다음 순서로 실행한다.

```powershell
npm ci --prefix worker
npm ci --prefix web
npm test --prefix worker
$env:VITE_API_BASE = 'https://ai-visibility.ai-visibility-worker.workers.dev'
npm run build --prefix web
Set-Location worker
npx wrangler d1 migrations apply ai-visibility --remote
npx wrangler secret put AUTH_SECRET
npm run deploy
```

AUTH_SECRET에는 암호학적으로 생성한 32바이트 이상의 무작위 비밀 값을 입력한다. 저장소나 대화창에 값을 넣지 않는다. 현재 변경에는 생성된 운영 비밀 값이 포함되어 있지 않다. 회원 테이블은 `migrations/0001-auth.sql`, 서비스 테이블은 `0002-members.sql`로 기존 검사 테이블을 삭제하지 않고 추가한다. 운영 배포 후 실제 Workers 환경에서 가입·로그인·검사·로그아웃을 확인한다. 테스트 계정은 검증 후 해당 계정의 데이터만 제거한다.

GitHub Pages와 Worker에 같은 프론트 빌드를 배포해야 한다. 현재 GitHub Actions는 Pages만 자동 배포하므로, 프론트 변경 시 Worker도 다시 배포한다. 배포 권한이 마련되기 전에는 회원 기능을 운영 중이라고 안내하지 않는다.

## 소셜 로그인

Gmail은 별도 제공자가 아니라 **Google 계정 로그인**이다. 이메일함 접근 권한을 요청하지 않는다. 아래 세 서비스는 개발자 앱 생성·설정과 ID/Secret 등록이 완료돼야 실제 로그인할 수 있다. 미설정 서비스는 화면에서 비활성화한다.

| 제공자 | Worker secret 이름 | 개발자 콘솔에 등록할 Redirect / Callback URL |
|---|---|---|
| Google | GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET | https://ai-visibility.ai-visibility-worker.workers.dev/api/auth/callback/google |
| 카카오 | KAKAO_CLIENT_ID, KAKAO_CLIENT_SECRET | https://ai-visibility.ai-visibility-worker.workers.dev/api/auth/callback/kakao |
| 네이버 | NAVER_CLIENT_ID, NAVER_CLIENT_SECRET | https://ai-visibility.ai-visibility-worker.workers.dev/api/auth/callback/naver |

각 키는 `npx wrangler secret put 키이름`으로 입력한다. 로그인 버튼 → 제공자 동의 → 복귀 → 로그아웃 → 같은 제공자로 재로그인까지 검증한다. 이메일 계정으로 로그인한 뒤 계정 연결 버튼을 눌러 같은 회원 ID와 기록으로 복귀하는지도 확인한다. 개발 모드의 허용 사용자, 이메일 제공 동의 항목, 운영 전환·심사 요구사항은 각 콘솔에서 확인해야 한다. 카카오는 기본 이메일 정보 제공 권한을 앱에서 허용받아야 한다.

공식 참고:
- https://better-auth.com/docs/authentication/google
- https://better-auth.com/docs/authentication/kakao
- https://better-auth.com/docs/authentication/naver
- https://better-auth.com/docs/concepts/users-accounts

## 이메일 인증 / 비밀번호 찾기

기본 이메일·비밀번호 가입은 메일 발송 없이 이용할 수 있다. 이 경우 이메일의 실제 소유 여부는 확인되지 않으며 비밀번호 찾기는 제공되지 않는다. 화면에도 이 제한을 표시한다. 운영에서 이메일 소유 확인이 필요하면 Resend의 발신 도메인 인증 후 다음 값을 설정한다.

- `RESEND_API_KEY`: Worker secret
- `AUTH_EMAIL_FROM`: 인증된 발신 주소 (Worker 변수 또는 secret)

두 값이 모두 있으면 가입·로그인 시 이메일 인증이 필수가 되고 비밀번호 재설정 메일 기능이 켜진다. 실제 메일 발송과 링크 복귀는 운영 설정 후 별도로 검증한다. 기본 계정의 비밀번호 변경은 로그인한 상태에서 기존 비밀번호를 확인한 후 제공한다.

## 검증 상태 및 남은 일

- SQLite/D1 호환 어댑터 테스트: 가입·암호 해시·로그아웃, 데이터 소유권, 외부 Origin 차단, 동시 요청 한도, 자정 초기화, 캐시 무료 조회와 실패 환불.
- 소셜 로그인/이메일 발송은 서비스 키가 없어 실제 연결 검증 전이다.
- 2026-09-09 Workers 실서버에서 이메일 가입·로그인·보안 쿠키·사이트 저장과 삭제·실제 페이지 검사·이력 저장·한도 20→19 차감·로그아웃을 검증했다. 테스트 계정은 제거했다. 자동 테스트는 24개 통과했다.
- OAuth 콜백과 인증/재설정 메일은 외부 서비스 연결 후 추가 검증이 필요하다.
- 이력은 90일 범위만 조회 가능하며 새 이력 저장 때 해당 회원의 오래된 이력을 정리한다. 현재는 전체 회원의 일괄 정리 작업이나 회원 탈퇴 UI는 포함하지 않았다.
