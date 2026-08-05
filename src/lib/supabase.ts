// Supabase 客户端工厂（懒加载）。
//
// 设计要点：
//  1. 仅在启用 Supabase 模式（设置 EXPO_PUBLIC_SUPABASE_URL + ANON_KEY）时才需要
//     @supabase/supabase-js 依赖；通过动态 import 延迟加载，避免污染测试图——
//     mock 模式与 `npm test` 永远不会触发该包加载。
//  2. 读取 EXPO_PUBLIC_ 前缀变量：Expo 在构建期会把 `process.env.EXPO_PUBLIC_*`
//     自动内联进 iOS / Android / Web 包；未设置时留空 → 前端回落 mock。
//  3. 安全：anon key 对客户端公开是预期行为，真正的权限边界是数据库 RLS 策略。

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

let _client: any = null;
let _clientPromise: Promise<any> | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/**
 * RN 没有 localStorage，而 supabase-js 的 persistSession 默认就是往 localStorage 写，
 * 因此原生端必须显式注入 AsyncStorage，否则 session 只活在内存里、冷启动即掉登录。
 * 用动态 import 而非顶层 import：本模块被 dataSource 静态引用，会进入 node 单测的
 * 模块图，顶层引入 RN 包会直接把 `npm test` 打挂。取不到时回落 supabase 默认实现
 * （Web 上就是 localStorage，行为正确）。
 */
async function resolveAuthStorage(): Promise<any | undefined> {
  try {
    const mod: any = await import('@react-native-async-storage/async-storage');
    return mod?.default ?? mod;
  } catch {
    return undefined;
  }
}

export async function getSupabaseClient(): Promise<any> {
  // 已建好（或测试注入）的实例优先，无需再校验环境变量。
  if (_client) return _client;
  if (!isSupabaseConfigured()) {
    throw new Error(
      'Supabase 未配置：请在 .env.local 设置 EXPO_PUBLIC_SUPABASE_URL 与 EXPO_PUBLIC_SUPABASE_ANON_KEY'
    );
  }
  if (!_clientPromise) {
    _clientPromise = (async () => {
      const mod: any = await import('@supabase/supabase-js');
      const storage = await resolveAuthStorage();
      return mod.createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false, // RN 没有 URL 回调；Web 端 OAuth 落地时再按需打开
          ...(storage ? { storage } : {}),
        },
      });
    })();
    // 首次加载失败（离线 / 分包未就绪）时清空 promise，否则失败结果会被永久缓存，
    // 后续每次调用都拿到同一个 rejection，网络恢复也无法自愈。
    _clientPromise.catch(() => {
      _clientPromise = null;
    });
  }
  _client = await _clientPromise;
  return _client;
}

export const SUPABASE_PROJECT_URL = SUPABASE_URL ?? '';

/**
 * 仅供测试：注入 fake client，让 supabaseDataSource 的映射/查询逻辑无需真实网络即可断言。
 * 传 null 恢复真实工厂。与 feedCache.__setFeedStorage 同一套约定。
 */
export function __setSupabaseClient(next: any | null): void {
  _client = next;
  _clientPromise = null;
}
