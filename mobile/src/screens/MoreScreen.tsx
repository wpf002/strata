/**
 * "More" hub — the destinations that don't earn a permanent tab.
 *
 * Five tabs is the practical ceiling on a phone, so Market Pulse and Settings
 * live one tap deeper rather than being cut. Search, Watchlist, Portfolio and
 * Copilot are the four you actually reach for in the field.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius, space } from '../theme';

const ITEMS: Array<{ route: string; title: string; body: string }> = [
  {
    route: 'Markets',
    title: 'Market Pulse',
    body: 'Regime, median price, inventory and cap rates across every market STRATA covers.',
  },
  {
    route: 'Settings',
    title: 'Settings',
    body: 'Your profile, the API this build points at, and sign out.',
  },
];

export default function MoreScreen({ navigation }: any) {
  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      {ITEMS.map(item => (
        <TouchableOpacity
          key={item.route}
          style={s.row}
          onPress={() => navigation.navigate(item.route)}
          activeOpacity={0.75}
          accessibilityRole="button"
        >
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{item.title}</Text>
            <Text style={s.body}>{item.body}</Text>
          </View>
          <Text style={s.chevron}>›</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    marginBottom: space.md,
  },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  body: { color: colors.textFaint, fontSize: 12, marginTop: 3, lineHeight: 17 },
  chevron: { color: colors.textGhost, fontSize: 26, fontWeight: '300' },
});
