/**
 * Tab bar icons drawn with plain Views.
 *
 * The tab bar used single unicode glyphs (⌕ ◫ ✦), which render at different
 * weights and baselines on iOS and Android and look like leftover placeholder
 * text. These are simple geometric shapes: no icon font, no native module, and
 * pixel-identical on both platforms.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';

const SIZE = 22;

function Frame({ children }: { children?: React.ReactNode }) {
  return <View style={s.frame}>{children}</View>;
}

/** Magnifying glass: circle plus an angled handle. */
export function SearchIcon({ color }: { color: string }) {
  return (
    <Frame>
      <View style={[s.circle, { borderColor: color }]} />
      <View style={[s.handle, { backgroundColor: color }]} />
    </Frame>
  );
}

/** Five-pointed star, approximated with two overlapping triangles. */
export function StarIcon({ color }: { color: string }) {
  return (
    <Frame>
      <View style={[s.triUp, { borderBottomColor: color }]} />
      <View style={[s.triDown, { borderTopColor: color }]} />
    </Frame>
  );
}

/** Briefcase: body plus a handle above it. */
export function BriefcaseIcon({ color }: { color: string }) {
  return (
    <Frame>
      <View style={[s.caseHandle, { borderColor: color }]} />
      <View style={[s.caseBody, { borderColor: color }]} />
    </Frame>
  );
}

/** Chat bubble with a tail. */
export function ChatIcon({ color }: { color: string }) {
  return (
    <Frame>
      <View style={[s.bubble, { borderColor: color }]} />
      <View style={[s.bubbleTail, { borderTopColor: color }]} />
    </Frame>
  );
}

/** Four-square grid, for "more". */
export function GridIcon({ color }: { color: string }) {
  return (
    <Frame>
      <View style={s.grid}>
        {[0, 1, 2, 3].map(i => (
          <View key={i} style={[s.gridCell, { backgroundColor: color }]} />
        ))}
      </View>
    </Frame>
  );
}

const s = StyleSheet.create({
  frame: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },

  circle: {
    width: 13, height: 13, borderRadius: 7, borderWidth: 1.8,
    position: 'absolute', top: 2, left: 2,
  },
  handle: {
    width: 7, height: 1.8, borderRadius: 1,
    position: 'absolute', right: 2.5, bottom: 4.5,
    transform: [{ rotate: '45deg' }],
  },

  triUp: {
    position: 'absolute',
    width: 0, height: 0,
    borderLeftWidth: 9, borderRightWidth: 9, borderBottomWidth: 13,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    top: 2,
  },
  triDown: {
    position: 'absolute',
    width: 0, height: 0,
    borderLeftWidth: 9, borderRightWidth: 9, borderTopWidth: 13,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    bottom: 2,
  },

  caseHandle: {
    width: 9, height: 5, borderWidth: 1.8, borderBottomWidth: 0,
    borderTopLeftRadius: 2, borderTopRightRadius: 2,
    position: 'absolute', top: 2,
  },
  caseBody: {
    width: 19, height: 13, borderWidth: 1.8, borderRadius: 3,
    position: 'absolute', bottom: 2,
  },

  bubble: {
    width: 19, height: 15, borderWidth: 1.8, borderRadius: 5,
    position: 'absolute', top: 1,
  },
  bubbleTail: {
    position: 'absolute',
    width: 0, height: 0,
    borderLeftWidth: 4, borderRightWidth: 4, borderTopWidth: 5,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    bottom: 1.5, left: 5,
  },

  grid: { width: 18, height: 18, flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  gridCell: { width: 7.5, height: 7.5, borderRadius: 1.5 },
});
