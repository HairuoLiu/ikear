// Web 端默认实现（Metro 在 Web 平台解析到本文件；原生平台解析 biometrics.native.ts）。
// Web 无 Face ID / 指纹，返回「不可用」，由 AuthScreen 引导用户走邮箱密码 / WebAuthn 登录。
// 这样无需修改任何调用方，登录流程在 Web 与原生平台自动分流。
export interface BiometricSupport {
  available: boolean;
  biometryType: 'face' | 'fingerprint' | 'none';
  reason: string;
}

export async function getBiometricSupport(): Promise<BiometricSupport> {
  return {
    available: false,
    biometryType: 'none',
    reason: 'Web 端不支持生物识别，请使用邮箱密码或 WebAuthn 登录',
  };
}

export async function authenticate(_reason: string): Promise<boolean> {
  return false;
}
