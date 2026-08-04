/**
 * 地点选择器（M1）—— 底部 Sheet：城市 → 可选区（district）。
 *
 * 选中后写入 `store.setLocation(city, district?)` 并关闭；不做本地副本，
 * 首页的地点 chip 直接读 `store.location`，保证唯一真源。
 */
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Check, MapPin } from 'lucide-react-native';
import { ListRow, ListSection, Sheet } from '../components';
import { useStore } from '../store/useStore';
import { colors, radius, spacing, typography } from '../theme/tokens';

/** 服务城市与可选区（与 mock 数据中的 location 一致）。 */
export const CITIES: { city: string; districts: string[] }[] = [
  { city: '多伦多', districts: ['Downtown', 'North York', 'Midtown', 'Scarborough', 'Etobicoke'] },
  { city: '万锦', districts: ['Unionville', 'Milliken Mills', 'Markville'] },
  { city: '密西沙加', districts: ['Square One', 'Erin Mills', 'Port Credit'] },
];

export type LocationPickerProps = {
  visible: boolean;
  onClose: () => void;
};

export function LocationPicker({ visible, onClose }: LocationPickerProps) {
  const location = useStore((s) => s.location);
  const setLocation = useStore((s) => s.setLocation);
  const [openCity, setOpenCity] = useState<string | null>(location.city ?? null);

  // 每次打开都回到当前城市展开的状态
  useEffect(() => {
    if (visible) setOpenCity(location.city ?? null);
  }, [visible, location.city]);

  const choose = (city: string, district?: string) => {
    setLocation(city, district);
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="选择地点">
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <ListSection style={styles.section} footer="用于「附近」排序与筛选，可随时更改。">
          {CITIES.map(({ city, districts }) => {
            const expanded = openCity === city;
            const isCurrent = location.city === city;
            return (
              <View key={city}>
                <ListRow
                  title={city}
                  subtitle={isCurrent ? location.district ?? '全部区域' : undefined}
                  icon={
                    <MapPin size={18} color={isCurrent ? colors.brand : colors.secondaryLabel} />
                  }
                  accessory={isCurrent ? <Check size={18} color={colors.brand} /> : undefined}
                  onPress={() => setOpenCity(expanded ? null : city)}
                  last
                />
                {expanded && (
                  <View style={styles.districts}>
                    <ListRow
                      title="全部区域"
                      value={isCurrent && !location.district ? '当前' : undefined}
                      onPress={() => choose(city)}
                      last
                    />
                    {districts.map((d) => (
                      <ListRow
                        key={d}
                        title={d}
                        value={isCurrent && location.district === d ? '当前' : undefined}
                        onPress={() => choose(city, d)}
                        last
                      />
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </ListSection>
        <Text style={styles.hint}>目前仅覆盖大多地区，更多城市陆续开放。</Text>
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  scroll: { maxHeight: 420 },
  // 抵消 ListSection 自带的屏幕边距，让卡片在 Sheet 内近乎满宽
  section: { marginHorizontal: -spacing.lg, marginBottom: spacing.sm },
  // 区域组用浅底与圆角内缩表达层级，不用分割线
  districts: {
    marginHorizontal: spacing.sm,
    marginBottom: spacing.sm,
    paddingLeft: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.gray6,
    overflow: 'hidden',
  },
  hint: {
    ...typography.caption,
    color: colors.tertiaryLabel,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
