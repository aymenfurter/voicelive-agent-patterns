import type { Locator, Page } from '@playwright/test';

export class TextModePanel {
  readonly toggle: Locator;
  readonly toggleCheckbox: Locator;
  readonly input: Locator;
  readonly send: Locator;
  constructor(page: Page) {
    this.toggle = page.locator('[data-testid="text-mode-toggle"]');
    this.toggleCheckbox = page.locator('[data-testid="text-mode-toggle"] input');
    this.input = page.locator('[data-testid="text-input"]');
    this.send = page.locator('[data-testid="text-send"]');
  }
  async enable() {
    await this.toggleCheckbox.check();
  }
  async sendMessage(text: string) {
    await this.input.fill(text);
    await this.send.click();
  }
}
