/**
 * supabaseDataSource 契约测试 —— 用 fake client 覆盖映射层与查询构造，无需真实网络。
 *
 * 存在意义：这个文件此前 0 覆盖，导致 `auth.data.user?.id` 这类必崩 bug 能一路通过
 * tsc（`src/types/supabase-js.d.ts` 的 ambient shim 把 SDK 降级成 any，类型层拦不住）。
 * 这里断言的是「两个 DataSource 实现对外行为一致」的关键口径，而非 Supabase SDK 本身。
 */
import { __setSupabaseClient } from '../lib/supabase';
import { supabaseDataSource } from './supabaseDataSource';
import { TTL_DAYS, DAY_MS } from '../lib/expiry';

// ---------------------------------------------------------------------------
// fake client：记录收到的查询链，并回放预置的结果
// ---------------------------------------------------------------------------

interface Recorded {
  table: string;
  op: string;
  filters: [string, unknown][];
  orders: [string, boolean][];
  payload?: unknown;
}

function fakeClient(opts: {
  rows?: Record<string, any[]>;
  user?: { id: string } | null;
  error?: { message: string } | null;
  /** functions.invoke 的回放结果 */
  invoke?: { data?: any; error?: { message: string } | null };
}) {
  const calls: Recorded[] = [];
  const invoked: { name: string; body: any }[] = [];
  const rpcs: { name: string; args: any }[] = [];
  const rowsByTable = opts.rows ?? {};

  function builder(table: string, rec: Recorded) {
    const result = () => {
      if (opts.error) return { data: null, error: opts.error };
      return { data: rowsByTable[table] ?? [], error: null };
    };
    const single = () => {
      if (opts.error) return { data: null, error: opts.error };
      const list = rowsByTable[table] ?? [];
      return { data: list[0] ?? null, error: null };
    };
    const api: any = {
      select(_cols?: string) {
        return api;
      },
      insert(payload: unknown) {
        rec.op = 'insert';
        rec.payload = payload;
        return api;
      },
      update(payload: unknown) {
        rec.op = 'update';
        rec.payload = payload;
        return api;
      },
      eq(col: string, val: unknown) {
        rec.filters.push([col, val]);
        return api;
      },
      in(col: string, val: unknown) {
        rec.filters.push([`${col}:in`, val]);
        return api;
      },
      or(expr: string) {
        rec.filters.push(['or', expr]);
        return api;
      },
      ilike(col: string, val: unknown) {
        rec.filters.push([`${col}:ilike`, val]);
        return api;
      },
      order(col: string, o?: { ascending?: boolean }) {
        rec.orders.push([col, o?.ascending !== false]);
        return api;
      },
      single: async () => single(),
      maybeSingle: async () => single(),
      // await 整条链（无 single）时走这里
      then(resolve: (v: unknown) => unknown) {
        return Promise.resolve(result()).then(resolve);
      },
    };
    return api;
  }

  return {
    calls,
    invoked,
    rpcs,
    auth: {
      // 真实 SDK 的形状是 { data: { user }, error }
      getUser: async () => ({ data: { user: opts.user ?? null }, error: null }),
    },
    from(table: string) {
      const rec: Recorded = { table, op: 'select', filters: [], orders: [] };
      calls.push(rec);
      return builder(table, rec);
    },
    functions: {
      async invoke(name: string, arg?: { body?: any }) {
        invoked.push({ name, body: arg?.body });
        return { data: opts.invoke?.data ?? null, error: opts.invoke?.error ?? null };
      },
    },
    async rpc(name: string, args?: any) {
      rpcs.push({ name, args });
      return { data: null, error: null };
    },
  };
}

/**
 * test/setup.ts 的 expect shim 没有 toContainEqual，这里用等价的布尔断言替代
 * （不改共享测试基建）。
 */
const hasPair = (pairs: [string, unknown][], key: string, val: unknown) =>
  pairs.some(([k, v]) => k === key && JSON.stringify(v) === JSON.stringify(val));

const listingRow = (over: Record<string, any> = {}) => ({
  id: 'lst_1',
  title: 'KIVIK 沙发',
  description: '九成新',
  price: 1280,
  condition: '良好',
  category: 'sofa',
  photos: ['https://example.com/a.jpg'],
  cover_index: 0,
  location: { city: '上海', district: '徐汇区' },
  seller_id: '11111111-1111-4111-8111-111111111111',
  created_at: new Date(Date.now() - DAY_MS).toISOString(),
  expires_at: new Date(Date.now() + 10 * DAY_MS).toISOString(),
  status: 'active',
  type: 'secondhand',
  discount: null,
  views: 143,
  boosted_until: null,
  ...over,
});

