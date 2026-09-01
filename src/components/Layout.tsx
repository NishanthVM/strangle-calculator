import type { ReactNode } from "react";
import { ThemeToggle } from "./ThemeToggle";
import { useTheme } from "../hooks/useTheme";

interface LayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

export function Layout({ title, subtitle, children }: LayoutProps) {
  const [theme, toggleTheme] = useTheme();

  return (
    <div className="min-h-screen bg-paper dark:bg-paper-dark px-4 py-7 pb-10 transition-colors">
      <div className="max-w-[1040px] mx-auto">
        <header className="flex justify-between items-start mb-5">
          <div>
            <h1 className="text-[19px] font-semibold tracking-tight text-ink dark:text-ink-dark m-0">{title}</h1>
            <p className="text-[12.5px] text-ink-faint dark:text-ink-faint-dark mt-1">{subtitle}</p>
          </div>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </header>

        <main className="flex gap-4 flex-wrap">{children}</main>

        <footer className="text-[10.5px] leading-relaxed text-ink-faint dark:text-ink-faint-dark text-center max-w-[640px] mx-auto mt-7">
          This calculator is for position-sizing and risk-estimation purposes only. Actual fees, margin
          requirements, liquidation prices, slippage, funding, and execution prices may differ from these estimates.
          Verify all values with your exchange before trading.
        </footer>
      </div>
    </div>
  );
}
