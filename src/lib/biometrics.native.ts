import * as LocalAuthentication from 'expo-local-authentication';

export interface BiometricSupport {
  available: boolean;
  biometryType: 'face' | 'fingerprint' | 'none';
  reason: string;
}

export async function getBiometricSupport(): Promise<BiometricSupport> {
  const compatible = await LocalAuthentication.hasHardwareAsync();
  if (!compatible) {
    return { available: false, biometryType: 'none', reason: '设备不支持生物识别' };
  }
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  if (!enrolled) {
    return { available: false, biometryType: 'none', reason: '尚未在系统中录入 Face ID / 指纹' };
  }
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  const hasFace = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
  return {
    available: true,
    biometryType: hasFace ? 'face' : 'fingerprint',
    reason: hasFace ? '使用 Face ID 解锁' : '使用触控 ID 解锁',
  };
}

export async function authenticate(reason: string): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      fallbackLabel: '使用密码',
      cancelLabel: '取消',
    });
    return result.success;
  } catch {
    return false;
  }
}
