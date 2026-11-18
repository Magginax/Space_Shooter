import { expect } from '@playwright/test';

const URL_PATH = '/views/error.html';

export class ErrorPage {
  constructor(page) {
    this.page = page;
    this.panel = page.getByTestId('error-panel');
    this.code = page.locator('#error-code');
    this.message = page.locator('#error-message');
    this.homeLink = page.getByTestId('error-home-link');
    this.retryButton = page.getByTestId('retry-button');
  }

  async open(type) {
    await this.page.goto(type ? `${URL_PATH}?type=${encodeURIComponent(type)}` : URL_PATH);
  }

  async openWith(type, code, message) {
    const params = new URLSearchParams({ type, code, msg: message });
    await this.page.goto(`${URL_PATH}?${params}`);
  }

  async expectErrorType(type) {
    await expect(this.panel).toHaveAttribute('data-error-type', type);
  }

  async expectCode(code) {
    await expect(this.code).toHaveText(code);
  }

  async expectMessage(message) {
    await expect(this.message).toHaveText(message);
  }

  async expectAction(text) {
    await expect(this.homeLink).toHaveText(text);
  }

  async expectRetryVisible(visible) {
    if (visible) await expect(this.retryButton).toBeVisible();
    else await expect(this.retryButton).toBeHidden();
  }

  async expectTitle(title) {
    await expect(this.page).toHaveTitle(title);
  }

  async expectLinkTo(path) {
    await expect(this.homeLink).toHaveAttribute('href', path);
  }
}
