// Supabase 客户端工厂（懒加载）。
//
// 设计要点：
//  1. 仅在启用 Supabase 模式（设置 EXPO_PUBLIC_SUPABASE_URL + ANON_KEY）时才需要
//     @supabase/supabase-js 依赖；通过动态 import 延迟加载，避免污染测试图——
//     mock 模式与 `npm test` 永远不会触发该包加载。
//  2. 读取 EXPO_PUBLIC_ 前缀变量：Expo 在构建期会把 `process.env.EXPO_PUBLIC_*`
//     自动内联进 iOS / Android / Web 包；未设置时留空 → 前端回落 mock。
//  3. 安全：anon key 对客户端公开是预期行为，真正的权限边界是数据库 RLS 策略。
import type { Listing } from '../data/types';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

let _client: any = null;
let _clientPromise: Promise<any> | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export async function getSupabaseClient(): Promise<any> {
  if (!isSupabaseConfigured()) {
    throw new Error(
      'Supabase 未配置：请在 .env.local 设置 EXPO_PUBLIC_SUPABASE_URL 与 EXPO_PUBLIC_SUPABASE_ANON_KEY'
    );
  }
  if (_client) return _client;
  if (!_clientPromise) {
    _clientPromise = (async () => {
      const mod: any = await import('@supabase/supabase-js');
      return mod.createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
        auth: { persistSession: true, autoRefreshToken: true },
      });
    })();
  }
  _client = await _clientPromise;
  return _client;
}

export const SUPABASE_PROJECT_URL = SUPABASE_URL ?? '';

/** 仅用于类型推导，避免未使用导入告警。 */
export type _SupabaseListing = Listing;
