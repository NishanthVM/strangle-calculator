import { Layout } from "../components/Layout";
import { MinLeverageCalculator } from "../components/MinLeverageCalculator";
import { NavCard } from "../components/NavCard";

export function HomePage() {
  return (
    <Layout
      title="Strangle Position Sizer"
      subtitle="Delta Exchange BTC options — short strangle / short straddle risk sizing"
    >
      <MinLeverageCalculator />

      <div className="basis-full flex gap-3 flex-wrap mt-2">
        <NavCard
          to="/premium-calculator"
          title="Premium Calculator"
          description="Maximum premium per leg for your risk budget"
        />
        <NavCard
          to="/lots-premium"
          title="Lots & Premium Calculator"
          description="BUY/SELL, CALL/PUT — maximum contracts, live from Delta"
        />
        <NavCard
          to="/defined-risk-spread"
          title="Defined-Risk Option Spread Calculator"
          description="Bull/bear call and put spreads, or custom two-leg combinations"
        />
      </div>
    </Layout>
  );
}
