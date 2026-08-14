/**
 * Shared building blocks for the mobile screens.
 *
 * The five original screens each rebuilt cards, badges, metric rows and empty
 * states from scratch, so they diverged in padding, radius and colour. These
 * are the pieces every screen actually needs.
 */
import React, { type ReactNode } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from 'react-native';
import { colors, radius, scoreColor, space } from '../theme';

// ── Card ─────────────────────────────────────────────────────────────────────

export function Card({ children, style, onPress }: {
  children: ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
}) {
  if (onPress) {
    return (
      <TouchableOpacity style={[s.card, style]} onPress={onPress} activeOpacity={0.75}>
        {children}
      </TouchableOpacity>
    );
  }
  return <View style={[s.card, style]}>{children}</View>;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={s.sectionTitleRow}>
      <Text style={s.sectionTitle}>{children}</Text>
      {right}
    </View>
  );
}

// ── Badges ───────────────────────────────────────────────────────────────────

export function ScoreBadge({ score, label }: { score: number; label?: string }) {
  const c = scoreColor(score);
  return (
    <View style={[s.badge, { backgroundColor: c + '20', borderColor: c + '55' }]}>
      <Text style={[s.badgeScore, { color: c }]}>{score}</Text>
      {label ? <Text style={[s.badgeLabel, { color: c }]}>{label}</Text> : null}
    </View>
  );
}

export function Pill({ text, tone = 'neutral' }: {
  text: string;
  tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'gold';
}) {
  const map = {
    neutral: [colors.textMuted, 'rgba(148,163,184,0.14)'],
    good: [colors.green, colors.greenFaint],
    warn: [colors.amber, colors.amberFaint],
    bad: [colors.red, colors.redFaint],
    gold: [colors.gold, colors.goldFaint],
  } as const;
  const [fg, bg] = map[tone];
  return (
    <View style={[s.pill, { backgroundColor: bg, borderColor: fg + '55' }]}>
      <Text style={[s.pillText, { color: fg }]}>{text}</Text>
    </View>
  );
}

// ── Metric rows ──────────────────────────────────────────────────────────────

export function MetricRow({ label, value, color, hint }: {
  label: string;
  value: string;
  color?: string;
  hint?: string;
}) {
  return (
    <View style={s.metricRow}>
      <View style={{ flex: 1 }}>
        <Text style={s.metricLabel}>{label}</Text>
        {hint ? <Text style={s.metricHint}>{hint}</Text> : null}
      </View>
      <Text style={[s.metricValue, color ? { color } : null]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

export function StatTile({ label, value, color, sub }: {
  label: string;
  value: string;
  color?: string;
  sub?: string;
}) {
  return (
    <View style={s.tile}>
      <Text style={s.tileLabel}>{label.toUpperCase()}</Text>
      <Text style={[s.tileValue, color ? { color } : null]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {sub ? <Text style={s.tileSub}>{sub}</Text> : null}
    </View>
  );
}

// ── States ───────────────────────────────────────────────────────────────────

export function Loading({ label }: { label?: string }) {
  return (
    <View style={s.centre}>
      <ActivityIndicator color={colors.gold} />
      {label ? <Text style={s.centreText}>{label}</Text> : null}
    </View>
  );
}

export function EmptyState({ title, body, actionLabel, onAction }: {
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={s.centre}>
      <Text style={s.emptyTitle}>{title}</Text>
      {body ? <Text style={s.centreText}>{body}</Text> : null}
      {actionLabel && onAction ? (
        <TouchableOpacity style={s.primaryBtn} onPress={onAction} activeOpacity={0.8}>
          <Text style={s.primaryBtnText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={s.centre}>
      <Text style={[s.emptyTitle, { color: colors.red }]}>Something went wrong</Text>
      <Text style={s.centreText}>{message}</Text>
      {onRetry ? (
        <TouchableOpacity style={s.primaryBtn} onPress={onRetry} activeOpacity={0.8}>
          <Text style={s.primaryBtnText}>Try again</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// ── Buttons ──────────────────────────────────────────────────────────────────

export function PrimaryButton({ label, onPress, disabled }: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[s.primaryBtn, disabled && { opacity: 0.45 }]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <Text style={s.primaryBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

export function GhostButton({ label, onPress, tone }: {
  label: string;
  onPress: () => void;
  tone?: 'danger';
}) {
  return (
    <TouchableOpacity style={s.ghostBtn} onPress={onPress} activeOpacity={0.8}>
      <Text style={[s.ghostBtnText, tone === 'danger' && { color: colors.red }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    marginBottom: space.md,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.sm,
  },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },

  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  badgeScore: { fontSize: 13, fontWeight: '700' },
  badgeLabel: { fontSize: 11, opacity: 0.75 },

  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  pillText: { fontSize: 11, fontWeight: '600' },

  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: space.md,
  },
  metricLabel: { color: colors.textFaint, fontSize: 13 },
  metricHint: { color: colors.textGhost, fontSize: 11, marginTop: 1 },
  metricValue: { color: colors.text, fontSize: 14, fontWeight: '600' },

  tile: {
    flex: 1,
    minWidth: 140,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
  },
  tileLabel: { color: colors.textFaint, fontSize: 10, letterSpacing: 0.8, marginBottom: 4 },
  tileValue: { color: colors.text, fontSize: 20, fontWeight: '700' },
  tileSub: { color: colors.textGhost, fontSize: 11, marginTop: 2 },

  centre: { alignItems: 'center', justifyContent: 'center', padding: space.xxl, gap: space.sm },
  centreText: { color: colors.textFaint, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: '700', textAlign: 'center' },

  primaryBtn: {
    backgroundColor: colors.gold,
    borderRadius: radius.md,
    paddingVertical: 11,
    paddingHorizontal: 18,
    alignItems: 'center',
    marginTop: space.sm,
  },
  primaryBtnText: { color: '#0f172a', fontSize: 14, fontWeight: '700' },

  ghostBtn: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingVertical: 11,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  ghostBtnText: { color: colors.text, fontSize: 14, fontWeight: '600' },
});
