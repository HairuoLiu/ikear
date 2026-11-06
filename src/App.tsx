/**
 * IKEAR 导航契约（M0）。
 *
 * 结构：
 *   NavigationContainer
 *     └─ RootStack（headerShown: false）
 *          ├─ Main（BottomTab ×5：首页 / 消息 / 发布(中心按钮) / 我的 / 商城(置灰)）
 *          ├─ CreateListing（modal，由中心按钮打开）
 *          ├─ ListingDetail / Chat / Favorites（详情类屏幕叠加）
 *
 * 未登录 → AuthScreen；已登录且开启生物识别 → Face ID 锁。
 * M1~M4 的屏幕在此统一接入，路由名保持契约不变。
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import {
  NativeStackNavigationProp,
  createNativeStackNavigator,
} from '@react-navigation/native-stack';
import {
  BottomTabBarButtonProps,
  createBottomTabNavigator,
} from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import {
  Fingerprint,
  House,
  MessageCircle,
  Plus,
  Store,
  User as UserIcon,
} from 'lucide-react-native';
import { colors, layout, radius, spacing, typography } from './theme/tokens';
import { useStore } from './store/useStore';
import { authenticate, getBiometricSupport } from './lib/biometrics';
import { getSupabaseClient, isSupabaseConfigured } from './lib/supabase';
import { dataSource } from './data/dataSource';
import { t, SupportedLanguage } from './lib/i18n';
import { SplashScreen } from './components/SplashScreen';
import { AuthScreen } from './screens/AuthScreen';
import { HomeScreen } from './screens/HomeScreen';
import { MessagesScreen } from './screens/MessagesScreen';
import { CreateListingScreen } from './screens/CreateListingScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { ListingDetailScreen } from './screens/ListingDetailScreen';
import { ChatScreen } from './screens/ChatScreen';
import { FavoritesScreen } from './screens/FavoritesScreen';

/** 路由参数契约 —— M1~M4 用 `navigation.navigate('ListingDetail', { id })` 时以此为准。 */
export type RootStackParamList = {
  Main: undefined;
  CreateListing: undefined;
  ListingDetail: { id: string };
  Chat: { listingId: string; peerId: string };
  Favorites: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Messages: undefined;
  Sell: undefined;
  Profile: undefined;
  Shop: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

// ------------------------------------------------------------- 轻量占位（仅商城/发布 tab 用）

function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <View style={styles.placeholder}>
      <Text style={typography.title2}>{title}</Text>
      <Text style={styles.placeholderNote}>{note}</Text>
    </View>
  );
}

/** 发布 tab 实际由中心按钮以 modal 打开 CreateListing，tab 自身不挂载内容。 */
const SellFallback = () => <View style={{ flex: 1, backgroundColor: colors.groupedBackground }} />;
const ShopPlaceholder = () => <Placeholder title="商城" note="M5：官方配件商城，敬请期待" />;

// ------------------------------------------------------------- Tab 自定义按钮
const tabIcon = (Icon: typeof House) =>
  ({ color, size }: { color: string; size: number }) => <Icon color={color} size={size} />;

/** 中心「发布」按钮 */
function CenterTabButton({ onPress }: BottomTabBarButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="发布商品"
      onPress={onPress}
      style={styles.centerWrap}
    >
      {({ pressed }) => (
        <View style={[styles.centerBtn, pressed && styles.centerBtnPressed]}>
          <Plus color={colors.onBrand} size={26} strokeWidth={2.5} />
        </View>
      )}
    </Pressable>
  );
}

/** 商城：M5 之前置灰、不可点 */
function DisabledTabButton() {
  return (
    <View style={styles.disabledTab} accessibilityLabel="商城（即将上线）">
      <Store color={colors.gray3} size={22} />
      <Text style={styles.disabledLabel}>商城</Text>
    </View>
  );
}

