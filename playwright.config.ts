import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  // o servidor de desenvolvimento compila cada rota na primeira visita: dá mais folga às verificações para não gerar falha falsa
  expect: { timeout: 15_000 },
  workers: 1,
  use: { baseURL: 'http://localhost:3100' },
  webServer: { command: 'pnpm dev', url: 'http://localhost:3100/login', reuseExistingServer: true, timeout: 120_000 },
});
