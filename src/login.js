import './styles/login.css';
import { auth, isAuthConfigured, playAsGuest, leaveGuestMode } from './services/account.js';
import { validateCredentials, validateUsername, validatePassword } from './services/auth.js';
import { safeReturnPath } from './services/redirect.js';
import { LcdScene } from './effects/LcdScene.js';

const panel = document.querySelector('[data-testid="login"]');
const title = document.querySelector('#login-title');
const status = document.querySelector('[data-testid="login-status"]');
const modes = document.querySelector('[data-testid="modes"]');
const modeButtons = modes.querySelectorAll('[data-mode]');
const form = document.querySelector('[data-testid="login-form"]');
const usernameInput = document.querySelector('#username');
const passwordInput = document.querySelector('#password');
const submitButton = document.querySelector('[data-testid="submit-button"]');
const guestButton = document.querySelector('[data-testid="guest-button"]');
const playerCard = document.querySelector('[data-testid="player-card"]');
const playerName = document.querySelector('[data-testid="player-name"]');
const playerRole = document.querySelector('[data-testid="player-role"]');
const playLink = document.querySelector('[data-testid="play-link"]');
const profileButton = document.querySelector('[data-testid="profile-button"]');
const logoutButton = document.querySelector('[data-testid="logout-button"]');
const profile = document.querySelector('[data-testid="profile"]');
const renameForm = document.querySelector('[data-testid="rename-form"]');
const newUsernameInput = document.querySelector('#new-username');
const passwordForm = document.querySelector('[data-testid="password-form"]');
const currentPasswordInput = document.querySelector('#current-password');
const newPasswordInput = document.querySelector('#new-password');
const profileBackButton = document.querySelector('[data-testid="profile-back"]');
const screen = document.querySelector('[data-testid="screen"]');
const banner = document.querySelector('[data-testid="banner"]');

const scene = new LcdScene(document.querySelector('[data-testid="lcd-canvas"]'));
scene.start();

// Where to go after logging in: the page that sent the player here (?next=...),
// but only if it is on this site, see safeReturnPath().
const returnPath = safeReturnPath(new URLSearchParams(location.search).get('next'), location.origin);
const gamePath = returnPath ?? new URL('../#game', location.href).pathname + '#game';
const RETURN_DELAY_MS = 1500; // long enough to enjoy "STAGE CLEAR"
playLink.href = gamePath;

const SUBMIT_LABELS = { login: 'PRESS START', register: 'NEW GAME' };
const TITLES = { form: 'INSERT COIN', player: 'PILOT READY', profile: 'PILOT PROFILE' };
let mode = 'login';

/** `state` goes to data-state ("idle" | "loading" | "error" | "offline" | "signed-in") for tests. */
function setState(state, message = '') {
  panel.dataset.state = state;
  status.textContent = message;
  status.hidden = message === '';
}

/** Shows one of the three parts of the panel: "form", "player" or "profile". */
function showView(view) {
  panel.dataset.view = view;
  title.textContent = TITLES[view];
  modes.hidden = view !== 'form';
  form.hidden = view !== 'form';
  playerCard.hidden = view !== 'player';
  profile.hidden = view !== 'profile';
}

function setMode(next) {
  mode = next;
  for (const button of modeButtons) button.setAttribute('aria-pressed', String(button.dataset.mode === next));
  submitButton.textContent = SUBMIT_LABELS[next];
  // Tells password managers whether to fill in a saved password or offer a new one.
  passwordInput.autocomplete = next === 'login' ? 'current-password' : 'new-password';
  setState('idle');
}

/** A big blinking word across the LCD for a moment ("STAGE CLEAR", "GAME OVER"). */
function showBanner(text, seconds = 2.4) {
  banner.textContent = text;
  banner.hidden = false;
  clearTimeout(showBanner.timer);
  showBanner.timer = setTimeout(() => (banner.hidden = true), seconds * 1000);
}

function shakeScreen() {
  screen.classList.remove('shake');
  void screen.offsetWidth; // forces the browser to notice the removal, so the animation can restart
  screen.classList.add('shake');
}

