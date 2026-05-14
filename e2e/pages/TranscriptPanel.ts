import type { Locator, Page } from '@playwright/test';

export class TranscriptPanel {
  readonly root: Locator;
  readonly typingIndicator: Locator;
  readonly firstMessage: Locator;
  constructor(page: Page) {
    this.root = page.locator('[data-testid="transcript-panel"]');
    this.typingIndicator = page.locator('.typing-indicator');
    this.firstMessage = this.root.locator('.message').first();
  }
  text(text: string | RegExp) {
    return this.root.getByText(text);
  }
}
