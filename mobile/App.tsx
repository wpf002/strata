import React, { useEffect, useState } from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import type { Session } from '@supabase/supabase-js';

import { supabase } from './src/supabase';
import { setUnauthorizedHandler } from './src/api';
import LoginScreen from './src/screens/LoginScreen';
import SearchScreen from './src/screens/SearchScreen';
import type { MobileProperty } from './src/api';

type Screen = 'search';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [_screen, setScreen] = useState<Screen>('search');
  const [_selectedProperty, setSelectedProperty] = useState<MobileProperty | null>(null);

  useEffect(() => {
    // Restore persisted session
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setBootstrapping(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    // Redirect to login on 401
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

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#0d1b2e" />
      <View style={styles.container}>
        <SearchScreen
          onPropertyPress={p => {
            setSelectedProperty(p);
            setScreen('search');
          }}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: '#080f1a' },
  container: { flex: 1, backgroundColor: '#080f1a' },
});
