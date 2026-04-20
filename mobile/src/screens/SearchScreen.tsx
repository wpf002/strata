import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, StatusBar, ActivityIndicator, Image,
} from 'react-native';
import { getProperties, fmt } from '../api';
import { colors } from '../theme';

type Property = Awaited<ReturnType<typeof getProperties>>[0];

interface Props {
  onPropertyPress: (id: string) => void;
  onUnderwritePress: (id: string) => void;
}

const SORT_OPTIONS = ['Deal Score', 'Cap Rate', 'Cash Flow'];

export default function SearchScreen({ onPropertyPress, onUnderwritePress }: Props) {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('Deal Score');
  const [query, setQuery] = useState('Dallas, TX');

  useEffect(() => {
    setLoading(true);
    getProperties({ sortBy }).then(data => {
      setProperties(data);
      setLoading(false);
    });
  }, [sortBy]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.navy950} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>STRATA</Text>
        <View style={styles.liveDot} />
      </View>

      {/* Search bar */}
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="City, ZIP, address…"
          placeholderTextColor={colors.slate600}
        />
      </View>

      {/* Sort pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sortScroll} contentContainerStyle={styles.sortContent}>
        {SORT_OPTIONS.map(s => (
          <TouchableOpacity key={s} onPress={() => setSortBy(s)} style={[styles.sortPill, sortBy === s && styles.sortPillActive]}>
            <Text style={[styles.sortPillText, sortBy === s && styles.sortPillTextActive]}>{s}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Heading */}
      <View style={styles.feedHeader}>
        <Text style={styles.feedTitle}>Opportunity Feed</Text>
        <Text style={styles.feedSub}>{properties.length} properties · {query}</Text>
      </View>

      {/* List */}
      {loading ? (
        <ActivityIndicator color={colors.gold500} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {properties.map((p, i) => (
            <PropertyCard
              key={p.id}
              property={p}
              isTop={i === 0}
              onPress={() => onPropertyPress(p.id)}
              onUnderwrite={() => onUnderwritePress(p.id)}
            />
          ))}
          <View style={{ height: 100 }} />
        </ScrollView>
      )}
    </View>
  );
}

function DealScoreColor(score: number) {
  if (score >= 70) return colors.emerald;
  if (score >= 50) return colors.gold500;
  if (score >= 30) return '#fb923c';
  return colors.red;
}

