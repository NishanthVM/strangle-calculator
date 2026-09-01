import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Layout } from "../components/Layout";
import { SpreadCalculator } from "../components/SpreadCalculator";

export function DefinedRiskSpreadPage() {
  return (
    <Layout
      title="Defined-Risk Option Spread Calculator"
      subtitle="Delta Exchange BTC options — vertical spreads and custom two-leg combinations"
    >
      <div className="basis-full mb-1">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-[12px] text-ink-faint dark:text-ink-faint-dark hover:text-ink dark:hover:text-ink-dark no-underline"
        >
          <ArrowLeft size={12} />
          Short Strangle Calculator
        </Link>
      </div>
      <SpreadCalculator />
    </Layout>
  );
}
