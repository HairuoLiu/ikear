import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { Button, SegmentedControl } from '../components/Atoms';
import { useStore } from '../store/useStore';
import { Apple } from 'lucide-react-native';

export function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const login = useStore((s) => s.login);
  const register = useStore((s) => s.register);

  const submit = async () => {
    if (!email || !password) {
      Alert.alert('请填写邮箱和密码');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        if (!nickname) {
          Alert.alert('请填写昵称');
          setLoading(false);
          return;
        }
        await register(nickname, email, password);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="always">
        <View style={styles.logo}>
          <Text style={styles.word}>IKEAR</Text>
        </View>
        <Text style={styles.subtitle}>二手家具集市 · 让好家具继续流通</Text>

        <View style={styles.segWrap}>
          <SegmentedControl
            value={mode}
            onChange={setMode}
            options={[
              { label: '登录', value: 'login' },
              { label: '注册', value: 'register' },
            ]}
          />
        </View>

        <View style={styles.form}>
          {mode === 'register' && (
            <Field placeholder="昵称" value={nickname} onChange={setNickname} autoCapitalize="words" />
          )}
          <Field placeholder="邮箱" value={email} onChange={setEmail} keyboardType="email-address" autoCapitalize="none" />
          <Field placeholder="密码" value={password} onChange={setPassword} secureTextEntry />
        </View>

        <View style={styles.actions}>
          <Button title={loading ? '请稍候…' : mode === 'login' ? '登录' : '创建账户'} onPress={submit} disabled={loading} />
          <View style={styles.dividerRow}>
            <View style={styles.line} />
            <Text style={styles.dividerText}>或</Text>
            <View style={styles.line} />
          </View>
          <PressableApple />
        </View>

        <Text style={styles.hint}>
          演示模式：任意邮箱密码即可登录（无需联网）
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  placeholder,
  value,
  onChange,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: 'email-address' | 'default';
  autoCapitalize?: 'none' | 'words';
}) {
  return (
    <TextInput
      placeholder={placeholder}
      value={value}
      onChangeText={onChange}
      secureTextEntry={secureTextEntry}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
      placeholderTextColor={colors.tertiaryLabel}
      style={styles.input}
    />
  );
}

function PressableApple() {
  return (
    <View style={styles.appleBtn}>
      <Apple size={18} color="#fff" />
      <Text style={styles.appleText}>使用 Apple 登录</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.groupedBackground },
  container: {
    flexGrow: 1,
    backgroundColor: colors.groupedBackground,
    paddingHorizontal: spacing.screen,
    paddingTop: 70,
    paddingBottom: 40,
  },
  logo: {
    backgroundColor: colors.brand,
    alignSelf: 'center',
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 12,
  },
  word: { fontSize: 32, fontWeight: '800', color: '#fff', letterSpacing: 1 },
  subtitle: {
    textAlign: 'center',
    color: colors.secondaryLabel,
    marginTop: 12,
    marginBottom: 28,
    ...typography.callout,
  },
  segWrap: { marginBottom: spacing.lg },
  form: {
    backgroundColor: colors.cardBackground,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  input: {
    ...typography.body,
    color: colors.label,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  actions: { gap: spacing.md },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 4 },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.separator },
  dividerText: { ...typography.footnote, color: colors.secondaryLabel },
  appleBtn: {
    backgroundColor: '#000',
    borderRadius: radius.md,
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  appleText: { color: '#fff', ...typography.headline },
  hint: {
    textAlign: 'center',
    color: colors.tertiaryLabel,
    marginTop: spacing.xl,
    ...typography.footnote,
  },
});
