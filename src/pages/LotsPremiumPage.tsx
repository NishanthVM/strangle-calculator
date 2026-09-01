import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Layout } from "../components/Layout";
import { LotsCalculator } from "../components/LotsCalculator";

export function LotsPremiumPage() {
  return (
    <Layout
      title="Lots & Premium Calculator"
      subtitle="Delta Exchange BTC options — BUY/SELL, CALL/PUT, live from the option chain"
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
      <LotsCalculator />
    </Layout>
  );
}
