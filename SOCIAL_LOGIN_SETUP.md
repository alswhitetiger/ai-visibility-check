# SNS 로그인 설정

가게 체크는 이메일 로그인과 함께 Google(Gmail), 카카오, 네이버 로그인을 지원합니다. OAuth 처리는 Cloudflare Worker의 Better Auth가 담당하고, Client Secret은 저장소에 넣지 않고 Wrangler secret으로만 등록합니다.

## 현재 구현 상태

- 로그인 화면에 Google · Gmail, 카카오, 네이버 버튼이 이미 있습니다.
- Worker는 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `KAKAO_CLIENT_ID`, `KAKAO_CLIENT_SECRET`, `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`을 읽습니다.
- 값이 모두 등록된 provider만 로그인 버튼이 활성화됩니다.
- 기존 이메일 계정에 로그인한 뒤 같은 화면에서 SNS 계정을 연결할 수 있습니다.
- 별도 DB 마이그레이션은 필요하지 않습니다. Better Auth의 기존 `user`, `account`, `session` 테이블을 사용합니다.

## 공통 Callback URL

각 서비스에 아래 URL을 **문자 그대로** 등록해야 합니다. 끝의 슬래시는 넣지 않습니다.

| 환경 | Google | 카카오 | 네이버 |
| --- | --- | --- | --- |
| 공개 | `https://ai-visibility.ai-visibility-worker.workers.dev/api/auth/callback/google` | `https://ai-visibility.ai-visibility-worker.workers.dev/api/auth/callback/kakao` | `https://ai-visibility.ai-visibility-worker.workers.dev/api/auth/callback/naver` |
| 로컬 | `http://localhost:8787/api/auth/callback/google` | `http://localhost:8787/api/auth/callback/kakao` | `http://localhost:8787/api/auth/callback/naver` |

## 1. Google(Gmail)

1. [Google Cloud Console의 Credentials](https://console.cloud.google.com/apis/credentials)를 엽니다.
2. 프로젝트를 만들거나 선택합니다.
3. Google Auth Platform에서 Branding/Consent 화면을 작성합니다. 테스트 상태라면 로그인할 Google 계정을 Test users에 추가합니다.
4. **Create credentials → OAuth client ID → Web application**을 선택합니다.
5. Authorized redirect URIs에 공개 Callback URL과 로컬 Callback URL을 각각 추가합니다.
6. 생성된 Client ID와 Client Secret을 보관합니다.

이 서비스는 Gmail 메일함 권한을 요청하지 않습니다. 로그인 식별에 필요한 기본 프로필과 이메일만 사용합니다.

## 2. 카카오

1. [카카오디벨로퍼스](https://developers.kakao.com/)에 로그인하고 앱을 만듭니다.
2. **카카오 로그인 → 사용 설정**을 ON으로 바꿉니다.
3. 동의항목에서 최소한 카카오계정 이메일과 닉네임을 설정합니다. 이메일이 없으면 이 서비스의 계정 식별을 완료할 수 없습니다.
4. **앱 → 플랫폼 키 → REST API 키**에서 REST API 키를 확인합니다. 이 값을 `KAKAO_CLIENT_ID`로 사용합니다.
5. 같은 화면의 Client Secret을 생성하고 활성화합니다. 이 값을 `KAKAO_CLIENT_SECRET`으로 사용합니다.
6. REST API 키 설정의 Redirect URI에 공개 Callback URL과 로컬 Callback URL을 등록합니다.

카카오 공식 문서: [카카오 로그인 사전 준비](https://developers.kakao.com/docs/ko/kakaologin/prerequisite)

## 3. 네이버

1. [네이버 개발자센터 애플리케이션 등록](https://developers.naver.com/apps/#/register)을 엽니다.
2. 사용 API에서 **네이버 로그인**을 선택합니다.
3. 로그인 오픈 API 서비스 환경에서 PC 웹을 선택합니다.
4. 서비스 URL에는 `https://alswhitetiger.github.io/ai-visibility-check/`를 입력합니다.
5. Callback URL에는 공개 Callback URL을 입력하고, 로컬 테스트가 필요하면 로컬 Callback URL도 추가합니다.
6. 발급된 Client ID와 Client Secret을 보관합니다.

네이버 공식 문서: [애플리케이션 등록](https://developers.naver.com/docs/common/openapiguide/appregister.md)

## Worker에 secret 등록

PowerShell에서 저장소의 `worker` 폴더로 이동한 다음 각 명령을 실행합니다. 명령을 실행하면 값 입력을 묻습니다.

```powershell
cd C:\Users\UserK\Desktop\ai-visibility-check\worker

npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put KAKAO_CLIENT_ID
npx wrangler secret put KAKAO_CLIENT_SECRET
npx wrangler secret put NAVER_CLIENT_ID
npx wrangler secret put NAVER_CLIENT_SECRET
```

Client Secret은 채팅, GitHub 코드, `wrangler.toml`, `.env` 커밋 파일에 붙여 넣지 않습니다. Wrangler가 입력받아 Cloudflare에 저장하도록 합니다.

등록 후 Worker를 다시 배포할 필요는 없지만, 설정을 명확히 확인하려면 다음을 실행합니다.

```powershell
(Invoke-WebRequest -UseBasicParsing https://ai-visibility.ai-visibility-worker.workers.dev/api/member/config).Content
```

정상 상태라면 다음처럼 세 값이 모두 `true`가 됩니다.

```json
{"providers":{"google":true,"kakao":true,"naver":true}}
```

그 다음 [로그인 페이지](https://ai-visibility.ai-visibility-worker.workers.dev/ai-visibility-check/login/)에서 버튼을 눌러 실제 로그인을 테스트하면 됩니다. `redirect_uri_mismatch`, 카카오 `KOE006`, 네이버 Callback URL 오류가 나오면 서비스에 등록한 Callback URL이 위 값과 한 글자까지 같은지 먼저 확인합니다.

