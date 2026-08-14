import React, { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import {
  addToWatchlist,
  createWatchlist,
  getProperty,
  getWatchlists,
  removeFromWatchlist,
  type MobileProperty,
} from '../api';

const { width: SCREEN_W } = Dimensions.get('window');

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

interface MetricCardProps {
  label: string;
  value: string;
  accent?: string;
}

function MetricCard({ label, value, accent = '#f1f5f9' }: MetricCardProps) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color: accent }]}>{value}</Text>
    </View>
  );
}

interface Props {
  propertyId: string;
  onBack: () => void;
  onUnderwrite?: () => void;
}

export default function IntelligenceScreen({ propertyId, onBack, onUnderwrite }: Props) {
  const [property, setProperty] = useState<MobileProperty | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [watched, setWatched] = useState(false);
  const [watchlistId, setWatchlistId] = useState<string | null>(null);

  useEffect(() => {
    getProperty(propertyId)
      .then(setProperty)
      .catch(() => setError('Failed to load property details.'))
      .finally(() => setLoading(false));
  }, [propertyId]);

  // The star used to be local state only: it lit up, saved nothing, and was
  // blank again on the next visit. Reflect the real watchlist instead.
  useEffect(() => {
    let cancelled = false;
    getWatchlists()
      .then(lists => {
        if (cancelled) return;
        const list = lists[0];
        setWatchlistId(list?.id ?? null);
        setWatched(!!list?.propertyIds.includes(propertyId));
      })
      .catch(() => { /* leave unwatched; toggling will create the list */ });
    return () => { cancelled = true; };
  }, [propertyId]);

  const toggleWatch = async () => {
    const next = !watched;
    setWatched(next);  // optimistic — the star should respond instantly
    try {
      let id = watchlistId;
      if (!id) {
        id = (await createWatchlist('My Watchlist')).id;
        setWatchlistId(id);
      }
      if (next) await addToWatchlist(id, propertyId);
      else await removeFromWatchlist(id, propertyId);
    } catch {
      setWatched(!next);  // roll back if the server rejected it
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#C9A84C" size="large" />
      </View>
    );
  }

  if (error || !property) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error ?? 'Property not found.'}</Text>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const p = property;
  const sc = scoreColor(p.dealScore);
  // Was `(cashFlow + (price * capRate/100) / 12) * 12`, which adds a year of
  // NOI to a year of cash flow and calls the result revenue — on a $315k
  // listing that reported $4K of annual gross rent. Derived properly:
  //   revenue      = rent x 12
  //   NOI          = price x cap rate        (that is the definition)
  //   opex         = revenue - NOI
  //   debt service = NOI - annual cash flow
  const annualRevenue = p.rentEstMid * 12;
  const annualNoi = p.price * (p.capRate / 100);
  const estimatedExpenses = Math.max(0, annualRevenue - annualNoi);
  const annualDebtService = Math.max(0, annualNoi - p.cashFlow * 12);
  const grossYield = annualRevenue > 0 ? (annualRevenue / p.price * 100).toFixed(1) : '—';

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.headerBack}>
          <Text style={styles.headerBackText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>Intelligence</Text>
        <TouchableOpacity
          style={[styles.watchBtn, watched && styles.watchBtnActive]}
          onPress={toggleWatch}
        >
          <Text style={[styles.watchBtnText, watched && styles.watchBtnTextActive]}>
            {watched ? '★ Watching' : '☆ Watch'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero image */}
        {p.image ? (
          <Image source={{ uri: p.image }} style={styles.heroImage} resizeMode="cover" />
        ) : (
          <View style={[styles.heroImage, styles.heroPlaceholder]} />
        )}

        {/* Deal score overlay */}
        <View style={styles.scoreOverlay}>
          <View style={[styles.scoreBadge, { backgroundColor: sc + '20', borderColor: sc + '50' }]}>
            <Text style={[styles.scoreNumber, { color: sc }]}>{p.dealScore}</Text>
            <Text style={[styles.scoreLabel, { color: sc }]}>Deal Score</Text>
          </View>
        </View>

        <View style={styles.content}>
          {/* Address */}
          <View style={styles.section}>
            <Text style={styles.address}>{p.address}</Text>
            <Text style={styles.location}>{p.city}, {p.state} {p.zip}</Text>
          </View>

          {/* Price & basics */}
          <View style={styles.section}>
            <Text style={styles.price}>{formatCurrency(p.price)}</Text>
            <Text style={styles.basics}>{p.beds} bd · {p.baths} ba · {p.sqft?.toLocaleString()} sqft</Text>
          </View>

          {/* Key metrics */}
          <Text style={styles.sectionTitle}>Key Metrics</Text>
          <View style={styles.metricsGrid}>
            <MetricCard label="Cap Rate" value={`${p.capRate?.toFixed(1)}%`} accent="#C9A84C" />
            <MetricCard
              label="Monthly Cash Flow"
              value={`${p.cashFlow >= 0 ? '+' : ''}${formatCurrency(p.cashFlow)}`}
              accent={p.cashFlow >= 0 ? '#22c55e' : '#ef4444'}
            />
            <MetricCard label="Gross Yield" value={grossYield === '—' ? '—' : `${grossYield}%`} accent="#94a3b8" />
            <MetricCard label="Price / SqFt" value={`$${Math.round(p.price / (p.sqft || 1))}`} accent="#94a3b8" />
          </View>

          {/* Financial breakdown */}
          <Text style={styles.sectionTitle}>Annual Financials (Est.)</Text>
          <View style={styles.financials}>
            <View style={styles.financialRow}>
              <Text style={styles.financialLabel}>Gross Revenue</Text>
              <Text style={styles.financialValue}>{formatCurrency(annualRevenue)}</Text>
            </View>
            <View style={styles.financialRow}>
              <Text style={styles.financialLabel}>Operating Expenses</Text>
              <Text style={[styles.financialValue, { color: '#ef4444' }]}>−{formatCurrency(estimatedExpenses)}</Text>
            </View>
            <View style={styles.financialRow}>
              <Text style={styles.financialLabel}>Net Operating Income</Text>
              <Text style={styles.financialValue}>{formatCurrency(annualNoi)}</Text>
            </View>
            <View style={styles.financialRow}>
              <Text style={styles.financialLabel}>Debt Service</Text>
              <Text style={[styles.financialValue, { color: '#ef4444' }]}>−{formatCurrency(annualDebtService)}</Text>
            </View>
            <View style={[styles.financialRow, styles.financialTotal]}>
              <Text style={styles.financialTotalLabel}>Net Cash Flow</Text>
              <Text style={[styles.financialTotalValue, { color: p.cashFlow * 12 >= 0 ? '#22c55e' : '#ef4444' }]}>
                {p.cashFlow * 12 >= 0 ? '+' : ''}{formatCurrency(p.cashFlow * 12)}/yr
              </Text>
            </View>
          </View>

          {/* Score breakdown */}
          <Text style={styles.sectionTitle}>Deal Score Breakdown</Text>
          <View style={styles.scoreBreakdown}>
            {[
              { label: 'Cash Flow', score: Math.min(100, Math.max(0, 50 + p.cashFlow / 10)) },
              { label: 'Cap Rate', score: Math.min(100, (p.capRate / 10) * 100) },
              { label: 'Location', score: 72 },
              { label: 'Market Trend', score: 68 },
            ].map(item => (
              <View key={item.label} style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>{item.label}</Text>
                <View style={styles.breakdownBar}>
                  <View style={[styles.breakdownFill, { width: `${item.score}%` as any, backgroundColor: scoreColor(item.score) }]} />
                </View>
                <Text style={[styles.breakdownScore, { color: scoreColor(item.score) }]}>{Math.round(item.score)}</Text>
              </View>
            ))}
          </View>
        </View>
          {onUnderwrite ? (
            <TouchableOpacity style={styles.underwriteBtn} onPress={onUnderwrite} activeOpacity={0.85}>
              <Text style={styles.underwriteBtnText}>Underwrite this deal</Text>
            </TouchableOpacity>
          ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080f1a' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#080f1a' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0d1b2e',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerBack: { paddingVertical: 4, paddingRight: 12 },
  headerBackText: { fontSize: 18, color: '#C9A84C', fontWeight: '500' },
  headerTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: '#f1f5f9', textAlign: 'center' },
  watchBtn: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8,
    borderWidth: 1, borderColor: 'rgba(201,168,76,0.3)',
  },
  watchBtnActive: { backgroundColor: 'rgba(201,168,76,0.15)', borderColor: '#C9A84C' },
  watchBtnText: { fontSize: 12, color: '#94a3b8', fontWeight: '600' },
  watchBtnTextActive: { color: '#C9A84C' },
  underwriteBtn: {
    backgroundColor: '#c9a84c',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 8,
  },
  underwriteBtnText: { color: '#0f172a', fontSize: 15, fontWeight: '800' },
  scroll: { flex: 1 },
  heroImage: { width: SCREEN_W, height: 220 },
  heroPlaceholder: { backgroundColor: '#1e293b' },
  scoreOverlay: {
    position: 'absolute',
    top: 180,
    right: 16,
    zIndex: 10,
  },
  scoreBadge: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
  },
  scoreNumber: { fontSize: 28, fontWeight: '900' },
  scoreLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  content: { padding: 16 },
  section: { marginBottom: 12 },
  address: { fontSize: 18, fontWeight: '800', color: '#f1f5f9', lineHeight: 24 },
  location: { fontSize: 13, color: '#64748b', marginTop: 2 },
  price: { fontSize: 26, fontWeight: '900', color: '#f1f5f9' },
  basics: { fontSize: 13, color: '#94a3b8', marginTop: 3 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, marginTop: 16 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metricCard: {
    width: (SCREEN_W - 48) / 2,
    backgroundColor: '#0d1b2e',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  metricLabel: { fontSize: 11, color: '#64748b', marginBottom: 4 },
  metricValue: { fontSize: 18, fontWeight: '800' },
  financials: {
    backgroundColor: '#0d1b2e',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: 10,
  },
  financialRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  financialLabel: { fontSize: 13, color: '#94a3b8' },
  financialValue: { fontSize: 13, fontWeight: '700', color: '#f1f5f9' },
  financialTotal: { paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  financialTotalLabel: { fontSize: 14, fontWeight: '700', color: '#f1f5f9' },
  financialTotalValue: { fontSize: 16, fontWeight: '900' },
  scoreBreakdown: {
    backgroundColor: '#0d1b2e', borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', gap: 10,
  },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  breakdownLabel: { width: 88, fontSize: 12, color: '#94a3b8' },
  breakdownBar: { flex: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' },
  breakdownFill: { height: '100%', borderRadius: 3 },
  breakdownScore: { width: 28, fontSize: 12, fontWeight: '700', textAlign: 'right' },
  errorText: { fontSize: 15, color: '#94a3b8', marginBottom: 16 },
  backBtn: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#0d1b2e', borderRadius: 8 },
  backBtnText: { fontSize: 14, color: '#C9A84C', fontWeight: '600' },
});
