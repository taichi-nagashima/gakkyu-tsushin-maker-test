/* ==========================================================
   HOME 学級通信メーカー - Pure Canvas PNG Exporter (LINE共有用)
   外部依存ゼロ・file://直開きでも動作する高解像度A4横レンダラー
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
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
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

    // 外枠
    const padX = 20;
    const padY = 18;
    const frameW = SHEET_W - padX * 2;
    const frameH = SHEET_H - padY * 2;
    const leftW = Math.round(frameW * 0.495);
    const rightX = padX + leftW;
    const rightW = frameW - leftW;

    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 1.6;
    ctx.strokeRect(padX, padY, frameW, frameH);

    // 中央縦仕切り線
    ctx.beginPath();
    ctx.moveTo(rightX, padY);
    ctx.lineTo(rightX, padY + frameH);
    ctx.stroke();

    // ======================================================
    // 左カラム
    // ======================================================
    const lx = padX + 10;
    const ly = padY + 10;
    const lw = leftW - 20;

    // ヘッダーボックス
    const headerH = 98;
    const logoCellW = Math.round(lw * 0.54);
    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(lx, ly, lw, headerH);
    ctx.beginPath();
    ctx.moveTo(lx + logoCellW, ly);
    ctx.lineTo(lx + logoCellW, ly + headerH);
    ctx.stroke();

    // HOMEロゴ + 家のイラスト
    const houseImg = await svgToImage(data.houseSvgElement);
    ctx.save();
    ctx.fillStyle = '#9e1b1e';
    ctx.font = 'italic 800 44px Arial, "Helvetica Neue", Meiryo, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const logoStr = data.logoText || 'HOME';
    const logoW = ctx.measureText(logoStr).width;
    const houseDrawW = houseImg ? 74 : 0;
    const houseDrawH = houseImg ? 64 : 0;
    const gap = houseImg ? 6 : 0;
    const totalLogoW = logoW + gap + houseDrawW;
    const startX = lx + Math.max(8, (logoCellW - totalLogoW) / 2);
    ctx.fillText(logoStr, startX, ly + headerH / 2 + 2);
    if (houseImg) {
      ctx.drawImage(houseImg, startX + logoW + gap, ly + (headerH - houseDrawH) / 2, houseDrawW, houseDrawH);
    }
    ctx.restore();

    // 学校名・号数・発行者・日付
    ctx.save();
    ctx.fillStyle = '#111111';
    ctx.font = `500 13.5px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const metaX = lx + logoCellW + 10;
    const metaLines = [
      data.schoolName || '',
      `${data.className || ''} 第${data.issueNumber || '〇'}号`,
      `発行者 ${data.publisherName || ''}`,
      data.issueDateText || ''
    ];
    metaLines.forEach((line, idx) => {
      ctx.fillText(line, metaX, ly + 11 + idx * 19.5);
    });
    ctx.restore();

    // 記事タイトル
    ctx.save();
    ctx.fillStyle = '#111111';
    ctx.font = `800 27px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const titleY = ly + headerH + 12;
    ctx.fillText(data.articleTitle || 'タイトル', lx + lw / 2, titleY, lw - 12);
    ctx.restore();

    // 記事本文
    ctx.save();
    const articleFs = parseFloat(data.articleFontSize || 13.5);
    ctx.fillStyle = '#111111';
    ctx.font = `400 ${articleFs}px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const bodyY = titleY + 42;
    const bodyMaxH = (padY + frameH - 12) - bodyY;
    drawWrappedText(ctx, data.articleBody || '', lx + 4, bodyY, lw - 8, bodyMaxH, articleFs * 1.62);
    ctx.restore();

    // ======================================================
    // 右カラム
    // ======================================================
    const rx = rightX + 10;
    const rw = rightW - 20;
    let curRightY = padY + 9;

    // ① フォトコーナー
    const photoBoxH = 228;
    ctx.save();
    drawRoundedRect(ctx, rx, curRightY, rw, photoBoxH, 16);
    ctx.fillStyle = '#fad57b';
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#d49b27';
    ctx.stroke();

    ctx.fillStyle = '#111111';
    ctx.font = `800 16px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(data.photoCornerTitle || 'フォトコーナー', rx + rw / 2, curRightY + 10);

    // 写真描画
    const photos = (data.photos || []).slice(0, 4);
    if (photos.length > 0) {
      const imgs = await Promise.all(photos.map((p) => loadImg(p.dataUrl)));
      const areaX = rx + 14;
      const areaY = curRightY + 34;
      const areaW = rw - 28;
      const areaH = photoBoxH - 44;

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

        // 白カード背景
        drawRoundedRect(ctx, cx, cy, cellW, cellH, 6);
        ctx.fillStyle = 'rgba(255,255,255,0.78)';
        ctx.fill();

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
          ctx.fillStyle = '#222222';
          ctx.font = `500 10.5px ${FONT_FAMILY}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(photo.caption.trim(), cx + cellW / 2, cy + cellH - 3, cellW - 8);
        }
      });
    }
    ctx.restore();

    curRightY += photoBoxH + 7;

    // ② ★保護者の皆様へ★
    const parentsBoxH = 226;
    ctx.save();
    drawRoundedRect(ctx, rx, curRightY, rw, parentsBoxH, 16);
    ctx.fillStyle = '#a3c992';
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#5b8a49';
    ctx.setLineDash([11, 7]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#111111';
    ctx.font = `800 16px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('★保護者の皆様へ★', rx + rw / 2, curRightY + 11);

    const pFs = parseFloat(data.parentsFontSize || 12);
    ctx.font = `400 ${pFs}px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    drawWrappedText(ctx, data.parentsNote || '', rx + 14, curRightY + 36, rw - 28, parentsBoxH - 46, pFs * 1.55);
    ctx.restore();

    curRightY += parentsBoxH + 7;

    // ③ 来週の予定表
    const tableY = curRightY;
    const tableH = (padY + frameH - 8) - tableY;
    const bannerH = 24;
    const headerRowH = 22;
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

    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(rx, tableY, rw, tableH);

    // 内枠線
    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 1;

    // バナー下線・ヘッダー下線
    const rowHeaderY = tableY + bannerH;
    const bodyStartY = rowHeaderY + headerRowH;

    ctx.beginPath();
    ctx.moveTo(rx, rowHeaderY);
    ctx.lineTo(rx + rw, rowHeaderY);
    ctx.moveTo(rx, bodyStartY);
    ctx.lineTo(rx + rw, bodyStartY);
    ctx.stroke();

    // 縦線（ヘッダー行〜下端）。行事・休業日の行では結合セル内の縦罫線を引かない
    // （プレビューと同じ見た目にする：行事は1〜6限のみ結合、休みは給・清・部まで結合）
    const schedRows = data.scheduleRows || data.schedule || [];
    const spanEndCol = (r) => {
      if (!r || !r.kind || r.kind === 'normal') return -1;
      return r.kind === 'holiday' ? 10 : 7; // この列番号までの縦線をその行では省略
    };
    for (let c = 1; c < colWidths.length; c++) {
      const isInnerDivider = c >= 3 && c <= 10;
      if (!isInnerDivider) {
        ctx.beginPath();
        ctx.moveTo(colXs[c], rowHeaderY);
        ctx.lineTo(colXs[c], tableY + tableH);
        ctx.stroke();
        continue;
      }
      // ヘッダー部分は常時
      ctx.beginPath();
      ctx.moveTo(colXs[c], rowHeaderY);
      ctx.lineTo(colXs[c], bodyStartY);
      ctx.stroke();
      // 各日の行：結合セル内の仕切りだけ省略（行が足りない分は通常行として描く）
      for (let r = 0; r < 5; r++) {
        if (c <= spanEndCol(schedRows[r])) continue;
        const rowY = bodyStartY + r * dayRowH;
        ctx.beginPath();
        ctx.moveTo(colXs[c], rowY);
        ctx.lineTo(colXs[c], rowY + dayRowH);
        ctx.stroke();
      }
    }

    // 月結合を考慮した横線
    const monthSpans = data.monthSpans || [5, 0, 0, 0, 0];
    for (let r = 1; r < 5; r++) {
      const yLine = bodyStartY + r * dayRowH;
      const startXLine = monthSpans[r] > 0 ? rx : colXs[1];
      ctx.beginPath();
      ctx.moveTo(startXLine, yLine);
      ctx.lineTo(rx + rw, yLine);
      ctx.stroke();
    }

    // 外枠太線
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 2;
    ctx.strokeRect(rx, tableY, rw, tableH);

    // バナーテキスト
    ctx.fillStyle = '#111111';
    ctx.font = `700 12px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(data.scheduleBannerText || '', rx + 6, tableY + bannerH / 2, rw - 12);

    // 列見出し
    const headers = ['月', '日', '1', '2', '3', '4', '5', '6', '給', '清', '部', '備考'];
    ctx.font = `700 11.5px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    headers.forEach((h, c) => {
      ctx.fillText(h, colXs[c] + colWidths[c] / 2, rowHeaderY + headerRowH / 2);
    });

    // 各日データ
    const weekDates = data.weekDates || [];
    (data.scheduleRows || data.schedule || []).forEach((row, r) => {
      const rowY = bodyStartY + r * dayRowH;
      const rowMidY = rowY + dayRowH / 2;

      // 月セル（結合中央）
      if (monthSpans[r] > 0) {
        const spanH = monthSpans[r] * dayRowH;
        ctx.font = `700 12px ${FONT_FAMILY}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(weekDates[r]?.month || '', colXs[0] + colWidths[0] / 2, rowY + spanH / 2);
      }

      // 日セル
      ctx.font = `500 11.5px ${FONT_FAMILY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(weekDates[r]?.dayLabel || '', colXs[1] + colWidths[1] / 2, rowMidY);

      // 行事・休業日は横長の結合セルで表示（プレビューと同じ範囲：行事は1〜6限、休みは給・清・部まで）
      if (row.kind && row.kind !== 'normal') {
        ctx.font = `700 12px ${FONT_FAMILY}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const spanRightX = row.kind === 'holiday' ? colXs[11] : colXs[8];
        ctx.fillText(row.spanText || '', (colXs[2] + spanRightX) / 2, rowMidY);
        ctx.font = `400 10.5px ${FONT_FAMILY}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        drawWrappedText(ctx, row.noteText || '', colXs[11] + 5, rowY + 4, colWidths[11] - 8, dayRowH - 5, 15);
        return;
      }

      // 1-6限
      ctx.font = `500 11px ${FONT_FAMILY}`;
      row.periods.forEach((subj, p) => {
        const lines = formatPeriodLines(subj);
        const cx = colXs[2 + p] + colWidths[2 + p] / 2;
        if (lines.length === 1) {
          ctx.fillText(lines[0], cx, rowMidY);
        } else {
          const lh = 15.5;
          const startY = rowMidY - ((lines.length - 1) * lh) / 2;
          lines.forEach((ln, lIdx) => {
            ctx.fillText(ln, cx, startY + lIdx * lh);
          });
        }
      });

      // 給・清・部
      ctx.font = `600 12.5px ${FONT_FAMILY}`;
      ['lunch', 'clean', 'club'].forEach((key, fIdx) => {
        ctx.fillText(row[key] || '', colXs[8 + fIdx] + colWidths[8 + fIdx] / 2, rowMidY);
      });

      // 備考（左上詰め）
      ctx.font = `400 10.5px ${FONT_FAMILY}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      drawWrappedText(ctx, row.noteText !== undefined ? row.noteText : (row.note || ''), colXs[11] + 5, rowY + 4, colWidths[11] - 8, dayRowH - 5, 15);
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
