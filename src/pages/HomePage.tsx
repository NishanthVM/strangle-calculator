import { Layout } from "../components/Layout";
import { MinLeverageCalculator } from "../components/MinLeverageCalculator";
import { OtherCalculatorsNav } from "../components/OtherCalculatorsNav";

export function HomePage() {
  return (
    <Layout
      title="Strangle Position Sizer"
      subtitle="Delta Exchange BTC options — short strangle / short straddle risk sizing"
    >
      <MinLeverageCalculator />
      <OtherCalculatorsNav />
    </Layout>
  );
}
