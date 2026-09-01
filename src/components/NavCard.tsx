import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

interface NavCardProps {
  to: string;
  title: string;
  description: string;
}

export function NavCard({ to, title, description }: NavCardProps) {
  return (
    <Link
      to={to}
      className="flex-1 min-w-[220px] rounded-card border border-line dark:border-line-dark
                 bg-card dark:bg-card-dark p-4 hover:border-line-strong dark:hover:border-line-strong-dark
                 transition-colors no-underline"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-[13.5px] font-semibold text-ink dark:text-ink-dark">{title}</span>
        <ArrowRight size={14} className="text-ink-faint dark:text-ink-faint-dark" />
      </div>
      <p className="text-[11.5px] text-ink-faint dark:text-ink-faint-dark m-0">{description}</p>
    </Link>
  );
}
