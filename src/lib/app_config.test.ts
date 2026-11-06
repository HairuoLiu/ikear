import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { t, SUPPORTED_LANGUAGES } from './i18n';

describe('Apple Developer & EAS 打包与原生权限校验 [IKEAR-002]', () => {
  it('app.json 包含 Face ID 原生权限与 iOS Bundle Identifier', () => {
    const appJsonPath = path.resolve(process.cwd(), 'app.json');
    const content = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
    assert.strictEqual(content.expo.ios.bundleIdentifier, 'com.ikear.app');
    assert.ok(content.expo.ios.infoPlist.NSFaceIDUsageDescription);
    assert.ok(content.expo.plugins.includes('expo-local-authentication'));
  });

  it('eas.json 包含完整的 iOS Apple Developer 打包构建 Profile', () => {
    const easJsonPath = path.resolve(process.cwd(), 'eas.json');
    assert.ok(fs.existsSync(easJsonPath), 'eas.json 必须存在');
    const eas = JSON.parse(fs.readFileSync(easJsonPath, 'utf8'));
    assert.ok(eas.build.development.ios);
    assert.ok(eas.build.preview.ios);
    assert.ok(eas.build.production.ios);
    assert.strictEqual(eas.build.development.ios.simulator, true);
    assert.strictEqual(eas.build.production.ios.simulator, false);
    assert.strictEqual(eas.submit.production.ios.appleId, 'developer@ikear.app');
  });
});

describe('法务免责声明与多语言覆盖 [IKEAR-004]', () => {
  it('所有 9 种支持语言均已配置免责声明字典', () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      const title = t('disclaimer_title', lang.code);
      const body = t('disclaimer_body', lang.code);
      const agree = t('disclaimer_agree', lang.code);

      assert.ok(title && title.length > 0, `${lang.code} 缺少 disclaimer_title`);
      assert.ok(body && body.length > 20, `${lang.code} 缺少 disclaimer_body`);
      assert.ok(agree && agree.length > 0, `${lang.code} 缺少 disclaimer_agree`);
      assert.ok(body.includes('IKEA'), `${lang.code} 免责声明正文必须指明独立于 IKEA`);
    }
  });

  it('免责协议具有法律效力关键要素（非官方实体、商标声明、验货建议）', () => {
    const titleEn = t('disclaimer_title', 'en');
    const bodyEn = t('disclaimer_body', 'en');
    const bodyZh = t('disclaimer_body', 'zh-CN');
    assert.ok(titleEn.includes('Trademark'));
    assert.ok(bodyEn.includes('independent'));
    assert.ok(bodyZh.includes('独立'));
    assert.ok(bodyZh.includes('商标'));
  });
});

