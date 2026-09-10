import { Layout } from "../components/Layout";
import { MinLeverageCalculator } from "../components/MinLeverageCalculator";
import { OtherCalculatorsNav } from "../components/OtherCalculatorsNav";

export function MinimumLeveragePage() {
  return (
    <Layout
      title="Minimum Leverage Calculator"
      subtitle="Delta Exchange BTC options — short strangle / short straddle risk sizing"
    >
      <MinLeverageCalculator />
      <OtherCalculatorsNav />
    </Layout>
  );
}
