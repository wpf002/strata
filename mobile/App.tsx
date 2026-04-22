import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, SafeAreaView, Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';

import { supabase } from './src/supabase';
import { setUnauthorizedHandler } from './src/api';
import { setupPushNotifications } from './src/services/notifications';
import LoginScreen from './src/screens/LoginScreen';
import SearchScreen from './src/screens/SearchScreen';
import IntelligenceScreen from './src/screens/IntelligenceScreen';
import PortfolioScreen from './src/screens/PortfolioScreen';
import CopilotScreen from './src/screens/CopilotScreen';
import type { MobileProperty, PortfolioEntry } from './src/api';

type Tab = 'search' | 'portfolio' | 'copilot';

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'search', label: 'Search', icon: '⌕' },
    { id: 'portfolio', label: 'Portfolio', icon: '◫' },
    { id: 'copilot', label: 'Copilot', icon: '✦' },
  ];

  return (
    <View style={tabStyles.bar}>
      {tabs.map(t => (
        <TouchableOpacity
          key={t.id}
          style={tabStyles.tab}
          onPress={() => onChange(t.id)}
          activeOpacity={0.7}
        >
          <Text style={[tabStyles.icon, active === t.id && tabStyles.iconActive]}>{t.icon}</Text>
          <Text style={[tabStyles.label, active === t.id && tabStyles.labelActive]}>{t.label}</Text>
          {active === t.id && <View style={tabStyles.indicator} />}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const tabStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: '#0d1b2e',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingBottom: Platform.OS === 'ios' ? 20 : 4,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
    position: 'relative',
  },
  icon: { fontSize: 18, color: '#475569', marginBottom: 2 },
  iconActive: { color: '#C9A84C' },
  label: { fontSize: 10, color: '#475569', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  labelActive: { color: '#C9A84C' },
  indicator: {
    position: 'absolute',
    top: 0,
    left: '25%' as any,
    right: '25%' as any,
    height: 2,
    backgroundColor: '#C9A84C',
    borderRadius: 1,
  },
});


export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('search');
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setBootstrapping(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) {
        setupPushNotifications().catch(() => {});
      }
    });

    setUnauthorizedHandler(() => {
      supabase.auth.signOut();
    });

    return () => subscription.unsubscribe();
  }, []);

  if (bootstrapping) {
    return <View style={styles.loading} />;
  }

  if (!session) {
    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor="#080f1a" />
        <LoginScreen onSuccess={() => {}} />
      </>
    );
  }

  const handlePropertyPress = (p: MobileProperty) => {
    setSelectedPropertyId(p.id);
  };

  const handlePortfolioPropertyPress = (_e: PortfolioEntry) => {
    // Navigate to intelligence view for portfolio property
    if (_e.propertyId) setSelectedPropertyId(_e.propertyId);
  };

  if (selectedPropertyId) {
    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor="#0d1b2e" />
        <SafeAreaView style={styles.safeArea}>
          <IntelligenceScreen
            propertyId={selectedPropertyId}
            onBack={() => setSelectedPropertyId(null)}
          />
        </SafeAreaView>
      </>
    );
  }

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#0d1b2e" />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <View style={styles.screen}>
            {activeTab === 'search' && (
              <SearchScreen onPropertyPress={handlePropertyPress} />
            )}
            {activeTab === 'portfolio' && (
              <PortfolioScreen onPropertyPress={handlePortfolioPropertyPress} />
            )}
            {activeTab === 'copilot' && <CopilotScreen propertyId={selectedPropertyId} />}
          </View>
          <TabBar active={activeTab} onChange={setActiveTab} />
        </View>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: '#080f1a' },
  safeArea: { flex: 1, backgroundColor: '#080f1a' },
  container: { flex: 1, backgroundColor: '#080f1a' },
  screen: { flex: 1 },
});
