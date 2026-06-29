import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom", // parse.ts가 DOMParser를 쓰므로 jsdom 필요
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
