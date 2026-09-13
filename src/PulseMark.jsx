import { pulsePath } from "../shared/brand";

export default function PulseMark({ size = 32, className }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d={pulsePath} />
    </svg>
  );
}
