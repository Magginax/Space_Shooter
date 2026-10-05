/**
 * Tracks which keys are currently held down.
 * Usage: `input.isDown('ArrowLeft')`. Call `destroy()` to remove listeners.
 */
export class Input {
  constructor(target = window) {
    this.target = target;
    this.keys = new Set();
    this.onKeyDown = (e) => this.keys.add(e.key);
    this.onKeyUp = (e) => this.keys.delete(e.key);
    this.onBlur = () => this.keys.clear(); // avoid "stuck" keys when the tab loses focus
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  isDown(...keys) {
    return keys.some((k) => this.keys.has(k));
  }

  destroy() {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }
}
