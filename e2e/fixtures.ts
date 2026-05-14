import { test as base } from '@playwright/test';
import { AppPage, type PatternId } from './pages/AppPage';
import type { WsEvent } from './builders/events';

export interface MockBackend {
  readonly sessionId: string;
  /** Set the pattern returned by the mocked POST /api/sessions. Call before `start()`. */
  setPattern(pattern: PatternId): void;
  /** Click Start Session and resolve once the WebSocket route is connected. */
  start(): Promise<void>;
  /** Send a WebSocket frame to the page (must be called after `start()`). */
  send(event: WsEvent): void;
}

type Fixtures = {
  mock: MockBackend;
  app: AppPage;
};

export const test = base.extend<Fixtures>({
  app: async ({ page }, use) => {
    await use(new AppPage(page));
  },

  mock: async ({ page }, use) => {
    const sessionId = `mock-${Date.now()}`;
    let pattern: PatternId = 'chat-supervisor';
    let wsSend: ((data: WsEvent) => void) | null = null;
    let resolveConnected!: () => void;
    const wsConnected = new Promise<void>((resolve) => {
      resolveConnected = resolve;
    });

    await page.routeWebSocket(/\/ws/, (ws) => {
      wsSend = (data) => ws.send(JSON.stringify(data));
      ws.onMessage(() => {});
      resolveConnected();
    });

    await page.route('**/api/sessions**', (route) => {
      const method = route.request().method();
      if (method === 'POST') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            session_id: sessionId,
            pattern,
            active_agent: pattern === 'sequential-handoff' ? 'greeter' : undefined,
          }),
        });
      } else if (method === 'DELETE') {
        route.fulfill({ status: 200, body: '{}' });
      } else {
        route.continue();
      }
    });

    await use({
      sessionId,
      setPattern: (p) => {
        pattern = p;
      },
      start: async () => {
        await page.click('[data-testid="start-session"]');
        await wsConnected;
      },
      send: (event) => {
        if (!wsSend) throw new Error('MockBackend.send called before start()');
        wsSend(event);
      },
    });
  },
});

export { expect } from '@playwright/test';
