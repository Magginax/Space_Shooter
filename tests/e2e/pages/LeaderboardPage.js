const URL_PATH = '/views/leaderboard.html';

/** Page object for views/leaderboard.html. */
export class LeaderboardPage {
  constructor(page) {
    this.page = page;
  }

  async open() {
    await this.page.goto(URL_PATH);
  }
}
