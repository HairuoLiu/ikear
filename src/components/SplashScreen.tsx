import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, typography } from '../theme/tokens';

export function SplashScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.logo}>
        <Text style={styles.word}>IKEAR</Text>
      </View>
      <Text style={styles.tag}>二手家具集市</Text>
      <View style={styles.dot} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    backgroundColor: '#fff',
    paddingHorizontal: 26,
    paddingVertical: 12,
    borderRadius: 14,
  },
  word: {
    fontSize: 40,
    fontWeight: '800',
    color: colors.brand,
    letterSpacing: 1,
  },
  tag: { color: '#fff', marginTop: 16, ...typography.callout, opacity: 0.9 },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#fff',
    marginTop: 28,
    opacity: 0.9,
  },
});
