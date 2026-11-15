import React, { useEffect, useRef } from 'react';
import lunarLimbImg from '../assets/images/lunar_limb_backdrop_1794599012640.jpg';

interface LunarAmbientBackdropProps {
  motionReduced: boolean;
  presentationMode?: boolean;
}

interface Star {
  xFrac: number;
  yFrac: number;
  layer: number; // 0 = far, 1 = mid, 2 = near
  radius: number;
  baseAlpha: number;
  twinklePhase: number;
  twinkles: boolean;
}

interface ShootingStar {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

export const LunarAmbientBackdrop: React.FC<LunarAmbientBackdropProps> = ({
  motionReduced,
  presentationMode = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Deterministic starfield (3 depth layers, low density)
    let seed = 918273;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    const stars: Star[] = Array.from({ length: 135 }, () => {
      const layer = Math.floor(rand() * 3);
      return {
        xFrac: rand(),
        yFrac: rand(),
        layer,
        radius: layer === 0 ? 0.6 : layer === 1 ? 0.95 : 1.3,
        baseAlpha: layer === 0 ? 0.25 : layer === 1 ? 0.42 : 0.65,
        twinklePhase: rand() * Math.PI * 2,
        twinkles: rand() < 0.18,
      };
    });

    let width = window.innerWidth;
    let height = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let scrollY = window.scrollY;
    let shooter: ShootingStar | null = null;
    let nextShooterAt = performance.now() + 5000 + rand() * 8000;
    let rafId = 0;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const onScroll = () => {
      scrollY = window.scrollY;
    };

    resize();
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });

    const drawStatic = () => {
      ctx.clearRect(0, 0, width, height);
      for (const s of stars) {
        ctx.fillStyle = `rgba(201, 232, 255, ${s.baseAlpha})`;
        ctx.beginPath();
        ctx.arc(s.xFrac * width, s.yFrac * height, s.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    if (motionReduced) {
      drawStatic();
      return () => {
        window.removeEventListener('resize', resize);
        window.removeEventListener('scroll', onScroll);
      };
    }

    let lastTime = performance.now();
    const render = (now: number) => {
      if (document.hidden) {
        lastTime = now;
        rafId = requestAnimationFrame(render);
        return;
      }

      const dt = Math.min(0.08, (now - lastTime) / 1000);
      lastTime = now;

      ctx.clearRect(0, 0, width, height);

      for (const s of stars) {
        const parallaxOffset = ((scrollY * (0.015 + s.layer * 0.02)) % height);
        const y = (s.yFrac * height - parallaxOffset + height) % height;
        const alpha = s.twinkles
          ? s.baseAlpha * (0.65 + 0.35 * Math.sin(now * 0.0018 + s.twinklePhase))
          : s.baseAlpha;
        ctx.fillStyle = s.layer === 2 ? `rgba(201, 232, 255, ${alpha})` : `rgba(184, 186, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(s.xFrac * width, y, s.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Single occasional thin shooting star restricted to upper edge/corner
      if (!shooter && now >= nextShooterAt && !presentationMode) {
        const startX = width * (0.55 + Math.random() * 0.38);
        const startY = height * (0.04 + Math.random() * 0.12);
        shooter = {
          x: startX,
          y: startY,
          vx: -380 - Math.random() * 140,
          vy: 145 + Math.random() * 65,
          life: 0,
          maxLife: 0.72,
        };
        nextShooterAt = now + 9000 + Math.random() * 11000;
      }

      if (shooter) {
        shooter.x += shooter.vx * dt;
        shooter.y += shooter.vy * dt;
        shooter.life += dt;
        const t = shooter.life / shooter.maxLife;
        const alpha = Math.sin(Math.min(1, t) * Math.PI) * 0.72;

        if (t >= 1) {
          shooter = null;
        } else {
          const tailX = shooter.x - shooter.vx * 0.09;
          const tailY = shooter.y - shooter.vy * 0.09;
          const grad = ctx.createLinearGradient(shooter.x, shooter.y, tailX, tailY);
          grad.addColorStop(0, `rgba(201, 232, 255, ${alpha})`);
          grad.addColorStop(1, 'rgba(201, 232, 255, 0)');
          ctx.strokeStyle = grad;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(shooter.x, shooter.y);
          ctx.lineTo(tailX, tailY);
          ctx.stroke();
        }
      }

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', onScroll);
    };
  }, [motionReduced, presentationMode]);

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-0 pointer-events-none overflow-hidden no-print"
      style={{
        background:
          'radial-gradient(circle at 92% 45%, rgba(115, 146, 181, 0.14) 0%, rgba(18, 22, 42, 0.45) 38%, #0c0c16 78%)',
      }}
    >
      {/* Canvas 3-layer starfield + shooting stars */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-90" />

      {/* Half-illuminated Moon limb anchored on right edge, smaller in top corner on phones */}
      <div
        className={`absolute -right-[10vw] top-[4vh] sm:-right-[14vw] sm:top-[14vh] w-[54vw] max-w-[820px] min-w-[200px] sm:w-[62vw] sm:min-w-[340px] aspect-video transition-opacity duration-500 ${
          presentationMode ? 'opacity-10' : 'opacity-25'
        }`}
      >
        <img
          src={lunarLimbImg}
          alt=""
          className="w-full h-full object-cover object-left rounded-full select-none"
          style={{
            maskImage: 'radial-gradient(ellipse at 65% 50%, black 22%, transparent 72%)',
            WebkitMaskImage: 'radial-gradient(ellipse at 65% 50%, black 22%, transparent 72%)',
          }}
        />
      </div>
    </div>
  );
};
