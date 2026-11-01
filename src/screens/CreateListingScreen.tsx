/**
 * M2 — 发布屏（引导式拍照 · 硬底 2 / 软建议 3）
 *
 * 对齐 PRODUCT_SPEC「图片规则」：
 *   · 上限 9 张（MAX_PHOTOS）
 *   · 硬底 2 张必填：① 正面整体 ② 细节/标签
 *   · 软建议 3 张：③ 侧面 ④ 抽屉内部 ⑤ 瑕疵特写（不硬锁，满足硬底 2 即可发布）
 *   · 进度提示「2/2 必填 + 1/3 建议」，长按换封面，无滤镜/水印
 *   · 流程：拍选 → 角度提示 → 选封面 → 填必填 → 发布
 *
 * 本文件只消费 M0 契约（components / store / lib / data / theme），不修改任何契约文件。
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Check, Circle, Image as ImageIcon, Sparkles, MessageSquareText, AlertTriangle, ShieldCheck } from 'lucide-react-native';
import {
  Badge,
  CategoryGridTile,
  LargeTitleHeader,
  ListRow,
  ListSection,
  PhotoGrid,
  PrimaryButton,
  Screen,
  SecondaryButton,
  SegmentedControl,
  Sheet,
} from '../components';
import { useStore } from '../store/useStore';
import type { DraftListing } from '../store/useStore';
import { canPublish, photoProgress, HARD_PHOTO_MIN, MAX_PHOTOS } from '../lib/listingRules';
import { CATEGORIES, getCategory, isCategoryId } from '../data/categories';
// CategoryId / Condition 的定义源在 data/types（categories.ts 只做 re-use，不 re-export 类型）
import type { CategoryId, Condition } from '../data/types';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { estimateFurnitureFromPhoto, estimateFromChatDialog, getTrustProfile, IKEA_KNOWLEDGE_BASE } from '../lib/aiEstimate';

/* ------------------------------------------------------------------ 引导角度 */

type Angle = { key: string; title: string; hint: string; required: boolean };

/** 前 HARD_PHOTO_MIN 条是硬底，其余为软建议。顺序即引导顺序。 */
const ANGLES: Angle[] = [
  { key: 'front', title: '正面整体', hint: '完整外观，家具占画面 2/3', required: true },
  { key: 'detail', title: '细节 / 标签', hint: '型号标签、材质或接口特写', required: true },
  { key: 'side', title: '侧面', hint: '看厚度与轮廓', required: false },
  { key: 'inside', title: '抽屉内部', hint: '内部结构与储物空间', required: false },
  { key: 'flaw', title: '瑕疵特写', hint: '如实展示磨损，减少纠纷', required: false },
];

const SUGGESTED_ANGLES = ANGLES.length - HARD_PHOTO_MIN;

/* ------------------------------------------------------------------ 成色 */

const CONDITION_OPTIONS: { label: string; value: Condition }[] = [
  { label: '全新', value: '全新' },
  { label: '良好', value: '良好' },
  { label: '一般', value: '一般' },
  { label: '磨损', value: '磨损' },
];

const LEGACY_CONDITION: Record<string, Condition> = {
  new: '全新',
  like_new: '全新',
  good: '良好',
  fair: '一般',
  worn: '磨损',
};

function normalizeCondition(value: unknown): Condition {
  if (typeof value !== 'string') return '良好';
  const hit = CONDITION_OPTIONS.find((o) => o.value === value);
  return hit ? hit.value : LEGACY_CONDITION[value] ?? '良好';
}

/* ------------------------------------------------------- 品类字段契约兼容 */
/** 读取草稿当前选中的品类（canonical CategoryId）。 */
function readCategory(draft: DraftListing | null): CategoryId | null {
  if (!draft) return null;
  const raw = draft.category;
  return typeof raw === 'string' && isCategoryId(raw) ? raw : null;
}

function categoryPatch(id: CategoryId): Partial<DraftListing> {
  return { category: id };
}

/* ------------------------------------------------------------------ 屏幕 */

type Nav = { goBack: () => void };

