/**
 * RESERVE Design System - Animations
 * 전역 keyframe + 재사용 animation 값 정의
 */

// ============================================
// Keyframe CSS (앱 최상단에 한 번만 주입)
// ============================================
export const animationKeyframes = `
  @keyframes fadeIn        { from { opacity: 0; }                           to { opacity: 1; } }
  @keyframes fadeOut       { from { opacity: 1; }                           to { opacity: 0; } }
  @keyframes slideUpIn     { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes slideUpOut    { from { opacity: 1; transform: translateY(0); }    to { opacity: 0; transform: translateY(10px); } }
  @keyframes scaleSpringIn { from { opacity: 0; transform: scale(0.88); }      to { opacity: 1; transform: scale(1); } }
  @keyframes scaleOut      { from { opacity: 1; transform: scale(1); }         to { opacity: 0; transform: scale(0.88); } }
  @keyframes pulse          { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
`;

// ============================================
// animation 값 (style={{ animation: ... }} 용)
// ============================================
export const animation = {
    fadeIn:        'fadeIn 0.2s ease both',
    fadeOut:       'fadeOut 0.2s ease both',
    slideUpIn:     'slideUpIn 0.2s ease both',
    slideUpOut:    'slideUpOut 0.2s ease both',
    scaleSpringIn: 'scaleSpringIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) both',
    scaleOut:      'scaleOut 0.2s ease both',
    pulse:          'pulse 1.4s ease-in-out infinite',
};
