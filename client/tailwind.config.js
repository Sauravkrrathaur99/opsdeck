/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          900: '#0a0e17',
          800: '#111827',
          700: '#1a2234',
          600: '#243049',
          500: '#2d3a56',
        },
        accent: {
          DEFAULT: '#3b82f6',
          hover: '#2563eb',
          glow: '#60a5fa',
        },
        success: '#10b981',
        warning: '#f59e0b',
        danger: '#ef4444',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'icon-blink': 'iconBlink 2s ease-in-out infinite',
        'icon-knob': 'iconKnob 2s ease-in-out infinite',
        'icon-sparkle': 'iconSparkle 1.5s ease-in-out infinite',
        'icon-chevron': 'iconChevron 1.2s ease-in-out infinite',
        'icon-cursor': 'iconCursor 1s step-end infinite',
        'icon-spin-slow': 'spin 3s linear infinite',
        'icon-ping': 'iconPing 1.5s ease-out infinite',
        'icon-wiggle': 'iconWiggle 0.6s ease-in-out',
        'icon-pop': 'iconPop 1.2s ease-in-out infinite',
        'icon-slide': 'iconSlide 1.5s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 8px rgba(59, 130, 246, 0.3)' },
          '50%': { boxShadow: '0 0 20px rgba(59, 130, 246, 0.6)' },
        },
        iconBlink: {
          '0%, 90%, 100%': { transform: 'scaleY(1)' },
          '95%': { transform: 'scaleY(0.1)' },
        },
        iconKnob: {
          '0%, 100%': { transform: 'translateX(0)' },
          '50%': { transform: 'translateX(4px)' },
        },
        iconSparkle: {
          '0%, 100%': { filter: 'brightness(1) drop-shadow(0 0 0 transparent)' },
          '50%': { filter: 'brightness(1.3) drop-shadow(0 0 4px rgba(250, 204, 21, 0.8))' },
        },
        iconChevron: {
          '0%, 100%': { transform: 'translateX(0)' },
          '50%': { transform: 'translateX(2px)' },
        },
        iconCursor: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
        iconPing: {
          '0%': { transform: 'scale(0.8)', opacity: '0.6' },
          '100%': { transform: 'scale(1.4)', opacity: '0' },
        },
        iconWiggle: {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '25%': { transform: 'rotate(-20deg)' },
          '75%': { transform: 'rotate(20deg)' },
        },
        iconPop: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(0.85)' },
        },
        iconSlide: {
          '0%, 100%': { transform: 'scaleX(1)' },
          '50%': { transform: 'scaleX(0.85)' },
        },
      },
    },
  },
  plugins: [],
};