export function CreateListingScreen({ navigation }: { navigation?: Nav }) {
  const draft = useStore((s) => s.drafts);
  const startDraft = useStore((s) => s.startDraft);
  const updateDraft = useStore((s) => s.updateDraft);
  const addDraftPhoto = useStore((s) => s.addDraftPhoto);
  const removeDraftPhoto = useStore((s) => s.removeDraftPhoto);
  const setDraftCover = useStore((s) => s.setDraftCover);
  const clearDraft = useStore((s) => s.clearDraft);
  const publishDraft = useStore((s) => s.publishDraft);

  const currentUser = useStore((s) => s.currentUser);
  const sellerTrust = useMemo(
    () => getTrustProfile(currentUser?.rating ?? 4.9, currentUser?.soldCount ?? 12, true),
    [currentUser]
  );

  const [sourceSheet, setSourceSheet] = useState(false);
  const [categorySheet, setCategorySheet] = useState(false);
  const [chatSheet, setChatSheet] = useState(false);
  const [chatText, setChatText] = useState('');
  const [aiBanner, setAiBanner] = useState<string | null>(null);
  const [noPhotoWarning, setNoPhotoWarning] = useState<string | null>(null);

  const { width } = useWindowDimensions();
  const tileSize = Math.floor(
    (width - spacing.screen * 2 - spacing.lg * 2 - spacing.sm * 2) / 3
  );

  // 进屏即续编草稿（store 里已有草稿时原样返回）
  useEffect(() => {
    startDraft();
  }, [startDraft]);

  const photos = draft?.photos ?? [];
  const isReferenceMode = !!draft?.aiMeta?.isReferencePhoto;
  const progress = photoProgress(draft);
  const requiredDone = Math.min(progress.count, progress.required);
  const suggestedDone = Math.min(Math.max(progress.count - progress.required, 0), SUGGESTED_ANGLES);
  const publishable = canPublish(draft, { allowReferencePhoto: isReferenceMode });

  /** 展示顺序＝封面在前，与 publishDraft 的落库顺序一致；order[展示下标] = 真实下标 */
  const order = useMemo(() => {
    if (!photos.length) return [] as number[];
    const cover = Math.min(Math.max(draft?.coverIndex ?? 0, 0), photos.length - 1);
    return [cover, ...photos.map((_, i) => i).filter((i) => i !== cover)];
  }, [photos, draft?.coverIndex]);

  const displayPhotos = order.map((i) => photos[i]);

  /* ---------------------------------------------------------- 照片与AI操作 */

  const pick = async (useCamera: boolean) => {
    setSourceSheet(false);
    try {
      const perm = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          useCamera ? '需要相机权限' : '需要相册权限',
          '请在系统设置中允许 IKEAR 访问后再试。'
        );
        return;
      }
      const options = { quality: 0.7, allowsEditing: true } as const;
      const result = useCamera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync({
            ...options,
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
          });
      const uri = !result.canceled ? result.assets?.[0]?.uri : undefined;
      if (uri) {
        addDraftPhoto(uri);
        // ✨ AI 视觉识别与自动填单
        const currentPhotos = [...(draft?.photos ?? []), uri];
        const ai = estimateFurnitureFromPhoto(currentPhotos);
        setAiBanner(
          `✨ AI 视觉识别：已匹配「${ai.meta.detectedModel}」· 建议转让价 ¥${ai.meta.estimatedPriceLow}~¥${ai.meta.estimatedPriceHigh}（已为您自动填好标题/分类/描述，可随时微调）`
        );
        setNoPhotoWarning(null);

        // 如果用户尚未手动填写标题/价格，自动补齐
        updateDraft({
          title: draft?.title ? draft.title : ai.autoFilled.title,
          price: draft?.price ? draft.price : ai.autoFilled.price,
          category: draft?.category ? draft.category : ai.autoFilled.category,
          condition: draft?.condition ? draft.condition : ai.autoFilled.condition,
          description: draft?.description ? draft.description : ai.autoFilled.description,
          listingMode: 'ai_photo',
          aiMeta: ai.meta,
        });
      }
    } catch {
      Alert.alert('照片添加失败', '请稍后再试。');
    }
  };

  /** 💬 无图模式：通过用户自然对话一键生成挂牌并采用官方参考图 */
  const handleChatToList = (input: string) => {
    if (!input.trim()) return;
    const res = estimateFromChatDialog(input);
    res.autoFilled.referencePhotos.forEach((p) => addDraftPhoto(p));
    updateDraft({
      title: res.autoFilled.title,
      price: res.autoFilled.price,
      category: res.autoFilled.category,
      condition: res.autoFilled.condition,
      description: res.autoFilled.description,
      listingMode: 'no_photo_chat',
      aiMeta: res.meta,
    });
    setNoPhotoWarning(res.exposureWarning);
    setAiBanner(
      `💬 AI 对话匹配：已匹配「${res.matchedModel.model} (${res.matchedModel.nameZh})」· 原厂参考价 ¥${res.matchedModel.msrp}`
    );
    setChatSheet(false);
    setChatText('');
  };

  const confirmRemove = (index: number) => {
    Alert.alert('删除这张照片？', undefined, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => removeDraftPhoto(index) },
    ]);
  };

  /* ------------------------------------------------------------ 发布 */

  const onPublish = () => {
    if (!publishDraft()) {
      Alert.alert('还不能发布', `至少需要 ${HARD_PHOTO_MIN} 张必填照片。`);
      return;
    }
    clearDraft();
    navigation?.goBack();
  };

  if (!draft) return <Screen edges={['top', 'bottom']}><View /></Screen>;

  const category = readCategory(draft);
  const categoryMeta = getCategory(category);
  const condition = normalizeCondition(draft.condition);
  const nextAngle = ANGLES[Math.min(progress.count, ANGLES.length - 1)];

  const progressHint = !progress.met
    ? `再拍 ${progress.required - progress.count} 张必填照片即可发布`
    : !progress.suggestedMet
      ? '已可发布 · 再补 1 张建议角度，买家更容易下单'
      : '照片很齐全，成交率更高';

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          <LargeTitleHeader title="发布闲置" subtitle="先拍照，再填两行字就能上架" />

          {/* ---------------------------------------------- 卖家诚信状态 */}
          <View style={styles.trustBanner}>
            <ShieldCheck size={14} color={colors.brand} />
            <Text style={styles.trustBannerText}>
              卖家诚信：{sellerTrust.badgeIcon} {sellerTrust.label} · 推荐排序加权 +{Math.round((sellerTrust.score / 70 - 1) * 100)}%
            </Text>
          </View>

          {/* ---------------------------------------------- AI 识别状态提示 */}
          {aiBanner && (
            <View style={styles.aiBanner}>
              <Sparkles size={14} color={colors.brand} />
              <Text style={styles.aiBannerText}>{aiBanner}</Text>
            </View>
          )}

          {/* ---------------------------------------------- 无图模式降权警示 */}
          {noPhotoWarning && (
            <View style={styles.warningBanner}>
              <AlertTriangle size={14} color={colors.orange} />
              <Text style={styles.warningBannerText}>{noPhotoWarning}</Text>
            </View>
          )}

          {/* ---------------------------------------------- 照片与引导进度 */}
          <ListSection
            header={`照片 · 最多 ${MAX_PHOTOS} 张`}
            footer="轻点照片可删除，长按设为封面。实拍照片越多、越详细，平台推荐权重越高。"
          >
            <View style={styles.photoCard}>
              <View style={styles.progressRow}>
                <Text style={typography.headline}>拍照进度</Text>
                <Text style={[typography.subhead, { color: progress.met ? colors.brand : colors.secondaryLabel }]}>
                  {requiredDone}/{progress.required} 必填 + {suggestedDone}/{SUGGESTED_ANGLES} 建议
                </Text>
              </View>

              <View style={styles.bar}>
                {ANGLES.map((a, i) => (
                  <View
                    key={a.key}
                    style={[
                      styles.barSeg,
                      i < progress.count && (a.required ? styles.barSegHard : styles.barSegSoft),
                    ]}
                  />
                ))}
              </View>

              <Text style={styles.progressHint}>{progressHint}</Text>

              <PhotoGrid
                style={{ marginTop: spacing.lg }}
                photos={displayPhotos}
                tileSize={tileSize}
                max={MAX_PHOTOS}
                addLabel={progress.count < ANGLES.length ? nextAngle.title : `${progress.count}/${MAX_PHOTOS}`}
                onAdd={() => setSourceSheet(true)}
                onPressPhoto={(i) => confirmRemove(order[i])}
                onRemovePhoto={(i) => confirmRemove(order[i])}
                onSetCover={(i) => setDraftCover(order[i])}
              />

              {photos.length > 0 && (
                <View style={styles.coverLegend}>
                  <Badge label="封面" tone="brand" />
                  <Text style={styles.legendText}>第一张即封面，长按任意照片可换。</Text>
                </View>
              )}

              {/* 无图速记入口 */}
              <Pressable
                accessibilityRole="button"
                onPress={() => setChatSheet(true)}
                style={({ pressed }) => [styles.chatModeBtn, { opacity: pressed ? 0.7 : 1 }]}
              >
                <MessageSquareText size={14} color={colors.brand} />
                <Text style={styles.chatModeBtnText}>暂无实物照片？使用 AI 对话极速推断刊登 (示意图)</Text>
              </Pressable>
            </View>
          </ListSection>

          {/* -------------------------------------------------- 角度清单 */}
          <ListSection
            header="建议角度"
            footer={`前 ${HARD_PHOTO_MIN} 个角度是必填，其余为建议，不影响发布。`}
          >
            {ANGLES.map((a, i) => {
              const done = progress.count > i;
              return (
                <ListRow
                  key={a.key}
                  title={`${i + 1}. ${a.title}`}
                  subtitle={done ? '已拍' : a.hint}
                  last={i === ANGLES.length - 1}
                  icon={
                    done ? (
                      <View style={styles.tick}>
                        <Check size={13} color={colors.onBrand} strokeWidth={3} />
                      </View>
                    ) : (
                      <Circle size={20} color={colors.gray3} />
                    )
                  }
                  accessory={
                    <Badge
                      label={a.required ? '必填' : '建议'}
                      tone={a.required ? (done ? 'brand' : 'warning') : 'muted'}
                    />
                  }
                  onPress={done ? undefined : () => setSourceSheet(true)}
                />
              );
            })}
          </ListSection>

          {/* ---------------------------------------------------- 品类 */}
          <ListSection header="品类">
            <ListRow
              title="选择品类"
              value={categoryMeta ? `${categoryMeta.emoji} ${categoryMeta.name}` : '未选择'}
              chevron
              last
              onPress={() => setCategorySheet(true)}
            />
          </ListSection>

          {/* ---------------------------------------------------- 成色 */}
          <View style={styles.block}>
            <Text style={styles.blockHeader}>成色</Text>
            <SegmentedControl
              options={CONDITION_OPTIONS}
              value={condition}
              onChange={(v) => updateDraft({ condition: v })}
            />
          </View>

          {/* ------------------------------------------------ 文字信息 */}
          <ListSection header="商品信息">
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>标题</Text>
              <TextInput
                value={draft.title}
                onChangeText={(t) => updateDraft({ title: t })}
                placeholder="例如：宜家 MALM 双人床架"
                placeholderTextColor={colors.tertiaryLabel}
                maxLength={40}
                style={styles.input}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>价格</Text>
              <View style={styles.priceRow}>
                <Text style={styles.currency}>¥</Text>
                <TextInput
                  value={draft.price == null ? '' : String(draft.price)}
                  onChangeText={(t) => {
                    const digits = t.replace(/[^0-9]/g, '');
                    updateDraft({ price: digits ? Number(digits) : null });
                  }}
                  placeholder="0"
                  placeholderTextColor={colors.tertiaryLabel}
                  keyboardType="number-pad"
                  maxLength={7}
                  style={[styles.input, styles.priceInput]}
                />
              </View>
            </View>

            <View style={[styles.field, styles.fieldLast]}>
              <Text style={styles.fieldLabel}>描述</Text>
              <TextInput
                value={draft.description}
                onChangeText={(t) => updateDraft({ description: t })}
                placeholder="尺寸、使用年限、瑕疵与自提方式…"
                placeholderTextColor={colors.tertiaryLabel}
                multiline
                textAlignVertical="top"
                style={[styles.input, styles.textarea]}
              />
            </View>
          </ListSection>
        </ScrollView>

        {/* ------------------------------------------------ 底部固定发布 */}
        <View style={styles.footer}>
          {!publishable && (
            <Text style={styles.footerHint}>
              还差 {Math.max(progress.required - progress.count, 0)} 张必填照片
            </Text>
          )}
          <PrimaryButton title="发布" disabled={!publishable} onPress={onPublish} />
        </View>
      </KeyboardAvoidingView>

      {/* ------------------------------------------------------ 照片来源 */}
      <Sheet visible={sourceSheet} onClose={() => setSourceSheet(false)} title="添加照片">
        <Text style={styles.sheetHint}>
          {progress.count < ANGLES.length
            ? `建议这张拍「${nextAngle.title}」· ${nextAngle.hint}`
            : `已有 ${progress.count} 张，最多 ${MAX_PHOTOS} 张`}
        </Text>
        <View style={styles.sheetActions}>
          <PrimaryButton title="拍照" icon={<Camera size={18} color={colors.onBrand} />} onPress={() => pick(true)} />
          <SecondaryButton
            title="从相册选择"
            icon={<ImageIcon size={18} color={colors.label} />}
            onPress={() => pick(false)}
          />
        </View>
      </Sheet>

      {/* -------------------------------------------------------- 品类 */}
      <Sheet visible={categorySheet} onClose={() => setCategorySheet(false)} title="选择品类">
        <ScrollView style={styles.catScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.catGrid}>
            {CATEGORIES.map((c) => (
              <CategoryGridTile
                key={c.id}
                icon={c.emoji}
                name={c.name}
                active={category === c.id}
                onPress={() => {
                  updateDraft(categoryPatch(c.id));
                  setCategorySheet(false);
                }}
              />
            ))}
          </View>
        </ScrollView>
      </Sheet>

      {/* ------------------------------------------------ 💬 无图速记对话 Sheet */}
      <Sheet visible={chatSheet} onClose={() => setChatSheet(false)} title="💬 AI 对话速记刊登">
        <Text style={styles.sheetHint}>
          简单描述你想转让的家具（如型号、颜色、使用情况），AI 会自动匹配官方参考图并估价填单。
        </Text>
        <TextInput
          placeholder="例如：家里转让一个宜家白色毕利五层书架，九成新..."
          value={chatText}
          onChangeText={setChatText}
          placeholderTextColor={colors.tertiaryLabel}
          style={styles.chatInputBox}
          multiline
        />
        <View style={styles.quickTagsRow}>
          <Text style={[typography.caption2, { color: colors.secondaryLabel }]}>快捷填入：</Text>
          {['白色毕利书架', '波昂扶手椅', '马尔姆双人床', '索德汉沙发'].map((tag) => (
            <Pressable
              key={tag}
              onPress={() => setChatText(`转让自用${tag}`)}
              style={styles.quickTagChip}
            >
              <Text style={styles.quickTagText}>{tag}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
          <PrimaryButton
            title="✨ AI 智能匹配并自动填单"
            disabled={!chatText.trim()}
            onPress={() => handleChatToList(chatText)}
          />
          <SecondaryButton title="取消" onPress={() => setChatSheet(false)} />
        </View>
      </Sheet>
    </Screen>
  );
}

export default CreateListingScreen;

/* ------------------------------------------------------------------ 样式 */

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: spacing.xxxl },

  trustBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: spacing.screen,
    marginBottom: spacing.sm,
    backgroundColor: 'rgba(0,88,163,0.06)',
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.md,
  },
  trustBannerText: {
    ...typography.caption,
    color: colors.brand,
    fontWeight: '600',
    flex: 1,
  },
  aiBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: spacing.screen,
    marginBottom: spacing.sm,
    backgroundColor: colors.condLikeNewBg,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  aiBannerText: {
    ...typography.footnote,
    color: colors.condLikeNewFg,
    fontWeight: '600',
    flex: 1,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: spacing.screen,
    marginBottom: spacing.sm,
    backgroundColor: colors.condFairBg,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  warningBannerText: {
    ...typography.footnote,
    color: colors.condFairFg,
    fontWeight: '600',
    flex: 1,
  },
  chatModeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.md,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.gray6,
    borderRadius: radius.sm,
  },
  chatModeBtnText: {
    ...typography.caption,
    color: colors.brand,
    fontWeight: '600',
  },
  chatInputBox: {
    ...typography.body,
    backgroundColor: colors.gray6,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 76,
    textAlignVertical: 'top',
    color: colors.label,
  },
  quickTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
  },
  quickTagChip: {
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.gray4,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  quickTagText: {
    ...typography.caption2,
    color: colors.label,
  },

  photoCard: { padding: spacing.lg },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  bar: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md },
  barSeg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.gray5 },
  barSegHard: { backgroundColor: colors.brand },
  barSegSoft: { backgroundColor: colors.gray3 },
  progressHint: {
    ...typography.footnote,
    color: colors.secondaryLabel,
    marginTop: spacing.sm,
  },
  coverLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  legendText: { ...typography.caption, color: colors.secondaryLabel, flex: 1 },
  tick: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },

  block: { marginHorizontal: spacing.screen, marginBottom: spacing.lg },
  blockHeader: {
    ...typography.footnote,
    color: colors.secondaryLabel,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.06,
    marginLeft: 6,
    marginBottom: 7,
  },

  field: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  fieldLast: { paddingBottom: spacing.lg },
  fieldLabel: { ...typography.caption, color: colors.secondaryLabel, marginBottom: 2 },
  input: { ...typography.body, color: colors.label, padding: 0, minHeight: 26 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  currency: { ...typography.body, color: colors.secondaryLabel },
  priceInput: { flex: 1 },
  textarea: { minHeight: 92, paddingTop: 2 },

  footer: {
    paddingHorizontal: spacing.screen,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.groupedBg,
    gap: spacing.sm,
  },
  footerHint: {
    ...typography.footnote,
    color: colors.secondaryLabel,
    textAlign: 'center',
  },

  sheetHint: {
    ...typography.footnote,
    color: colors.secondaryLabel,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  sheetActions: { gap: spacing.md },
  catScroll: { maxHeight: 380 },
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    justifyContent: 'flex-start',
    paddingBottom: spacing.sm,
  },
});
