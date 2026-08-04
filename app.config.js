// app.config.js
// 在构建期内联 EXPO_PUBLIC_ 前缀的环境变量到 iOS / Android / Web 包。
// 这些变量对客户端公开（anon key 用于浏览器/原生客户端读取），真正的权限边界是数据库 RLS 策略。
// 注意：Expo 会自动内联 `process.env.EXPO_PUBLIC_*`，本文件同时把值写入 extra，
// 以便后续如需通过 expo-constants 读取时保持一致。
module.exports = ({ config }) => {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
  return {
    ...config,
    expo: {
      ...config.expo,
      extra: {
        ...(config.expo && config.expo.extra ? config.expo.extra : {}),
        supabaseUrl,
        supabaseAnonKey,
      },
    },
  };
};
