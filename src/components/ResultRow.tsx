interface ResultRowProps {
  label: string;
  value: string;
  tone?: "profit" | "risk" | "neutral";
  big?: boolean;
}

export function ResultRow({ label, value, tone = "neutral", big = false }: ResultRowProps) {
  const toneClass =
    tone === "profit"
      ? "text-profit dark:text-profit-dark"
      : tone === "risk"
      ? "text-risk dark:text-risk-dark"
      : "text-ink dark:text-ink-dark";

  return (
    <div
      className={`flex justify-between items-baseline ${
        big ? "pb-2.5" : "py-1.5 border-b border-line dark:border-line-dark last:border-b-0"
      }`}
    >
      <span className="text-[12.5px] font-medium text-ink-muted dark:text-ink-muted-dark">{label}</span>
      <span
        className={`font-mono tracking-tight ${
          big ? "text-[26px] font-semibold text-ink dark:text-ink-dark" : `text-sm font-medium ${toneClass}`
        }`}
      >
        {value}
      </span>
    </div>
  );
}
