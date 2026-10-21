import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
      }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Prisma generated files — not hand-written, linting them is noise
    "lib/generated/prisma/**",
    // Saída compilada do MCP; o código TypeScript de src continua validado.
    "mcp-server/dist/**",
    // Key-generation script — not part of the app, already gitignored
    "gerar-chaves.js",
    // Node.js helper scripts — CJS files that intentionally use require()
    "scripts/**",
    // Microserviços têm seus próprios linters (eslint src) e tsconfigs separados.
    // O tsconfig.json raiz os exclui; tentar lintá-los aqui causa erros de parser.
    "auth-service/**",
    "api-gateway/**",
    "notification-service/**",
    "file-service/**",
    "project-service/**",
    "sprint-service/**",
    "prisma/**",
    // Cópias de trabalho do git (git worktree): não fazem parte deste projeto.
    ".worktrees/**",
  ]),
]);

export default eslintConfig;
