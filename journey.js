export const FOCUS_DURATION = 5000;

export class FocusChallenge {
  startedAt = null;
  complete = false;

  reset() {
    this.startedAt = null;
    this.complete = false;
  }

  interrupt(now) {
    if (!this.complete && this.startedAt !== null) this.startedAt = now;
  }

  update(now, active) {
    if (this.complete) return 1;
    if (!active) {
      this.startedAt = null;
      return 0;
    }
    if (this.startedAt === null) this.startedAt = now;
    // Input events can carry a timestamp newer than the current animation frame.
    const progress = Math.max(0, Math.min(1, (now - this.startedAt) / FOCUS_DURATION));
    this.complete = progress === 1;
    return progress;
  }
}

export function remainingSeconds(progress) {
  return Math.max(0, Math.min(5, Math.ceil(5 * (1 - progress))));
}

export class TrailFollower {
  constructor(position, gap = 80) {
    this.position = { ...position };
    this.points = [];
    this.gap = gap;
    this.moving = false;
    this.facingLeft = false;
  }

  record(point) {
    const previous = this.points.at(-1) ?? this.position;
    if (Math.hypot(point.x - previous.x, point.y - previous.y) >= 2) {
      this.points.push({ ...point });
    }
  }

  resize(xRatio, yRatio) {
    for (const point of [this.position, ...this.points]) {
      point.x *= xRatio;
      point.y *= yRatio;
    }
  }

  update(delta, speed) {
    let distance = 0;
    let previous = this.position;
    for (const point of this.points) {
      distance += Math.hypot(point.x - previous.x, point.y - previous.y);
      previous = point;
    }
    let budget = Math.min(Math.max(0, distance - this.gap), speed * delta);
    this.moving = budget > .25;
    while (budget > 0 && this.points.length) {
      const target = this.points[0];
      const dx = target.x - this.position.x;
      const dy = target.y - this.position.y;
      const length = Math.hypot(dx, dy);
      if (length < .01) {
        this.points.shift();
        continue;
      }
      const step = Math.min(length, budget);
      this.position.x += dx / length * step;
      this.position.y += dy / length * step;
      if (Math.abs(dx) > .5) this.facingLeft = dx < 0;
      budget -= step;
      if (step === length) this.points.shift();
    }
    return this.position;
  }
}

export function facingBetween(previous, next, width, chapterHeight, fallback = 'down') {
  const dx = (next.x - previous.x) * width;
  const dy = (next.y - previous.y) * chapterHeight;
  if (Math.abs(dx) + Math.abs(dy) < .1) return fallback;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}
