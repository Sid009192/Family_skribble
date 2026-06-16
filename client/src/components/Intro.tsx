/**
 * Intro.tsx — the hand-drawn "potato tiger" splash that plays once per session.
 *
 * This is a React port of the standalone animation designed in Google AI Studio.
 * The trick is the classic SVG "draw-on": every path is dashed with a dash as
 * long as the path itself and offset by that same amount, which hides it. We
 * then animate the offset back to 0 so the line appears to be drawn. We stagger
 * the paths on a timeline (each starting as the previous is ~90% done) so it
 * reads as one continuous sketch, then reveal the title and fade into the app.
 *
 * `onDone` is called once the animation finishes or the user taps "skip". The
 * parent (App) decides whether to mount this at all (once per browser session).
 */

import { useEffect, useRef, useState } from "react";

interface Props {
  onDone: () => void;
}

const STATUS = (pct: number) => {
  if (pct < 20) return "drawing the potato tiger...";
  if (pct < 50) return "giving him a derpy face...";
  if (pct < 80) return "scribbling with the orange crayon...";
  if (pct < 95) return "adding the stripes...";
  return "masterpiece complete.";
};

export function Intro({ onDone }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);

  // Refs so the timeout cleanup and the "skip" button share one source of truth.
  const timers = useRef<number[]>([]);
  const finished = useRef(false);

  // Fade out, then tell the parent we're done (matches the 0.6s CSS transition).
  function finish() {
    if (finished.current) return;
    finished.current = true;
    timers.current.forEach(clearTimeout);
    setLeaving(true);
    window.setTimeout(onDone, 650);
  }

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const paths = Array.from(svg.querySelectorAll<SVGPathElement>(".line"));

    // 1. Prime every path as "fully hidden" before anything is shown.
    paths.forEach((p) => {
      const len = p.getTotalLength() + 5; // +5 buffer for clean endpoints
      p.style.strokeDasharray = String(len);
      p.style.strokeDashoffset = String(len);
    });

    // 2. Build the staggered draw-on timeline.
    let delay = 300;
    const speed = 3.5; // ms per pixel — uniform drawing speed
    paths.forEach((p, i) => {
      const duration = Math.max(p.getTotalLength() * speed, 200);
      const id = window.setTimeout(() => {
        p.style.transition = `stroke-dashoffset ${duration}ms linear`;
        p.style.strokeDashoffset = "0";
        const pct = ((i + 1) / paths.length) * 100;
        if (barRef.current) barRef.current.style.width = `${pct}%`;
        if (statusRef.current) statusRef.current.innerText = STATUS(pct);
      }, delay);
      timers.current.push(id);
      delay += duration * 0.9; // 10% overlap → fluid, continuous line
    });

    // 3. Reveal the title, admire it, then transition out.
    const revealId = window.setTimeout(() => {
      if (titleRef.current) {
        titleRef.current.style.opacity = "1";
        titleRef.current.style.transform = "translateY(0)";
      }
      if (statusRef.current) statusRef.current.style.color = "var(--intro-accent)";
      timers.current.push(window.setTimeout(finish, 2000));
    }, delay);
    timers.current.push(revealId);

    // Cleanup on unmount: cancel every pending timer.
    return () => timers.current.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`intro${leaving ? " leaving" : ""}`}>
      <div className="intro-grid" />

      <div className="intro-stage">
        <div className="intro-svg">
          <svg ref={svgRef} viewBox="0 0 700 450">
            {/* Tail */}
            <path className="line outline" d="M 200,250 Q 100,220 120,150" />
            {/* Body */}
            <path className="line outline" d="M 200,250 A 130,90 0 1,0 460,250 A 130,90 0 1,0 200,250" />
            {/* Head */}
            <path className="line outline" d="M 410,200 A 70,70 0 1,0 550,200 A 70,70 0 1,0 410,200" />
            {/* Legs */}
            <path className="line outline" d="M 250,335 L 240,400" />
            <path className="line outline" d="M 290,340 L 290,400" />
            <path className="line outline" d="M 380,340 L 380,400" />
            <path className="line outline" d="M 420,335 L 430,400" />
            {/* Ears */}
            <path className="line outline" d="M 430,140 Q 440,90 470,120" />
            <path className="line outline" d="M 500,115 Q 530,80 540,135" />
            {/* Eyes */}
            <path className="line outline" style={{ strokeWidth: 8 }} d="M 455,185 L 455.1,185" />
            <path className="line outline" style={{ strokeWidth: 8 }} d="M 505,185 L 505.1,185" />
            {/* Smile */}
            <path className="line detail" d="M 470,215 Q 480,225 490,215" />
            {/* Whiskers */}
            <path className="line detail" d="M 430,200 L 390,190" />
            <path className="line detail" d="M 430,215 L 390,225" />
            <path className="line detail" d="M 530,200 L 570,190" />
            <path className="line detail" d="M 530,215 L 570,225" />
            {/* Orange crayon scribble fill */}
            <path className="line fill" d="M 240,250 L 280,290 L 310,220 L 340,290 L 370,220 L 400,290 L 430,230 L 440,270" />
            {/* Black stripes */}
            <path className="line stripe" d="M 260,170 Q 270,210 260,250" />
            <path className="line stripe" d="M 320,160 Q 330,210 320,260" />
            <path className="line stripe" d="M 380,165 Q 390,210 380,250" />
          </svg>
          <div className="intro-title" ref={titleRef}>Agarwal Family</div>
        </div>

        <div className="intro-panel">
          <div className="intro-status" ref={statusRef}>sharpening pencils...</div>
          <div className="intro-track">
            <div className="intro-fill" ref={barRef} />
          </div>
        </div>
      </div>

      <button className="intro-skip" onClick={finish}>skip intro →</button>
    </div>
  );
}
