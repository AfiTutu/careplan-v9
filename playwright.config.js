import fs from 'node:fs';
import { defineConfig } from '@playwright/test';

const systemChromium = '/usr/bin/chromium';
export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.e2e\.js/,
  timeout: 40_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'line',
  use: {
    headless: true,
    launchOptions: {
      ...(fs.existsSync(systemChromium) ? { executablePath: systemChromium } : {}),
      args: ['--no-sandbox', '--no-proxy-server', '--allow-file-access-from-files']
    }
  }
});