function PropertyCard({ property: p, isTop, onPress, onUnderwrite }: {
  property: Property; isTop: boolean; onPress: () => void; onUnderwrite: () => void;
}) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      {/* Top badge */}
      {isTop && <View style={styles.topBadge}><Text style={styles.topBadgeText}>TOP PICK</Text></View>}

      {/* Header row */}
      <View style={styles.cardHeader}>
        <View style={styles.cardAddress}>
          <Text style={styles.addressText} numberOfLines={1}>{p.address}</Text>
          <Text style={styles.cityText}>{p.city}, {p.state} · {p.neighborhood}</Text>
        </View>
        <View style={[styles.dealBadge, { borderColor: DealScoreColor(p.dealScore) + '60', backgroundColor: DealScoreColor(p.dealScore) + '20' }]}>
          <Text style={[styles.dealScore, { color: DealScoreColor(p.dealScore) }]}>{p.dealScore}</Text>
          <Text style={[styles.dealLabel, { color: DealScoreColor(p.dealScore) }]}>Deal</Text>
        </View>
      </View>

      {/* Price + key metrics */}
      <View style={styles.priceRow}>
        <Text style={styles.price}>{fmt.compact(p.price)}</Text>
        <View style={styles.regimePill}>
          <Text style={styles.regimeText}>{p.marketRegime}</Text>
        </View>
      </View>

      {/* Metrics grid */}
      <View style={styles.metrics}>
        <MetricItem label="Cap Rate" value={fmt.pct(p.capRate)} highlight />
        <MetricItem label="Cash Flow" value={`${p.cashFlow >= 0 ? '+' : ''}${fmt.currency(p.cashFlow)}/mo`} positive={p.cashFlow >= 0} />
        <MetricItem label="CoC" value={fmt.pct(p.cashOnCash)} />
        <MetricItem label="DOM" value={`${p.daysOnMarket}d`} />
      </View>

      {/* Risk flags */}
      {p.riskFlags.length > 0 && (
        <View style={styles.flags}>
          {p.riskFlags.slice(0, 2).map((f, i) => (
            <View key={i} style={[styles.flag, { borderColor: f.severity === 'High' ? '#f87171' : f.severity === 'Medium' ? '#fbbf24' : '#38bdf8', backgroundColor: (f.severity === 'High' ? '#f87171' : f.severity === 'Medium' ? '#fbbf24' : '#38bdf8') + '15' }]}>
              <Text style={[styles.flagText, { color: f.severity === 'High' ? '#f87171' : f.severity === 'Medium' ? '#fbbf24' : '#38bdf8' }]}>{f.label}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.underwriteBtn} onPress={onUnderwrite}>
          <Text style={styles.underwriteBtnText}>Underwrite</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.watchBtn}>
          <Text style={styles.watchBtnText}>Watch</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

function MetricItem({ label, value, highlight, positive }: { label: string; value: string; highlight?: boolean; positive?: boolean }) {
  const valueColor = positive === true ? colors.emerald : positive === false ? colors.red : highlight ? colors.gold500 : colors.white;
  return (
    <View style={styles.metricItem}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.navy950 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12, gap: 8 },
  logo: { fontSize: 22, fontWeight: '700', color: colors.white, letterSpacing: 2 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#34d399', marginTop: 2 },
  searchBar: { marginHorizontal: 16, marginBottom: 10 },
  searchInput: { backgroundColor: colors.navy800, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 10, color: colors.white, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 },
  sortScroll: { flexGrow: 0, marginBottom: 12 },
  sortContent: { paddingHorizontal: 16, gap: 8 },
  sortPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  sortPillActive: { backgroundColor: colors.gold500 + '20', borderColor: colors.gold500 + '60' },
  sortPillText: { fontSize: 12, fontWeight: '600', color: colors.slate500 },
  sortPillTextActive: { color: colors.gold400 },
  feedHeader: { paddingHorizontal: 16, marginBottom: 10 },
  feedTitle: { fontSize: 17, fontWeight: '600', color: colors.white },
  feedSub: { fontSize: 12, color: colors.slate500, marginTop: 2 },
  list: { flex: 1, paddingHorizontal: 16 },
  card: { backgroundColor: colors.navy800, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', padding: 16, marginBottom: 12, overflow: 'hidden' },
  topBadge: { position: 'absolute', top: 12, right: 12, backgroundColor: colors.gold500, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  topBadgeText: { fontSize: 9, fontWeight: '700', color: colors.navy950 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 },
  cardAddress: { flex: 1, marginRight: 12 },
  addressText: { fontSize: 15, fontWeight: '600', color: colors.white },
  cityText: { fontSize: 12, color: colors.slate400, marginTop: 2 },
  dealBadge: { alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, minWidth: 44 },
  dealScore: { fontSize: 18, fontWeight: '700', fontFamily: 'Courier' },
  dealLabel: { fontSize: 9, fontWeight: '600' },
  priceRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
  price: { fontSize: 22, fontWeight: '700', color: colors.white, fontFamily: 'Courier' },
  regimePill: { backgroundColor: 'rgba(201,168,76,0.15)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(201,168,76,0.3)' },
  regimeText: { fontSize: 11, fontWeight: '600', color: colors.gold400 },
  metrics: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: 12, marginBottom: 10 },
  metricItem: { flex: 1, alignItems: 'center' },
  metricLabel: { fontSize: 9, color: colors.slate500, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 },
  metricValue: { fontSize: 13, fontWeight: '700', fontFamily: 'Courier' },
  flags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  flag: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  flagText: { fontSize: 11, fontWeight: '500' },
  actions: { flexDirection: 'row', gap: 8 },
  underwriteBtn: { flex: 1, backgroundColor: colors.gold500, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  underwriteBtnText: { fontSize: 13, fontWeight: '700', color: colors.navy950 },
  watchBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', alignItems: 'center' },
  watchBtnText: { fontSize: 13, fontWeight: '600', color: colors.slate400 },
});
