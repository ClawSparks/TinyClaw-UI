import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ChatView from './components/ChatView';
import SettingsView from './components/SettingsView';
import LoginScreen from './components/LoginScreen';

export type ViewType = 'chat' | 'settings';
export type SettingsTab = 'gateway' | 'general' | 'models' | 'commands' | 'about';

export default function App() {
  const allowedTabs: SettingsTab[] = ['general', 'commands'];
  const normalizeTab = (tab: string): SettingsTab => {
    return allowedTabs.includes(tab as SettingsTab) ? (tab as SettingsTab) : 'general';
  };

  const getHashState = () => {
    const hash = window.location.hash.replace('#', '');
    if (!hash) return { view: 'chat' as ViewType, tab: 'general' as SettingsTab };
    
    if (hash === 'settings') return { view: 'settings' as ViewType, tab: 'general' as SettingsTab };
    if (hash.startsWith('settings/')) {
      const tab = normalizeTab(hash.split('/')[1]);
      return { view: 'settings' as ViewType, tab: tab as SettingsTab };
    }
    return { view: 'chat' as ViewType, tab: 'general' as SettingsTab };
  };

  const initialState = getHashState();

  const [currentView, setCurrentView] = useState<ViewType>(initialState.view);
  const [isConnected, setIsConnected] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>(initialState.tab);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null); // null = checking
  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    return localStorage.getItem('clawui_active_session') || '';
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [sessions, setSessions] = useState<{id: string, name: string, characterId?: string, model?: string}[]>([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);

  // --- Hash Routing Integration for Back Gesture & Deep Linking ---
  useEffect(() => {
    const handleHashChange = () => {
      const { view, tab } = getHashState();
      setCurrentView(view);
      setSettingsTab(tab);
      // If we navigate back via hash, close mobile menu
      setIsMobileMenuOpen(false);
    };

    window.addEventListener('hashchange', handleHashChange);
    
    // Set initial hash if it's empty to normalize URL
    if (!window.location.hash) {
      window.location.hash = currentView === 'settings' ? `settings/${settingsTab}` : 'chat';
    }

    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Sync view state to hash and localStorage
  useEffect(() => {
    const newHash = currentView === 'settings' ? `settings/${settingsTab}` : 'chat';
    if (window.location.hash.replace('#', '') !== newHash) {
      window.location.hash = newHash;
    }
    localStorage.setItem('clawui_current_view', currentView);
    localStorage.setItem('clawui_settings_tab', settingsTab);
  }, [currentView, settingsTab]);

  // Sync activeSessionId to localStorage
  useEffect(() => {
    if (activeSessionId) {
      localStorage.setItem('clawui_active_session', activeSessionId);
    }
  }, [activeSessionId]);

  // Wrapper for view/tab changes
  const navigateTo = (view: ViewType, tab?: SettingsTab, openMenu?: boolean) => {
    const nextTab = tab || settingsTab;
    const nextOpen = openMenu !== undefined ? openMenu : isMobileMenuOpen;
    
    if (view !== currentView || nextTab !== settingsTab || nextOpen !== isMobileMenuOpen) {
      setCurrentView(view);
      if (tab) setSettingsTab(tab);
      setIsMobileMenuOpen(nextOpen);
      // Hash is updated automatically by the useEffect above
    }
  };

  const reloadSessions = async () => {
    try {
      const res = await fetch('/api/sessions');
      const data = await res.json();
      setSessions(data);
      setSessionsLoaded(true);
      // Auto-select first session if currently active is not in the list or empty
      if (data.length > 0) {
        setActiveSessionId(prev => {
          const exists = data.find((s: any) => s.id === prev);
          return exists ? prev : data[0].id;
        });
      }
    } catch (err) {
      console.error('Failed to reload sessions:', err);
    }
  };

  const reorderSessions = async (newSessions: {id: string, name: string}[]) => {
    // Optimistic update
    setSessions(newSessions);
    try {
      await fetch('/api/sessions/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: newSessions.map(s => s.id) }),
      });
    } catch (err) {
      console.error('Failed to save session order:', err);
      // Fallback on failure
      reloadSessions();
    }
  };

  // Check if login is required on mount and periodically
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem('clawui_auth_token');
        const url = token ? `/api/auth/check?token=${encodeURIComponent(token)}` : '/api/auth/check';
        const res = await fetch(url);
        const data = await res.json();
        if (data.loginRequired) {
          localStorage.removeItem('clawui_auth_token');
          setIsAuthenticated(false);
        } else {
          setIsAuthenticated(true);
        }
      } catch {
        // If can't reach server, allow access (offline mode)
        setIsAuthenticated(prev => prev === null ? true : prev);
      }
    };
    checkAuth();
    
    // Periodically poll auth to log out instantly on password change
    const tokenTimer = setInterval(checkAuth, 3000);
    return () => clearInterval(tokenTimer);
  }, []);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await fetch('/api/gateway/status');
        if (res.ok) {
          const data = await res.json();
          setIsConnected(!!data.connected); 
        } else {
          setIsConnected(false);
        }
      } catch (e) {
        setIsConnected(false);
      }
    };

    checkStatus();
    reloadSessions();
    const timer = setInterval(checkStatus, 10000);
    return () => clearInterval(timer);
  }, []);

  // Show login screen if not authenticated (and auth check is done)
  if (isAuthenticated === false) {
    return <LoginScreen onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  // Always render the real UI, but hide it until data is ready.
  // This prevents progressive paint / "expanding" artifacts.
  const appReady = isAuthenticated === true && sessionsLoaded;

  return (
    <div
      className="flex fixed inset-0 h-[100dvh] w-full overflow-hidden bg-gray-50 text-gray-900 font-sans antialiased"
      style={{ opacity: appReady ? 1 : 0 }}
    >
      <Sidebar 
        currentView={currentView} 
        settingsTab={settingsTab} 
        activeSessionId={activeSessionId}
        setActiveSessionId={setActiveSessionId}
        isMobileMenuOpen={isMobileMenuOpen}
        sessions={sessions}
        sessionsLoaded={sessionsLoaded}
        reloadSessions={reloadSessions}
        reorderSessions={reorderSessions}
        navigateTo={navigateTo}
      />
      <main className="flex-1 flex flex-col min-w-0 bg-white overflow-hidden md:overflow-visible md:relative md:z-[60]">
        {currentView === 'chat' ? (
          <ChatView 
            isConnected={isConnected} 
            activeSessionId={activeSessionId} 
            onMenuClick={() => navigateTo(currentView, settingsTab, true)}
            sessions={sessions}
          />
        ) : (
          <SettingsView 
            isConnected={isConnected} 
            settingsTab={settingsTab} 
            onMenuClick={() => navigateTo(currentView, settingsTab, true)}
          />
        )}
      </main>
    </div>
  );
}
