// 全域設計系統 - 所有畫面共用
export const colors = {
  primary:    '#2563EB', // 主色：深藍
  primaryBg:  '#EFF6FF', // 主色淡背景
  success:    '#16A34A', // 綠：完成
  successBg:  '#F0FDF4',
  danger:     '#DC2626', // 紅：緊急/刪除
  dangerBg:   '#FEF2F2',
  warning:    '#D97706', // 橘：注意
  warningBg:  '#FFFBEB',
  purple:     '#7C3AED',
  purpleBg:   '#F5F3FF',

  bg:         '#F1F5F9', // 頁面背景
  card:       '#FFFFFF', // 卡片白
  border:     '#E2E8F0', // 邊框
  text:       '#1E293B', // 主文字
  textSub:    '#64748B', // 副文字
  textMuted:  '#94A3B8', // 淡文字
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 999,
};

export const shadow = {
  sm: { elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3 },
  md: { elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6 },
};

export const text = {
  h1:   { fontSize: 22, fontWeight: '700', color: '#1E293B' },
  h2:   { fontSize: 18, fontWeight: '700', color: '#1E293B' },
  h3:   { fontSize: 15, fontWeight: '600', color: '#1E293B' },
  body: { fontSize: 15, fontWeight: '400', color: '#1E293B' },
  sm:   { fontSize: 13, fontWeight: '400', color: '#64748B' },
  xs:   { fontSize: 11, fontWeight: '400', color: '#94A3B8' },
};