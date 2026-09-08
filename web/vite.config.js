import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages는 https://<user>.github.io/<repo>/ 아래에 배포되므로
// base를 저장소 이름으로 맞춰야 한다. 저장소 이름을 바꾸면 여기도 바꾼다.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || '/ai-visibility-check/',
  // JS/CSS 는 파일명에 해시가 붙어 갱신되지만 public/data/*.json 은 주소가 그대로라
  // 재방문자에게 낡은 수치가 남는다. 빌드마다 바뀌는 값을 쿼리로 붙여 무효화한다.
  define: {
    __BUILD_ID__: JSON.stringify(Date.now().toString(36)),
  },
});
