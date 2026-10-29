export default function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="币记"
      className="logo"
    >
      <defs>
        <linearGradient id="logoBg" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1e2430" />
          <stop offset="1" stopColor="#141821" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#logoBg)" />
      <path
        d="M6 21.5 L12.5 15 L18 18.5 L26 9"
        fill="none"
        stroke="#0ecb81"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20.5 9 H26 V14.5"
        fill="none"
        stroke="#0ecb81"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="6" cy="21.5" r="2.4" fill="#2f6fed" />
    </svg>
  );
}
