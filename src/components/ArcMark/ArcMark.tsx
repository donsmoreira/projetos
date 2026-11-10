import { useId } from "react";

type ArcMarkProps = {
  size?: number;
  className?: string;
};

/**
 * Símbolo de circuito da marca ARC (os três nós acima do "ARC" da logo).
 */
function ArcMark({
  size = 40,
  className
}: ArcMarkProps) {
  const id = useId();
  const gradientId = `arc-mark-gradient-${id}`;
  const glowId = `arc-mark-glow-${id}`;

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="32"
          y1="4"
          x2="32"
          y2="60"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#4fc3ff" />
          <stop offset="1" stopColor="#1a5cff" />
        </linearGradient>

        <filter
          id={glowId}
          x="-30%"
          y="-30%"
          width="160%"
          height="160%"
        >
          <feGaussianBlur stdDeviation="1.6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g
        stroke={`url(#${gradientId})`}
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#${glowId})`}
      >
        <circle cx="32" cy="10" r="5" />
        <path d="M32 15v41" />

        <circle cx="15" cy="18" r="3.6" />
        <path d="M15 21.6v7.4l-9 9" />
        <path d="M24 30v6l-11 11" />

        <circle cx="49" cy="18" r="3.6" />
        <path d="M49 21.6v7.4l9 9" />
        <path d="M40 30v6l11 11" />
      </g>
    </svg>
  );
}

export default ArcMark;
