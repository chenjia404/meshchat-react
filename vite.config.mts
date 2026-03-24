import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import legacy from "@vitejs/plugin-legacy";

// 通过环境变量配置后端地址，未设置时默认本机 127.0.0.1:19080
const API_TARGET = process.env.VITE_API_TARGET || "http://127.0.0.1:19080";

export default defineConfig({
  base: "./",
  plugins: [react(), legacy({ targets: ["defaults", "not IE 11"] })],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: API_TARGET,
        changeOrigin: true
      }
    }
  }
});


