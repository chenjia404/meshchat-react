import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { viteSingleFile } from "vite-plugin-singlefile";
import legacy from "@vitejs/plugin-legacy";

// 透過環境變數配置後端地址，沒有就預設到本機 127.0.0.1:19082
const API_TARGET = process.env.VITE_API_TARGET || "http://127.0.0.1:19080";

export default defineConfig({
  base: "./",
  plugins: [react(), viteSingleFile(), legacy({ targets: ["defaults", "not IE 11"] })],
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


