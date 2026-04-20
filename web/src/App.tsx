import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import SearchPage from './pages/SearchPage';
import IntelligencePage from './pages/IntelligencePage';
import UnderwritePage from './pages/UnderwritePage';
import PortfolioPage from './pages/PortfolioPage';
import CopilotPage from './pages/CopilotPage';
import LoginPage from './pages/LoginPage';
import { useAuth } from './contexts/AuthContext';

function Placeholder({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-white mb-2">{title}</h2>
        <p className="text-slate-500 text-sm">{sub}</p>
      </div>
    </div>
  );
}

export default function App() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen grid-bg flex items-center justify-center">
        <div className="glass rounded-xl w-48 h-16 animate-pulse" />
      </div>
    );
  }

  if (!session) {
    return <LoginPage />;
  }

  return (
    <BrowserRouter>
      <div className="flex h-screen overflow-hidden grid-bg">
        <Sidebar />
        <main className="flex-1 overflow-hidden flex flex-col bg-navy-950/50">
          <Routes>
            <Route path="/" element={<SearchPage />} />
            <Route path="/intelligence/:id" element={<IntelligencePage />} />
            <Route path="/intelligence" element={<IntelligencePage />} />
            <Route path="/underwrite" element={<UnderwritePage />} />
            <Route path="/portfolio" element={<PortfolioPage />} />
            <Route path="/copilot" element={<CopilotPage />} />
            <Route path="/market" element={<Placeholder title="Market Pulse" sub="City, zip, and MSA dashboards — next sprint." />} />
            <Route path="/teams" element={<Placeholder title="STRATA Teams" sub="Client activity feed, deal rooms, branded reports." />} />
            <Route path="/lender" element={<Placeholder title="STRATA Lender" sub="DSCR dashboards, borrower matching, deal intake." />} />
            <Route path="/settings" element={<Placeholder title="Settings" sub="Profile, alerts, API keys, billing." />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
