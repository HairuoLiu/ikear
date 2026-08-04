/**
 * M3 — 聊天。
 *
 * 顶部商品条（点击回详情）→ 气泡（收到左灰 / 发出右宜家蓝）→ 底部输入栏 + 发送。
 * 路由参数兼容 { peerId } / { sellerId } / { counterpartId }。
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Send } from 'lucide-react-native';
import { EmptyState, Screen } from '../components';
import { useStore } from '../store/useStore';
import { clockTime, formatPrice } from '../lib/format';
import type { Message } from '../data/types';
import { colors, radius, spacing, typography } from '../theme/tokens';

type Nav = { navigate: (screen: string, params?: object) => void };

export function ChatScreen() {
  const route = useRoute();
  const navigation = useNavigation() as unknown as Nav;
  const params = (route.params ?? {}) as {
    listingId?: string;
    peerId?: string;
    sellerId?: string;
    counterpartId?: string;
  };
  const listingId = params.listingId ?? '';
  const peerId = params.peerId ?? params.sellerId ?? params.counterpartId ?? '';

  const messages = useStore((s) => s.messages);
  const listing = useStore((s) => s.listings.find((l) => l.id === listingId));
  const meId = useStore((s) => s.currentUser?.id) ?? 'u_me';
  const sendMessage = useStore((s) => s.sendMessage);
  const markConversationRead = useStore((s) => s.markConversationRead);

  const [draft, setDraft] = useState('');
  const listRef = useRef<FlatList<Message>>(null);

  const thread = useMemo(
    () =>
      messages
        .filter(
          (m) =>
            m.listing_id === listingId &&
            ((m.sender_id === meId && m.receiver_id === peerId) ||
              (m.sender_id === peerId && m.receiver_id === meId))
        )
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [messages, listingId, peerId, meId]
  );

  const peerName =
    thread.find((m) => m.sender_id === peerId)?.sender?.nickname ??
    listing?.seller?.nickname ??
    '宜家邻居';

  useEffect(() => {
    if (listingId && peerId) markConversationRead(listingId, peerId);
  }, [listingId, peerId, markConversationRead]);

  useEffect(() => {
    if (thread.length) listRef.current?.scrollToEnd({ animated: true });
  }, [thread.length]);

  const send = () => {
    const text = draft.trim();
    if (!text || !listingId || !peerId) return;
    sendMessage(listingId, peerId, text);
    setDraft('');
  };

  if (!listingId || !peerId) {
    return (
      <Screen edges={['bottom']}>
        <EmptyState emoji="💬" title="会话不存在" message="请从商品详情或消息列表进入聊天" />
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']} background={colors.groupedBg}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* 商品上下文条 */}
        {!!listing && (
          <Pressable
            onPress={() => navigation.navigate('ListingDetail', { id: listing.id })}
            style={({ pressed }) => [styles.listingBar, { opacity: pressed ? 0.7 : 1 }]}
          >
            <View style={styles.thumb}>
              <Text style={{ fontSize: 22 }}>{listing.photos?.[0] ?? '📦'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={typography.subhead} numberOfLines={1}>
                {listing.title}
              </Text>
              <Text style={styles.peer}>与 {peerName} 的会话</Text>
            </View>
            <Text style={styles.price}>{formatPrice(listing.price)}</Text>
          </Pressable>
        )}

        <FlatList
          ref={listRef}
          data={thread}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              emoji="👋"
              title={`和 ${peerName} 打个招呼`}
              message="问问是否还在、能否自提，交易更顺利"
            />
          }
          renderItem={({ item }) => {
            const mine = item.sender_id === meId;
            return (
              <View style={[styles.bubbleWrap, mine ? styles.right : styles.left]}>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  <Text
                    style={[typography.callout, { color: mine ? colors.onBrand : colors.label }]}
                  >
                    {item.content}
                  </Text>
                </View>
                <Text style={styles.stamp}>{clockTime(item.created_at)}</Text>
              </View>
            );
          }}
        />

        {/* 输入栏 */}
        <View style={styles.inputBar}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="发消息…"
            placeholderTextColor={colors.secondaryLabel}
            style={styles.input}
            multiline
            returnKeyType="send"
            onSubmitEditing={send}
            blurOnSubmit={false}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="发送"
            onPress={send}
            disabled={!draft.trim()}
            style={({ pressed }) => [
              styles.sendButton,
              { opacity: draft.trim() ? (pressed ? 0.8 : 1) : 0.35 },
            ]}
          >
            <Send size={18} color={colors.onBrand} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  listingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.screen,
    paddingVertical: spacing.md,
    backgroundColor: colors.cardBg,
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.groupedBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  peer: { ...typography.caption, color: colors.secondaryLabel, marginTop: 2 },
  price: { ...typography.subhead, color: colors.brand },
  list: { padding: spacing.lg, gap: spacing.md },
  bubbleWrap: { maxWidth: '78%' },
  left: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  right: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubble: { borderRadius: radius.xl, paddingHorizontal: spacing.lg, paddingVertical: 10 },
  bubbleMine: { backgroundColor: colors.brand, borderBottomRightRadius: radius.xs },
  bubbleTheirs: { backgroundColor: colors.cardBg, borderBottomLeftRadius: radius.xs },
  stamp: { ...typography.caption2, color: colors.tertiaryLabel, marginTop: 3, marginHorizontal: 4 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.cardBg,
  },
  input: {
    flex: 1,
    maxHeight: 110,
    minHeight: 40,
    backgroundColor: colors.groupedBg,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: 10,
    paddingBottom: 10,
    ...typography.body,
    color: colors.label,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
