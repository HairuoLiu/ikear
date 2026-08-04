/**
 * IKEAR 消息域纯逻辑（M3）
 *
 * 纯函数，无 React / React Native 依赖：UI 层（ChatScreen / MessagesScreen）与
 * store 都只消费这里的结果，便于 jest 直接覆盖。
 *
 * 注：会话的时间字段在数据契约（data/types.ts）中名为 `lastMessageAt`，
 * 本文件按契约字段更新，不引入 `updatedAt` 别名。
 */
import type { Conversation, ID, Message } from '../data/types';

/** 列表预览的最大字符数，超出以省略号收尾。 */
export const PREVIEW_MAX = 30;

/** 会话尚无消息时的占位文案。 */
export const EMPTY_PREVIEW = '暂无消息';

/**
 * 生成稳定会话 id：同一 (卖家, 挂牌) 组合永远得到同一个 key，
 * 因此买家可以在不查库的情况下推导出要写入的会话。
 */
export function threadKey(sellerId: ID, listingId: ID): ID {
  return `c_${String(listingId).trim()}__${String(sellerId).trim()}`;
}

/**
 * 判断消息属于哪个会话：优先用 msg.conversationId，
 * 缺省时退化为「同一挂牌 + 收发双方都是会话参与者」。
 */
function belongsTo(conv: Conversation, msg: Message): boolean {
  if (msg.conversationId) return conv.id === msg.conversationId;
  if (conv.listingId !== msg.listing_id) return false;
  const members = [conv.buyerId, conv.sellerId];
  return members.includes(msg.sender_id) && members.includes(msg.receiver_id);
}

/**
 * 追加一条消息：不可变更新命中的会话（lastMessage / lastMessageAt / unreadCount），
 * 其余会话保持原引用。未命中任何会话时原样返回，由调用方决定是否先建会话。
 */
export function appendMessage(
  conversations: Conversation[],
  msg: Message
): Conversation[] {
  const i = conversations.findIndex((c) => belongsTo(c, msg));
  if (i < 0) return conversations;

  const target = conversations[i];
  const next = [...conversations];
  next[i] = {
    ...target,
    lastMessage: msg.content,
    lastMessageAt: msg.created_at,
    unreadCount: msg.read ? target.unreadCount : (target.unreadCount ?? 0) + 1,
  };
  return next;
}

/** 全部会话的未读总数（用于 Tab 角标）。异常值按 0 计。 */
export function unreadCount(conversations: Conversation[]): number {
  return conversations.reduce((sum, c) => {
    const n = Number(c?.unreadCount);
    return sum + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);
}

/** 会话列表的最后一条消息预览：折叠空白、超长截断、空会话给占位文案。 */
export function preview(conv: Conversation, max: number = PREVIEW_MAX): string {
  const text = (conv?.lastMessage ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return EMPTY_PREVIEW;
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}
