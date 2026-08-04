// 环境声明：@supabase/supabase-js 仅在启用 Supabase 模式时才需要安装。
// 通过动态 import 懒加载（见 src/lib/supabase.ts），故此处用 `any` 占位，
// 避免在未安装该包时（mock 模式 / 单测）导致 tsc 报错。
// 真实接入时执行 `npm i @supabase/supabase-js` 即可获得完整类型。
declare module '@supabase/supabase-js' {
  export function createClient(url: string, key: string, options?: any): any;
  export type SupabaseClient = any;
  const _default: any;
  export default _default;
}
