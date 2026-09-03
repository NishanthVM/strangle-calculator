import { Layout } from "../components/Layout";
import { SpreadCalculator } from "../components/SpreadCalculator";
import { OtherCalculatorsNav } from "../components/OtherCalculatorsNav";

export function DefinedRiskSpreadPage() {
  return (
    <Layout
      title="Defined-Risk Option Spread Calculator"
      subtitle="Delta Exchange BTC options — vertical spreads and custom two-leg combinations"
    >
      <SpreadCalculator />
      <OtherCalculatorsNav />
    </Layout>
  );
}