afterEach(() => {
  __setSupabaseClient(null);
});

// ---------------------------------------------------------------------------

describe('supabaseDataSource / mapListing', () => {
  it('把 snake_case 行映射成 canonical camelCase', async () => {
    __setSupabaseClient(fakeClient({ rows: { listings: [listingRow()] } }));
    const [l] = await supabaseDataSource.getListings();

    expect(l.id).toBe('lst_1');
    expect(l.coverIndex).toBe(0);
    expect(l.sellerId).toBe('11111111-1111-4111-8111-111111111111');
    expect(l.location).toEqual({ city: '上海', district: '徐汇区' });
    expect(l.status).toBe('active');
  });

  it('映射 views —— SQL 有该列、详情页与「我的」都在读', async () => {
    __setSupabaseClient(fakeClient({ rows: { listings: [listingRow()] } }));
    const [l] = await supabaseDataSource.getListings();
    expect(l.views).toBe(143);
  });

  it('过了 expiresAt 的 active 读取时惰性结算为 expired（与 mock 的 settleStatus 同口径）', async () => {
    const stale = listingRow({
      status: 'active',
      expires_at: new Date(Date.now() - DAY_MS).toISOString(),
    });
    __setSupabaseClient(fakeClient({ rows: { listings: [stale] } }));
    const [l] = await supabaseDataSource.getListings();
    expect(l.status).toBe('expired');
  });

  it('null 的可空列被规整成 undefined / 默认值', async () => {
    const row = listingRow({ discount: null, boosted_until: null, photos: null, description: null });
    __setSupabaseClient(fakeClient({ rows: { listings: [row] } }));
    const [l] = await supabaseDataSource.getListings();
    expect(l.discount).toBeUndefined();
    expect(l.boostedUntil).toBeUndefined();
    expect(l.photos).toEqual([]);
    expect(l.description).toBe('');
  });
});

describe('supabaseDataSource / getListings 查询构造', () => {
  it('不传 status 时只查 active', async () => {
    const c = fakeClient({ rows: { listings: [] } });
    __setSupabaseClient(c);
    await supabaseDataSource.getListings();
    expect(hasPair(c.calls[0].filters, 'status', 'active')).toBe(true);
  });

  it('category / sellerId 透传为 eq 过滤', async () => {
    const c = fakeClient({ rows: { listings: [] } });
    __setSupabaseClient(c);
    await supabaseDataSource.getListings({ category: 'sofa', sellerId: 'u1' });
    expect(hasPair(c.calls[0].filters, 'category', 'sofa')).toBe(true);
    expect(hasPair(c.calls[0].filters, 'seller_id', 'u1')).toBe(true);
  });

  it('排序落到正确的列与方向', async () => {
    const c = fakeClient({ rows: { listings: [] } });
    __setSupabaseClient(c);
    await supabaseDataSource.getListings({ sort: 'price_asc' });
    expect(hasPair(c.calls[0].orders, 'price', true)).toBe(true);

    const c2 = fakeClient({ rows: { listings: [] } });
    __setSupabaseClient(c2);
    await supabaseDataSource.getListings({ sort: 'newest' });
    expect(hasPair(c2.calls[0].orders, 'created_at', false)).toBe(true);
  });

  it('查询失败时抛出带上下文的错误', async () => {
    __setSupabaseClient(fakeClient({ error: { message: 'boom' } }));
    await expect(supabaseDataSource.getListings()).rejects.toThrow('getListings 失败');
  });
});

describe('supabaseDataSource / getListing', () => {
  it('查无此条返回 null 而不是抛错（契约 Promise<Listing | null>）', async () => {
    __setSupabaseClient(fakeClient({ rows: { listings: [] } }));
    const l = await supabaseDataSource.getListing('nope');
    expect(l).toBeNull();
  });
});

