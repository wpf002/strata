import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import SearchPage from './pages/SearchPage';
import IntelligencePage from './pages/IntelligencePage';
import UnderwritePage from './pages/UnderwritePage';
import PortfolioPage from './pages/PortfolioPage';
import CopilotPage from './pages/CopilotPage';
import LoginPage from './pages/LoginPage';
import MarketPulsePage from './pages/MarketPulsePage';
import ClientsPage from './pages/ClientsPage';
import LenderPage from './pages/LenderPage';
import SettingsPage from './pages/SettingsPage';
import AlertsPage from './pages/AlertsPage';
import { useAuth } from './contexts/AuthContext';

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
            <Route path="/market" element={<MarketPulsePage />} />
            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/lender" element={<LenderPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/alerts" element={<AlertsPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
