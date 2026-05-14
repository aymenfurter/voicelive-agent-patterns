import { defineConfig } from '@playwright/test';
import path from 'path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000';
const MOCK_PORT = 4173;

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    launchOptions: {
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        `--use-file-for-fake-audio-capture=${path.resolve(__dirname, 'fixtures/speech.wav')}`,
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  },
  projects: [
    {
      name: 'mock',
      testMatch: /mock\..+\.spec\.ts/,
      use: {
        baseURL: `http://localhost:${MOCK_PORT}`,
        permissions: ['microphone'],
        launchOptions: {
          args: [
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
            '--autoplay-policy=no-user-gesture-required',
          ],
        },
      },
    },
    {
      name: 'live',
      testMatch: /live\..+\.spec\.ts/,
    },
  ],
  webServer: {
    command: `npx serve ${path.resolve(__dirname, '../frontend/dist')} -l ${MOCK_PORT} -s --no-clipboard`,
    port: MOCK_PORT,
    reuseExistingServer: true,
    timeout: 15_000,
  },
});
