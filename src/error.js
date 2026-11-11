import "./styles/game.css";
import { safeReturnPath } from "./services/redirect.js";
import { LcdScene } from "./effects/LcdScene.js";

const scene = new LcdScene(
  document.querySelector('[data-testid="lcd-canvas"]'),
);
scene.start();

const params = new URLSearchParams(window.location.search);
const code = params.get("code");
const msg = params.get("msg");

if (code) {
  document.getElementById("error-code").textContent = code;
}
if (msg) {
  document.getElementById("error-message").textContent =
    decodeURIComponent(msg);
}
