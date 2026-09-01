import { BrowserRouter, Route, Routes } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { PremiumCalculatorPage } from "./pages/PremiumCalculatorPage";
import { LotsPremiumPage } from "./pages/LotsPremiumPage";
import { DefinedRiskSpreadPage } from "./pages/DefinedRiskSpreadPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/premium-calculator" element={<PremiumCalculatorPage />} />
        <Route path="/lots-premium" element={<LotsPremiumPage />} />
        <Route path="/defined-risk-spread" element={<DefinedRiskSpreadPage />} />
      </Routes>
    </BrowserRouter>
  );
}