function TabNavigator() {
  const language = (useStore((s) => s.language) ?? 'zh-CN') as SupportedLanguage;

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.gray2,
        tabBarStyle: {
          backgroundColor: 'rgba(249,249,249,0.92)',
          borderTopColor: colors.separator,
          height: layout.tabBarHeight,
          paddingBottom: 20,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: t('nav_discover', language), tabBarIcon: tabIcon(House) }}
      />
      <Tab.Screen
        name="Messages"
        component={MessagesScreen}
        options={{ title: t('nav_messages', language), tabBarIcon: tabIcon(MessageCircle) }}
      />
      <Tab.Screen
        name="Sell"
        component={SellFallback}
        options={{ title: t('nav_sell', language), tabBarButton: (p) => <CenterTabButton {...p} /> }}
        listeners={({ navigation }) => ({
          // 中心按钮不切 tab，而是把 CreateListing 以 modal 推到父级 Stack
          tabPress: (e) => {
            e.preventDefault();
            const parent = navigation.getParent() as
              | NativeStackNavigationProp<RootStackParamList>
              | undefined;
            parent?.navigate('CreateListing');
          },
        })}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: t('nav_hub', language), tabBarIcon: tabIcon(UserIcon) }}
      />
    </Tab.Navigator>
  );
}

function MainStack() {
  const language = (useStore((s) => s.language) ?? 'zh-CN') as SupportedLanguage;

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={TabNavigator} />
      <Stack.Screen
        name="CreateListing"
        component={CreateListingScreen}
        options={{ presentation: 'modal', headerShown: true, title: t('publish_title', language) }}
      />
      <Stack.Screen
        name="ListingDetail"
        component={ListingDetailScreen}
        options={{ headerShown: true, title: t('detail_seller', language), headerBackTitleVisible: false }}
      />
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={{ headerShown: true, title: t('tab_messages', language), headerBackTitleVisible: false }}
      />
      <Stack.Screen
        name="Favorites"
        component={FavoritesScreen}
        options={{ headerShown: true, title: t('fav_count', language), headerBackTitleVisible: false }}
      />
    </Stack.Navigator>
  );
}

// ------------------------------------------------------------------ Face ID
function BiometricLock({ onUnlock }: { onUnlock: () => void }) {
  const [checking, setChecking] = useState(true);
  const [failed, setFailed] = useState(false);

  const tryAuth = async () => {
    setChecking(true);
    setFailed(false);
    try {
      const support = await getBiometricSupport();
      if (!support.available) {
        onUnlock();
        return;
      }
      const ok = await authenticate(support.reason);
      if (ok) {
        onUnlock();
        return;
      }
      setFailed(true);
      setChecking(false);
    } catch {
      // 原生模块异常时不能停在「验证中」的死态，否则用户再也进不了 App：
      // 降级为可重试的失败态。
      setFailed(true);
      setChecking(false);
    }
  };

  useEffect(() => {
    tryAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.lock}>
      <View style={styles.lockIcon}>
        <Fingerprint size={48} color={colors.brand} />
      </View>
      <Text style={[typography.title3, { marginTop: 16 }]}>IKEAR 已锁定</Text>
      <Text style={styles.lockHint}>{failed ? '验证失败，请重试' : '正在通过 Face ID 验证…'}</Text>
      {checking ? (
        <ActivityIndicator style={{ marginTop: 16 }} color={colors.brand} />
      ) : (
        <Pressable
          style={({ pressed }) => [styles.retry, { opacity: pressed ? 0.7 : 1 }]}
          onPress={tryAuth}
        >
          <Text style={{ color: colors.brand, ...typography.subhead }}>使用 Face ID 解锁</Text>
        </Pressable>
      )}
    </View>
  );
}

/**
 * Web 响应式外壳：桌面浏览器下把内容约束成居中、最大宽度 480 的「手机列」，
 * 避免移动端布局在宽屏拉伸；原生端（iOS/Android）全屏渲染，不加约束。
 */
