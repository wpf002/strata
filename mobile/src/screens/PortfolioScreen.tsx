import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { getPortfolio, type PortfolioEntry } from '../api';

const { width: SCREEN_W } = Dimensions.get('window');

function formatCurrency(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${v}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

interface SummaryCardProps {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}

function SummaryCard({ label, value, sub, accent = '#f1f5f9' }: SummaryCardProps) {
  return (
    <View style={summaryStyles.card}>
      <Text style={summaryStyles.label}>{label}</Text>
      <Text style={[summaryStyles.value, { color: accent }]}>{value}</Text>
      {sub && <Text style={summaryStyles.sub}>{sub}</Text>}
    </View>
  );
}

const summaryStyles = StyleSheet.create({
  card: {
    width: (SCREEN_W - 48) / 2,
    backgroundColor: '#0d1b2e',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  label: { fontSize: 11, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { fontSize: 20, fontWeight: '900' },
  sub: { fontSize: 11, color: '#64748b', marginTop: 2 },
});

interface PropertyRowProps {
  entry: PortfolioEntry;
  onPress: (e: PortfolioEntry) => void;
}

function PropertyRow({ entry: e, onPress }: PropertyRowProps) {
  const appreciation = e.currentValue - e.purchasePrice;
  const appreciationPct = e.purchasePrice > 0 ? ((appreciation / e.purchasePrice) * 100).toFixed(1) : '0.0';

  return (
    <TouchableOpacity style={styles.row} onPress={() => onPress(e)} activeOpacity={0.75}>
      <View style={styles.rowLeft}>
        <Text style={styles.rowAddress} numberOfLines={1}>{e.address}</Text>
        <Text style={styles.rowLocation}>{e.city}, {e.state} · {e.strategy ?? 'LTR'} · {formatDate(e.acquisitionDate)}</Text>
        <View style={styles.rowMetrics}>
          <Text style={styles.rowPrice}>{formatCurrency(e.currentValue)}</Text>
          <Text style={styles.rowDot}>·</Text>
          <Text style={[styles.rowCashFlow, { color: e.cashFlow >= 0 ? '#22c55e' : '#ef4444' }]}>
            {e.cashFlow >= 0 ? '+' : ''}{formatCurrency(e.cashFlow)}/mo
          </Text>
          <Text style={styles.rowDot}>·</Text>
          <Text style={styles.rowCapRate}>{e.capRate.toFixed(1)}% cap</Text>
        </View>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.rowEquity}>{formatCurrency(e.equity)}</Text>
        <Text style={styles.rowEquityLabel}>equity</Text>
        <Text style={[styles.rowAppreciation, { color: appreciation >= 0 ? '#22c55e' : '#ef4444' }]}>
          {appreciation >= 0 ? '+' : ''}{appreciationPct}%
        </Text>
      </View>
    </TouchableOpacity>
  );
}

interface Props {
  onPropertyPress?: (entry: PortfolioEntry) => void;
}

export default function PortfolioScreen({ onPropertyPress }: Props) {
  const [entries, setEntries] = useState<PortfolioEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await getPortfolio();
      setEntries(data);
    } catch {
      setError('Failed to load portfolio. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const totalEquity = entries.reduce((s, e) => s + e.equity, 0);
  const totalCashFlow = entries.reduce((s, e) => s + e.cashFlow, 0);
  const totalValue = entries.reduce((s, e) => s + e.currentValue, 0);
  const avgCocReturn = entries.length > 0 ? entries.reduce((s, e) => s + e.cocReturn, 0) / entries.length : 0;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#C9A84C" size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Portfolio</Text>
        <Text style={styles.headerSub}>{entries.length} propert{entries.length !== 1 ? 'ies' : 'y'}</Text>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={entries}
        keyExtractor={e => e.id}
        renderItem={({ item }) => (
          <PropertyRow entry={item} onPress={e => onPropertyPress?.(e)} />
        )}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C9A84C" />}
        ListHeaderComponent={
          entries.length > 0 ? (
            <View style={styles.summaryGrid}>
              <SummaryCard label="Total Equity" value={formatCurrency(totalEquity)} sub="across all properties" accent="#C9A84C" />
              <SummaryCard label="Monthly Cash Flow" value={`${totalCashFlow >= 0 ? '+' : ''}${formatCurrency(totalCashFlow)}`} sub="net income" accent={totalCashFlow >= 0 ? '#22c55e' : '#ef4444'} />
              <SummaryCard label="Portfolio Value" value={formatCurrency(totalValue)} sub="current est." accent="#f1f5f9" />
              <SummaryCard label="Avg CoC Return" value={`${avgCocReturn.toFixed(1)}%`} sub="annualized" accent="#94a3b8" />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No Properties Yet</Text>
            <Text style={styles.emptySub}>Add properties to your portfolio from the Intelligence view.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080f1a' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#080f1a' },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#0d1b2e',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#f1f5f9' },
  headerSub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  list: { padding: 16, gap: 10 },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  row: {
    backgroundColor: '#0d1b2e',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowLeft: { flex: 1, marginRight: 12 },
  rowAddress: { fontSize: 14, fontWeight: '700', color: '#f1f5f9', marginBottom: 2 },
  rowLocation: { fontSize: 11, color: '#64748b', marginBottom: 6 },
  rowMetrics: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowPrice: { fontSize: 13, fontWeight: '800', color: '#f1f5f9' },
  rowDot: { fontSize: 12, color: '#334155' },
  rowCashFlow: { fontSize: 12, fontWeight: '700' },
  rowCapRate: { fontSize: 12, fontWeight: '700', color: '#C9A84C' },
  rowRight: { alignItems: 'flex-end' },
  rowEquity: { fontSize: 16, fontWeight: '900', color: '#f1f5f9' },
  rowEquityLabel: { fontSize: 10, color: '#64748b', marginTop: 1 },
  rowAppreciation: { fontSize: 12, fontWeight: '700', marginTop: 3 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#94a3b8' },
  emptySub: { fontSize: 13, color: '#475569', marginTop: 6, textAlign: 'center', paddingHorizontal: 32 },
  errorBanner: { backgroundColor: 'rgba(239,68,68,0.1)', padding: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(239,68,68,0.2)' },
  errorText: { color: '#f87171', fontSize: 13, textAlign: 'center' },
});
