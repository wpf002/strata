import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  RefreshControl,
} from 'react-native';
import { searchProperties, MobileProperty } from '../api';

function scoreColor(score: number): string {
  if (score >= 70) return '#22c55e';
  if (score >= 50) return '#f59e0b';
  if (score >= 25) return '#f97316';
  return '#ef4444';
}

function formatCurrency(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${v}`;
}

interface PropertyCardProps {
  property: MobileProperty;
  onPress: (p: MobileProperty) => void;
}

function PropertyCard({ property: p, onPress }: PropertyCardProps) {
  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress(p)} activeOpacity={0.75}>
      {p.image ? (
        <Image source={{ uri: p.image }} style={styles.image} resizeMode="cover" />
      ) : (
        <View style={[styles.image, styles.imagePlaceholder]} />
      )}
      <View style={styles.cardBody}>
        <View style={styles.cardHeader}>
          <Text style={styles.address} numberOfLines={1}>{p.address}</Text>
          <View style={[styles.scoreBadge, { backgroundColor: scoreColor(p.dealScore) + '20', borderColor: scoreColor(p.dealScore) + '40' }]}>
            <Text style={[styles.scoreText, { color: scoreColor(p.dealScore) }]}>{p.dealScore}</Text>
          </View>
        </View>
        <Text style={styles.location}>{p.city}, {p.state} {p.zip}</Text>
        <View style={styles.metrics}>
          <Text style={styles.price}>{formatCurrency(p.price)}</Text>
          <Text style={styles.metricDot}>·</Text>
          <Text style={styles.metric}>{p.beds}bd / {p.baths}ba</Text>
          <Text style={styles.metricDot}>·</Text>
          <Text style={styles.metric}>{p.sqft?.toLocaleString()} sqft</Text>
        </View>
        <View style={styles.metrics}>
          <Text style={styles.capRate}>{p.capRate?.toFixed(1)}% cap</Text>
          <Text style={styles.metricDot}>·</Text>
          <Text style={[styles.cashFlow, { color: (p.cashFlow ?? 0) >= 0 ? '#22c55e' : '#ef4444' }]}>
            {(p.cashFlow ?? 0) >= 0 ? '+' : ''}{formatCurrency(p.cashFlow ?? 0)}/mo
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

interface Props {
  onPropertyPress?: (property: MobileProperty) => void;
}

export default function SearchScreen({ onPropertyPress }: Props) {
  const [query, setQuery] = useState('');
  const [properties, setProperties] = useState<MobileProperty[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (q?: string) => {
    setLoading(true);
    setError(null);
    try {
      const results = await searchProperties(q || undefined);
      setProperties(results);
    } catch {
      setError('Failed to load properties. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load(query);
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchBar}>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search city, ZIP, address…"
            placeholderTextColor="#475569"
            returnKeyType="search"
            onSubmitEditing={() => load(query)}
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      {/* Error */}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* List */}
      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator color="#C9A84C" size="large" />
        </View>
      ) : (
        <FlatList
          data={properties}
          keyExtractor={p => p.id}
          renderItem={({ item }) => (
            <PropertyCard property={item} onPress={p => onPropertyPress?.(p)} />
          )}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C9A84C" />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>No properties found.</Text>
              <Text style={styles.emptySubText}>Try a different city or ZIP code.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080f1a' },
  searchBar: {
    padding: 16,
    paddingBottom: 8,
    backgroundColor: '#0d1b2e',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#f1f5f9',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cameraBtn: {
    width: 44, height: 44, borderRadius: 10,
    backgroundColor: 'rgba(201,168,76,0.12)',
    borderWidth: 1, borderColor: 'rgba(201,168,76,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  cameraIcon: { fontSize: 20 },
  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: '#0d1b2e',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  image: { width: '100%', height: 160 },
  imagePlaceholder: { backgroundColor: '#1e293b' },
  cardBody: { padding: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  address: { flex: 1, fontSize: 14, fontWeight: '700', color: '#f1f5f9', marginRight: 8 },
  scoreBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 1 },
  scoreText: { fontSize: 13, fontWeight: '800' },
  location: { fontSize: 12, color: '#64748b', marginBottom: 8 },
  metrics: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 },
  price: { fontSize: 15, fontWeight: '800', color: '#f1f5f9' },
  metric: { fontSize: 12, color: '#94a3b8' },
  metricDot: { fontSize: 12, color: '#334155' },
  capRate: { fontSize: 12, fontWeight: '700', color: '#C9A84C' },
  cashFlow: { fontSize: 12, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#94a3b8' },
  emptySubText: { fontSize: 13, color: '#475569', marginTop: 4 },
  errorBanner: { backgroundColor: 'rgba(239,68,68,0.1)', padding: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(239,68,68,0.2)' },
  errorText: { color: '#f87171', fontSize: 13, textAlign: 'center' },
});
