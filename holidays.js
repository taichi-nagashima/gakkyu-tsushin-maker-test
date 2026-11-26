(function (global) {
  'use strict';

  const holidayCache = {};

  function addDays(d, n) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  }

  function nthMonday(y, m0, n) {
    const first = new Date(y, m0, 1).getDay();
    return 1 + ((8 - first) % 7) + 7 * (n - 1);
  }

  function getHolidays(y) {
    if (holidayCache[y]) return holidayCache[y];
    const map = new Map();
    const key = (m, d) => `${m}-${d}`;
    const add = (m, d, name) => map.set(key(m, d), name);
    const k = y - 1980;
    add(1, 1, '元日');
    add(1, nthMonday(y, 0, 2), '成人の日');
    add(2, 11, '建国記念の日');
    if (y >= 2020) add(2, 23, '天皇誕生日');
    add(3, Math.floor(20.8431 + 0.242194 * k - Math.floor(k / 4)), '春分の日');
    add(4, 29, '昭和の日');
    add(5, 3, '憲法記念日');
    add(5, 4, 'みどりの日');
    add(5, 5, 'こどもの日');
    add(7, nthMonday(y, 6, 3), '海の日');
    add(8, 11, '山の日');
    add(9, nthMonday(y, 8, 3), '敬老の日');
    add(9, Math.floor(23.2488 + 0.242194 * k - Math.floor(k / 4)), '秋分の日');
    add(10, nthMonday(y, 9, 2), 'スポーツの日');
    add(11, 3, '文化の日');
    add(11, 23, '勤労感謝の日');

    const baseKeys = new Set(map.keys());
    // 振替休日
    for (const kk of baseKeys) {
      const [m, d] = kk.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      if (dt.getDay() === 0) {
        let n = addDays(dt, 1);
        while (map.has(key(n.getMonth() + 1, n.getDate()))) n = addDays(n, 1);
        if (n.getFullYear() === y) add(n.getMonth() + 1, n.getDate(), '振替休日');
      }
    }
    // 国民の休日（祝日に挟まれた平日）
    for (let dt = new Date(y, 0, 2); dt.getFullYear() === y; dt = addDays(dt, 1)) {
      const kk = key(dt.getMonth() + 1, dt.getDate());
      if (map.has(kk) || dt.getDay() === 0) continue;
      const p = addDays(dt, -1);
      const n = addDays(dt, 1);
      if (baseKeys.has(key(p.getMonth() + 1, p.getDate())) && baseKeys.has(key(n.getMonth() + 1, n.getDate())))
        add(dt.getMonth() + 1, dt.getDate(), '国民の休日');
    }
    holidayCache[y] = map;
    return map;
  }

  function holidayName(d) {
    return getHolidays(d.getFullYear()).get(`${d.getMonth() + 1}-${d.getDate()}`) || '';
  }

  global.HomeHolidays = {
    getHolidays: getHolidays,
    holidayName: holidayName,
  };
})(typeof window !== 'undefined' ? window : this);
