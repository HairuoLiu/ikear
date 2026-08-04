/**
 * M3 — 消息（会话列表）。
 *
 * store 里只有扁平的 messages，会话按「商品 + 对方」聚合：
 * Avatar · 昵称 · 最后一条预览 · 时间 · 未读 Badge，点击进入 Chat。
 */
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  Avatar,
  Badge,
  EmptyState,
  LargeTitleHeader,
  ListRow,
  ListSection,
  Screen,
} from '../components';
import { useStore } from '../store/useStore';
import { clockTime } from '../lib/format';
import type { Message } from '../data/types';
import { spacing } from '../theme/tokens';

type Nav = { navigate: (screen: string, params?: object) => void };

interface Thread {
  key: string;
  listingId: string;
  peerId: string;
  peerName: string;
  last: Message;
  unread: number;
}

/** 今天显示时刻，否则显示月/日。 */
function threadTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  return sameDay ? clockTime(iso) : `${d.getMonth() + 1}/${d.getDate()}`;
}

export function MessagesScreen() {
  const navigation = useNavigation() as unknown as Nav;
  const messages = useStore((s) => s.messages);
  const listings = useStore((s) => s.listings);
  const meId = useStore((s) => s.currentUser?.id) ?? 'u_me';

  const threads = useMemo<Thread[]>(() => {
    const at = (m: Message) => new Date(m.created_at).getTime();

    /** 对方昵称：优先取消息里的 sender，其次取（对方即卖家时的）商品卖家。 */
    const nameOf = (m: Message, peerId: string) => {
      if (m.sender_id === peerId && m.sender?.nickname) return m.sender.nickname;
      const seller = listings.find((l) => l.id === m.listing_id)?.seller;
      if (seller && seller.id === peerId && seller.nickname) return seller.nickname;
      return '宜家邻居';
    };

    const map = new Map<string, Thread>();
    messages.forEach((m) => {
      const peerId = m.sender_id === meId ? m.receiver_id : m.sender_id;
      const key = `${m.listing_id}|${peerId}`;
      const unreadInc = m.sender_id === peerId && !m.read ? 1 : 0;
      const prev = map.get(key);

      if (!prev) {
        map.set(key, {
          key,
          listingId: m.listing_id,
          peerId,
          peerName: nameOf(m, peerId),
          last: m,
          unread: unreadInc,
        });
        return;
      }
      prev.unread += unreadInc;
      if (at(m) >= at(prev.last)) prev.last = m;
    });

    return Array.from(map.values()).sort((a, b) => at(b.last) - at(a.last));
  }, [messages, listings, meId]);

  const totalUnread = threads.reduce((n, t) => n + t.unread, 0);

  return (
    <Screen>
      <LargeTitleHeader
        title="消息"
        subtitle={totalUnread > 0 ? `${totalUnread} 条未读` : '与卖家的私聊都在这里'}
      />
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {threads.length === 0 ? (
          <EmptyState
            emoji="💬"
            title="还没有消息"
            message="在商品详情点「联系卖家」就能开始聊天"
          />
        ) : (
          <ListSection>
            {threads.map((t, i) => (
              <ListRow
                key={t.key}
                icon={<Avatar name={t.peerName} emoji="🧑" size={44} />}
                title={t.peerName}
                subtitle={t.last.content}
                value={threadTime(t.last.created_at)}
                accessory={
                  t.unread > 0 ? <Badge label={t.unread} count style={styles.unread} /> : undefined
                }
                chevron
                last={i === threads.length - 1}
                onPress={() =>
                  navigation.navigate('Chat', {
                    listingId: t.listingId,
                    peerId: t.peerId,
                    sellerId: t.peerId,
                  })
                }
              />
            ))}
          </ListSection>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  unread: { marginLeft: spacing.sm },
});
