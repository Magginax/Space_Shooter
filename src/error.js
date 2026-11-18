import "./styles/login.css";
import { LcdScene } from "./effects/LcdScene.js";

const baseUrl = import.meta.env.BASE_URL;

const ERROR_TYPES = {
  notFound: {
    code: "404",
    title: "404 - Space_Shooter",
    message: "Sector not found or transmission lost in deep space.",
    actionText: "RETURN TO BASE",
  },
  forbidden: {
    code: "403",
    title: "403 - Space_Shooter",
    message: "This sector requires a higher clearance level.",
    actionText: "RETURN TO BASE",
  },
  sessionExpired: {
    code: "401",
    title: "Session Expired - Space_Shooter",
    message: "Pilot authorization has expired. Log in to continue the mission.",
    actionText: "LOG IN",
    actionUrl: "views/login.html",
  },
  loginRequired: {
    code: "401",
    title: "Login Required - Space_Shooter",
    message: "This system requires an active pilot account.",
    actionText: "LOG IN",
    actionUrl: "views/login.html",
  },
  scoreRejected: {
    code: "400",
    title: "Score Not Accepted - Space_Shooter",
    message: "The flight record was invalid and could not be transmitted.",
    actionText: "RETURN TO BASE",
  },
  scoreConflict: {
    code: "409",
    title: "Score Conflict - Space_Shooter",
    message: "This result could not be saved. It may have already been transmitted.",
    actionText: "RETURN TO BASE",
  },
  leaderboardOffline: {
    code: "503",
    title: "Leaderboard Offline - Space_Shooter",
    message: "The leaderboard relay is offline. Scores can be tried again later.",
    actionText: "TRY AGAIN",
    retry: true,
  },
  rateLimited: {
    code: "429",
    title: "Systems Cooling Down - Space_Shooter",
    message: "Too many transmissions are in progress. Stand by before trying again.",
    actionText: "TRY AGAIN",
    retry: true,
  },
  offline: {
    code: "503",
    title: "503 - Space_Shooter",
    message: "The signal relay is offline. Try connecting again.",
    actionText: "TRY AGAIN",
    retry: true,
  },
  maintenance: {
    code: "503",
    title: "Maintenance - Space_Shooter",
    message: "Mission control is temporarily offline for maintenance.",
    actionText: "RETURN TO BASE",
  },
  generic: {
    code: "ERROR",
    title: "Error - Space_Shooter",
    message: "A system fault interrupted the mission.",
    actionText: "RETURN TO BASE",
  },
};

const canvas = document.querySelector('[data-testid="lcd-canvas"]');
if (canvas) {
  const scene = new LcdScene(canvas);
  scene.start();
}

const params = new URLSearchParams(window.location.search);
const pathType = window.location.pathname.endsWith("/404.html") ? "notFound" : null;
const type = params.get("type") ?? pathType ?? "generic";
const requestCode = params.get("code")?.trim();
const requestMessage = params.get("msg")?.trim();
const config = ERROR_TYPES[type] ?? ERROR_TYPES.generic;
const code = requestCode || config.code;
const message = requestMessage || config.message;

const codeNode = document.getElementById("error-code");
const messageNode = document.getElementById("error-message");
const homeLink = document.querySelector('[data-testid="error-home-link"]');
const retryButton = document.querySelector('[data-testid="retry-button"]');

if (codeNode) codeNode.textContent = code;
if (messageNode) messageNode.textContent = message;

const actionUrl = config.actionUrl ? new URL(config.actionUrl, window.location.origin + baseUrl).href : baseUrl;

if (homeLink) {
  homeLink.textContent = config.actionText ?? "RETURN TO BASE";
  homeLink.href = actionUrl;
}

if (retryButton) {
  retryButton.hidden = !config.retry;
  retryButton.addEventListener("click", () => window.location.reload());
}

const panel = document.querySelector('[data-testid="error-panel"]');
if (panel) panel.dataset.errorType = type;

document.title = config.title ?? "Error - Space_Shooter";
