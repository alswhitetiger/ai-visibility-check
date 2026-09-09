# 실제 운영자 검증 준비

2026-09-09 사용자가 지정한 공식 URL의 비로그인 접근 검사. AI API 호출 및 운영자 연락 없음.
로그인·성인인증 화면은 채점하지 않음. 아래 값은 공개 HTML 검사이며 운영자 사용성 검증이나 개선 완료 사례가 아님.

```json
[
  {
    "name": "프로키베이프",
    "url": "https://m.frokyvape.com/index.html",
    "checkedAt": "2026-09-09T05:47:40.472Z",
    "error": "LOGIN_WALL",
    "version": "2026-09-09.1",
    "aiScore": null,
    "uxScore": null
  },
  {
    "name": "베이프두잇",
    "url": "https://www.vapedoit.com/",
    "checkedAt": "2026-09-09T05:47:40.579Z",
    "error": "LOGIN_WALL",
    "version": "2026-09-09.1",
    "aiScore": null,
    "uxScore": null
  },
  {
    "name": "프로키라이프",
    "url": "https://dearbody.cafe24.com/skin-base/index.html",
    "checkedAt": "2026-09-09T05:47:40.661Z",
    "error": null,
    "version": "2026-09-09.1",
    "aiScore": 47,
    "uxScore": 51
  }
]
```

다음 단계: 운영자가 직접 로그인한 뒤 안내에 따라 필요한 내용을 확인하고, 수정 가능한 공개 영역을 선정. 수정 전후 원본과 담당자 확인이 확보된 경우에만 개선 사례로 사용.
