import { useEffect, useRef } from 'react';

/**
 * Dark grid backdrop that lights up in electric blue under the cursor.
 *
 * Purely decorative: fixed, pointer-events-none and painted behind every panel,
 * so it never intercepts a click or a drag-drop onto the scanner.
 *
 * Behaviour:
 *  - a soft spotlight follows the pointer with eased interpolation
 *  - a tapered tail trails behind that light, drawn from recent positions
 *  - the light loses energy when the pointer stops, so a still cursor and a
 *    parked cursor both fade to nothing within a couple of seconds
 */
export function LiveBlueHoverBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const targetRef = useRef({ x: -1000, y: -1000, active: false });
  const smoothRef = useRef({ x: -1000, y: -1000 });
  const lastMoveRef = useRef(0);
  const vigorRef = useRef(0);
  const trailRef = useRef<Array<{ x: number; y: number }>>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cell = 44;
    const hoverRadius = 280;
    const maxTrail = 22;
    /** How long the light stays at full strength after the last movement. */
    const holdMs = 120;
    /** Then how long it takes to dim all the way down. */
    const fadeMs = 2200;

    let frame = 0;
    let fadeTimer = 0;
    let time = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    const onMove = (event: MouseEvent) => {
      targetRef.current = { x: event.clientX, y: event.clientY, active: true };
      lastMoveRef.current = performance.now();
      // With reduced motion there is no animation loop, so paint straight away
      // and step the fade with a timer rather than a frame callback.
      if (reduceMotion) {
        draw();
        if (!fadeTimer) fadeTimer = window.setInterval(draw, 120);
      }
    };
    const onLeave = () => {
      targetRef.current.active = false;
      if (reduceMotion) draw();
    };

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseleave', onLeave);

    const draw = () => {
      time += 0.015;
      context.clearRect(0, 0, canvas.width, canvas.height);

      // Ease the glow toward the pointer so the trail reads as a light source,
      // and drift it off-screen when the cursor leaves the window.
      const target = targetRef.current;
      const smooth = smoothRef.current;
      const goalX = target.active ? target.x : -1000;
      const goalY = target.active ? target.y : -1000;
      const easing = reduceMotion ? 1 : 0.14;
      smooth.x += (goalX - smooth.x) * easing;
      smooth.y += (goalY - smooth.y) * easing;

      // Energy: full while the pointer is moving, then a slow decay to zero, so
      // a cursor held at one spot stops lighting the page and the grid settles.
      const idle = performance.now() - lastMoveRef.current;
      const desiredVigor =
        !target.active || idle > holdMs + fadeMs
          ? 0
          : idle <= holdMs
            ? 1
            : 1 - (idle - holdMs) / fadeMs;
      // The frame loop eases so the light swells in; the timer-driven reduced
      // path has no frames to spare, so it tracks the value directly.
      vigorRef.current += (desiredVigor - vigorRef.current) * (reduceMotion ? 1 : 0.2);
      const vigor = vigorRef.current;

      const { x: mx, y: my } = smooth;

      // Record the eased position so the tail lags behind the pointer.
      if (reduceMotion) {
        trailRef.current.length = 0;
      } else if (vigor > 0.02 && mx > -500 && my > -500) {
        const trail = trailRef.current;
        const head = trail[0];
        if (!head || Math.hypot(head.x - mx, head.y - my) > 1.5) {
          trail.unshift({ x: mx, y: my });
          if (trail.length > maxTrail) trail.length = maxTrail;
        }
      } else if (trailRef.current.length > 0) {
        trailRef.current.pop();
      }

      if (vigor > 0.02 && mx > -500 && my > -500) {
        const spotlight = context.createRadialGradient(mx, my, 10, mx, my, hoverRadius * 1.35);
        spotlight.addColorStop(0, `rgba(37, 99, 235, ${0.24 * vigor})`);
        spotlight.addColorStop(0.45, `rgba(59, 130, 246, ${0.09 * vigor})`);
        spotlight.addColorStop(1, 'rgba(3, 7, 18, 0)');
        context.fillStyle = spotlight;
        context.fillRect(0, 0, canvas.width, canvas.height);

        drawTail(context, trailRef.current, vigor);
      }

      const cols = Math.ceil(canvas.width / cell) + 1;
      const rows = Math.ceil(canvas.height / cell) + 1;

      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const x = col * cell;
          const y = row * cell;
          const distance = Math.hypot(x - mx, y - my);

          if (vigor > 0.02 && distance < hoverRadius) {
            const intensity = Math.pow(1 - distance / hoverRadius, 1.6);

            if (intensity > 0.12) {
              context.fillStyle = `rgba(37, 99, 235, ${intensity * 0.14 * vigor})`;
              context.fillRect(x - cell / 2, y - cell / 2, cell - 2, cell - 2);
              context.strokeStyle = `rgba(59, 130, 246, ${intensity * 0.45 * vigor})`;
              context.lineWidth = 1;
              context.strokeRect(x - cell / 2, y - cell / 2, cell - 2, cell - 2);
            }
            // No dots inside the glow — the lit cells alone carry the highlight.
          } else {
            const wave = Math.sin(col * 0.35 + time) * Math.cos(row * 0.35 + time) * 0.5 + 0.5;
            context.beginPath();
            context.arc(x, y, 1.1, 0, Math.PI * 2);
            context.fillStyle = `rgba(148, 163, 184, ${0.06 + wave * 0.06})`;
            context.fill();
          }
        }
      }

      if (reduceMotion) {
        if (vigor < 0.02 && fadeTimer) {
          window.clearInterval(fadeTimer);
          fadeTimer = 0;
        }
      } else {
        frame = requestAnimationFrame(draw);
      }
    };

    draw();

    return () => {
      cancelAnimationFrame(frame);
      if (fadeTimer) window.clearInterval(fadeTimer);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0"
      style={{ background: 'radial-gradient(circle at 50% 15%, #0b1528 0%, #030712 75%)' }}
    />
  );
}

/**
 * Comet tail: the recent eased positions are stroked as a chain of segments that
 * thin, dim and narrow with age, so motion leaves a short blue streak behind it.
 */
function drawTail(
  context: CanvasRenderingContext2D,
  trail: Array<{ x: number; y: number }>,
  vigor: number,
) {
  if (trail.length < 2) return;

  context.save();
  context.lineCap = 'round';

  for (let index = trail.length - 1; index > 0; index -= 1) {
    const from = trail[index];
    const to = trail[index - 1];
    // 0 at the tail's end, 1 just behind the cursor.
    const progress = 1 - index / trail.length;
    const alpha = Math.pow(progress, 1.5) * 0.5 * vigor;
    if (alpha < 0.004) continue;

    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.strokeStyle = `rgba(96, 165, 250, ${alpha})`;
    context.lineWidth = 0.8 + progress * progress * 10;
    context.stroke();
  }

  // A brighter core right behind the pointer keeps the tail anchored to it.
  for (let index = 1; index < Math.min(trail.length, 7); index += 1) {
    const point = trail[index];
    const progress = 1 - index / 7;
    const radius = 1.2 + progress * 4;
    const alpha = Math.pow(progress, 2) * 0.55 * vigor;
    const glow = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius * 2.4);
    glow.addColorStop(0, `rgba(191, 219, 254, ${alpha})`);
    glow.addColorStop(1, 'rgba(59, 130, 246, 0)');
    context.fillStyle = glow;
    context.beginPath();
    context.arc(point.x, point.y, radius * 2.4, 0, Math.PI * 2);
    context.fill();
  }

  context.restore();
}
