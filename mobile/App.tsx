import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import SearchScreen from './src/screens/SearchScreen';
import UnderwriteScreen from './src/screens/UnderwriteScreen';

type Screen = 
  | { name: 'Search' }
  | { name: 'Underwrite'; propertyId: string };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'Search' });

  return (
    <View style={styles.root}>
      {screen.name === 'Search' && (
        <SearchScreen
          onPropertyPress={id => setScreen({ name: 'Underwrite', propertyId: id })}
          onUnderwritePress={id => setScreen({ name: 'Underwrite', propertyId: id })}
        />
      )}
      {screen.name === 'Underwrite' && (
        <UnderwriteScreen
          propertyId={screen.propertyId}
          onBack={() => setScreen({ name: 'Search' })}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
