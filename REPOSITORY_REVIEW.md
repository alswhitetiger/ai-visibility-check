# 저장소 점검 보고서

점검일: 2026-09-18 (Asia/Seoul)

## 확인 결과

- 기본 브랜치: `main`
- 운영 소스: 3,311줄 / 47개 파일 (`worker/src`, `web/src`, `extension`, `scripts`; 테스트·문서·vendor·build 제외)
- Worker 테스트: 56/56 통과
- Vite 프로덕션 빌드: 통과
- 운영 의존성 감사: Worker·Web 모두 알려진 취약점 0건
- GitHub Pages 배포: 성공 (`35300486069`)
- Cloudflare Worker 배포: 성공 (`a523f077-f6fb-4dc3-9b11-b6ad7f44af0c`)
- 운영 API: Gemini 단독 활성화, Google·카카오·네이버 로그인과 이메일 인증 활성화

## Ponytail ultra 정리

- 사용하지 않는 OpenAI·Anthropic 폴백 구현과 테스트를 제거하고 Gemini 단일 호출 경로로 합쳤다.
- AI 초안·고객 질문·운영자 인터뷰의 중복 HTTP 처리를 기존 `memberApi`로 통합했다.
- 활성 GitHub Actions와 중복되는 예전 배포 YAML·수동 배포 스크립트·루트 확장프로그램 manifest·중복 ZIP을 삭제했다.

## 제출 전 남은 수동 확인

- 원티드 제출 폼에 대표 이미지, 제목, 문제 설명, AI 활용 방식, 도구 선택, 서비스 링크, 16:9 스크린샷을 입력한다.
- 임시저장이 아닌 최종 제출을 2026-09-20 23:59:59 전에 완료한다.
- 외부 OAuth 동의 화면, 실제 받은편지함 수신, 대표 이미지·스크린샷 업로드는 계정 소유자가 직접 확인한다.

세부 기능·제한·검증 범위는 [`docs/FEATURES.md`](docs/FEATURES.md), 제출 문구는 [`docs/SUBMISSION.md`](docs/SUBMISSION.md)에 기록했다.
