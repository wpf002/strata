import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, StatusBar,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { calculateUnderwriting, getProperty, fmt } from '../api';
import { colors } from '../theme';

interface Props {
  propertyId: string;
  onBack: () => void;
}

export default function UnderwriteScreen({ propertyId, onBack }: Props) {
  const [property, setProperty] = useState<any>(null);
  const [outputs, setOutputs] = useState<any>(null);

  const [purchasePrice, setPurchasePrice] = useState(342000);
  const [downPct, setDownPct] = useState(25);
  const [rate, setRate] = useState(7.25);
  const [rent, setRent] = useState(2240);
  const [vacancyPct, setVacancyPct] = useState(6);
  const [mgmtPct, setMgmtPct] = useState(8);

  useEffect(() => {
    getProperty(propertyId).then(p => {
      setProperty(p);
      setPurchasePrice(p.price);
      setRent(p.rentEstMid);
    });
  }, [propertyId]);

  const recalc = useCallback(() => {
    calculateUnderwriting({ purchasePrice, downPaymentPct: downPct, interestRate: rate, monthlyRent: rent, vacancyPct, managementPct: mgmtPct })
      .then(setOutputs);
  }, [purchasePrice, downPct, rate, rent, vacancyPct, mgmtPct]);

  useEffect(() => { recalc(); }, [recalc]);

  if (!property) return <View style={styles.container}><Text style={{ color: colors.white, textAlign: 'center', marginTop: 100 }}>Loading…</Text></View>;

  const recColors: Record<string, string> = {
    'Strong Buy': '#34d399', 'Buy': '#C9A84C', 'Avoid': '#f87171',
  };
  const recColor = outputs ? recColors[outputs.recommendation] || '#94a3b8' : '#94a3b8';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.navy950} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerTitle}>
          <Text style={styles.titleText} numberOfLines={1}>{property.address}</Text>
          <Text style={styles.subtitleText}>STRATA Underwrite</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
        {/* Recommendation */}
        {outputs && (
          <View style={[styles.recCard, { borderColor: recColor + '60', backgroundColor: recColor + '15' }]}>
            <Text style={[styles.recTitle, { color: recColor }]}>{outputs.recommendation}</Text>
            <View style={styles.recMetrics}>
              <RecMetric label="Cash Flow" value={`${outputs.cashFlow >= 0 ? '+' : ''}${fmt.currency(outputs.cashFlow)}/mo`} color={outputs.cashFlow >= 0 ? colors.emerald : colors.red} />
              <RecMetric label="Cap Rate" value={fmt.pct(outputs.capRate)} color={colors.gold500} />
              <RecMetric label="DSCR" value={outputs.dscr.toFixed(2)} color={outputs.dscr >= 1.25 ? colors.emerald : colors.red} />
              <RecMetric label="CoC" value={fmt.pct(outputs.cashOnCash)} color={outputs.cashOnCash >= 6 ? colors.emerald : colors.white} />
            </View>
          </View>
        )}

        {/* Assumptions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Assumptions</Text>

          <SliderRow label="Purchase Price" value={purchasePrice} display={fmt.compact(purchasePrice)} min={50000} max={1000000} step={5000} onChange={setPurchasePrice} />
          <SliderRow label="Down Payment" value={downPct} display={`${downPct}% · ${fmt.compact(purchasePrice * downPct / 100)}`} min={3.5} max={100} step={0.5} onChange={setDownPct} />
          <SliderRow label="Interest Rate" value={rate} display={`${rate.toFixed(2)}%`} min={4} max={14} step={0.125} onChange={setRate} />
          <SliderRow label="Monthly Rent" value={rent} display={fmt.currency(rent)} min={500} max={6000} step={50} onChange={setRent} />
          <SliderRow label="Vacancy Rate" value={vacancyPct} display={`${vacancyPct}%`} min={0} max={25} step={1} onChange={setVacancyPct} />
          <SliderRow label="Mgmt Fee" value={mgmtPct} display={`${mgmtPct}%`} min={0} max={15} step={0.5} onChange={setMgmtPct} />
        </View>

        {/* P&L breakdown */}
        {outputs && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Monthly P&L</Text>
            <PLRow label="Gross Rent" value={fmt.currency(rent)} />
            <PLRow label="Vacancy Loss" value={`-${fmt.currency(rent * vacancyPct / 100)}`} negative />
            <PLRow label="Eff. Gross Income" value={fmt.currency(outputs.noi + outputs.mortgage)} highlight />
            <PLRow label="Operating Expenses" value={`-${fmt.currency(outputs.noi + outputs.mortgage - outputs.noi - rent * (1 - vacancyPct / 100) + rent * (1 - vacancyPct / 100) - outputs.noi)}`} negative />
            <PLRow label="NOI" value={fmt.currency(outputs.noi)} />
            <PLRow label="Mortgage" value={`-${fmt.currency(outputs.mortgage)}`} negative />
            <View style={styles.divider} />
            <View style={styles.netRow}>
              <Text style={styles.netLabel}>Net Cash Flow</Text>
              <Text style={[styles.netValue, { color: outputs.cashFlow >= 0 ? colors.emerald : colors.red }]}>
                {outputs.cashFlow >= 0 ? '+' : ''}{fmt.currency(outputs.cashFlow)}
              </Text>
            </View>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

function SliderRow({ label, value, display, min, max, step, onChange }: {
  label: string; value: number; display: string; min: number; max: number; step: number; onChange: (v: number) => void;
}) {
  return (
    <View style={slStyles.row}>
      <View style={slStyles.labelRow}>
        <Text style={slStyles.label}>{label}</Text>
        <Text style={slStyles.value}>{display}</Text>
      </View>
      <Slider
        style={slStyles.slider}
        minimumValue={min} maximumValue={max} step={step} value={value}
        onValueChange={onChange}
        minimumTrackTintColor={colors.gold500}
        maximumTrackTintColor="rgba(255,255,255,0.1)"
        thumbTintColor={colors.gold500}
      />
    </View>
  );
}

function RecMetric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={{ fontSize: 10, color: colors.slate400, marginBottom: 3 }}>{label}</Text>
      <Text style={{ fontSize: 15, fontWeight: '700', color, fontFamily: 'Courier' }}>{value}</Text>
    </View>
  );
}

