import React from "react";

interface MotionCamMarkProps {
  size?: number;
  className?: string;
}

export const MotionCamMark: React.FC<MotionCamMarkProps> = ({ size = 32, className = "" }) => (
  <svg
    aria-hidden="true"
    className={className}
    width={size}
    height={size}
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect width="48" height="48" rx="13" fill="#0B1B19" />
    <path
      d="M17 9.5H13.5A4 4 0 0 0 9.5 13.5V17M31 9.5h3.5a4 4 0 0 1 4 4V17M38.5 31v3.5a4 4 0 0 1-4 4H31M17 38.5h-3.5a4 4 0 0 1-4-4V31"
      stroke="#F2F3E9"
      strokeWidth="2.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="24" cy="24" r="7.2" stroke="#61DCC6" strokeWidth="2.7" />
    <circle cx="24" cy="24" r="2.5" fill="#61DCC6" />
  </svg>
);
