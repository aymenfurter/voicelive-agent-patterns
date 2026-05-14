import type { Locator, Page } from '@playwright/test';

export class ProgressBoard {
  readonly root: Locator;
  readonly emptyMsg: Locator;
  readonly claimType: Locator;
  readonly firstField: Locator;
  readonly answeredField: Locator;
  readonly validatedField: Locator;
  constructor(page: Page) {
    this.root = page.locator('.progress-board');
    this.emptyMsg = page.locator('.pb-empty-msg');
    this.claimType = page.locator('.pb-claim-type');
    this.firstField = page.locator('.pb-field').first();
    this.answeredField = page.locator('.pb-field.pb-status--answered');
    this.validatedField = page.locator('.pb-field.pb-status--validated');
  }
}
