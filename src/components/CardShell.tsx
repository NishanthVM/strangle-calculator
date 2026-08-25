import type { ReactNode } from "react";
import { RotateCcw } from "lucide-react";

interface CardShellProps {
  title: string;
  subtitle: string;
  onReset: () => void;
  children: ReactNode;
}

export function CardShell({ title, subtitle, onReset, children }: CardShellProps) {
  return (
    <div
      className="flex-1 min-w-[300px] basis-[380px] rounded-card border
                 border-line dark:border-line-dark
                 bg-card dark:bg-card-dark p-5"
    >
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-[15.5px] font-semibold text-ink dark:text-ink-dark m-0">{title}</h2>
          <p className="text-xs text-ink-faint dark:text-ink-faint-dark mt-0.5">{subtitle}</p>
        </div>
        <button
          onClick={onReset}
          title="Reset defaults"
          className="flex items-center gap-1.5 rounded-md border
                     border-line dark:border-line-dark
                     text-ink-muted dark:text-ink-muted-dark
                     text-[11.5px] px-2.5 py-1.5 hover:border-line-strong
                     dark:hover:border-line-strong-dark transition-colors"
        >
          <RotateCcw size={11.5} />
          Reset
        </button>
      </div>
      <div className="h-px bg-line dark:bg-line-dark my-3.5" />
      {children}
    </div>
  );
}