describe('supabaseDataSource / createListing', () => {
  it('从 auth.getUser() 正确取出 seller_id —— 回归：曾误写成 auth.data.user 必崩', async () => {
    const uid = '11111111-1111-4111-8111-111111111111';
    const c = fakeClient({ rows: { listings: [listingRow()] }, user: { id: uid } });
    __setSupabaseClient(c);

    await supabaseDataSource.createListing({
      title: '沙发',
      price: 100,
      category: 'sofa',
      photos: ['a.jpg'],
    });

    const insert = c.calls.find((x) => x.op === 'insert');
    expect((insert?.payload as any).seller_id).toBe(uid);
  });

  it('未登录且未显式传 sellerId 时抛错，而不是写入非法 uuid "u_me"', async () => {
    __setSupabaseClient(fakeClient({ rows: { listings: [] }, user: null }));
    await expect(
      supabaseDataSource.createListing({
        title: '沙发',
        price: 100,
        category: 'sofa',
        photos: ['a.jpg'],
      })
    ).rejects.toThrow('未登录');
  });

  it('缺必填字段时校验口径与 mockDataSource 一致', async () => {
    __setSupabaseClient(fakeClient({ rows: { listings: [] }, user: { id: 'u1' } }));
    await expect(
      supabaseDataSource.createListing({ title: '', price: 1, category: 'sofa', photos: [] } as any)
    ).rejects.toThrow('缺少必填字段');
  });

  it('默认 expires_at = now + TTL_DAYS', async () => {
    const c = fakeClient({ rows: { listings: [listingRow()] }, user: { id: 'u1' } });
    __setSupabaseClient(c);
    const before = Date.now();

    await supabaseDataSource.createListing({
      title: '沙发',
      price: 100,
      category: 'sofa',
      photos: ['a.jpg'],
    });

    const insert = c.calls.find((x) => x.op === 'insert');
    const got = new Date((insert?.payload as any).expires_at).getTime();
    expect(got).toBeGreaterThanOrEqual(before + TTL_DAYS * DAY_MS - 5_000);
    expect(got).toBeLessThanOrEqual(Date.now() + TTL_DAYS * DAY_MS + 5_000);
  });
});

describe('supabaseDataSource / refreshListing（0003 之后走 Edge Function）', () => {
  it('调用 refresh-listing 而不是直接 update expires_at（会被 42501 拒绝）', async () => {
    const c = fakeClient({
      rows: { listings: [listingRow({ status: 'expired' })] },
      invoke: {
        data: {
          ok: true,
          listingId: 'lst_1',
          expiresAt: new Date(Date.now() + TTL_DAYS * DAY_MS).toISOString(),
          status: 'active',
        },
      },
    });
    __setSupabaseClient(c);

    const l = await supabaseDataSource.refreshListing('lst_1');

    expect(c.invoked).toHaveLength(1);
    expect(c.invoked[0].name).toBe('refresh-listing');
    expect(c.invoked[0].body).toEqual({ listingId: 'lst_1' });
    // 不应存在任何 update 操作
    expect(c.calls.some((x) => x.op === 'update')).toBe(false);
    expect(l.status).toBe('active');
  });

  it('终态（sold/archived）原样返回且不打服务端，与 mockDataSource 同口径', async () => {
    const c = fakeClient({ rows: { listings: [listingRow({ status: 'sold' })] } });
    __setSupabaseClient(c);

    const l = await supabaseDataSource.refreshListing('lst_1');

    expect(l.status).toBe('sold');
    expect(c.invoked).toHaveLength(0);
  });

  it('Edge Function 返回 ok:false 时抛出 body 里的原因（而非笼统的 error.message）', async () => {
    const c = fakeClient({
      rows: { listings: [listingRow({ status: 'expired' })] },
      invoke: {
        data: { ok: false, error: 'Cannot refresh a listing with status "sold"' },
        error: { message: 'Edge Function returned a non-2xx status code' },
      },
    });
    __setSupabaseClient(c);

    await expect(supabaseDataSource.refreshListing('lst_1')).rejects.toThrow(
      'Cannot refresh a listing with status'
    );
  });
});

