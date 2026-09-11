# 현재 페이지 검사 확장 프로그램 (시험용)

Chrome에서 `chrome://extensions` → 개발자 모드 → 압축해제된 확장 프로그램 로드로 이 폴더를 선택합니다.

1. 쇼핑몰에서 사용자가 직접 로그인·성인인증을 완료합니다.
2. 검사할 메인·상품 페이지를 열고 확장 프로그램 아이콘을 누릅니다.
3. `현재 탭 읽기`를 누르면 제목, 설명, 헤딩, 이미지 alt, 가격 후보를 미리보기로 보여줍니다.

4. 내용을 확인한 뒤 `추출 결과로 점수 보기`를 누르면 검사 서버에 추출 정보를 전송하고 홈페이지에서 참고 결과를 보여줍니다. 회원 이력이나 일반 검사 점수에 합산되지 않습니다. 계정·주문 페이지에서는 사용하지 마세요.

팝업 소스는 이 폴더에서만 관리합니다. 저장소 루트의 manifest도 같은 팝업을 가리킵니다. 수정 후 이미 설치한 확장프로그램은 Chrome에서 새로고침해야 합니다.

ZIP을 갱신할 때 저장소 루트에서 PowerShell로 실행합니다.

```powershell
Compress-Archive -Path extension/manifest.json,extension/popup.html,extension/popup.css,extension/popup.js -DestinationPath ai-visibility-check-extension-connected.zip -Force
Copy-Item ai-visibility-check-extension-connected.zip web/public/ai-visibility-check-extension-connected.zip -Force
```

GitHub Pages 배포 워크플로도 같은 4개 파일로 ZIP을 새로 만듭니다.
