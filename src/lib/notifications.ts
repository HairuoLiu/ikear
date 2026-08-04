/**
 * 通知调度 —— M4 占位层（push 桩）。
 *
 * 现阶段**不接真实推送**：只锁定调用时机与参数形状，函数体打日志后立即 resolve。
 * 未来接 expo-notifications 时，只改本文件，调用方（M4 UI/逻辑）零改动。
 *
 * 风险对齐（见 ENGINEERING_PLAN 第六节）：iOS 推送默拒率高，
 * 因此所有关键提醒都必须同时走 `notifyInApp` 站内信 + badge 兜底。
 */
import type { Listing } from '../data/types';
import { REFRESH_REMINDER_DAYS, expiryAt } from './expiry';

const DAY_MS = 86_400_000;

/**
 * 申请通知权限。
 * 占位：直接返回 true，不弹系统框。
 *
 * TODO(接 expo-notifications)：
 *   const { status } = await Notifications.requestPermissionsAsync();
 *   return status === 'granted';
 */
export async function requestPermission(): Promise<boolean> {
  return true;
}

/**
 * 为一条挂牌安排「临期 3 天，提醒卖家刷新」的本地通知。
 * 占位：只打印计划时间，不真正入队；重复调用不去重。
 *
 * TODO(接 expo-notifications)：
 *   await Notifications.scheduleNotificationAsync({
 *     content: { title, body, data: { listingId: listing.id } },
 *     trigger: { date: new Date(fireAt) },
 *   });
 * 迁移到服务端推送时，这里改为向 Supabase 写一行 notification_jobs。
 */
export async function scheduleRefreshReminder(listing: Listing): Promise<void> {
  const expiresAt = expiryAt(listing);
  const fireAt =
    expiresAt === null
      ? null // 无到期信息 = 永不过期，不安排提醒
      : new Date(expiresAt - REFRESH_REMINDER_DAYS * DAY_MS).toISOString();

  console.log(
    `[notifications] 计划「临期${REFRESH_REMINDER_DAYS}天提醒卖家刷新」`,
    { listingId: listing.id, title: listing.title, fireAt }
  );
}

/**
 * 站内信 + badge 兜底通道（推送被拒时的唯一触达）。
 * 占位：只打印，不写 store。
 *
 * TODO：写入站内信列表并让 Tab badge +1（由 M4 逻辑接 store）。
 */
export function notifyInApp(title: string, body: string): void {
  console.log(`[notifications] 站内信 | ${title} — ${body}`);
}
