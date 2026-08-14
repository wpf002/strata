/**
 * Watchlist — the most obviously mobile feature in the product: save a place
 * while you're standing outside it, review the set later.
 *
 * Hydrates each saved id individually and renders results as they land, so one
 * slow live lookup doesn't hold the whole list hostage.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  getProperty,
  getWatchlists,
  removeFromWatchlist,
  type MobileProperty,
} from '../api';
import { colors, fmt, radius, space } from '../theme';
import { Card, EmptyState, ErrorState, Loading, ScoreBadge } from '../components/UI';

export default function WatchlistScreen({ navigation }: any) {
  const [listId, setListId] = useState<string | null>(null);
  const [properties, setProperties] = useState<MobileProperty[]>([]);
  const [missing, setMissing] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const lists = await getWatchlists();
      const list = lists[0] ?? null;
      setListId(list?.id ?? null);

      if (!list || list.propertyIds.length === 0) {
        setProperties([]);
        setMissing(0);
        return;
      }

      // Progressive: each lookup renders as it resolves rather than waiting
      // for the slowest one.
      setProperties([]);
      let gone = 0;
      await Promise.all(
        list.propertyIds.map(async id => {
          try {
            const p = await getProperty(id);
            if (p) setProperties(prev => (prev.some(x => x.id === p.id) ? prev : [...prev, p]));
            else gone += 1;
          } catch {
            gone += 1;
          }
        }),
      );
      setMissing(gone);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load your watchlist.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Refresh whenever the tab regains focus — a property watched from Search
  // should be here when the user switches over.
  useEffect(() => navigation?.addListener?.('focus', load), [navigation, load]);

  const unwatch = async (id: string) => {
    if (!listId) return;
    setProperties(prev => prev.filter(p => p.id !== id));   // optimistic
    try {
      await removeFromWatchlist(listId, id);
    } catch {
      load();  // put it back if the server disagreed
    }
  };

  if (loading) return <Loading label="Loading your watchlist…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  if (properties.length === 0) {
    return (
      <EmptyState
        title="Nothing watched yet"
        body="Tap the star on any property in Search to keep an eye on it. Saved properties show up here with live pricing."
        actionLabel="Go to Search"
        onAction={() => navigation?.navigate?.('Search')}
      />
    );
  }

  return (
    <FlatList
      style={s.container}
      contentContainerStyle={s.content}
      data={properties}
      keyExtractor={p => p.id}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(); }}
          tintColor={colors.gold}
        />
      }
      ListHeaderComponent={
        <Text style={s.count}>
          {properties.length} {properties.length === 1 ? 'property' : 'properties'} watched
          {missing > 0 ? ` · ${missing} no longer available` : ''}
        </Text>
      }
      renderItem={({ item: p }) => (
        <Card onPress={() => navigation?.navigate?.('Property', { propertyId: p.id })} style={s.card}>
          <View style={s.row}>
            {p.image ? (
              <Image source={{ uri: p.image }} style={s.thumb} resizeMode="cover" />
            ) : (
              <View style={[s.thumb, { backgroundColor: colors.surfaceAlt }]} />
            )}
            <View style={s.body}>
              <View style={s.titleRow}>
                <Text style={s.address} numberOfLines={1}>{p.address}</Text>
                <ScoreBadge score={p.dealScore} />
              </View>
              <Text style={s.location} numberOfLines={1}>{p.city}, {p.state} {p.zip}</Text>
              <View style={s.metrics}>
                <Text style={s.price}>{fmt.compact(p.price)}</Text>
                <Text style={s.dot}>·</Text>
                <Text style={s.metric}>{fmt.pct(p.capRate)} cap</Text>
                <Text style={s.dot}>·</Text>
                <Text style={[s.metric, { color: p.cashFlow >= 0 ? colors.green : colors.red }]}>
                  {p.cashFlow >= 0 ? '+' : ''}{fmt.currency(p.cashFlow)}/mo
                </Text>
              </View>
            </View>
          </View>
          <TouchableOpacity
            style={s.unwatch}
            onPress={() => unwatch(p.id)}
            accessibilityLabel={`Remove ${p.address} from watchlist`}
          >
            <Text style={s.unwatchText}>★ Watching</Text>
          </TouchableOpacity>
        </Card>
      )}
    />
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, paddingBottom: space.xxl },
  count: { color: colors.textFaint, fontSize: 13, marginBottom: space.md },

  card: { padding: space.md },
  row: { flexDirection: 'row', gap: space.md },
  thumb: { width: 74, height: 74, borderRadius: radius.md },
  body: { flex: 1, justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  address: { color: colors.text, fontSize: 15, fontWeight: '700', flex: 1 },
  location: { color: colors.textFaint, fontSize: 12, marginTop: 2 },
  metrics: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  price: { color: colors.text, fontSize: 14, fontWeight: '700' },
  metric: { color: colors.textMuted, fontSize: 12 },
  dot: { color: colors.textGhost, fontSize: 12 },

  unwatch: {
    marginTop: space.md,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.gold + '55',
    backgroundColor: colors.goldFaint,
  },
  unwatchText: { color: colors.gold, fontSize: 12, fontWeight: '600' },
});
