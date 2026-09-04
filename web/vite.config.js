import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages는 https://<user>.github.io/<repo>/ 아래에 배포되므로
// base를 저장소 이름으로 맞춰야 한다. 저장소 이름을 바꾸면 여기도 바꾼다.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || '/ai-visibility-check/',
});
