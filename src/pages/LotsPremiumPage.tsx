import { Layout } from "../components/Layout";
import { LotsCalculator } from "../components/LotsCalculator";
import { OtherCalculatorsNav } from "../components/OtherCalculatorsNav";

export function LotsPremiumPage() {
  return (
    <Layout
      title="Lots & Premium Calculator"
      subtitle="Delta Exchange BTC options — BUY/SELL, CALL/PUT, live from the option chain"
    >
      <LotsCalculator />
      <OtherCalculatorsNav />
    </Layout>
  );
}