function PLRow({ label, value, highlight, negative }: { label: string; value: string; highlight?: boolean; negative?: boolean }) {
  return (
    <View style={plStyles.row}>
      <Text style={plStyles.label}>{label}</Text>
      <Text style={[plStyles.value, highlight && { color: colors.gold500 }, negative && { color: colors.red }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.navy950 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)', gap: 12 },
  backBtn: { paddingVertical: 4 },
  backText: { color: colors.slate400, fontSize: 14 },
  headerTitle: { flex: 1 },
  titleText: { color: colors.white, fontSize: 14, fontWeight: '600' },
  subtitleText: { color: colors.slate500, fontSize: 11, marginTop: 1 },
  scroll: { flex: 1 },
  recCard: { margin: 16, borderRadius: 16, borderWidth: 1, padding: 16 },
  recTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 14 },
  recMetrics: { flexDirection: 'row' },
  section: { backgroundColor: colors.navy800, borderRadius: 16, margin: 16, marginTop: 0, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: colors.white, marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.8 },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginVertical: 10 },
  netRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  netLabel: { fontSize: 15, fontWeight: '700', color: colors.white },
  netValue: { fontSize: 22, fontWeight: '700', fontFamily: 'Courier' },
});

const slStyles = StyleSheet.create({
  row: { marginBottom: 16 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  label: { fontSize: 13, color: colors.slate400 },
  value: { fontSize: 13, color: colors.gold400, fontFamily: 'Courier', fontWeight: '600' },
  slider: { width: '100%', height: 28 },
});

const plStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  label: { fontSize: 13, color: colors.slate400 },
  value: { fontSize: 13, fontWeight: '600', color: colors.white, fontFamily: 'Courier' },
});
