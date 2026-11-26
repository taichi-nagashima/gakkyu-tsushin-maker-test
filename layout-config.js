(function (global) {
  'use strict';

  function deepFreeze(obj) {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }
    Object.keys(obj).forEach(function (key) {
      var val = obj[key];
      if (val && typeof val === 'object') {
        deepFreeze(val);
      }
    });
    return Object.freeze(obj);
  }

  var config = deepFreeze({
    // A4横 紙面サイズ（HTML / Canvas / DOCX 共通）
    widthPx: 1122,
    heightPx: 794,
    pngScale: 2,
    pageWidthMm: 297,
    pageHeightMm: 210,
    pageMarginMm: 10,
    pageMarginPx: 38,

    // 写真圧縮・枚数制限設定
    photoMaxSide: 1000,
    photoJpegQuality: 0.85,
    maxPhotos: 4,

    // 記事フォントサイズ基準値
    articleFont: {
      basePx: 13.5,
      minPx: 10,
      maxPx: 18,
      stepPx: 0.5,
      lineHeight: 1.65,
      docxBasePt: 10,
      docxMinPt: 7.5,
      docxHeadingPt: 12
    },

    // 紙面基本カラー
    colors: {
      paperBg: '#FFFFFF',
      ink: '#1F2937',
      mutedInk: '#6B7280',
      border: '#D1D5DB',
      subtleBg: '#F9FAFB'
    },

    // 主要テーマカラー
    themes: {
      warm: {
        name: 'あたたかオレンジ',
        primary: '#EA580C',
        secondary: '#FDBA74',
        accentBg: '#FFF7ED',
        border: '#FED7AA',
        textOnPrimary: '#FFFFFF'
      },
      sky: {
        name: 'さわやかブルー',
        primary: '#0284C7',
        secondary: '#7DD3FC',
        accentBg: '#F0F9FF',
        border: '#BAE6FD',
        textOnPrimary: '#FFFFFF'
      },
      forest: {
        name: 'みどりグリーン',
        primary: '#15803D',
        secondary: '#86EFAC',
        accentBg: '#F0FDF4',
        border: '#BBF7D0',
        textOnPrimary: '#FFFFFF'
      },
      sakura: {
        name: 'さくらピンク',
        primary: '#DB2777',
        secondary: '#F9A8D4',
        accentBg: '#FDF2F8',
        border: '#FBCFE8',
        textOnPrimary: '#FFFFFF'
      },
      navy: {
        name: 'おちつきネイビー',
        primary: '#1E3A8A',
        secondary: '#93C5FD',
        accentBg: '#EFF6FF',
        border: '#BFDBFE',
        textOnPrimary: '#FFFFFF'
      }
    },

    defaultTheme: 'warm'
  });

  global.HomeLayoutConfig = config;
})(typeof window !== 'undefined' ? window : this);
