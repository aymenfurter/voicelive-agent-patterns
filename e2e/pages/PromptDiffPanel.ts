import type { Locator, Page } from '@playwright/test';

export class PromptDiffPanel {
  readonly toggle: Locator;
  readonly content: Locator;
  readonly firstTimelineItem: Locator;
  readonly count: Locator;
  constructor(page: Page) {
    this.toggle = page.locator('[data-testid="prompt-diff-toggle"]');
    this.content = page.locator('.prompt-diff-pre');
    this.firstTimelineItem = page.locator('.prompt-timeline-item').first();
    this.count = page.locator('.prompt-diff-count');
  }
  async expand() {
    await this.toggle.click();
  }
}
