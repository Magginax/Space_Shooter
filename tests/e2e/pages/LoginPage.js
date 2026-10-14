import { expect } from '@playwright/test';
import { PASSWORD } from '../support/FakeSupabase.js';

const URL_PATH = '/views/login.html';
const RETURN_DELAY_MS = 1500; // same as in src/login.js

/** Page object for views/login.html: login, sign-up, guest mode and the profile. */
export class LoginPage {
  constructor(page) {
    this.page = page;
    this.errors = [];
    page.on('pageerror', (error) => this.errors.push(error.message));

    this.panel = page.getByTestId('login');
    this.status = page.getByTestId('login-status');
    this.lcd = page.getByTestId('lcd-canvas');
    this.banner = page.getByTestId('banner');
    this.backLink = page.getByRole('link', { name: '< BACK' });

    this.newPilotButton = page.getByRole('button', { name: 'NEW PILOT' });
    this.form = page.getByTestId('login-form');
    this.username = page.getByLabel('PILOT ID', { exact: true });
    this.password = page.getByLabel('PASSCODE', { exact: true });
    this.submitButton = page.getByTestId('submit-button');
    this.guestButton = page.getByTestId('guest-button');

    this.playerCard = page.getByTestId('player-card');
    this.playerName = page.getByTestId('player-name');
    this.playerRole = page.getByTestId('player-role');
    this.playLink = page.getByTestId('play-link');
    this.profileButton = page.getByTestId('profile-button');
    this.logoutButton = page.getByTestId('logout-button');

    this.currentPassword = page.getByLabel('CURRENT PASSCODE');
    this.newPassword = page.getByLabel('NEW PASSCODE');
    this.changePasswordButton = page.getByRole('button', { name: 'CHANGE PASSCODE' });
  }

  // --- Actions ------------------------------------------------------------------

  /** `next` = where the page should return after login (?next=...). */
  async open({ next } = {}) {
    await this.page.goto(next ? `${URL_PATH}?next=${encodeURIComponent(next)}` : URL_PATH);
  }

  async reload() {
    await this.page.reload();
  }

  async logIn(username = 'ace_pilot', password = PASSWORD) {
    await this.username.fill(username);
    await this.password.fill(password);
    await this.submitButton.click();
  }

  /** Sends the form again with what is already filled in. */
  async submitAgain() {
    await this.submitButton.click();
  }

  async switchToRegister() {
    await this.newPilotButton.click();
  }

  async register(username, password = PASSWORD) {
    await this.switchToRegister();
    await this.logIn(username, password);
  }

  async playAsGuest() {
    await this.guestButton.click();
  }

  async logOut() {
    await this.logoutButton.click();
  }

  async goBack() {
    await this.backLink.click();
  }

  /** Types like a person, key by key (every key makes the ship fire). */
  async typeUsernameSlowly(text) {
    await this.username.pressSequentially(text, { delay: 30 });
  }

  /** The LCD scene must survive a window resize. */
  async resizeWindow(width, height) {
    await this.page.setViewportSize({ width, height });
  }

  async letSceneRun(milliseconds = 1500) {
    await this.page.waitForTimeout(milliseconds);
  }

  /** Waits longer than the page would wait before returning to ?next=. */
  async waitLongerThanReturnDelay() {
    await this.page.waitForTimeout(RETURN_DELAY_MS + 500);
  }

  async openProfile() {
    await this.profileButton.click();
  }

  async changePassword(currentPassword, newPassword) {
    await this.currentPassword.fill(currentPassword);
    await this.newPassword.fill(newPassword);
    await this.changePasswordButton.click();
  }

  // --- Checks -------------------------------------------------------------------

  async expectLoaded() {
    await expect(this.page).toHaveTitle('Login - Space_Shooter');
  }

  /** data-state of the panel: "idle", "loading", "error", "offline" or "signed-in". */
  async expectState(state) {
    await expect(this.panel).toHaveAttribute('data-state', state);
  }

  async expectStatus(text) {
    await expect(this.status).toHaveText(text);
  }

  async expectBanner(text) {
    await expect(this.banner).toHaveText(text);
  }

  async expectLives(lives, { timeout } = {}) {
    await expect(this.lcd).toHaveAttribute('data-lives', String(lives), { timeout });
  }

  /** "animated", or "static" with reduced motion. */
  async expectScene(state) {
    await expect(this.lcd).toHaveAttribute('data-state', state);
  }

  async expectLoginForm() {
    await expect(this.form).toBeVisible();
    await expect(this.username).toBeVisible();
    await expect(this.password).toHaveAttribute('type', 'password');
    await expect(this.playerCard).toBeHidden();
  }

  async expectRegisterMode() {
    await expect(this.newPilotButton).toHaveAttribute('aria-pressed', 'true');
    // Tells password managers to offer a new password.
    await expect(this.password).toHaveAttribute('autocomplete', 'new-password');
  }

  async expectSignedInAs(username, role) {
    await this.expectState('signed-in');
    await expect(this.playerName).toHaveText(username);
    await expect(this.playerRole).toHaveText(role);
    await expect(this.form).toBeHidden();
  }

  async expectProfileOpen() {
    await expect(this.panel).toHaveAttribute('data-view', 'profile');
  }

  async expectPasswordFieldsCleared() {
    await expect(this.currentPassword).toHaveValue('');
    await expect(this.newPassword).toHaveValue('');
  }

  async expectReturnAddressToGame() {
    await expect(this.page).toHaveURL(/\/views\/login\.html\?next=%2F%23game$/);
  }

  async expectStillHere() {
    await expect(this.page).toHaveURL(/\/views\/login\.html/);
  }

  async expectPlayLinkTo(href) {
    await expect(this.playLink).toHaveAttribute('href', href);
  }

  expectPasswordNotInAddress(password) {
    expect(this.page.url()).not.toContain(password);
  }

  expectNoPageErrors() {
    expect(this.errors).toEqual([]);
  }
}
