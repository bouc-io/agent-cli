import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Unit tests only. Anything needing a live agent server or a browser-based
    // Keycloak flow stays out of CI.
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
    reporters: ["default", "junit"],
    outputFile: {
      junit: "junit.xml",
    },
    coverage: {
      provider: "v8",
      // "cobertura" writes coverage/cobertura-coverage.xml, which the CI template
      // publishes as the merge-request coverage report.
      reporter: ["text", "cobertura"],
      reportsDirectory: "coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/types/**"],
    },
  },
});
