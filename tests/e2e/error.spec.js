import { test } from './fixtures.js';

test.describe('Error page', () => {
  test('shows a session-expired state and login action', async ({ errorPage }) => {
    await errorPage.open('sessionExpired');

    await errorPage.expectErrorType('sessionExpired');
    await errorPage.expectTitle('Session Expired - Space_Shooter');
    await errorPage.expectCode('401');
    await errorPage.expectMessage('Pilot authorization has expired. Log in to continue the mission.');
    await errorPage.expectAction('LOG IN');
    await errorPage.expectRetryVisible(false);
    await errorPage.expectScene('sessionExpired');
  });

  test('shows an offline state with retry', async ({ errorPage }) => {
    await errorPage.open('offline');

    await errorPage.expectErrorType('offline');
    await errorPage.expectCode('503');
    await errorPage.expectAction('RETURN TO BASE');
    await errorPage.expectRetryVisible(true);
  });

  test('shows score and rate-limit states', async ({ errorPage }) => {
    await errorPage.open('scoreConflict');
    await errorPage.expectCode('409');
    await errorPage.expectAction('RETURN TO BASE');

    await errorPage.open('rateLimited');
    await errorPage.expectCode('429');
    await errorPage.expectRetryVisible(true);
  });

  test('a 500 shows the core malfunction with retry', async ({ errorPage }) => {
    await errorPage.open('serverError');

    await errorPage.expectCode('500');
    await errorPage.expectTitle('Core Malfunction - Space_Shooter');
    await errorPage.expectRetryVisible(true);
    await errorPage.expectScene('serverError');
  });

  test('every scene draws without script errors', async ({ errorPage }) => {
    const scenes = ['notFound', 'forbidden', 'sessionExpired', 'loginRequired', 'scoreRejected', 'scoreConflict', 'rateLimited', 'serverError', 'offline', 'leaderboardOffline', 'maintenance'];
    for (const scene of scenes) {
      await errorPage.open(scene);
      await errorPage.expectScene(scene);
    }
    await errorPage.expectNoScriptErrors();
  });

  test('unknown types fall back to generic', async ({ errorPage }) => {
    await errorPage.open('unknownType');

    await errorPage.expectErrorType('unknownType');
    await errorPage.expectCode('ERROR');
    await errorPage.expectMessage('A system fault interrupted the mission.');
    await errorPage.expectScene('generic');
  });

  test('missing pages show 404 with a way home', async ({ errorPage }) => {
    await errorPage.openMissingPage();

    await errorPage.expectHttpStatus(404);
    await errorPage.expectErrorType('notFound');
    await errorPage.expectCode('404');
    await errorPage.expectLinkTo('/');
    await errorPage.expectScene('notFound');
  });

  test('code and message query values override defaults', async ({ errorPage }) => {
    await errorPage.openWith('generic', '418', 'The ship cannot pass this checkpoint.');

    await errorPage.expectCode('418');
    await errorPage.expectMessage('The ship cannot pass this checkpoint.');
  });

});
