import { BRAND } from "@/lib/constants/brand";
import { cn } from "@/lib/utils";

export function Brand({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg
        viewBox="0 0 64 64"
        fill="none"
        className="size-10 shrink-0 text-primary"
        aria-hidden="true"
      >
        <path
          d="M5 32C12 19 21 12 32 12C43 12 52 19 59 32C52 45 43 52 32 52C21 52 12 45 5 32Z"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinejoin="round"
        />
        <rect
          x="18"
          y="31"
          width="7"
          height="10"
          rx="2"
          className="fill-foreground"
        />
        <rect
          x="28.5"
          y="25"
          width="7"
          height="16"
          rx="2"
          fill="currentColor"
        />
        <rect x="39" y="19" width="7" height="22" rx="2" fill="currentColor" />
      </svg>
      <span
        className={
          compact
            ? "sr-only"
            : "text-[27px] leading-none font-semibold tracking-[-1.3px]"
        }
      >
        {BRAND.name}
      </span>
    </span>
  );
}
