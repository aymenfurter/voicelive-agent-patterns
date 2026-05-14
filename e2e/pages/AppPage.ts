import type { Locator, Page } from '@playwright/test';
import { EventsPanel } from './EventsPanel';
import { TranscriptPanel } from './TranscriptPanel';
import { ProgressBoard } from './ProgressBoard';
import { PromptDiffPanel } from './PromptDiffPanel';
import { TextModePanel } from './TextModePanel';

export type PatternId = 'chat-supervisor' | 'sequential-handoff';

export class AppPage {
  readonly startSession: Locator;
  readonly endSession: Locator;
  readonly connectionStatus: Locator;
  readonly statusBar: Locator;
  readonly events: EventsPanel;
  readonly transcript: TranscriptPanel;
  readonly progressBoard: ProgressBoard;
  readonly promptDiff: PromptDiffPanel;
  readonly textMode: TextModePanel;

  constructor(readonly page: Page) {
    this.startSession = page.locator('[data-testid="start-session"]');
    this.endSession = page.locator('[data-testid="end-session"]');
    this.connectionStatus = page.locator('[data-testid="connection-status"]');
    this.statusBar = page.locator('[data-testid="status-bar"]');
    this.events = new EventsPanel(page);
    this.transcript = new TranscriptPanel(page);
    this.progressBoard = new ProgressBoard(page);
    this.promptDiff = new PromptDiffPanel(page);
    this.textMode = new TextModePanel(page);
  }

  async goto() {
    await this.page.goto('/');
  }

  patternTab(pattern: PatternId) {
    return this.page.locator(`[data-testid="tab-${pattern}"]`);
  }

  async selectPattern(pattern: PatternId) {
    await this.patternTab(pattern).click();
  }

  async openStateTab() {
    await this.page.locator('.center-tab', { hasText: 'State' }).click();
  }
}
