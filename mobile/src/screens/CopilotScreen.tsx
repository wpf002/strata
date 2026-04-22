/**
 * Mobile Copilot screen — streaming chat with STRATA AI.
 * Uses EventSource (SSE) for token-by-token streaming.
 * Falls back to standard fetch if EventSource is unavailable.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Animated, Easing,
} from 'react-native';
import { supabase } from '../supabase';
import { API_BASE_URL } from '../constants';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

interface CopilotScreenProps {
  propertyId?: string | null;
  propertyAddress?: string | null;
}

const SUGGESTIONS = [
  'What is this property worth?',
  'Analyse the cash flow',
  'What are the biggest risks?',
  'Is now a good time to buy?',
];

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

// ── Typing indicator ──────────────────────────────────────────────────────────

function TypingIndicator() {
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];

  useEffect(() => {
    const animations = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true, easing: Easing.ease }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true, easing: Easing.ease }),
          Animated.delay(600 - i * 150),
        ])
      )
    );
    Animated.parallel(animations).start();
    return () => animations.forEach(a => a.stop());
  }, []);

  return (
    <View style={styles.typingRow}>
      {dots.map((dot, i) => (
        <Animated.View key={i} style={[styles.typingDot, { opacity: dot, transform: [{ translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }] }]} />
      ))}
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function CopilotScreen({ propertyId, propertyAddress }: CopilotScreenProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const abortRef = useRef<(() => void) | null>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: trimmed };
    const assistantId = `a-${Date.now()}`;
    const assistantMsg: Message = { id: assistantId, role: 'assistant', content: '', streaming: true };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput('');
    setStreaming(true);
    scrollToBottom();

    const history = messages.map(m => ({ role: m.role, content: m.content }));
    history.push({ role: 'user', content: trimmed });

    const token = await getToken();
    let cancelled = false;

    abortRef.current = () => { cancelled = true; };

    try {
      const response = await fetch(`${API_BASE_URL}/copilot/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          messages: history,
          propertyId: propertyId ?? undefined,
        }),
      });

      if (!response.ok || !response.body) throw new Error(`${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!cancelled) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') { cancelled = true; break; }
          try {
            const { text } = JSON.parse(payload);
            if (text) {
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, content: m.content + text } : m
              ));
            }
          } catch { /* skip malformed */ }
        }
      }
      reader.cancel();
    } catch {
      if (!cancelled) {
        setMessages(prev => prev.map(m =>
          m.id === assistantId
            ? { ...m, content: 'Sorry, I had trouble connecting. Please try again.' }
            : m
        ));
      }
    } finally {
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, streaming: false } : m
      ));
      setStreaming(false);
      scrollToBottom();
    }
  }, [messages, streaming, propertyId, scrollToBottom]);

  const renderItem = useCallback(({ item }: { item: Message }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        {!isUser && item.streaming && item.content === '' ? (
          <TypingIndicator />
        ) : (
          <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextAssistant]}>
            {item.content}
          </Text>
        )}
      </View>
    );
  }, []);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>✦ STRATA Copilot</Text>
        <Text style={styles.headerSub}>AI real estate intelligence</Text>
      </View>

      {/* Property context banner */}
      {propertyAddress && (
        <View style={styles.contextBanner}>
          <Text style={styles.contextText}>Context: {propertyAddress}</Text>
        </View>
      )}

      {/* Message list */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={m => m.id}
        renderItem={renderItem}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={scrollToBottom}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>✦</Text>
            <Text style={styles.emptyTitle}>Ask me anything</Text>
            <Text style={styles.emptySub}>
              {propertyAddress
                ? `I have context on ${propertyAddress}.`
                : 'Property search, deal analysis, market intel.'}
            </Text>
          </View>
        }
      />

      {/* Suggestion chips */}
      {messages.length === 0 && (
        <View style={styles.chips}>
          {SUGGESTIONS.map(s => (
            <TouchableOpacity key={s} style={styles.chip} onPress={() => sendMessage(s)} activeOpacity={0.7}>
              <Text style={styles.chipText}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Disclaimer */}
      <Text style={styles.disclaimer}>For informational purposes only — not investment advice.</Text>

      {/* Input */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask Copilot…"
          placeholderTextColor="#475569"
          multiline
          maxLength={2000}
          onSubmitEditing={() => sendMessage(input)}
          returnKeyType="send"
          blurOnSubmit
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || streaming) && styles.sendBtnDisabled]}
          onPress={() => sendMessage(input)}
          disabled={!input.trim() || streaming}
          activeOpacity={0.7}
        >
          {streaming
            ? <ActivityIndicator size="small" color="#080f1a" />
            : <Text style={styles.sendIcon}>↑</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080f1a' },
  header: {
    paddingTop: 16, paddingBottom: 12, paddingHorizontal: 20,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#f1f5f9', letterSpacing: -0.3 },
  headerSub: { fontSize: 12, color: '#64748b', marginTop: 1 },
  contextBanner: {
    marginHorizontal: 16, marginTop: 8, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10, backgroundColor: 'rgba(201,168,76,0.08)', borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.2)',
  },
  contextText: { fontSize: 12, color: '#C9A84C', fontWeight: '600' },
  messageList: { paddingHorizontal: 16, paddingVertical: 12, flexGrow: 1 },
  bubble: {
    maxWidth: '82%', marginVertical: 4, paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 16,
  },
  bubbleUser: {
    alignSelf: 'flex-end', backgroundColor: '#112240',
    borderTopRightRadius: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  bubbleAssistant: {
    alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.04)',
    borderTopLeftRadius: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  bubbleText: { fontSize: 14, lineHeight: 21 },
  bubbleTextUser: { color: '#f1f5f9' },
  bubbleTextAssistant: { color: '#cbd5e1' },
  typingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  typingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#C9A84C' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 36, color: '#C9A84C', marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#f1f5f9', marginBottom: 6 },
  emptySub: { fontSize: 13, color: '#64748b', textAlign: 'center', paddingHorizontal: 32 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  chipText: { fontSize: 12, color: '#94a3b8' },
  disclaimer: { fontSize: 10, color: '#334155', textAlign: 'center', marginBottom: 6 },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingBottom: 12,
    paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', gap: 8,
  },
  input: {
    flex: 1, minHeight: 44, maxHeight: 120, paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 22, backgroundColor: '#0d1b2e', color: '#f1f5f9', fontSize: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#C9A84C',
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#1e293b' },
  sendIcon: { fontSize: 20, color: '#080f1a', fontWeight: '700', marginTop: -2 },
});
