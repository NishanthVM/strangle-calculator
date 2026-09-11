import { Link, useLocation } from "react-router-dom";

const PAGES = [
  { to: "/", label: "Minimum Leverage" },
  { to: "/premium-calculator", label: "Premium Calculator" },
  { to: "/lots-premium", label: "Lots Calculator" },
  { to: "/defined-risk-spread", label: "Defined-Risk Spreads" },
];

/** Bottom-of-page navigation to the other three calculators — consistent across all four pages. */
export function OtherCalculatorsNav() {
  const location = useLocation();

  return (
    <div className="basis-full mt-6 pt-4 border-t border-line dark:border-line-dark">
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint dark:text-ink-faint-dark mb-2">
        Other Calculators
      </div>
      <div className="flex gap-2 flex-wrap">
        {PAGES.map((page) => {
          const isActive = location.pathname === page.to;
          return isActive ? (
            <span
              key={page.to}
              className="text-[12px] px-2.5 py-1.5 rounded-md border border-line-strong dark:border-line-strong-dark text-ink dark:text-ink-dark font-medium"
            >
              {page.label}
            </span>
          ) : (
            <Link
              key={page.to}
              to={page.to}
              className="text-[12px] px-2.5 py-1.5 rounded-md border border-line dark:border-line-dark text-ink-muted dark:text-ink-muted-dark hover:border-line-strong dark:hover:border-line-strong-dark hover:text-ink dark:hover:text-ink-dark no-underline transition-colors"
            >
              {page.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
