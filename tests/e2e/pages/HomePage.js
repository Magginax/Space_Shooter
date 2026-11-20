import { expect } from '@playwright/test';

/** Page object for index.html: the site header and the about section. */
export class HomePage {
  constructor(page) {
    this.page = page;
    this.heading = page.getByRole('heading', { level: 1 });
    this.gameLink = page.getByRole('link', { name: 'Game' });
  }

  // --- Actions ------------------------------------------------------------------

  async open() {
    await this.page.goto('/');
  }

  /** Clicks a link in the header navigation ("About", "Game", "Leaderboard", "Login"). */
  async clickNav(name) {
    await this.page.getByRole('link', { name }).click();
  }

  // --- Checks -------------------------------------------------------------------

  async expectLoaded() {
    await expect(this.page).toHaveTitle('Space_Shooter');
    await expect(this.heading).toHaveText('Space_Shooter');
  }

  async expectGameLink() {
    await expect(this.gameLink).toHaveAttribute('href', './views/game.html');
  }
}
