import "./styles/game.css";
import { safeReturnPath } from "./services/redirect.js";
import { LcdScene } from "./effects/LcdScene.js";

const scene = new LcdScene(
  document.querySelector('[data-testid="lcd-canvas"]'),
);
scene.start();
