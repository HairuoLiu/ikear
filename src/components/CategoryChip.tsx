import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { Category } from '../data/types';

export function CategoryChip({
  category,
  active,
  onPress,
}: {
  category: Category;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        active && styles.chipActive,
        { opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Text style={styles.emoji}>{category.icon}</Text>
      <Text style={[typography.footnote, active ? styles.textActive : styles.text]}>
        {category.name_zh}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 66,
    height: 76,
    borderRadius: radius.md,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.separator,
    paddingVertical: 8,
  },
  chipActive: {
    backgroundColor: colors.brandTint,
    borderColor: colors.brand,
  },
  emoji: { fontSize: 26, marginBottom: 4 },
  text: { color: colors.label },
  textActive: { color: colors.brand, fontWeight: '600' },
});
