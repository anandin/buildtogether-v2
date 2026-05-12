import type { CSSProperties } from "react";

type ShapeProps = {
  className?: string;
  style?: CSSProperties;
};

export function Squiggle({ className, style }: ShapeProps) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 120 30"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
    >
      <path d="M2 15 Q 17 2 32 15 T 62 15 T 92 15 T 118 15" />
    </svg>
  );
}

export function Burst({ className, style }: ShapeProps) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 100 100"
      fill="currentColor"
    >
      <path d="M50 0 L58 36 L96 27 L70 56 L100 80 L62 70 L60 100 L42 70 L4 80 L30 56 L0 27 L42 36 Z" />
    </svg>
  );
}

export function Dots({ className, style }: ShapeProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 100 100" fill="currentColor">
      {Array.from({ length: 5 }).map((_, r) =>
        Array.from({ length: 5 }).map((_, c) => (
          <circle key={`${r}-${c}`} cx={10 + c * 20} cy={10 + r * 20} r={3.5} />
        )),
      )}
    </svg>
  );
}

export function Zigzag({ className, style }: ShapeProps) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 140 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <path d="M2 22 L 18 4 L 34 22 L 50 4 L 66 22 L 82 4 L 98 22 L 114 4 L 130 22 L 138 14" />
    </svg>
  );
}

export function HalfCircle({ className, style }: ShapeProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 100 50" fill="currentColor">
      <path d="M0 50 A 50 50 0 0 1 100 50 Z" />
    </svg>
  );
}

export function Triangle({ className, style }: ShapeProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 100 100" fill="currentColor">
      <path d="M50 4 L96 92 L4 92 Z" />
    </svg>
  );
}

export function CrossPlus({ className, style }: ShapeProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round">
      <path d="M15 3 V 27 M 3 15 H 27" />
    </svg>
  );
}

export function ArrowHand({ className, style }: ShapeProps) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 160 60"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 30 Q 50 6 100 30 T 150 28" />
      <path d="M138 18 L 152 28 L 138 40" />
    </svg>
  );
}

export function Spiral({ className, style }: ShapeProps) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 80 80"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
    >
      <path d="M40 40 m-3 0 a 3 3 0 1 1 6 0 a 6 6 0 1 1 -12 0 a 12 12 0 1 1 24 0 a 18 18 0 1 1 -36 0 a 26 26 0 1 1 52 0" />
    </svg>
  );
}
