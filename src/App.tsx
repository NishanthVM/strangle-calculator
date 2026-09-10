import { BrowserRouter, Route, Routes } from "react-router-dom";
import { LiveTradeExecutionPage } from "./pages/LiveTradeExecutionPage";
import { MinimumLeveragePage } from "./pages/MinimumLeveragePage";
import { PremiumCalculatorPage } from "./pages/PremiumCalculatorPage";
import { LotsPremiumPage } from "./pages/LotsPremiumPage";
import { DefinedRiskSpreadPage } from "./pages/DefinedRiskSpreadPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LiveTradeExecutionPage />} />
        <Route path="/minimum-leverage" element={<MinimumLeveragePage />} />
        <Route path="/premium-calculator" element={<PremiumCalculatorPage />} />
        <Route path="/lots-premium" element={<LotsPremiumPage />} />
        <Route path="/defined-risk-spread" element={<DefinedRiskSpreadPage />} />
      </Routes>
    </BrowserRouter>
  );
}
