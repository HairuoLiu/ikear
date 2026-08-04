import type { Conversation, Message } from '../data/types';
import {
  EMPTY_PREVIEW,
  PREVIEW_MAX,
  appendMessage,
  preview,
  threadKey,
  unreadCount,
} from './messaging';

const AT = '2026-06-01T12:00:00.000Z';

const conv = (patch: Partial<Conversation> = {}): Conversation => ({
  id: threadKey('u_seller', 'l_1'),
  listingId: 'l_1',
  buyerId: 'u_me',
  sellerId: 'u_seller',
  lastMessage: '还在吗？',
  lastMessageAt: '2026-05-30T08:00:00.000Z',
  unreadCount: 0,
  ...patch,
});

const msg = (patch: Partial<Message> = {}): Message => ({
  id: 'm_1',
  listing_id: 'l_1',
  sender_id: 'u_seller',
  receiver_id: 'u_me',
  content: '在的，可以看货',
  read: false,
  created_at: AT,
  ...patch,
});

describe('threadKey', () => {
  it('同一 (卖家, 挂牌) 组合生成稳定 id', () => {
    expect(threadKey('u_seller', 'l_1')).toBe(threadKey('u_seller', 'l_1'));
  });

  it('不同卖家或不同挂牌互不冲突', () => {
    expect(threadKey('u_a', 'l_1')).not.toBe(threadKey('u_b', 'l_1'));
    expect(threadKey('u_a', 'l_1')).not.toBe(threadKey('u_a', 'l_2'));
  });
});

describe('appendMessage', () => {
  it('更新命中会话的 lastMessage / lastMessageAt', () => {
    const before = [conv()];
    const after = appendMessage(before, msg({ conversationId: before[0].id }));
    expect(after[0].lastMessage).toBe('在的，可以看货');
    expect(after[0].lastMessageAt).toBe(AT);
  });

  it('不可变：返回新数组与新会话对象，入参完全不变', () => {
    const before = [conv()];
    const snapshot = JSON.parse(JSON.stringify(before));
    const after = appendMessage(before, msg({ conversationId: before[0].id }));

    expect(after).not.toBe(before);
    expect(after[0]).not.toBe(before[0]);
    expect(before).toEqual(snapshot);
  });

  it('未读消息 unreadCount +1，已读消息保持不变', () => {
    const base = [conv({ unreadCount: 2 })];
    expect(appendMessage(base, msg({ read: false }))[0].unreadCount).toBe(3);
    expect(appendMessage(base, msg({ read: true }))[0].unreadCount).toBe(2);
  });

  it('只改命中的那条，其他会话保持原引用', () => {
    const a = conv({ id: 'c_a', listingId: 'l_1' });
    const b = conv({ id: 'c_b', listingId: 'l_2' });
    const after = appendMessage([a, b], msg({ conversationId: 'c_a' }));
    expect(after[0]).not.toBe(a);
    expect(after[1]).toBe(b);
  });

  it('无 conversationId 时按挂牌 + 收发双方匹配', () => {
    const after = appendMessage([conv()], msg());
    expect(after[0].lastMessage).toBe('在的，可以看货');
  });

  it('没有命中的会话时原样返回', () => {
    const before = [conv()];
    expect(appendMessage(before, msg({ conversationId: 'c_unknown' }))).toBe(before);
    expect(appendMessage([], msg())).toEqual([]);
  });
});

describe('unreadCount', () => {
  it('累加各会话未读数', () => {
    expect(unreadCount([conv({ unreadCount: 1 }), conv({ unreadCount: 4 })])).toBe(5);
  });

  it('全部已读或空列表为 0', () => {
    expect(unreadCount([conv(), conv()])).toBe(0);
    expect(unreadCount([])).toBe(0);
  });

  it('忽略负数与非法值', () => {
    const bad = [
      conv({ unreadCount: -3 }),
      conv({ unreadCount: NaN }),
      conv({ unreadCount: 2 }),
    ];
    expect(unreadCount(bad)).toBe(2);
  });
});

describe('preview', () => {
  it('返回最后一条消息内容', () => {
    expect(preview(conv({ lastMessage: '明天下午自提' }))).toBe('明天下午自提');
  });

  it('折叠换行与多余空白', () => {
    expect(preview(conv({ lastMessage: '  你好\n\n还在吗  ' }))).toBe('你好 还在吗');
  });

  it('超长截断并加省略号', () => {
    const long = 'x'.repeat(PREVIEW_MAX + 10);
    const out = preview(conv({ lastMessage: long }));
    expect(out).toHaveLength(PREVIEW_MAX + 1);
    expect(out.endsWith('…')).toBe(true);
  });

  it('空会话给占位文案', () => {
    expect(preview(conv({ lastMessage: '' }))).toBe(EMPTY_PREVIEW);
    expect(preview(conv({ lastMessage: '   ' }))).toBe(EMPTY_PREVIEW);
  });
});
