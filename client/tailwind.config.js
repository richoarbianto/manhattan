/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,html}"
  ],
  theme: {
    extend: {
      colors: {
        terminal: {
          bg: '#0a0a0a',
          surface: '#111111',
          panel: '#1a1a1a',
          border: '#2a2a2a',
          green: '#00ff41',
          'green-dim': '#00cc33',
          cyan: '#00d4ff',
          red: '#ff0040',
          amber: '#ffb000',
          text: '#e0e0e0',
          muted: '#666666',
        }
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        'glow-green': '0 0 10px rgba(0, 255, 65, 0.3), 0 0 20px rgba(0, 255, 65, 0.1)',
        'glow-cyan': '0 0 10px rgba(0, 212, 255, 0.3), 0 0 20px rgba(0, 212, 255, 0.1)',
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'blink': 'blink 1s step-end infinite',
        'slide-down': 'slide-down 0.3s ease-out forwards',
        'slide-up': 'slide-up 0.3s ease-in forwards',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { textShadow: '0 0 4px rgba(0, 255, 65, 0.4)' },
          '50%': { textShadow: '0 0 8px rgba(0, 255, 65, 0.8), 0 0 16px rgba(0, 255, 65, 0.4)' },
        },
        'blink': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
        'slide-down': {
          '0%': { transform: 'translateY(-100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(0)', opacity: '1' },
          '100%': { transform: 'translateY(-100%)', opacity: '0' },
        },
      }
    },
  },
  plugins: [],
}
