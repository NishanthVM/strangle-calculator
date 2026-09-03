import { Layout } from "../components/Layout";
import { PremiumCalculator } from "../components/PremiumCalculator";
import { OtherCalculatorsNav } from "../components/OtherCalculatorsNav";

export function PremiumCalculatorPage() {
  return (
    <Layout title="Premium Calculator" subtitle="Delta Exchange BTC options — maximum premium per leg">
      <PremiumCalculator />
      <OtherCalculatorsNav />
    </Layout>
  );
}
