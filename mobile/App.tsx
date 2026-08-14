import React, { useEffect, useState } from 'react';
import { StatusBar, Platform, StyleSheet, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { supabase } from './src/supabase';
import { setUnauthorizedHandler } from './src/api';
import LoginScreen from './src/screens/LoginScreen';
import SearchScreen from './src/screens/SearchScreen';
import IntelligenceScreen from './src/screens/IntelligenceScreen';
import UnderwriteScreen from './src/screens/UnderwriteScreen';
import PortfolioScreen from './src/screens/PortfolioScreen';
import CopilotScreen from './src/screens/CopilotScreen';
import WatchlistScreen from './src/screens/WatchlistScreen';
import MarketPulseScreen from './src/screens/MarketPulseScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import MoreScreen from './src/screens/MoreScreen';
import ErrorBoundary from './src/components/ErrorBoundary';
import { BriefcaseIcon, ChatIcon, GridIcon, SearchIcon, StarIcon } from './src/components/TabIcons';
import { colors } from './src/theme';
import type { MobileProperty, PortfolioEntry } from './src/api';

// Param lists — keeps typing tight as screens grow.
export type PropertyStackParamList = {
  SearchList: undefined;
  Property: { propertyId: string };
  Underwrite: { propertyId: string };
};

export type MoreStackParamList = {
  MoreHome: undefined;
  Markets: undefined;
  Settings: undefined;
};

export type TabParamList = {
  Search: undefined;
  Watchlist: undefined;
  Portfolio: undefined;
  Copilot: undefined;
  More: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

const stackOptions = {
  headerStyle: { backgroundColor: colors.surface },
  headerTintColor: colors.text,
  headerTitleStyle: { color: colors.text },
  contentStyle: { backgroundColor: colors.bg },
} as const;


/**
 * Screens with `headerShown: false` draw their own header, which would
 * otherwise slide under the status bar and collide with the clock. This adds
 * only the top inset — the tab bar already handles the bottom.
 */
function TopInset({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      {children}
    </SafeAreaView>
  );
}

// ── Search: list → property → underwrite ─────────────────────────────────────

const PropertyStack = createNativeStackNavigator<PropertyStackParamList>();

function SearchStackScreen() {
  return (
    <PropertyStack.Navigator screenOptions={stackOptions}>
      <PropertyStack.Screen name="SearchList" options={{ headerShown: false }}>
        {({ navigation }) => (
          <ErrorBoundary label="Search">
            <TopInset>
              <SearchScreen
                onPropertyPress={(p: MobileProperty) =>
                  navigation.navigate('Property', { propertyId: p.id })
                }
              />
            </TopInset>
          </ErrorBoundary>
        )}
      </PropertyStack.Screen>

      <PropertyStack.Screen name="Property" options={{ headerShown: false }}>
        {({ route, navigation }) => (
          <ErrorBoundary label="Property">
            <IntelligenceScreen
              propertyId={route.params.propertyId}
              onBack={() => navigation.goBack()}
              onUnderwrite={() =>
                navigation.navigate('Underwrite', { propertyId: route.params.propertyId })
              }
            />
          </ErrorBoundary>
        )}
      </PropertyStack.Screen>

      <PropertyStack.Screen name="Underwrite" options={{ title: 'Underwrite' }}>
        {({ route }) => (
          <ErrorBoundary label="Underwrite">
            <UnderwriteScreen route={route} />
          </ErrorBoundary>
        )}
      </PropertyStack.Screen>
    </PropertyStack.Navigator>
  );
}

// ── Watchlist: list → property ───────────────────────────────────────────────

const WatchStack = createNativeStackNavigator();

function WatchlistStackScreen() {
  return (
    <WatchStack.Navigator screenOptions={stackOptions}>
      <WatchStack.Screen name="WatchlistHome" options={{ headerShown: false }}>
        {({ navigation }) => (
          <ErrorBoundary label="Watchlist">
            <TopInset><WatchlistScreen navigation={navigation} /></TopInset>
          </ErrorBoundary>
        )}
      </WatchStack.Screen>
      <WatchStack.Screen name="Property" options={{ headerShown: false }}>
        {({ route, navigation }: any) => (
          <ErrorBoundary label="Property">
            <IntelligenceScreen
              propertyId={route.params.propertyId}
              onBack={() => navigation.goBack()}
              onUnderwrite={() =>
                navigation.navigate('Underwrite', { propertyId: route.params.propertyId })
              }
            />
          </ErrorBoundary>
        )}
      </WatchStack.Screen>
      <WatchStack.Screen name="Underwrite" options={{ title: 'Underwrite' }}>
        {({ route }: any) => (
          <ErrorBoundary label="Underwrite">
            <UnderwriteScreen route={route} />
          </ErrorBoundary>
        )}
      </WatchStack.Screen>
    </WatchStack.Navigator>
  );
}

// ── Portfolio ────────────────────────────────────────────────────────────────

const PortfolioStack = createNativeStackNavigator();

function PortfolioStackScreen() {
  return (
    <PortfolioStack.Navigator screenOptions={stackOptions}>
      <PortfolioStack.Screen name="PortfolioHome" options={{ headerShown: false }}>
        {({ navigation }) => (
          <ErrorBoundary label="Portfolio">
            <TopInset>
              <PortfolioScreen
                onPropertyPress={(e: PortfolioEntry) =>
                  e.propertyId && navigation.navigate('Property', { propertyId: e.propertyId })
                }
              />
            </TopInset>
          </ErrorBoundary>
        )}
      </PortfolioStack.Screen>
      <PortfolioStack.Screen name="Property" options={{ headerShown: false }}>
        {({ route, navigation }: any) => (
          <ErrorBoundary label="Property">
            <IntelligenceScreen
              propertyId={route.params.propertyId}
              onBack={() => navigation.goBack()}
              onUnderwrite={() =>
                navigation.navigate('Underwrite', { propertyId: route.params.propertyId })
              }
            />
          </ErrorBoundary>
        )}
      </PortfolioStack.Screen>
      <PortfolioStack.Screen name="Underwrite" options={{ title: 'Underwrite' }}>
        {({ route }: any) => (
          <ErrorBoundary label="Underwrite">
            <UnderwriteScreen route={route} />
          </ErrorBoundary>
        )}
      </PortfolioStack.Screen>
    </PortfolioStack.Navigator>
  );
}

// ── More: hub → markets / settings ───────────────────────────────────────────

const MoreStack = createNativeStackNavigator<MoreStackParamList>();

function MoreStackScreen() {
  return (
    <MoreStack.Navigator screenOptions={stackOptions}>
      <MoreStack.Screen name="MoreHome" options={{ title: 'More' }}>
        {({ navigation }) => <MoreScreen navigation={navigation} />}
      </MoreStack.Screen>
      <MoreStack.Screen name="Markets" options={{ title: 'Market Pulse' }}>
        {({ navigation }) => (
          <ErrorBoundary label="Market Pulse">
            <MarketPulseScreen navigation={navigation} />
          </ErrorBoundary>
        )}
      </MoreStack.Screen>
      <MoreStack.Screen name="Settings" options={{ title: 'Settings' }}>
        {() => (
          <ErrorBoundary label="Settings">
            <SettingsScreen />
          </ErrorBoundary>
        )}
      </MoreStack.Screen>
    </MoreStack.Navigator>
  );
}

// ── Root ─────────────────────────────────────────────────────────────────────

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
        <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
        <LoginScreen onSuccess={() => {}} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={colors.surface} />
      <NavigationContainer
        theme={{
          dark: true,
          colors: {
            primary: colors.gold,
            background: colors.bg,
            card: colors.surface,
            text: colors.text,
            border: colors.border,
            notification: colors.gold,
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
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
              paddingBottom: Platform.OS === 'ios' ? 20 : 6,
              height: Platform.OS === 'ios' ? 84 : 62,
            },
            tabBarActiveTintColor: colors.gold,
            tabBarInactiveTintColor: colors.textGhost,
            tabBarLabelStyle: {
              fontSize: 10, fontWeight: '600',
              textTransform: 'uppercase', letterSpacing: 0.4,
            },
          }}
        >
          <Tab.Screen
            name="Search"
            component={SearchStackScreen}
            options={{ tabBarIcon: ({ color }) => <SearchIcon color={color} /> }}
          />
          <Tab.Screen
            name="Watchlist"
            component={WatchlistStackScreen}
            options={{ tabBarIcon: ({ color }) => <StarIcon color={color} /> }}
          />
          <Tab.Screen
            name="Portfolio"
            component={PortfolioStackScreen}
            options={{ tabBarIcon: ({ color }) => <BriefcaseIcon color={color} /> }}
          />
          <Tab.Screen
            name="Copilot"
            options={{ tabBarIcon: ({ color }) => <ChatIcon color={color} /> }}
          >
            {() => (
              <ErrorBoundary label="Copilot">
                <TopInset><CopilotScreen propertyId={null} /></TopInset>
              </ErrorBoundary>
            )}
          </Tab.Screen>
          <Tab.Screen
            name="More"
            component={MoreStackScreen}
            options={{ tabBarIcon: ({ color }) => <GridIcon color={color} /> }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: colors.bg },
});
