/** Inline SVG logomark for Nexoratech.
 *
 *  Design intent: a stylised "N" cut from two overlapping rounded blades
 *  inside a hex frame — reads as "node" + "tech" without needing an
 *  external icon set. Sized via Tailwind on the parent (default 32×32);
 *  use `gradient` to choose colour: "brand" (sky→blue, on light bg) or
 *  "white" (solid white, on the blue Analytics / Newsletter sections).
 */
export function NexoratechLogo({
  size = 32,
  gradient = "brand",
  className = "",
}: {
  size?: number;
  gradient?: "brand" | "white";
  className?: string;
}) {
  const stroke = gradient === "white" ? "#ffffff" : "url(#nexoratech-grad)";
  const fill = gradient === "white" ? "#ffffff" : "url(#nexoratech-grad)";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Nexoratech logo"
    >
      <defs>
        <linearGradient id="nexoratech-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#38bdf8" />
          <stop offset="0.55" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>

      {/* Hex frame */}
      <path
        d="M16 2.2 28.3 9.1V22.9L16 29.8 3.7 22.9V9.1z"
        stroke={stroke}
        strokeWidth="2.2"
        strokeLinejoin="round"
      />

      {/* Stylised N — two diagonals + side bars */}
      <path
        d="M10.5 21.5V10.5M21.5 21.5V10.5M10.5 10.5L21.5 21.5"
        stroke={stroke}
        strokeWidth="2.4"
        strokeLinecap="round"
      />

      {/* Accent node at top-right of the N */}
      <circle cx="21.5" cy="10.5" r="1.8" fill={fill} />
    </svg>
  );
}
