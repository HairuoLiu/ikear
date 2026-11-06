import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mockDataSource, __resetMockDb } from './dataSource';
import type { Message } from './types';

describe('Realtime 私聊信道订阅与分发 [IKEAR-001]', () => {
  beforeEach(() => {
    __resetMockDb();
  });

  it('subscribeMessages 成功注册并在发送消息时触发回调', async () => {
    const received: Message[] = [];
    const unsubscribe = mockDataSource.subscribeMessages!('u_other', (msg) => {
      received.push(msg);
    });

    await mockDataSource.sendMessage({
      listingId: 'l_1',
      receiverId: 'u_other',
      content: '你好，请问书架还在吗？',
    });

    assert.strictEqual(received.length, 1);
    assert.strictEqual(received[0].content, '你好，请问书架还在吗？');
    assert.strictEqual(received[0].receiver_id, 'u_other');

    unsubscribe();
  });

  it('退订 (unsubscribe) 后不再接收新消息事件', async () => {
    const received: Message[] = [];
    const unsubscribe = mockDataSource.subscribeMessages!('u_other', (msg) => {
      received.push(msg);
    });

    await mockDataSource.sendMessage({
      listingId: 'l_1',
      receiverId: 'u_other',
      content: '第一条消息',
    });
    assert.strictEqual(received.length, 1);

    // 退订
    unsubscribe();

    await mockDataSource.sendMessage({
      listingId: 'l_1',
      receiverId: 'u_other',
      content: '第二条消息（退订后）',
    });
    assert.strictEqual(received.length, 1, '退订后不应再触发回调');
  });

  it('仅监听与指定 userId 相关（发信人或收信人）的消息', async () => {
    const receivedA: Message[] = [];
    const receivedB: Message[] = [];

    const unsubA = mockDataSource.subscribeMessages!('u_target_a', (msg) => receivedA.push(msg));
    const unsubB = mockDataSource.subscribeMessages!('u_target_b', (msg) => receivedB.push(msg));

    await mockDataSource.sendMessage({
      listingId: 'l_1',
      receiverId: 'u_target_a',
      content: '专门发给 A',
    });

    assert.strictEqual(receivedA.length, 1);
    assert.strictEqual(receivedB.length, 0, 'B 不应收到发给 A 的私聊');

    unsubA();
    unsubB();
  });
});
