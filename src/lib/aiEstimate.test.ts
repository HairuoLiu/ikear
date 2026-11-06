import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateFurnitureFromPhoto,
  estimateFromChatDialog,
  getTrustProfile,
  computeListingRankingScore,
  classifyModelOffline,
  IKEA_QUANTIZED_MODEL_SPEC,
  IKEA_KNOWLEDGE_BASE,
} from './aiEstimate';
import type { Listing } from '../data/types';

describe('AI 视觉估价与自动填单引擎 (aiEstimate)', () => {
  it('知识库涵盖宜家经典主流家具型号', () => {
    assert.ok(IKEA_KNOWLEDGE_BASE.length >= 8);
    const models = IKEA_KNOWLEDGE_BASE.map((k) => k.model);
    assert.ok(models.includes('POÄNG'));
    assert.ok(models.includes('BILLY'));
    assert.ok(models.includes('MALM'));
    assert.ok(models.includes('KALLAX'));
  });

  it('照片估价：识别出有效型号、价格区间与默认成色', () => {
    const result = estimateFurnitureFromPhoto(['file:///test/poang.jpg']);
    assert.ok(result.meta.detectedModel);
    assert.ok(result.autoFilled.title.length > 0);
    assert.ok(result.autoFilled.price > 0);
    assert.ok(result.meta.confidence && result.meta.confidence > 0.7);
    assert.strictEqual(result.meta.isReferencePhoto, false);
  });

  it('照片越多置信度与照片质量加权越高 (1张 vs 5张)', () => {
    const r1 = estimateFurnitureFromPhoto(['file:///p1.jpg']);
    const r5 = estimateFurnitureFromPhoto([
      'file:///p1.jpg',
      'file:///p2.jpg',
      'file:///p3.jpg',
      'file:///p4.jpg',
      'file:///p5.jpg',
    ]);
    assert.ok((r5.meta.confidence ?? 0) >= (r1.meta.confidence ?? 0));
    assert.ok((r5.meta.photoQualityBonus ?? 0) > (r1.meta.photoQualityBonus ?? 0));
    assert.strictEqual(r5.meta.photoQualityBonus, 1.3); // 5 张图获得最高 1.3 倍加权
  });
});

describe('💬 无图模式 (Chat to List)', () => {
  it('从自然对话中推断出对应型号', () => {
    const chatResult = estimateFromChatDialog('我想出掉家里一个白色的书架，书很多放不下了');
    assert.strictEqual(chatResult.matchedModel.model, 'BILLY');
    assert.strictEqual(chatResult.meta.detectedModel, 'BILLY');
    assert.strictEqual(chatResult.meta.isReferencePhoto, true);
    assert.strictEqual(chatResult.meta.photoQualityBonus, 0.35); // 确保低曝光惩罚生效
  });

  it('无图模式输出明确的曝光降权警示', () => {
    const chatResult = estimateFromChatDialog('转让一张双人床');
    assert.ok(chatResult.exposureWarning.includes('权重将降低'));
    assert.strictEqual(chatResult.autoFilled.referencePhotos.length, 1);
  });
});

describe('🛡️ 卖家诚信等级计算 (Trust Profile)', () => {
  it('新手卖家获得铜牌评级', () => {
    const profile = getTrustProfile(4.5, 0, false);
    assert.strictEqual(profile.tier, 'bronze');
    assert.ok(profile.score >= 50 && profile.score < 65);
  });

  it('成交多且评分高的卖家获得皇冠信赖评级', () => {
    const profile = getTrustProfile(5.0, 30, true);
    assert.strictEqual(profile.tier, 'crown');
    assert.ok(profile.score >= 90);
    assert.strictEqual(profile.verifiedID, true);
  });
});

describe('🚀 综合多因子推荐排序分计算 (Ranking Score)', () => {
  const dummyListing: Listing = {
    id: 'l_test',
    title: 'POÄNG 扶手椅',
    description: '测试家具',
    price: 120,
    condition: '良好',
    category: 'chair',
    photos: ['p1', 'p2', 'p3', 'p4', 'p5'],
    coverIndex: 0,
    location: { city: '多伦多' },
    sellerId: 'u_1',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
    status: 'active',
    type: 'secondhand',
  };

  it('5张全图 + 皇冠高诚信卖家 排序分显著高于 无图模式挂牌', () => {
    const highTrust = getTrustProfile(5.0, 35, true);
    const scoreHigh = computeListingRankingScore(dummyListing, highTrust, 2);

    const noPhotoListing: Listing = {
      ...dummyListing,
      photos: [],
      aiMeta: { isReferencePhoto: true },
    };
    const lowTrust = getTrustProfile(4.0, 1, false);
    const scoreLow = computeListingRankingScore(noPhotoListing, lowTrust, 0);

    assert.ok(scoreHigh > scoreLow * 2, '5图高质量高诚信挂牌得分应远超无图挂牌');
  });

  it('带 24h 置顶曝光 (boostedUntil) 获得额外排序倍率加成', () => {
    const normalScore = computeListingRankingScore(dummyListing);
    const boostedListing: Listing = {
      ...dummyListing,
      boostedUntil: new Date(Date.now() + 86400000).toISOString(),
    };
    const boostedScore = computeListingRankingScore(boostedListing);
    assert.ok(boostedScore > normalScore);
  });
});

describe('⚡️ 端侧量化模型 (CoreML / TFLite INT8) 离线推理测试 [IKEAR-003]', () => {
  it('量化规范符合端侧超轻量级运行指标', () => {
    assert.strictEqual(IKEA_QUANTIZED_MODEL_SPEC.precision, 'INT8');
    assert.strictEqual(IKEA_QUANTIZED_MODEL_SPEC.framework, 'CoreML');
    assert.deepStrictEqual(IKEA_QUANTIZED_MODEL_SPEC.inputShape, [1, 224, 224, 3]);
    assert.ok(IKEA_QUANTIZED_MODEL_SPEC.latencyBudgetMs <= 50);
  });

  it('离线输入文本/特征快速分类并满足毫秒级时延', () => {
    const result = classifyModelOffline('扶手椅 POÄNG');
    assert.strictEqual(result.topModel, 'POÄNG');
    assert.strictEqual(result.category, 'chair');
    assert.ok(result.confidence >= 0.9);
    assert.ok(result.inferenceTimeMs < IKEA_QUANTIZED_MODEL_SPEC.latencyBudgetMs);
  });

  it('支持模拟浮点特征向量输入进行离线分类', () => {
    const fakeEmbedding = [0.12, 0.45, 0.99, -0.32, 1.44];
    const result = classifyModelOffline(fakeEmbedding);
    assert.ok(result.topModel.length > 0);
    assert.ok(result.nameZh.length > 0);
    assert.strictEqual(result.quantizedSpec.precision, 'INT8');
  });
});
