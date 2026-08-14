/**
 * Market Pulse — the markets STRATA covers, with the figures that decide
 * whether a market is worth searching at all.
 *
 * Renders nothing rather than estimates when the feed is unreachable. The web
 * version used to substitute five hardcoded markets on failure and label them
 * "live"; that is not repeated here.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { getMarketSummary, type MarketSummary } from '../api';
import { colors, fmt, space } from '../theme';
import { Card, ErrorState, Loading, MetricRow, Pill } from '../components/UI';

const REGIME_TONE: Record<string, 'good' | 'warn' | 'bad' | 'gold' | 'neutral'> = {
  Hot: 'bad',
  Balanced: 'gold',
  Cooling: 'neutral',
  "Buyer's Market": 'good',
};

const REGIME_NOTE: Record<string, string> = {
  Hot: 'Under 2 months of inventory — sellers hold leverage.',
  Balanced: 'Supply and demand roughly matched.',
  Cooling: 'Inventory rising or prices softening; buyers gaining leverage.',
  "Buyer's Market": 'Excess inventory. Negotiate hard.',
};

export default function MarketPulseScreen({ navigation }: any) {
  const [markets, setMarkets] = useState<MarketSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setMarkets(await getMarketSummary());
    } catch (e: any) {
      setMarkets([]);
      setError(e?.message ?? 'Market data is unavailable right now.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Loading label="Loading markets…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <FlatList
      style={s.container}
      contentContainerStyle={s.content}
      data={markets}
      keyExtractor={m => `${m.city}-${m.state}`}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(); }}
          tintColor={colors.gold}
        />
      }
      ListHeaderComponent={
        <Text style={s.intro}>
          Live conditions across {markets.length} markets. Tap one to see the detail
          or search it.
        </Text>
      }
      renderItem={({ item: m }) => {
        const key = `${m.city}-${m.state}`;
        const open = expanded === key;
        return (
          <Card onPress={() => setExpanded(open ? null : key)}>
            <View style={s.headerRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.city}>{m.city}, {m.state}</Text>
                <Text style={s.regimeNote} numberOfLines={open ? undefined : 1}>
                  {REGIME_NOTE[m.regime] ?? ''}
                </Text>
              </View>
              <Pill text={m.regime} tone={REGIME_TONE[m.regime] ?? 'neutral'} />
            </View>

            <View style={s.quickRow}>
              <View style={s.quick}>
                <Text style={s.quickLabel}>MEDIAN</Text>
                <Text style={s.quickValue}>{fmt.compact(m.medianPrice)}</Text>
              </View>
              <View style={s.quick}>
                <Text style={s.quickLabel}>12MO</Text>
                <Text style={[
                  s.quickValue,
                  { color: m.priceChange12Mo >= 0 ? colors.green : colors.red },
                ]}>
                  {fmt.signedPct(m.priceChange12Mo)}
                </Text>
              </View>
              <View style={s.quick}>
                <Text style={s.quickLabel}>CAP</Text>
                <Text style={[s.quickValue, { color: colors.gold }]}>{fmt.pct(m.capRateMedian)}</Text>
              </View>
              <View style={s.quick}>
                <Text style={s.quickLabel}>INVENTORY</Text>
                <Text style={s.quickValue}>{m.inventoryMonths.toFixed(1)}mo</Text>
              </View>
            </View>

            {open ? (
              <View style={s.detail}>
                <MetricRow label="Days on Market" value={`${Math.round(m.daysOnMarket)} days`} />
                <MetricRow label="Rent Growth 12mo" value={fmt.signedPct(m.rentGrowth12Mo)} />
                <MetricRow label="Vacancy Rate" value={fmt.pct(m.vacancyRate)} />
                <Text
                  style={s.searchLink}
                  onPress={() => navigation?.navigate?.('Search', { query: `${m.city}, ${m.state}` })}
                >
                  Search {m.city} →
                </Text>
              </View>
            ) : null}
          </Card>
        );
      }}
    />
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, paddingBottom: space.xxl },
  intro: { color: colors.textFaint, fontSize: 13, marginBottom: space.md, lineHeight: 18 },

  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  city: { color: colors.text, fontSize: 17, fontWeight: '700' },
  regimeNote: { color: colors.textFaint, fontSize: 12, marginTop: 2, lineHeight: 17 },

  quickRow: { flexDirection: 'row', marginTop: space.md, gap: space.sm },
  quick: { flex: 1 },
  quickLabel: { color: colors.textGhost, fontSize: 9, letterSpacing: 0.6 },
  quickValue: { color: colors.text, fontSize: 15, fontWeight: '700', marginTop: 2 },

  detail: { marginTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  searchLink: { color: colors.gold, fontSize: 13, fontWeight: '600', marginTop: space.md },
});
