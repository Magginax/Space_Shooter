/**
 * Tracks which keys are currently held down.
 * Usage: `input.isDown('ArrowLeft')`. `justPressed` is true for a keydown
 * until `drainPressed()`. A repeat keydown while the key is already down
 * does not count. Call `destroy()` to remove listeners.
 */
export class Input {
  constructor(target = window) {
    this.target = target;
    this.keys = new Set();
    /** @type {string[]} keydowns since the last drain, in order */
    this.pressed = [];
    this.onKeyDown = (e) => {
      if (this.keys.has(e.key)) return;
      this.keys.add(e.key);
      this.pressed.push(e.key);
      if (e.code === 'Backquote' && e.key !== '`' && e.key !== '~') this.pressed.push('`');
    };
    this.onKeyUp = (e) => this.keys.delete(e.key);
    this.onBlur = () => this.keys.clear(); // avoid "stuck" keys when the tab loses focus
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  isDown(...keys) {
    return keys.some((k) => this.keys.has(k));
  }

  justPressed(...keys) {
    return keys.some((key) => this.pressed.includes(key));
  }

  pressedKeys() {
    return this.pressed;
  }

  drainPressed() {
    this.pressed = [];
  }

  destroy() {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }
}
