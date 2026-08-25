import { Moon, Sun } from "lucide-react";
import type { Theme } from "../types";

interface ThemeToggleProps {
  theme: Theme;
  onToggle: () => void;
}

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  return (
    <button
      onClick={onToggle}
      title="Toggle theme"
      aria-label="Toggle color theme"
      className="flex items-center justify-center w-8 h-8 rounded-md border
                 border-line dark:border-line-dark
                 bg-card dark:bg-card-dark
                 text-ink-muted dark:text-ink-muted-dark
                 flex-shrink-0 hover:border-line-strong dark:hover:border-line-strong-dark
                 transition-colors"
    >
      {theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
    </button>
  );
}
