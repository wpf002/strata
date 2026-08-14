/**
 * Settings — profile, environment, and sign out.
 *
 * Sign out did not exist anywhere in the mobile app before this: once you were
 * in, the only way out was deleting the app. That alone makes this screen worth
 * more than its size suggests.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { getProfile, updateProfile, type UserProfile } from '../api';
import { supabase } from '../supabase';
import { API_BASE_URL } from '../constants';
import { colors, radius, space } from '../theme';
import { Card, GhostButton, Loading, MetricRow, PrimaryButton } from '../components/UI';

export default function SettingsScreen() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [name, setName] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = await getProfile();
      setProfile(p);
      setName(p.name ?? '');
      setLoadFailed(false);
    } catch {
      // Fall back to whatever the session knows so the screen — and crucially
      // the sign-out button — stay reachable when the API is down.
      const { data } = await supabase.auth.getSession();
      const u = data.session?.user;
      if (u) {
        setProfile({ id: u.id, email: u.email ?? '', name: null, strategySettings: {} });
      } else {
        setLoadFailed(true);
      }
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await updateProfile(name.trim());
      setProfile(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      Alert.alert('Could not save', e?.message ?? 'Try again in a moment.');
    } finally {
      setSaving(false);
    }
  };

  const confirmSignOut = () => {
    Alert.alert('Sign out', 'You will need to sign in again to use STRATA.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  };

  if (!profile && !loadFailed) return <Loading />;

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      {loadFailed ? (
        <Card>
          <Text style={s.cardTitle}>Not signed in</Text>
          <Text style={s.body}>
            Your session has expired or the API is unreachable.
          </Text>
          <View style={{ marginTop: space.md }}>
            <GhostButton label="Sign out" onPress={confirmSignOut} tone="danger" />
          </View>
        </Card>
      ) : (
        <>
          <Card>
            <Text style={s.cardTitle}>Profile</Text>
            <Text style={s.label}>Name</Text>
            <TextInput
              style={s.input}
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={colors.textGhost}
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={save}
            />
            <MetricRow label="Email" value={profile?.email || '—'} />
            <View style={{ marginTop: space.md }}>
              <PrimaryButton
                label={saved ? 'Saved' : saving ? 'Saving…' : 'Save'}
                onPress={save}
                disabled={saving || name.trim() === (profile?.name ?? '')}
              />
            </View>
          </Card>

          <Card>
            <Text style={s.cardTitle}>Connection</Text>
            <MetricRow label="API" value={API_BASE_URL} />
            <Text style={s.hint}>
              Set in mobile/.env and baked in at build time — change it and rebuild.
            </Text>
          </Card>

          <Card>
            <Text style={s.cardTitle}>Account</Text>
            <Text style={s.body}>
              Signing out clears the session on this device.
            </Text>
            <View style={{ marginTop: space.md }}>
              <GhostButton label="Sign out" onPress={confirmSignOut} tone="danger" />
            </View>
          </Card>
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, paddingBottom: space.xxl },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '700', marginBottom: space.sm },
  body: { color: colors.textFaint, fontSize: 13, lineHeight: 19 },
  label: { color: colors.textFaint, fontSize: 12, marginBottom: 6 },
  hint: { color: colors.textGhost, fontSize: 11, marginTop: space.sm, lineHeight: 16 },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 11,
    color: colors.text,
    fontSize: 15,
    marginBottom: space.sm,
  },
});
