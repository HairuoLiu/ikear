import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SUPPORTED_LANGUAGES,
  TRANSLATIONS,
  translate,
  t,
} from './i18n';

describe('i18n 多语言引擎 (i18n.ts)', () => {
  it('涵盖 9 大主流语言且定义完整', () => {
    assert.strictEqual(SUPPORTED_LANGUAGES.length, 9);
    const codes = SUPPORTED_LANGUAGES.map((l) => l.code);
    assert.ok(codes.includes('zh-CN'));
    assert.ok(codes.includes('zh-TW'));
    assert.ok(codes.includes('en'));
    assert.ok(codes.includes('fr'));
    assert.ok(codes.includes('es'));
    assert.ok(codes.includes('ja'));
    assert.ok(codes.includes('ko'));
    assert.ok(codes.includes('de'));
    assert.ok(codes.includes('sv'));
  });

  it('每种语言都具备关键翻译词条且非空', () => {
    const keysToCheck = [
      'nav_discover',
      'nav_sell',
      'nav_hub',
      'publish_title',
      'trust_tier_label',
      'lang_switcher',
    ];
    for (const lang of SUPPORTED_LANGUAGES) {
      for (const k of keysToCheck) {
        const val = translate(k, lang.code);
        assert.ok(val && val.length > 0, `语言 ${lang.code} 缺失键值 ${k}`);
      }
    }
  });

  it('不存在的键值平滑降级返回原 key', () => {
    const fallback = t('non_existent_key_123', 'en');
    assert.strictEqual(fallback, 'non_existent_key_123');
  });

  it('英语与法语具备正确的官方地道表达', () => {
    assert.strictEqual(t('nav_discover', 'en'), 'Discover');
    assert.strictEqual(t('nav_discover', 'fr'), 'Découvrir');
    assert.strictEqual(t('nav_discover', 'sv'), 'Upptäck');
    assert.strictEqual(t('nav_discover', 'ja'), '見つける');
  });
});
