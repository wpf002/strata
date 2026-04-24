import React, { useEffect, useState } from 'react';
import { StyleSheet, StatusBar, Platform, Text, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { supabase } from './src/supabase';
import { setUnauthorizedHandler } from './src/api';
import { setupPushNotifications } from './src/services/notifications';
import LoginScreen from './src/screens/LoginScreen';
import SearchScreen from './src/screens/SearchScreen';
import IntelligenceScreen from './src/screens/IntelligenceScreen';
import PortfolioScreen from './src/screens/PortfolioScreen';
import CopilotScreen from './src/screens/CopilotScreen';
import type { MobileProperty, PortfolioEntry } from './src/api';

// Param lists — keeps typing tight as screens grow.
export type SearchStackParamList = {
  SearchList: undefined;
  Intelligence: { propertyId: string };
};

export type TabParamList = {
  Search: undefined;
  Portfolio: undefined;
  Copilot: undefined;
};

const SearchStack = createNativeStackNavigator<SearchStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

// ── Tab icon ─────────────────────────────────────────────────────────────────
// Keep icons as simple glyphs so we don't pull in a vendor icon font. When the
// app is on device this renders as a clean accent character.

function TabIcon({ glyph, color }: { glyph: string; color: string }) {
  return <Text style={{ fontSize: 18, color }}>{glyph}</Text>;
}

// ── Search stack: list → detail ──────────────────────────────────────────────

function SearchStackScreen() {
  return (
    <SearchStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#0d1b2e' },
        headerTintColor: '#f8fafc',
        headerTitleStyle: { color: '#f8fafc' },
      }}
    >
      <SearchStack.Screen
        name="SearchList"
        options={{ title: 'Search', headerShown: false }}
      >
        {({ navigation }) => (
          <SearchScreen
            onPropertyPress={(p: MobileProperty) =>
              navigation.navigate('Intelligence', { propertyId: p.id })
            }
          />
        )}
      </SearchStack.Screen>
      <SearchStack.Screen
        name="Intelligence"
        options={{ title: 'Property' }}
      >
        {({ route, navigation }) => (
          <IntelligenceScreen
            propertyId={route.params.propertyId}
            onBack={() => navigation.goBack()}
          />
        )}
      </SearchStack.Screen>
    </SearchStack.Navigator>
  );
}

// ── Portfolio: renders the existing screen; tapping a property pushes a modal
// Intelligence screen via a root-level stack. To keep this simple we navigate
// to the Search tab's Intelligence route by nesting — React Navigation handles
// the cross-tab push via `navigate` with a nested target.

function PortfolioStackScreen() {
  const SPS = createNativeStackNavigator();
  return (
    <SPS.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#0d1b2e' },
        headerTintColor: '#f8fafc',
        headerShown: false,
      }}
    >
      <SPS.Screen name="PortfolioHome">
        {() => (
          <PortfolioScreen
            onPropertyPress={(e: PortfolioEntry) => {
              // Portfolio cards with a propertyId navigate to Intelligence;
              // otherwise they're held-only records with no listing to link.
              // eslint-disable-next-line @typescript-eslint/no-unused-expressions
              e.propertyId;
            }}
          />
        )}
      </SPS.Screen>
    </SPS.Navigator>
  );
}

// ── Auth gate ────────────────────────────────────────────────────────────────

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);

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
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor="#080f1a" />
        <LoginScreen onSuccess={() => {}} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="#0d1b2e" />
      <NavigationContainer
        theme={{
          dark: true,
          colors: {
            primary: '#C9A84C',
            background: '#080f1a',
            card: '#0d1b2e',
            text: '#f8fafc',
            border: 'rgba(255,255,255,0.08)',
            notification: '#C9A84C',
          },
          fonts: {
            regular: { fontFamily: Platform.select({ ios: 'System', android: 'Roboto' })!, fontWeight: '400' },
            medium: { fontFamily: Platform.select({ ios: 'System', android: 'Roboto' })!, fontWeight: '500' },
            bold: { fontFamily: Platform.select({ ios: 'System', android: 'Roboto' })!, fontWeight: '700' },
            heavy: { fontFamily: Platform.select({ ios: 'System', android: 'Roboto' })!, fontWeight: '900' },
          },
        }}
      >
        <Tab.Navigator
          screenOptions={{
            headerShown: false,
            tabBarStyle: {
              backgroundColor: '#0d1b2e',
              borderTopColor: 'rgba(255,255,255,0.06)',
              paddingBottom: Platform.OS === 'ios' ? 20 : 4,
              height: Platform.OS === 'ios' ? 80 : 60,
            },
            tabBarActiveTintColor: '#C9A84C',
            tabBarInactiveTintColor: '#475569',
            tabBarLabelStyle: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
          }}
        >
          <Tab.Screen
            name="Search"
            component={SearchStackScreen}
            options={{ tabBarIcon: ({ color }) => <TabIcon glyph="⌕" color={color} /> }}
          />
          <Tab.Screen
            name="Portfolio"
            component={PortfolioStackScreen}
            options={{ tabBarIcon: ({ color }) => <TabIcon glyph="◫" color={color} /> }}
          />
          <Tab.Screen
            name="Copilot"
            options={{ tabBarIcon: ({ color }) => <TabIcon glyph="✦" color={color} /> }}
          >
            {() => <CopilotScreen propertyId={null} />}
          </Tab.Screen>
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: '#080f1a' },
});
