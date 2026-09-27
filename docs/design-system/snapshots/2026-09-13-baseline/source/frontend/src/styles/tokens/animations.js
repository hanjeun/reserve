/**
 * RESERVE Design System - Animations
 * 전역 keyframe + 재사용 animation 값 정의
 */

// ============================================
// animation 값 (키프레임은 index.css, 값은 style={{ animation: ... }} 용)
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
