// M3 数据层单测：会话 / 消息 / 收藏 / 详情读取。
// 只依赖数据层，不引入 react-native，可在纯 node 环境下跑。
import { __resetMockDb, mockDataSource } from './dataSource';
import { CONVERSATIONS, MESSAGES } from './mockData';
import type { Conversation, Listing, Message } from './types';

beforeEach(() => {
  __resetMockDb();
});

describe('mockDataSource.getConversations', () => {
  it('返回全部会话，字段齐全', () => {
    const convs: Conversation[] = mockDataSource.getConversations();
    expect(convs.length).toBe(CONVERSATIONS.length);
    expect(convs.length).toBeGreaterThanOrEqual(4);

    convs.forEach((c) => {
      expect(c.id).toBeTruthy();
      expect(c.listingId).toBeTruthy();
      expect(c.buyerId).not.toBe(c.sellerId);
      expect(typeof c.lastMessage).toBe('string');
      expect(Number.isNaN(new Date(c.lastMessageAt).getTime())).toBe(false);
      expect(c.unreadCount).toBeGreaterThanOrEqual(0);
    });
  });

  it('按 lastMessageAt 倒序（最新会话在前）', () => {
    const convs = mockDataSource.getConversations();
    for (let i = 1; i < convs.length; i++) {
      expect(new Date(convs[i - 1].lastMessageAt).getTime()).toBeGreaterThanOrEqual(
        new Date(convs[i].lastMessageAt).getTime()
      );
    }
  });

  it('每个会话都引用真实存在的 listing', async () => {
    const convs = mockDataSource.getConversations();
    for (const c of convs) {
      const listing = await mockDataSource.getListing(c.listingId);
      expect(listing).not.toBeNull();
      expect(listing?.id).toBe(c.listingId);
    }
  });

  it('返回的是副本，调用方排序不污染 mock 源数据', () => {
    const first = mockDataSource.getConversations();
    first.reverse();
    const second = mockDataSource.getConversations();
    expect(second[0].id).not.toBe(first[0].id);
  });
});

describe('mockDataSource.getMessages', () => {
  it('只返回指定会话的消息，并按时间升序', () => {
    const msgs: Message[] = mockDataSource.getMessages('c_3');
    expect(msgs.length).toBeGreaterThanOrEqual(2);
    expect(msgs.every((m) => m.conversationId === 'c_3')).toBe(true);

    for (let i = 1; i < msgs.length; i++) {
      expect(new Date(msgs[i - 1].created_at).getTime()).toBeLessThanOrEqual(
        new Date(msgs[i].created_at).getTime()
      );
    }
  });

  it('会话内收发混合：既有我发出的也有对方发来的', () => {
    const msgs = mockDataSource.getMessages('c_3');
    const senders = new Set(msgs.map((m) => m.sender_id));
    expect(senders.size).toBeGreaterThanOrEqual(2);
    expect(msgs.some((m) => m.sender_id === 'u_me')).toBe(true);
    expect(msgs.some((m) => m.sender_id !== 'u_me')).toBe(true);
  });

  it('未知 / 空 convId 返回空数组', () => {
    expect(mockDataSource.getMessages('c_nope')).toEqual([]);
    expect(mockDataSource.getMessages('')).toEqual([]);
  });

  it('消息的 listing_id 与所属会话一致，unreadCount 等于未读数', () => {
    mockDataSource.getConversations().forEach((c) => {
      const msgs = mockDataSource.getMessages(c.id);
      expect(msgs.length).toBeGreaterThan(0);
      expect(msgs.every((m) => m.listing_id === c.listingId)).toBe(true);
      expect(msgs.filter((m) => !m.read).length).toBe(c.unreadCount);
      expect(msgs[msgs.length - 1].content).toBe(c.lastMessage);
    });
  });

  it('所有 mock 消息都归属于某个会话', () => {
    const ids = new Set(CONVERSATIONS.map((c) => c.id));
    expect(MESSAGES.every((m) => !!m.conversationId && ids.has(m.conversationId))).toBe(true);
  });
});

describe('mockDataSource.getFavorites', () => {
  it('按传入 ids 的顺序返回对应 Listing', () => {
    const favs: Listing[] = mockDataSource.getFavorites(['l_3', 'l_1', 'l_12']);
    expect(favs.map((l) => l.id)).toEqual(['l_3', 'l_1', 'l_12']);
    expect(favs[0].title).toContain('POÄNG');
  });

  it('跳过不存在的 id', () => {
    const favs = mockDataSource.getFavorites(['l_1', 'l_nope', 'l_2']);
    expect(favs.map((l) => l.id)).toEqual(['l_1', 'l_2']);
  });

  it('空数组 / 全部未命中时返回空数组', () => {
    expect(mockDataSource.getFavorites([])).toEqual([]);
    expect(mockDataSource.getFavorites(['x', 'y'])).toEqual([]);
  });

  it('已过期的收藏项返回 expired 状态（详情页灰标依赖）', () => {
    const [expired] = mockDataSource.getFavorites(['l_9']);
    expect(expired.status).toBe('expired');
  });
});

describe('mockDataSource.getListing（M3 详情页复用）', () => {
  it('命中返回详情，含封面与卖家', async () => {
    const l = await mockDataSource.getListing('l_12');
    expect(l).not.toBeNull();
    expect(l?.title).toContain('SÖDERHAMN');
    expect(l?.sellerId).toBe('u_me');
    expect(l?.photos[l.coverIndex]).toBeDefined();
  });

  it('未命中返回 null', async () => {
    expect(await mockDataSource.getListing('l_nope')).toBeNull();
  });
});