function LegalDisclaimerModal({
  onAgree,
  language,
}: {
  onAgree: () => void;
  language: SupportedLanguage;
}) {
  return (
    <View style={styles.disclaimerOverlay} testID="disclaimer-modal">
      <View style={styles.disclaimerCard}>
        <View style={styles.disclaimerBadge}>
          <Text style={styles.disclaimerBadgeText}>⚖️ Legal Notice</Text>
        </View>
        <Text style={styles.disclaimerTitle}>{t('disclaimer_title', language)}</Text>
        <Text style={styles.disclaimerBody}>{t('disclaimer_body', language)}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('disclaimer_agree', language)}
          testID="disclaimer-agree-btn"
          onPress={onAgree}
          style={({ pressed }) => [styles.disclaimerBtn, pressed && styles.disclaimerBtnPressed]}
        >
          <Text style={styles.disclaimerBtnText}>{t('disclaimer_agree', language)}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function frame(node: React.ReactNode) {
  if (Platform.OS !== 'web') return <>{node}</>;
  return <View style={styles.webFrame}>{node}</View>;
}

export default function App() {
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const biometricEnabled = useStore((s) => s.biometricEnabled);
  const disclaimerAccepted = useStore((s) => s.disclaimerAccepted);
  const acceptDisclaimer = useStore((s) => s.acceptDisclaimer);
  const language = useStore((s) => s.language);
  const loadPersisted = useStore((s) => s.loadPersisted);
  const [booting, setBooting] = useState(true);
  const [splash, setSplash] = useState(true);
  const [unlocked, setUnlocked] = useState(false);

  // 监听并接入实时 WebSocket 私聊通道
  useEffect(() => {
    if (isAuthenticated) {
      const unsub = useStore.getState().initRealtimeMessages?.();
      return () => unsub?.();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    loadPersisted().finally(() => setBooting(false));
    const t = setTimeout(() => setSplash(false), 1400);
    return () => clearTimeout(t);
  }, [loadPersisted]);

  // Supabase 模式：启动时若已有 session 则直接进入已登录态；并订阅登录/登出事件，
  // 让 store 的 isAuthenticated / currentUser 与后端会话保持一致（mock 模式直接跳过）。
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let active = true;
    let unsub: (() => void) | undefined;
    (async () => {
      const client = await getSupabaseClient();
      const { data: sess } = await client.auth.getSession();
      if (sess.session && active) {
        await dataSource.hydrate?.();
        useStore.setState({ currentUser: dataSource.getProfile(), isAuthenticated: true });
      }
      const { data: sub } = client.auth.onAuthStateChange((_event: string, session: any) => {
        if (session) {
          dataSource.hydrate?.().then(() => {
            if (!active) return;
            useStore.setState({ currentUser: dataSource.getProfile(), isAuthenticated: true });
          });
        } else {
          dataSource.hydrate?.();
          useStore.setState({ currentUser: null, isAuthenticated: false });
        }
      });
      unsub = () => sub.subscription.unsubscribe();
    })();
    return () => {
      active = false;
      unsub?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 退出登录后重新上锁
  useEffect(() => {
    if (!isAuthenticated) setUnlocked(false);
  }, [isAuthenticated]);

  if (booting || splash) return <SplashScreen />;

  let content: React.ReactNode;
  if (!isAuthenticated) {
    content = (
      <>
        <StatusBar style="dark" />
        <AuthScreen />
      </>
    );
  } else if (biometricEnabled && !unlocked) {
    content = (
      <>
        <StatusBar style="dark" />
        <BiometricLock onUnlock={() => setUnlocked(true)} />
      </>
    );
  } else {
    content = (
      <NavigationContainer>
        <StatusBar style="dark" />
        <MainStack />
      </NavigationContainer>
    );
  }

  return frame(
    <View style={{ flex: 1 }}>
      {content}
      {!disclaimerAccepted && (
        <LegalDisclaimerModal onAgree={acceptDisclaimer} language={language} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    backgroundColor: colors.groupedBackground,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.screen,
    gap: spacing.sm,
  },
  placeholderNote: {
    ...typography.footnote,
    color: colors.secondaryLabel,
    textAlign: 'center',
  },

  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.brand,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  centerBtnPressed: { transform: [{ scale: 0.94 }] },

  disabledTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    opacity: 0.5,
  },
  disabledLabel: { ...typography.footnote, color: colors.gray3 },

  lock: {
    flex: 1,
    backgroundColor: colors.groupedBackground,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.screen,
  },
  lockIcon: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: colors.brandTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockHint: { ...typography.subhead, color: colors.secondaryLabel, marginTop: 12 },
  retry: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTint,
  },

  // Web 响应式：桌面端居中「手机列」
  webFrame: {
    flex: 1,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    backgroundColor: colors.groupedBackground,
  },

  // 免责声明弹窗（P0 侵权风险阻断）
  disclaimerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.screen,
    zIndex: 9999,
    elevation: 20,
  },
  disclaimerCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: 24,
    maxWidth: 420,
    width: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 24,
  },
  disclaimerBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.brandTint,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    marginBottom: 12,
  },
  disclaimerBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.brand,
  },
  disclaimerTitle: {
    ...typography.title2,
    color: colors.label,
    marginBottom: 12,
    fontWeight: '700',
  },
  disclaimerBody: {
    ...typography.body,
    color: colors.secondaryLabel,
    lineHeight: 22,
    marginBottom: 20,
  },
  disclaimerBtn: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disclaimerBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  disclaimerBtnText: {
    color: colors.onBrand,
    fontSize: 16,
    fontWeight: '700',
  },
});
