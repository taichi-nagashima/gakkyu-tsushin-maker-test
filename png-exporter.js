/* ==========================================================
   HOME 学級通信メーカー - Pure Canvas PNG Exporter (LINE共有用)
   外部依存ゼロ・file://直開きでも動作する高解像度A4横レンダラー
   エディトリアル×知的ネイビー・デザイン（プレビュー完全同期版）
   ========================================================== */

window.HomePngExporter = (() => {
  'use strict';
  const LAYOUT_CFG = window.HomeLayoutConfig || {};
  const SHEET_W = LAYOUT_CFG.widthPx || 1122;
  const SHEET_H = LAYOUT_CFG.heightPx || 794;
  const SCALE = LAYOUT_CFG.pngScale || 2; // 2244 x 1588 px 高解像度
  const FONT_FAMILY = '"BIZ UDPGothic", "Meiryo", "Yu Gothic", "Hiragino Kaku Gothic ProN", sans-serif';

  function loadImg(src) {
    return new Promise((resolve) => {
      if (!src) return resolve(null);
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  function svgToImage(svgEl) {
    if (!svgEl) return Promise.resolve(null);
    try {
      const clone = svgEl.cloneNode(true);
      clone.setAttribute('width', '220');
      clone.setAttribute('height', '184');
      const svgStr = new XMLSerializer().serializeToString(clone);
      return loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr));
    } catch (_) {
      return Promise.resolve(null);
    }
  }

  function drawRoundedRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function splitTitleLines(ctx, text, maxW, maxLines) {
    const clean = String(text || '').replace(/\r?\n/g, ' ').trim();
    if (!clean) return [''];
    if (ctx.measureText(clean).width <= maxW) return [clean];
    const lines = [];
    let cur = '';
    for (const ch of clean) {
      const next = cur + ch;
      if (ctx.measureText(next).width > maxW && cur.length > 0) {
        lines.push(cur);
        cur = ch;
        if (lines.length === maxLines - 1) {
          // 残りは最終行にまとめる
          const idx = lines.join('').length;
          lines.push(clean.slice(idx));
          return lines;
        }
      } else {
        cur = next;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  }

  function drawWrappedText(ctx, text, x, y, maxW, maxH, lineHeight) {
    const paragraphs = String(text || '').replace(/\r\n/g, '\n').split('\n');
    let curY = y;
    const bottomLimit = y + maxH;

    for (const para of paragraphs) {
      if (curY + lineHeight > bottomLimit + 2) break;
      if (para === '') {
        curY += lineHeight;
        continue;
      }
      let line = '';
      for (const ch of para) {
        const test = line + ch;
        if (ctx.measureText(test).width > maxW && line.length > 0) {
          ctx.fillText(line, x, curY);
          curY += lineHeight;
          line = ch;
          if (curY + lineHeight > bottomLimit + 2) return;
        } else {
          line = test;
        }
      }
      if (line) {
        ctx.fillText(line, x, curY);
        curY += lineHeight;
      }
    }
  }

  function formatPeriodLines(text) {
    const t = (text || '').trim();
    if (!t) return [''];
    if (t.includes('\n')) return t.split('\n');
    if (t.length === 2) return [t[0], t[1]];
    if (t.length === 3) return [t.slice(0, 2), t.slice(2)];
    if (t.length === 4) return [t.slice(0, 2), t.slice(2)];
    return [t];
  }

  async function buildPngBlob(data) {
    const canvas = document.createElement('canvas');
    canvas.width = SHEET_W * SCALE;
    canvas.height = SHEET_H * SCALE;
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);

    // 白背景
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, SHEET_W, SHEET_H);

    // 外枠（上部ネイビー5pxアクセントバー＋1.8px外枠）
    const padX = 20;
    const padY = 18;
    const frameW = SHEET_W - padX * 2;
    const frameH = SHEET_H - padY * 2;
    const leftW = Math.round(frameW * 0.495);
    const rightX = padX + leftW;
    const rightW = frameW - leftW;

    ctx.fillStyle = '#1e3a5f';
    ctx.fillRect(padX, padY, frameW, 5);

    ctx.strokeStyle = '#1e3a5f';
    ctx.lineWidth = 1.8;
    ctx.strokeRect(padX + 0.9, padY + 0.9, frameW - 1.8, frameH - 1.8);

    // 中央縦仕切り線
    ctx.save();
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(rightX, padY + 5);
    ctx.lineTo(rightX, padY + frameH - 1);
    ctx.stroke();
    ctx.restore();

    // ======================================================
    // 左カラム
    // ======================================================
    const lx = padX + 11;
    const ly = padY + 13;
    const lw = leftW - 22;

    // 1. ヘッダーボックス（マストヘッド）
    const headerH = 98;
    const logoCellW = Math.round(lw * 0.53);

    // わずかな下影
    ctx.save();
    drawRoundedRect(ctx, lx, ly + 2, lw, headerH, 6);
    ctx.fillStyle = 'rgba(30, 58, 95, 0.08)';
    ctx.fill();
    ctx.restore();

    ctx.save();
    drawRoundedRect(ctx, lx, ly, lw, headerH, 6);
    ctx.clip();

    // 左ロゴセル背景（アイボリーグラデーション＋左端えんじストライプ）
    const logoGrad = ctx.createLinearGradient(0, ly, 0, ly + headerH);
    logoGrad.addColorStop(0, '#ffffff');
    logoGrad.addColorStop(1, '#fcfaf5');
    ctx.fillStyle = logoGrad;
    ctx.fillRect(lx, ly, logoCellW, headerH);

    ctx.fillStyle = '#9e1b1e';
    ctx.fillRect(lx, ly, 5, headerH);

    // 右メタ情報セル背景（クールスレート）
    ctx.fillStyle = '#f4f7fb';
    ctx.fillRect(lx + logoCellW, ly, lw - logoCellW, headerH);

    // セル間縦罫線
    ctx.strokeStyle = '#1e3a5f';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(lx + logoCellW, ly);
    ctx.lineTo(lx + logoCellW, ly + headerH);
    ctx.stroke();
    ctx.restore();

    // ヘッダー外枠
    ctx.save();
    drawRoundedRect(ctx, lx, ly, lw, headerH, 6);
    ctx.strokeStyle = '#1e3a5f';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.restore();

    // HOMEロゴ + 家のイラスト
    const houseImg = await svgToImage(data.houseSvgElement);
    ctx.save();
    const logoStr = data.logoText || 'HOME';
    ctx.font = `italic 800 43px Arial, "Helvetica Neue", ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const houseDrawW = houseImg ? 74 : 0;
    const houseDrawH = houseImg ? 64 : 0;
    const gap = houseImg ? 6 : 0;
    const usableLogoCellX = lx + 5;
    const usableLogoCellW = logoCellW - 5;
    const maxLogoTextW = Math.max(60, usableLogoCellW - houseDrawW - gap - 14);
    const measuredLogoW = ctx.measureText(logoStr).width;
    const logoDrawW = Math.min(measuredLogoW, maxLogoTextW);
    const totalLogoW = logoDrawW + gap + houseDrawW;
    const startX = usableLogoCellX + Math.max(7, (usableLogoCellW - totalLogoW) / 2);
    const logoMidY = ly + headerH / 2 + 2;

    // 立体感のある控えめなシャドウ
    ctx.fillStyle = 'rgba(30, 58, 95, 0.13)';
    ctx.fillText(logoStr, startX + 1.5, logoMidY + 1.5, maxLogoTextW);
    ctx.fillStyle = '#9e1b1e';
    ctx.fillText(logoStr, startX, logoMidY, maxLogoTextW);

    if (houseImg) {
      ctx.drawImage(houseImg, startX + logoDrawW + gap, ly + (headerH - houseDrawH) / 2, houseDrawW, houseDrawH);
    }
    ctx.restore();

    // 学校名・クラス＋号数バッジ・発行者・発行日
    ctx.save();
    const metaX = lx + logoCellW + 11;
    const metaW = lw - logoCellW - 22;

    // 学校名
    ctx.fillStyle = '#475569';
    ctx.font = `700 11.5px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(data.schoolName || '', metaX, ly + 10, metaW);

    // 号数ピルバッジ＋クラス名
    const issueBadgeStr = `第${data.issueNumber || '〇'}号`;
    ctx.font = `800 11.5px ${FONT_FAMILY}`;
    const badgeTextW = ctx.measureText(issueBadgeStr).width;
    const pillW = Math.min(metaW * 0.45, badgeTextW + 16);
    const pillH = 19;
    const pillX = metaX + metaW - pillW;
    const pillY = ly + 26;

    drawRoundedRect(ctx, pillX, pillY, pillW, pillH, 9.5);
    ctx.fillStyle = '#1e3a5f';
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(issueBadgeStr, pillX + pillW / 2, pillY + pillH / 2 + 0.5, pillW - 8);

    ctx.fillStyle = '#0f172a';
    ctx.font = `800 13.5px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(data.className || '', metaX, pillY + pillH / 2 + 0.5, Math.max(40, metaW - pillW - 6));

    // 点線セパレータ
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(metaX, ly + 50);
    ctx.lineTo(metaX + metaW, ly + 50);
    ctx.stroke();
    ctx.setLineDash([]);

    // 発行者・発行日
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#334155';
    ctx.font = `600 11.5px ${FONT_FAMILY}`;
    ctx.fillText(`発行者 ${data.publisherName || ''}`, metaX, ly + 56, metaW);

    ctx.fillStyle = '#1e3a5f';
    ctx.font = `700 11.5px ${FONT_FAMILY}`;
    ctx.fillText(data.issueDateText || '', metaX, ly + 74, metaW);
    ctx.restore();

    // 2. 記事タイトル（エディトリアル左アクセントバー＋下罫線）
    const titleBoxY = ly + headerH + 10;
    ctx.save();
    ctx.font = `800 21px ${FONT_FAMILY}`;
    const rawTitle = data.articleTitle || 'タイトル';
    const titleTextMaxW = lw - 27;
    const titleLines = splitTitleLines(ctx, rawTitle, titleTextMaxW, 2);
    const titleLineH = 27;
    const titleBoxH = 14 + titleLines.length * titleLineH;

    const titleGrad = ctx.createLinearGradient(lx, 0, lx + lw, 0);
    titleGrad.addColorStop(0, '#f0f5fb');
    titleGrad.addColorStop(1, '#f8fafc');
    ctx.fillStyle = titleGrad;
    ctx.fillRect(lx, titleBoxY, lw, titleBoxH);

    // 上・右の細罫線
    ctx.strokeStyle = '#d5dfec';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(lx, titleBoxY + 0.5);
    ctx.lineTo(lx + lw, titleBoxY + 0.5);
    ctx.lineTo(lx + lw - 0.5, titleBoxY + titleBoxH);
    ctx.stroke();

    // 下太線・左アクセントバー
    ctx.fillStyle = '#1e3a5f';
    ctx.fillRect(lx, titleBoxY, 5, titleBoxH);
    ctx.fillRect(lx, titleBoxY + titleBoxH - 2, lw, 2);

    ctx.fillStyle = data.articleTitle ? '#0f172a' : '#94a3b8';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    titleLines.forEach((ln, idx) => {
      const lineMidY = titleBoxY + 7 + titleLineH * idx + titleLineH / 2;
      ctx.fillText(ln, lx + 14, lineMidY, titleTextMaxW);
    });
    ctx.restore();

    // 3. 記事本文
    ctx.save();
    const articleFs = parseFloat(data.articleFontSize || 13.5);
    ctx.fillStyle = '#1a202c';
    ctx.font = `400 ${articleFs}px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const bodyY = titleBoxY + titleBoxH + 11;
    const bodyMaxH = (padY + frameH - 12) - bodyY;
    drawWrappedText(ctx, data.articleBody || '', lx + 6, bodyY, lw - 12, bodyMaxH, articleFs * 1.65);
    ctx.restore();

    // ======================================================
    // 右カラム
    // ======================================================
    const rx = rightX + 10;
    const rw = rightW - 20;
    let curRightY = padY + 13;

    // ① フォトコーナー（淡アンバー見出し帯＋クリーンアイボリー台紙）
    const photoBoxH = 226;
    const photoHeaderH = 27;
    ctx.save();
    drawRoundedRect(ctx, rx, curRightY, rw, photoBoxH, 10);
    ctx.clip();

    ctx.fillStyle = '#fffdf7';
    ctx.fillRect(rx, curRightY, rw, photoBoxH);

    const photoHeadGrad = ctx.createLinearGradient(0, curRightY, 0, curRightY + photoHeaderH);
    photoHeadGrad.addColorStop(0, '#fef3c7');
    photoHeadGrad.addColorStop(1, '#fde68a');
    ctx.fillStyle = photoHeadGrad;
    ctx.fillRect(rx, curRightY, rw, photoHeaderH);

    ctx.strokeStyle = '#c98a18';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(rx, curRightY + photoHeaderH);
    ctx.lineTo(rx + rw, curRightY + photoHeaderH);
    ctx.stroke();

    // 写真描画
    const photos = (data.photos || []).slice(0, 4);
    if (photos.length > 0) {
      const imgs = await Promise.all(photos.map((p) => loadImg(p.dataUrl)));
      const areaX = rx + 10;
      const areaY = curRightY + photoHeaderH + 7;
      const areaW = rw - 20;
      const areaH = photoBoxH - photoHeaderH - 15;

      const cols = photos.length === 1 ? 1 : photos.length === 3 ? 3 : 2;
      const rows = photos.length === 4 ? 2 : 1;
      const gapX = 8;
      const gapY = 8;
      const cellW = (areaW - gapX * (cols - 1)) / cols;
      const cellH = (areaH - gapY * (rows - 1)) / rows;

      photos.forEach((photo, idx) => {
        const img = imgs[idx];
        if (!img) return;
        const c = idx % cols;
        const r = Math.floor(idx / cols);
        const cx = areaX + c * (cellW + gapX);
        const cy = areaY + r * (cellH + gapY);

        // 白カード背景＋細枠
        drawRoundedRect(ctx, cx, cy, cellW, cellH, 6);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#e5dcc8';
        ctx.lineWidth = 1;
        ctx.stroke();

        const hasCaption = Boolean(photo.caption && photo.caption.trim());
        const capH = hasCaption ? 15 : 0;
        const innerX = cx + 4;
        const innerY = cy + 4;
        const innerW = cellW - 8;
        const innerH = cellH - 8 - capH;

        const scale = Math.min(innerW / img.naturalWidth, innerH / img.naturalHeight);
        const drawW = img.naturalWidth * scale;
        const drawH = img.naturalHeight * scale;
        ctx.drawImage(img, innerX + (innerW - drawW) / 2, innerY + (innerH - drawH) / 2, drawW, drawH);

        if (hasCaption) {
          ctx.fillStyle = '#334155';
          ctx.font = `600 10.5px ${FONT_FAMILY}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(photo.caption.trim(), cx + cellW / 2, cy + cellH - 3, cellW - 8);
        }
      });
    }
    ctx.restore();

    // フォトコーナー外枠＆見出しテキスト
    ctx.save();
    drawRoundedRect(ctx, rx, curRightY, rw, photoBoxH, 10);
    ctx.strokeStyle = '#c98a18';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    const photoTitleStr = data.photoCornerTitle || 'フォトコーナー';
    ctx.font = `800 13.5px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const ptW = ctx.measureText(photoTitleStr).width;
    const headMidY = curRightY + photoHeaderH / 2 + 0.5;
    ctx.fillStyle = '#78350f';
    ctx.fillText(photoTitleStr, rx + rw / 2, headMidY, rw - 48);

    ctx.font = `700 9px ${FONT_FAMILY}`;
    ctx.fillStyle = '#b45309';
    const ornamentOffset = Math.min((rw - 24) / 2, ptW / 2 + 12);
    ctx.fillText('◆', rx + rw / 2 - ornamentOffset, headMidY);
    ctx.fillText('◆', rx + rw / 2 + ornamentOffset, headMidY);
    ctx.restore();

    curRightY += photoBoxH + 8;

    // ② ★保護者の皆様へ★（深緑ヘッダー帯＋極淡セージ背景で高コントラスト化）
    const parentsBoxH = 224;
    const parentsHeaderH = 28;
    ctx.save();
    drawRoundedRect(ctx, rx, curRightY, rw, parentsBoxH, 10);
    ctx.clip();

    ctx.fillStyle = '#f6fbf8';
    ctx.fillRect(rx, curRightY, rw, parentsBoxH);

    ctx.fillStyle = '#276749';
    ctx.fillRect(rx, curRightY, rw, parentsHeaderH);

    ctx.fillStyle = '#1e4e38';
    ctx.fillRect(rx, curRightY + parentsHeaderH - 2, rw, 2);

    ctx.fillStyle = '#ffffff';
    ctx.font = `800 13.5px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★保護者の皆様へ★', rx + rw / 2, curRightY + parentsHeaderH / 2 + 0.5, rw - 24);

    const pFs = parseFloat(data.parentsFontSize || 12);
    ctx.fillStyle = '#1a202c';
    ctx.font = `400 ${pFs}px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    drawWrappedText(
      ctx,
      data.parentsNote || '',
      rx + 14,
      curRightY + parentsHeaderH + 9,
      rw - 28,
      parentsBoxH - parentsHeaderH - 18,
      pFs * 1.55
    );
    ctx.restore();

    ctx.save();
    drawRoundedRect(ctx, rx, curRightY, rw, parentsBoxH, 10);
    ctx.strokeStyle = '#276749';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.restore();

    curRightY += parentsBoxH + 8;

    // ③ 来週の予定表（濃紺バナー＋エプロン班ピル＋主従罫線）
    const tableY = curRightY;
    const tableH = (padY + frameH - 9) - tableY;
    const bannerH = 27;
    const headerRowH = 23;
    const rowHeaderY = tableY + bannerH;
    const bodyStartY = rowHeaderY + headerRowH;
    const dayRowH = (tableH - bannerH - headerRowH) / 5;

    const fixedCols = [26, 54, 27, 27, 27, 27, 27, 27, 25, 25, 25];
    const fixedSum = fixedCols.reduce((a, b) => a + b, 0);
    const colWidths = [...fixedCols, rw - fixedSum];
    const colXs = [];
    let accX = rx;
    for (const w of colWidths) {
      colXs.push(accX);
      accX += w;
    }

    const schedRows = data.scheduleRows || data.schedule || [];

    ctx.save();
    // セル背景塗り分け
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(rx, tableY, rw, tableH);

    // バナー行（濃紺）
    ctx.fillStyle = '#1e3a5f';
    ctx.fillRect(rx, tableY, rw, bannerH);

    // 列見出し行（淡スレート）
    ctx.fillStyle = '#e8eef6';
    ctx.fillRect(rx, rowHeaderY, rw, headerRowH);

    // 月・日列背景
    ctx.fillStyle = '#eef3f9';
    ctx.fillRect(colXs[0], bodyStartY, colWidths[0], dayRowH * 5);
    ctx.fillStyle = '#f6f8fb';
    ctx.fillRect(colXs[1], bodyStartY, colWidths[1], dayRowH * 5);

    // 行事・休業日の行背景
    for (let r = 0; r < 5; r++) {
      const row = schedRows[r];
      if (!row || !row.kind || row.kind === 'normal') continue;
      const rowY = bodyStartY + r * dayRowH;
      if (row.kind === 'holiday') {
        ctx.fillStyle = '#fef2f2';
        ctx.fillRect(colXs[2], rowY, colXs[11] - colXs[2], dayRowH);
      } else {
        ctx.fillStyle = '#eff6ff';
        ctx.fillRect(colXs[2], rowY, colXs[8] - colXs[2], dayRowH);
      }
    }

    // 横罫線（月結合を考慮）
    const monthSpans = data.monthSpans || [5, 0, 0, 0, 0];
    ctx.strokeStyle = '#7c8ba1';
    ctx.lineWidth = 1;
    for (let r = 1; r < 5; r++) {
      const yLine = bodyStartY + r * dayRowH;
      const startXLine = monthSpans[r] > 0 ? rx : colXs[1];
      ctx.beginPath();
      ctx.moveTo(startXLine, yLine);
      ctx.lineTo(rx + rw, yLine);
      ctx.stroke();
    }

    // 縦罫線（主要区切り 1.5px #334155 ／ 細区切り 1px #7c8ba1）
    // 行事・休業日の行では結合セル内の縦罫線を引かない
    const spanEndCol = (r) => {
      if (!r || !r.kind || r.kind === 'normal') return -1;
      return r.kind === 'holiday' ? 10 : 7;
    };
    const majorCols = new Set([2, 8, 11]);
    for (let c = 1; c < colWidths.length; c++) {
      const isMajor = majorCols.has(c);
      ctx.strokeStyle = isMajor ? '#334155' : '#7c8ba1';
      ctx.lineWidth = isMajor ? 1.5 : 1;

      const isInnerDivider = c >= 3 && c <= 10;
      if (!isInnerDivider) {
        ctx.beginPath();
        ctx.moveTo(colXs[c], rowHeaderY);
        ctx.lineTo(colXs[c], tableY + tableH);
        ctx.stroke();
        continue;
      }
      // ヘッダー部分
      ctx.beginPath();
      ctx.moveTo(colXs[c], rowHeaderY);
      ctx.lineTo(colXs[c], bodyStartY);
      ctx.stroke();
      // 各日の行：結合セル内の仕切りだけ省略
      for (let r = 0; r < 5; r++) {
        if (c <= spanEndCol(schedRows[r])) continue;
        const rowY = bodyStartY + r * dayRowH;
        ctx.beginPath();
        ctx.moveTo(colXs[c], rowY);
        ctx.lineTo(colXs[c], rowY + dayRowH);
        ctx.stroke();
      }
    }

    // バナー下線・列見出し下線（濃紺で引き締め）
    ctx.strokeStyle = '#1e3a5f';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(rx, rowHeaderY);
    ctx.lineTo(rx + rw, rowHeaderY);
    ctx.moveTo(rx, bodyStartY);
    ctx.lineTo(rx + rw, bodyStartY);
    ctx.stroke();

    // 外枠太線
    ctx.strokeStyle = '#1e3a5f';
    ctx.lineWidth = 2;
    ctx.strokeRect(rx, tableY, rw, tableH);

    // バナーテキスト＋エプロン持参バッジ
    const apronStr = data.apronText !== undefined
      ? data.apronText
      : ((data.apronGroups || []).slice().sort((a, b) => a - b).join('・'));
    let leftBannerStr = data.scheduleWeekRangeText
      ? `来週の予定（${data.scheduleWeekRangeText}）`
      : (data.scheduleBannerText || '');
    if (!data.scheduleWeekRangeText && apronStr) {
      leftBannerStr = leftBannerStr.replace(/\s*要エプロン持参.*$/, '');
    }

    let maxBannerTitleW = rw - 16;
    if (apronStr) {
      const apronLabel = `要エプロン持参 ${apronStr}班`;
      ctx.font = `800 10.5px ${FONT_FAMILY}`;
      const abTextW = ctx.measureText(apronLabel).width;
      const abW = Math.min(rw * 0.48, abTextW + 16);
      const abH = 18;
      const abX = rx + rw - 7 - abW;
      const abY = tableY + (bannerH - abH) / 2;

      drawRoundedRect(ctx, abX, abY, abW, abH, 9);
      ctx.fillStyle = '#fef3c7';
      ctx.fill();

      ctx.fillStyle = '#78350f';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(apronLabel, abX + abW / 2, abY + abH / 2 + 0.5, abW - 8);
      maxBannerTitleW = Math.max(80, abX - rx - 14);
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = `800 12px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(leftBannerStr, rx + 8, tableY + bannerH / 2 + 0.5, maxBannerTitleW);

    // 列見出し
    const headers = ['月', '日', '1', '2', '3', '4', '5', '6', '給', '清', '部', '備考'];
    ctx.fillStyle = '#1e3a5f';
    ctx.font = `800 11.5px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    headers.forEach((h, c) => {
      ctx.fillText(h, colXs[c] + colWidths[c] / 2, rowHeaderY + headerRowH / 2 + 0.5);
    });

    // 各日データ
    const weekDates = data.weekDates || [];
    schedRows.forEach((row, r) => {
      const rowY = bodyStartY + r * dayRowH;
      const rowMidY = rowY + dayRowH / 2;

      // 月セル（結合中央）
      if (monthSpans[r] > 0) {
        const spanH = monthSpans[r] * dayRowH;
        ctx.fillStyle = '#1e3a5f';
        ctx.font = `800 12px ${FONT_FAMILY}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(weekDates[r]?.month || '', colXs[0] + colWidths[0] / 2, rowY + spanH / 2);
      }

      // 日セル
      ctx.fillStyle = '#1e293b';
      ctx.font = `700 11px ${FONT_FAMILY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(weekDates[r]?.dayLabel || '', colXs[1] + colWidths[1] / 2, rowMidY);

      // 行事・休業日は横長の結合セルで表示
      if (row.kind && row.kind !== 'normal') {
        const isHol = row.kind === 'holiday';
        ctx.fillStyle = isHol ? '#991b1b' : '#1e3a5f';
        ctx.font = `800 12px ${FONT_FAMILY}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const spanRightX = isHol ? colXs[11] : colXs[8];
        ctx.fillText(row.spanText || '', (colXs[2] + spanRightX) / 2, rowMidY, spanRightX - colXs[2] - 8);

        if (!isHol) {
          ctx.font = `700 12.5px ${FONT_FAMILY}`;
          ['lunch', 'clean', 'club'].forEach((key, fIdx) => {
            const val = row[key] || '';
            ctx.fillStyle = val === '×' ? '#991b1b' : '#1e293b';
            ctx.fillText(val, colXs[8 + fIdx] + colWidths[8 + fIdx] / 2, rowMidY);
          });
        }

        ctx.fillStyle = '#1e293b';
        ctx.font = `400 10.5px ${FONT_FAMILY}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        drawWrappedText(ctx, row.noteText !== undefined ? row.noteText : (row.note || ''), colXs[11] + 6, rowY + 4, colWidths[11] - 10, dayRowH - 5, 15);
        return;
      }

      // 1-6限
      ctx.fillStyle = '#1e293b';
      ctx.font = `500 11px ${FONT_FAMILY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      row.periods.forEach((subj, p) => {
        const lines = formatPeriodLines(subj);
        const cx = colXs[2 + p] + colWidths[2 + p] / 2;
        if (lines.length === 1) {
          ctx.fillText(lines[0], cx, rowMidY);
        } else {
          const lh = 15;
          const startY = rowMidY - ((lines.length - 1) * lh) / 2;
          lines.forEach((ln, lIdx) => {
            ctx.fillText(ln, cx, startY + lIdx * lh);
          });
        }
      });

      // 給・清・部
      ['lunch', 'clean', 'club'].forEach((key, fIdx) => {
        const val = row[key] || '';
        ctx.fillStyle = val === '×' ? '#991b1b' : '#1e293b';
        ctx.font = `${val === '×' ? 800 : 700} 12.5px ${FONT_FAMILY}`;
        ctx.fillText(val, colXs[8 + fIdx] + colWidths[8 + fIdx] / 2, rowMidY);
      });

      // 備考（左上詰め）
      ctx.fillStyle = '#1e293b';
      ctx.font = `400 10.5px ${FONT_FAMILY}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      drawWrappedText(ctx, row.noteText !== undefined ? row.noteText : (row.note || ''), colXs[11] + 6, rowY + 4, colWidths[11] - 10, dayRowH - 5, 15);
    });
    ctx.restore();

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('PNG生成に失敗しました'));
      }, 'image/png');
    });
  }

  return { buildPngBlob };
})();
