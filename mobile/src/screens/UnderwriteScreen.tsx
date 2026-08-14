/**
 * Underwrite — the calculator, which mobile had no equivalent of at all.
 *
 * Deliberately not a port of the desktop page: on a phone the useful thing is
 * to stand in a driveway, pull a listing up, and move three or four numbers to
 * see whether the deal still works. So the inputs are steppers rather than
 * fiddly sliders, the headline verdict is pinned at the top, and the detail is
 * below the fold for anyone who wants it.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  calculateUnderwriting,
  getProperty,
  type MobileProperty,
  type UnderwritingInputs,
  type UnderwritingOutputs,
} from '../api';
import { colors, fmt, radius, space } from '../theme';
import { Card, ErrorState, Loading, MetricRow, Pill, StatTile } from '../components/UI';

const LOAN_TYPES: UnderwritingInputs['loanType'][] = ['30yr Fixed', '15yr Fixed', 'Interest Only'];

const REC_TONE: Record<string, 'good' | 'warn' | 'bad' | 'gold'> = {
  'Strong Buy': 'good',
  'Buy with Negotiation': 'gold',
  Marginal: 'warn',
  Avoid: 'bad',
};

/** +/- stepper. Far easier than a slider on a phone, and exact. */
function Stepper({ label, value, display, step, min, max, onChange }: {
  label: string;
  value: number;
  display: string;
  step: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v * 1000) / 1000));
  return (
    <View style={s.stepper}>
      <View style={{ flex: 1 }}>
        <Text style={s.stepperLabel}>{label}</Text>
        <Text style={s.stepperValue}>{display}</Text>
      </View>
      <View style={s.stepperControls}>
        <TouchableOpacity
          style={s.stepBtn}
          onPress={() => onChange(clamp(value - step))}
          disabled={value <= min}
          accessibilityLabel={`Decrease ${label}`}
        >
          <Text style={[s.stepBtnText, value <= min && { opacity: 0.3 }]}>−</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.stepBtn}
          onPress={() => onChange(clamp(value + step))}
          disabled={value >= max}
          accessibilityLabel={`Increase ${label}`}
        >
          <Text style={[s.stepBtnText, value >= max && { opacity: 0.3 }]}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function UnderwriteScreen({ route }: any) {
  const propertyId: string | undefined = route?.params?.propertyId;

  const [property, setProperty] = useState<MobileProperty | null>(null);
  const [outputs, setOutputs] = useState<UnderwritingOutputs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);

  const [inputs, setInputs] = useState<UnderwritingInputs>({
    purchasePrice: 342_000,
    downPaymentPct: 25,
    interestRate: 7.25,
    loanType: '30yr Fixed',
    monthlyRent: 2_240,
    vacancyPct: 6,
    managementPct: 8,
    maintenancePct: 1,
    insuranceMonthly: 140,
    capexPct: 5,
  });

  // Seed from the property being viewed, including its state so the model
  // applies that state's property tax rather than a national average.
  useEffect(() => {
    if (!propertyId) return;
    let cancelled = false;
    getProperty(propertyId)
      .then(p => {
        if (cancelled || !p) return;
        setProperty(p);
        setInputs(prev => ({
          ...prev,
          propertyId: p.id,
          purchasePrice: p.price || prev.purchasePrice,
          state: p.state || undefined,
        }));
      })
      .catch(() => { /* calculator still works with defaults */ });
    return () => { cancelled = true; };
  }, [propertyId]);

  const recalc = useCallback(async () => {
    setCalculating(true);
    setError(null);
    try {
      setOutputs(await calculateUnderwriting(inputs));
    } catch (e: any) {
      setError(e?.message ?? 'Could not reach the calculator.');
    } finally {
      setCalculating(false);
    }
  }, [inputs]);

  // Debounced so holding down a stepper doesn't fire a request per tap.
  useEffect(() => {
    const t = setTimeout(recalc, 250);
    return () => clearTimeout(t);
  }, [recalc]);

  const set = <K extends keyof UnderwritingInputs>(key: K) => (v: UnderwritingInputs[K]) =>
    setInputs(prev => ({ ...prev, [key]: v }));

  const cashFlowColor = useMemo(
    () => (outputs && outputs.cashFlow >= 0 ? colors.green : colors.red),
    [outputs],
  );

  if (error && !outputs) {
    return <ErrorState message={error} onRetry={recalc} />;
  }
  if (!outputs) {
    return <Loading label="Running the numbers…" />;
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      {property ? (
        <View style={s.header}>
          <Text style={s.address} numberOfLines={1}>{property.address}</Text>
          <Text style={s.location}>
            {property.city}, {property.state}
            {inputs.state ? ` · ${inputs.state} tax rate applied` : ''}
          </Text>
        </View>
      ) : null}

      {/* Verdict first — the one thing worth seeing on a phone. */}
      <Card style={{ borderColor: colors.borderStrong }}>
        <View style={s.verdictRow}>
          <Pill text={outputs.recommendation} tone={REC_TONE[outputs.recommendation] ?? 'neutral'} />
          {calculating ? <Text style={s.recalcHint}>updating…</Text> : null}
        </View>
        <Text style={[s.bigNumber, { color: cashFlowColor }]}>
          {outputs.cashFlow >= 0 ? '+' : ''}{fmt.currency(outputs.cashFlow)}
          <Text style={s.bigNumberUnit}> /mo</Text>
        </Text>
        <Text style={s.bigCaption}>
          {fmt.currency(outputs.annualCashFlow)}/yr after all expenses and debt service
        </Text>

        <View style={s.tileRow}>
          <StatTile label="Cap Rate" value={fmt.pct(outputs.capRate)} color={colors.gold} />
          <StatTile label="Cash on Cash" value={fmt.pct(outputs.cashOnCash)} />
        </View>
        <View style={s.tileRow}>
          <StatTile
            label="DSCR"
            value={outputs.dscr === null ? 'No debt' : fmt.ratio(outputs.dscr)}
            color={
              outputs.dscr === null
                ? colors.textMuted
                : outputs.dscr >= 1.25 ? colors.green : colors.red
            }
            sub={outputs.dscr === null ? 'All-cash purchase' : 'Lenders want 1.25+'}
          />
          <StatTile label="Cash to Close" value={fmt.compact(outputs.totalCashToClose)} />
        </View>
      </Card>

      {/* Inputs */}
      <Card>
        <Text style={s.cardTitle}>Deal</Text>
        <Stepper
          label="Purchase Price" value={inputs.purchasePrice}
          display={fmt.currency(inputs.purchasePrice)}
          step={5_000} min={25_000} max={5_000_000}
          onChange={set('purchasePrice')}
        />
        <Stepper
          label="Down Payment" value={inputs.downPaymentPct}
          display={`${inputs.downPaymentPct}% · ${fmt.compact(inputs.purchasePrice * inputs.downPaymentPct / 100)}`}
          step={2.5} min={0} max={100}
          onChange={set('downPaymentPct')}
        />
        <Stepper
          label="Interest Rate" value={inputs.interestRate}
          display={`${inputs.interestRate.toFixed(3)}%`}
          step={0.125} min={0} max={20}
          onChange={set('interestRate')}
        />

        <Text style={[s.stepperLabel, { marginTop: space.md, marginBottom: space.sm }]}>Loan Type</Text>
        <View style={s.segment}>
          {LOAN_TYPES.map(t => {
            const active = inputs.loanType === t;
            return (
              <TouchableOpacity
                key={t}
                style={[s.segmentItem, active && s.segmentItemActive]}
                onPress={() => set('loanType')(t)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[s.segmentText, active && s.segmentTextActive]}>
                  {t.replace(' Fixed', '')}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Card>

      <Card>
        <Text style={s.cardTitle}>Income &amp; Costs</Text>
        <Stepper
          label="Monthly Rent" value={inputs.monthlyRent}
          display={fmt.currency(inputs.monthlyRent)}
          step={50} min={0} max={25_000}
          onChange={set('monthlyRent')}
        />
        <Stepper
          label="Vacancy" value={inputs.vacancyPct}
          display={`${inputs.vacancyPct}%`}
          step={1} min={0} max={40}
          onChange={set('vacancyPct')}
        />
        <Stepper
          label="Management" value={inputs.managementPct}
          display={`${inputs.managementPct}% of EGI`}
          step={1} min={0} max={25}
          onChange={set('managementPct')}
        />
        <Stepper
          label="Property Tax"
          value={inputs.propertyTaxRatePct ?? 1.1}
          display={`${(inputs.propertyTaxRatePct ?? 1.1).toFixed(1)}% of value/yr`}
          step={0.1} min={0} max={4}
          onChange={set('propertyTaxRatePct')}
        />
      </Card>

      {/* Detail */}
      <Card>
        <Text style={s.cardTitle}>Monthly Breakdown</Text>
        <MetricRow label="Gross Rent" value={fmt.currency(inputs.monthlyRent)} />
        <MetricRow label="Effective Gross Income" value={fmt.currency(outputs.effectiveGrossIncome)} />
        <MetricRow label="Operating Expenses" value={`-${fmt.currency(outputs.totalExpenses)}`} color={colors.red} />
        <MetricRow label="NOI" value={fmt.currency(outputs.noi)} />
        <MetricRow label="Mortgage" value={`-${fmt.currency(outputs.mortgage)}`} color={colors.red} />
        <MetricRow label="Net Cash Flow" value={fmt.currency(outputs.cashFlow)} color={cashFlowColor} />
      </Card>

      <Card>
        <Text style={s.cardTitle}>Scenarios</Text>
        <Text style={s.cardSub}>
          Rent and vacancy stressed up and down. Year-one return includes the
          scenario's appreciation assumption.
        </Text>
        {outputs.scenarios.map(sc => (
          <View key={sc.name} style={s.scenarioRow}>
            <Text style={s.scenarioName}>{sc.name}</Text>
            <Text style={[s.scenarioCash, { color: sc.cashFlow >= 0 ? colors.green : colors.red }]}>
              {sc.cashFlow >= 0 ? '+' : ''}{fmt.currency(sc.cashFlow)}
            </Text>
            <Text style={s.scenarioMeta}>{fmt.pct(sc.capRate)} cap</Text>
            <Text style={s.scenarioMeta}>{fmt.pct(sc.yearOneReturn)} yr-1</Text>
          </View>
        ))}
      </Card>

      <Card>
        <Text style={s.cardTitle}>Break-Even</Text>
        <MetricRow label="Break-Even Rent" value={`${fmt.currency(outputs.breakEvenRent)}/mo`} />
        <MetricRow label="Break-Even Occupancy" value={fmt.pct(outputs.breakEvenOccupancy, 0)} />
        <MetricRow label="Expense Ratio" value={fmt.pct(outputs.expenseRatio, 0)} hint="Opex / EGI" />
        <MetricRow label="GRM" value={outputs.grm ? `${outputs.grm.toFixed(1)}x` : '—'} />
      </Card>

      <Text style={s.footnote}>
        Tax and insurance are estimates, not this property's actual bills.
        Adjust the property tax rate above if you know the real figure.
      </Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, paddingBottom: space.xxl * 2 },

  header: { marginBottom: space.md },
  address: { color: colors.text, fontSize: 18, fontWeight: '700' },
  location: { color: colors.textFaint, fontSize: 13, marginTop: 2 },

  verdictRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  recalcHint: { color: colors.textGhost, fontSize: 11 },
  bigNumber: { fontSize: 38, fontWeight: '800', marginTop: space.sm, letterSpacing: -1 },
  bigNumberUnit: { fontSize: 16, fontWeight: '600', color: colors.textFaint },
  bigCaption: { color: colors.textFaint, fontSize: 12, marginBottom: space.md },

  tileRow: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },

  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '700', marginBottom: space.sm },
  cardSub: { color: colors.textFaint, fontSize: 12, marginBottom: space.md, lineHeight: 17 },

  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.sm,
    gap: space.md,
  },
  stepperLabel: { color: colors.textFaint, fontSize: 12 },
  stepperValue: { color: colors.text, fontSize: 16, fontWeight: '600', marginTop: 2 },
  stepperControls: { flexDirection: 'row', gap: space.sm },
  stepBtn: {
    width: 44, height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { color: colors.text, fontSize: 22, fontWeight: '600', lineHeight: 26 },

  segment: {
    flexDirection: 'row',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  segmentItem: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  segmentItemActive: { backgroundColor: colors.goldFaint },
  segmentText: { color: colors.textFaint, fontSize: 13, fontWeight: '600' },
  segmentTextActive: { color: colors.gold },

  scenarioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: space.sm,
  },
  scenarioName: { color: colors.text, fontSize: 13, fontWeight: '600', width: 46 },
  scenarioCash: { fontSize: 13, fontWeight: '700', flex: 1 },
  scenarioMeta: { color: colors.textFaint, fontSize: 12, width: 66, textAlign: 'right' },

  footnote: {
    color: colors.textGhost,
    fontSize: 11,
    lineHeight: 16,
    marginTop: space.sm,
    paddingHorizontal: space.xs,
  },
});
