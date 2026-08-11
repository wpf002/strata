import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import MobileNav from './components/MobileNav';
import BottomTabs from './components/BottomTabs';
import { SectionTabsBar } from './components/SectionTabs';
import SearchPage from './pages/SearchPage';
import IntelligencePage from './pages/IntelligencePage';
import UnderwritePage from './pages/UnderwritePage';
import PortfolioPage from './pages/PortfolioPage';
import CopilotPage from './pages/CopilotPage';
import LoginPage from './pages/LoginPage';
import MarketPulsePage from './pages/MarketPulsePage';
import ClientsPage from './pages/ClientsPage';
import SettingsPage from './pages/SettingsPage';
import AlertsPage from './pages/AlertsPage';
import ReportPage from './pages/ReportPage';
import LeadsPage from './pages/LeadsPage';
import PortalViewPage from './pages/PortalViewPage';
import WatchlistPage from './pages/WatchlistPage';
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

  // Public routes must render without auth — check the URL before gating.
  const path = typeof window !== 'undefined' ? window.location.pathname : '';
  const isPublic = path.startsWith('/portal/') || path.startsWith('/reports/');

  // Mock mode runs entirely off src/data/mockData.ts, so there is no Supabase to
  // authenticate against. Gating on a session would make the app unopenable.
  const mockMode = import.meta.env.VITE_USE_MOCK === 'true';

  if (!session && !isPublic && !mockMode) {
    return <LoginPage />;
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes — no sidebar, no auth */}
        <Route path="/reports/:id" element={<ReportPage />} />
        <Route path="/portal/:token" element={<PortalViewPage />} />

        {/* App shell with sidebar */}
        <Route path="*" element={
          <div className="flex flex-col md:flex-row h-screen overflow-hidden grid-bg">
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden min-w-0 bg-navy-950/50">
              <MobileNav />
              <SectionTabsBar />
              <main className="flex-1 overflow-hidden flex flex-col min-w-0">
                <Routes>
                  <Route path="/" element={<SearchPage />} />
                  <Route path="/intelligence/:id" element={<IntelligencePage />} />
                  <Route path="/intelligence" element={<IntelligencePage />} />
                  <Route path="/underwrite" element={<UnderwritePage />} />
                  <Route path="/portfolio" element={<PortfolioPage />} />
                  <Route path="/copilot" element={<CopilotPage />} />
                  <Route path="/market" element={<MarketPulsePage />} />
                  <Route path="/clients" element={<ClientsPage />} />
                  <Route path="/leads" element={<LeadsPage />} />
                  <Route path="/watchlist" element={<WatchlistPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/alerts" element={<AlertsPage />} />
                </Routes>
              </main>
              <BottomTabs />
            </div>
          </div>
        } />
      </Routes>
    </BrowserRouter>
  );
}
