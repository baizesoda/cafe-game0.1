import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// root 保持仓库根目录，这样 content/ 与 story/ 的 JSON 能被 import.meta.glob('/content/...') 直接扫到，
// 轨道 1、2 新增数据文件后无需改动任何游戏代码。
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
  server: { host: true },
});
