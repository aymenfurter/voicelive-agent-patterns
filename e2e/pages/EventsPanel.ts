import type { Locator, Page } from '@playwright/test';

export class EventsPanel {
  readonly root: Locator;
  constructor(page: Page) {
    this.root = page.locator('[data-testid="events-panel"]');
  }
  text(text: string | RegExp) {
    return this.root.getByText(text);
  }
  firstTime() {
    return this.root.locator('.event-time').first();
  }
}