function showPlayer(player, message = '') {
  playerName.textContent = player.username;
  playerRole.textContent = player.role.toUpperCase();
  showView('player');
  setState('signed-in', message);
}

/** Wrong password: one heart less. With no hearts left: "GAME OVER" and they refill. */
function loseLife() {
  shakeScreen();
  if (scene.loseLife() === 0) {
    showBanner('GAME OVER');
    setTimeout(() => scene.refillLives(), 2400);
  }
}

/** Runs a server call with a loading message; errors are shown in the status line. */
async function run(button, loadingText, action) {
  setState('loading', loadingText);
  button.disabled = true;
  try {
    await action();
  } catch (error) {
    console.error(error);
    setState('error', error.message);
    if (error.code === 'invalid_credentials') loseLife();
  } finally {
    button.disabled = false;
  }
}

/** Checks input before anything is sent; shows the problem and returns null. */
function checked(check) {
  try {
    return check();
  } catch (error) {
    setState('error', error.message);
    return null;
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const credentials = checked(() =>
    validateCredentials({ username: usernameInput.value, password: passwordInput.value }),
  );
  if (!credentials) return;
  if (!isAuthConfigured) {
    setState('offline', 'LOGIN OFFLINE');
    return;
  }

  run(submitButton, mode === 'login' ? 'CONNECTING...' : 'CREATING PILOT...', async () => {
    const player = mode === 'login' ? await auth.signIn(credentials) : await auth.signUp(credentials);
    passwordInput.value = '';
    leaveGuestMode(); // a real login replaces guest mode
    scene.defeatBoss();
    showBanner('STAGE CLEAR');
    showPlayer(player, returnPath ? 'RETURNING TO GAME...' : '');
    if (returnPath) setTimeout(() => location.assign(returnPath), RETURN_DELAY_MS);
  });
});

guestButton.addEventListener('click', () => {
  playAsGuest();
  location.assign(gamePath);
});

for (const button of modeButtons) {
  button.addEventListener('click', () => setMode(button.dataset.mode));
}

// Every typed character fires a shot. Deleting does not.
for (const input of panel.querySelectorAll('input')) {
  input.addEventListener('input', (event) => {
    if (event.inputType?.startsWith('insert')) scene.fire();
  });
}

// The A/B buttons on the console fire too, just for fun.
for (const button of document.querySelectorAll('[data-fire]')) {
  button.addEventListener('pointerdown', () => scene.fire());
}

logoutButton.addEventListener('click', () => {
  run(logoutButton, 'LOGGING OUT...', async () => {
    await auth.signOut();
    leaveGuestMode();
    scene.respawnBoss();
    showView('form');
    setState('idle');
    usernameInput.focus();
  });
});

// ---------- Profile management ----------

profileButton.addEventListener('click', () => {
  showView('profile');
  setState('signed-in');
  newUsernameInput.focus();
});

profileBackButton.addEventListener('click', () => {
  showView('player');
  setState('signed-in');
});

renameForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const newName = checked(() => validateUsername(newUsernameInput.value));
  if (!newName) return;

  run(renameForm.querySelector('button'), 'RENAMING...', async () => {
    const player = await auth.changeUsername(newName);
    playerName.textContent = player.username;
    newUsernameInput.value = '';
    setState('signed-in', `PILOT ID CHANGED TO ${player.username}`);
  });
});

passwordForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const newPassword = checked(() => validatePassword(newPasswordInput.value));
  if (!newPassword) return;

  run(passwordForm.querySelector('button'), 'SAVING...', async () => {
    await auth.changePassword({ currentPassword: currentPasswordInput.value, newPassword });
    currentPasswordInput.value = '';
    newPasswordInput.value = '';
    setState('signed-in', 'PASSCODE CHANGED');
  });
});

// All handlers are attached: the forms may be sent now (they start disabled in
// the HTML, so nobody can send them before this script runs).
for (const button of panel.querySelectorAll('button[type="submit"]')) button.disabled = false;

// Already logged in from an earlier visit? Show the pilot instead of the form.
showView('form');
if (isAuthConfigured) {
  auth
    .getCurrentPlayer()
    .then((player) => player && showPlayer(player))
    .catch((error) => console.error(error));
}
