/**
 * Catches render errors per screen.
 *
 * A release build has no red box — an uncaught error just unmounts the tree
 * and leaves a blank screen with the tab bar gone. This keeps the failure
 * inside one tab and gives a way back.
 */
import React, { Component, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, space } from '../theme';
import { GhostButton } from './UI';

interface Props { children: ReactNode; label?: string }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`[STRATA] ${this.props.label ?? 'screen'} crashed:`, error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <ScrollView style={s.container} contentContainerStyle={s.content}>
        <View style={s.card}>
          <Text style={s.title}>
            {this.props.label ? `${this.props.label} stopped working` : 'Something went wrong'}
          </Text>
          <Text style={s.body}>
            This screen hit an error. The other tabs still work — switch tabs, or
            try again.
          </Text>
          <View style={{ marginTop: space.md }}>
            <GhostButton label="Try again" onPress={() => this.setState({ error: null })} />
          </View>
          <Text style={s.detail} selectable>{error.message}</Text>
        </View>
      </ScrollView>
    );
  }
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, flexGrow: 1, justifyContent: 'center' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.red + '40',
    padding: space.xl,
  },
  title: { color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: space.sm },
  body: { color: colors.textFaint, fontSize: 13, lineHeight: 19 },
  detail: { color: colors.textGhost, fontSize: 11, marginTop: space.lg, lineHeight: 16 },
});