describe('supabaseDataSource / toRow 特权列', () => {
  it('改 expiresAt 时提前抛错并指向 refreshListing', async () => {
    __setSupabaseClient(fakeClient({ rows: { listings: [listingRow()] } }));
    await expect(
      supabaseDataSource.updateListing('lst_1', { expiresAt: new Date().toISOString() })
    ).rejects.toThrow('refreshListing');
  });

  it('改 boostedUntil 时提前抛错', async () => {
    __setSupabaseClient(fakeClient({ rows: { listings: [listingRow()] } }));
    await expect(
      supabaseDataSource.updateListing('lst_1', { boostedUntil: new Date().toISOString() })
    ).rejects.toThrow('boostedUntil');
  });

  it('不下发会被服务端钉回的 views / created_at / seller_id', async () => {
    const c = fakeClient({ rows: { listings: [listingRow()] } });
    __setSupabaseClient(c);

    await supabaseDataSource.updateListing('lst_1', {
      title: '改个标题',
      views: 9999,
      createdAt: '2020-01-01T00:00:00.000Z',
      sellerId: 'someone-else',
    });

    const upd = c.calls.find((x) => x.op === 'update');
    const payload = upd?.payload as Record<string, unknown>;
    expect(payload.title).toBe('改个标题');
    expect(payload.views).toBeUndefined();
    expect(payload.created_at).toBeUndefined();
    expect(payload.seller_id).toBeUndefined();
  });
});

describe('supabaseDataSource / 0003 新接口', () => {
  it('incrementListingViews 调用 RPC 且参数名为 p_listing_id', async () => {
    const c = fakeClient({});
    __setSupabaseClient(c);

    await supabaseDataSource.incrementListingViews!('lst_1');

    expect(c.rpcs).toHaveLength(1);
    expect(c.rpcs[0].name).toBe('increment_listing_views');
    expect(c.rpcs[0].args).toEqual({ p_listing_id: 'lst_1' });
  });

  it('getPublicProfile 读 public_profiles 视图而不是 profiles 表', async () => {
    const c = fakeClient({
      rows: {
        public_profiles: [
          {
            id: 'u2',
            nickname: '卖家',
            avatar_url: null,
            city: '上海',
            district: '徐汇区',
            rating: 4.8,
            sold_count: 12,
            created_at: 'x',
          },
        ],
      },
    });
    __setSupabaseClient(c);

    const p = await supabaseDataSource.getPublicProfile!('u2');

    expect(c.calls[0].table).toBe('public_profiles');
    expect(p?.nickname).toBe('卖家');
    expect(p?.soldCount).toBe(12);
    // 视图不含 email，映射后为空串而不是 undefined
    expect(p?.email).toBe('');
  });
});

describe('supabaseDataSource / hydrate', () => {
  it('未登录时清空缓存并早退，不发出 uuid 为空的非法过滤', async () => {
    const c = fakeClient({ user: null });
    __setSupabaseClient(c);

    await supabaseDataSource.hydrate!();

    // 只应查过 auth，不应触碰 conversations / messages
    expect(c.calls.some((x) => x.table === 'conversations')).toBe(false);
    expect(supabaseDataSource.getConversations()).toEqual([]);
    expect(supabaseDataSource.getMessages('cnv_1')).toEqual([]);
  });

  it('已登录时一次性拉取消息（不按会话 N+1）并按 conversationId 分组', async () => {
    const uid = '11111111-1111-4111-8111-111111111111';
    const c = fakeClient({
      user: { id: uid },
      rows: {
        profiles: [
          { id: uid, email: 'a@b.c', nickname: '我', avatar_url: null, city: '上海', created_at: 'x' },
        ],
        conversations: [
          {
            id: 'cnv_1',
            listing_id: 'lst_1',
            buyer_id: uid,
            seller_id: 'u2',
            last_message: 'hi',
            last_message_at: 'x',
            unread_count: 1,
          },
          {
            id: 'cnv_2',
            listing_id: 'lst_2',
            buyer_id: uid,
            seller_id: 'u3',
            last_message: 'yo',
            last_message_at: 'x',
            unread_count: 0,
          },
        ],
        messages: [
          { id: 'm1', conversation_id: 'cnv_1', listing_id: 'lst_1', sender_id: uid, receiver_id: 'u2', content: 'hi', read: true, created_at: 'x' },
          { id: 'm2', conversation_id: 'cnv_2', listing_id: 'lst_2', sender_id: 'u3', receiver_id: uid, content: 'yo', read: false, created_at: 'x' },
        ],
      },
    });
    __setSupabaseClient(c);

    await supabaseDataSource.hydrate!();

    // N+1 回归防护：2 个会话也只查 1 次 messages
    expect(c.calls.filter((x) => x.table === 'messages')).toHaveLength(1);
    expect(supabaseDataSource.getMessages('cnv_1')).toHaveLength(1);
    expect(supabaseDataSource.getMessages('cnv_2')).toHaveLength(1);
    expect(supabaseDataSource.getProfile().nickname).toBe('我');
  });
});
