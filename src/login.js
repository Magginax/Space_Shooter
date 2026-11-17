import "./styles/login.css";
import {
  auth,
  isAuthConfigured,
  playAsGuest,
  leaveGuestMode,
} from "./services/account.js";
import {
  validateCredentials,
  validateUsername,
  validatePassword,
} from "./services/auth.js";
import { safeReturnPath } from "./services/redirect.js";
import { LcdScene } from "./effects/LcdScene.js";

const panel = document.querySelector(".login-container");
const title = document.querySelector("#stateTitle");
const status = document.querySelector('[data-testid="login-status"]');
const prevBtn = document.querySelector("#prevBtn");
const nextBtn = document.querySelector("#nextBtn");
const panels = document.querySelectorAll(".login-form, .state-panel"); // Covers all 3 states

// Elements specific to forms and player state
const forms = document.querySelectorAll(".login-form");
const usernameInputs = document.querySelectorAll('input[name="username"]');
const passwordInputs = document.querySelectorAll('input[name="password"]');

const screen = document.querySelector('[data-testid="screen"]');
const banner = document.querySelector('[data-testid="banner"]');

const scene = new LcdScene(
  document.querySelector('[data-testid="lcd-canvas"]'),
);
scene.start();

// Where to go after logging in: the page that sent the player here (?next=...),
// but only if it is on this site, see safeReturnPath().
const returnPath = safeReturnPath(
  new URLSearchParams(location.search).get("next"),
  location.origin,
);
const gamePath =
  returnPath ?? new URL("../#game", location.href).pathname + "#game";
const RETURN_DELAY_MS = 1500; // long enough to enjoy "STAGE CLEAR"

// Update guest link href directly
const playLink = document.querySelector('a[href*="./views/game.html"]');
if (playLink) playLink.href = gamePath;

let currentIndex = 0;
let currentMode = "guest"; // 'guest' | 'login' | 'new-pilot'

/** `state` goes to data-state ("idle" | "loading" | "error" | "offline" | "signed-in") for tests. */
function setState(state, message = "") {
  panel.dataset.state = state;
  status.textContent = message;
  status.hidden = message === "";
}

/** Updates panel visibility based on the state index */
function updateState(newIndex) {
  currentIndex = (newIndex + panels.length) % panels.length;

  panels.forEach((panelElement, index) => {
    panelElement.classList.toggle("active", index === currentIndex);
  });

  const activeTitle = panels[currentIndex].dataset.title;
  title.textContent = activeTitle;

  if (activeTitle === "Guest") {
    currentMode = "guest";
  } else if (activeTitle === "Login") {
    currentMode = "login";
  } else if (activeTitle === "New pilot") {
    currentMode = "new-pilot";
  }
  setState("idle");
}

prevBtn.addEventListener("click", () => updateState(currentIndex - 1));
nextBtn.addEventListener("click", () => updateState(currentIndex + 1));

/** A big blinking word across the LCD for a moment ("STAGE CLEAR", "GAME OVER"). */
function showBanner(text, seconds = 2.4) {
  banner.textContent = text;
  banner.hidden = false;
  clearTimeout(showBanner.timer);
  showBanner.timer = setTimeout(() => (banner.hidden = true), seconds * 1000);
}

function shakeScreen() {
  if (!screen) return;
  screen.classList.remove("shake");
  void screen.offsetWidth; // forces the browser to notice the removal, so the animation can restart
  screen.classList.add("shake");
}

/** Wrong password: one heart less. With no hearts left: "GAME OVER" and they refill. */
function loseLife() {
  shakeScreen();
  if (scene.loseLife() === 0) {
    showBanner("GAME OVER");
    setTimeout(() => scene.refillLives(), 2400);
  }
}

/** Runs a server call with a loading message; errors are shown in the status line. */
async function run(button, loadingText, action) {
  setState("loading", loadingText);
  button.disabled = true;
  try {
    await action();
  } catch (error) {
    console.error(error);
    setState("error", error.message);
    if (error.code === "invalid_credentials") loseLife();
  } finally {
    button.disabled = false;
  }
}

/** Checks input before anything is sent; shows the problem and returns null. */
function checked(check) {
  try {
    return check();
  } catch (error) {
    setState("error", error.message);
    return null;
  }
}

// Bind submission handling for both Login and New Pilot forms
forms.forEach((form) => {
  if (form.dataset.title == "Guest") return;

  const submitButton = form.querySelector('button[type="submit"]');
  const usernameInput = form.querySelector('input[name="username"]');
  const passwordInput = form.querySelector('input[name="password"]');

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const credentials = checked(() =>
      validateCredentials({
        username: usernameInput.value,
        password: passwordInput.value,
      }),
    );
    if (!credentials) return;
    if (!isAuthConfigured) {
      setState("offline", "LOGIN OFFLINE");
      return;
    }

    const isLogin = form.dataset.title === "Login";

    run(
      submitButton,
      isLogin ? "CONNECTING..." : "CREATING PILOT...",
      async () => {
        const player = isLogin
          ? await auth.signIn(credentials)
          : await auth.signUp(credentials);
        passwordInput.value = "";
        leaveGuestMode(); // a real login replaces guest mode
        scene.defeatBoss();
        showBanner("STAGE CLEAR");
        setState("signed-in", returnPath ? "RETURNING TO GAME..." : "");
        if (returnPath)
          setTimeout(() => location.assign(returnPath), RETURN_DELAY_MS);
      },
    );
  });
});

// Every typed character fires a shot. Deleting does not.
for (const input of panel.querySelectorAll("input")) {
  input.addEventListener("input", (event) => {
    if (event.inputType?.startsWith("insert")) scene.fire();
  });
}

// The A/B buttons on the console fire too, just for fun.
for (const button of document.querySelectorAll("[data-fire]")) {
  button.addEventListener("pointerdown", () => scene.fire());
}

// All handlers are attached: enable submit buttons
for (const button of panel.querySelectorAll('button[type="submit"]')) {
  button.disabled = false;
}

// Initial state initialization
updateState(0);
