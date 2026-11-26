/* ==========================================================
   HOME 学級通信メーカー - Pure JS OOXML (.docx) Builder
   Word / Googleドキュメント完全対応（外部依存ゼロ）
   エディトリアル×知的ネイビー・デザイン対応版
   ========================================================== */

window.HomeDocxBuilder = (() => {
  'use strict';

  // ---------- Minimal Standard ZIP Writer (Store / Deflate) ----------
  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  async function compressDeflateRaw(bytes) {
    if (typeof CompressionStream !== 'function') return null;
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      const compressedBuffer = await new Response(stream).arrayBuffer();
      return new Uint8Array(compressedBuffer);
    } catch (_err) {
      return null;
    }
  }

  async function createZipBlob(entries, mimeType) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    const now = new Date();
    const dosTime = ((now.getHours() & 0x1f) << 11) | ((now.getMinutes() & 0x3f) << 5) | ((now.getSeconds() >> 1) & 0x1f);
    const dosDate = (((Math.max(1980, now.getFullYear()) - 1980) & 0x7f) << 9) | (((now.getMonth() + 1) & 0x0f) << 5) | (now.getDate() & 0x1f);

    for (const entry of entries) {
      const nameBytes = encoder.encode(entry.name);
      const dataBytes = typeof entry.data === 'string' ? encoder.encode(entry.data) : entry.data;
      const crc = crc32(dataBytes);
      const size = dataBytes.length;
      const isCompressible = typeof entry.data === 'string' || /\.(xml|rels|txt)$/i.test(entry.name);
      let payloadBytes = dataBytes;
      let method = 0;
      if (isCompressible && size > 0) {
        const compressed = await compressDeflateRaw(dataBytes);
        if (compressed && compressed.length < size) {
          payloadBytes = compressed;
          method = 8;
        }
      }
      const compressedSize = payloadBytes.length;

      // Local File Header (30 bytes + name)
      const localHeader = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(localHeader.buffer);
      lv.setUint32(0, 0x04034b50, true); // signature
      lv.setUint16(4, 20, true);         // version needed
      lv.setUint16(6, 0x0800, true);     // UTF-8 flag
      lv.setUint16(8, method, true);     // method
      lv.setUint16(10, dosTime, true);
      lv.setUint16(12, dosDate, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, compressedSize, true);
      lv.setUint32(22, size, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      localHeader.set(nameBytes, 30);

      localParts.push(localHeader, payloadBytes);

      // Central Directory Header (46 bytes + name)
      const centralHeader = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(centralHeader.buffer);
      cv.setUint32(0, 0x02014b50, true); // signature
      cv.setUint16(4, 20, true);         // version made by
      cv.setUint16(6, 20, true);         // version needed
      cv.setUint16(8, 0x0800, true);     // UTF-8 flag
      cv.setUint16(10, method, true);    // method
      cv.setUint16(12, dosTime, true);
      cv.setUint16(14, dosDate, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, compressedSize, true);
      cv.setUint32(24, size, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);    // local header offset
      centralHeader.set(nameBytes, 46);

      centralParts.push(centralHeader);
      offset += localHeader.length + compressedSize;
    }

    const centralSize = centralParts.reduce((acc, p) => acc + p.length, 0);
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);

    return new Blob([...localParts, ...centralParts, eocd], { type: mimeType });
  }

  // ---------- Image Utilities ----------
  function dataUrlToBytes(dataUrl) {
    const base64 = dataUrl.split(',')[1] || '';
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function loadImageSize(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth || 400, height: img.naturalHeight || 300 });
      img.onerror = () => resolve({ width: 400, height: 300 });
      img.src = dataUrl;
    });
  }

  function svgElementToPngBytes(svgEl) {
    return new Promise((resolve) => {
      if (!svgEl) return resolve(null);
      try {
        const cloneSvg = svgEl.cloneNode(true);
        cloneSvg.setAttribute('width', '220');
        cloneSvg.setAttribute('height', '184');
        const svgStr = new XMLSerializer().serializeToString(cloneSvg);
        const svgDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = 220;
          canvas.height = 184;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, 220, 184);
          resolve(dataUrlToBytes(canvas.toDataURL('image/png')));
        };
        img.onerror = () => resolve(null);
        img.src = svgDataUrl;
      } catch (_) {
        resolve(null);
      }
    });
  }

  // ---------- XML Helpers (Strict OOXML Schema Element Order) ----------
  function xmlEsc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
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

  // EG_RPrBase order: rFonts -> b/bCs -> i/iCs -> color -> sz/szCs -> shd
  function rPr({ sizeHalfPt = 20, bold = false, italic = false, color = '1A202C', font = 'Meiryo', fill = '' } = {}) {
    return `<w:rPr>
      <w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:eastAsia="${font}" w:cs="${font}"/>
      ${bold ? '<w:b/><w:bCs/>' : ''}
      ${italic ? '<w:i/><w:iCs/>' : ''}
      <w:color w:val="${color}"/>
      <w:sz w:val="${sizeHalfPt}"/><w:szCs w:val="${sizeHalfPt}"/>
      ${fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : ''}
    </w:rPr>`;
  }

  // CT_PPrBase order: pBdr -> shd -> spacing -> ind -> jc
  function makeParagraph(text, {
    align = 'left',
    sizeHalfPt = 20,
    bold = false,
    italic = false,
    color = '1A202C',
    spaceBefore = 0,
    spaceAfter = 40,
    line = 280,
    font = 'Meiryo',
    pBdrXml = '',
    shdFill = '',
    indentLeft = 0,
    indentRight = 0
  } = {}) {
    return `<w:p>
      <w:pPr>
        ${pBdrXml}
        ${shdFill ? `<w:shd w:val="clear" w:color="auto" w:fill="${shdFill}"/>` : ''}
        <w:spacing w:before="${spaceBefore}" w:after="${spaceAfter}" w:line="${line}" w:lineRule="auto"/>
        ${(indentLeft || indentRight) ? `<w:ind w:left="${indentLeft}" w:right="${indentRight}"/>` : ''}
        <w:jc w:val="${align}"/>
      </w:pPr>
      <w:r>
        ${rPr({ sizeHalfPt, bold, italic, color, font })}
        <w:t xml:space="preserve">${xmlEsc(text)}</w:t>
      </w:r>
    </w:p>`;
  }

  function makeMultilineParagraphs(text, opts) {
    const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
    return lines.map((line) => makeParagraph(line, opts)).join('');
  }

  function makeInlineDrawing(rId, cxEmu, cyEmu, docPrId, name) {
    return `<w:r><w:drawing>
      <wp:inline distT="0" distB="0" distL="0" distR="0"
        xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
        <wp:extent cx="${Math.round(cxEmu)}" cy="${Math.round(cyEmu)}"/>
        <wp:effectExtent l="0" t="0" r="0" b="0"/>
        <wp:docPr id="${docPrId}" name="${xmlEsc(name)}"/>
        <wp:cNvGraphicFramePr>
          <a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/>
        </wp:cNvGraphicFramePr>
        <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:nvPicPr>
                <pic:cNvPr id="${docPrId}" name="${xmlEsc(name)}"/>
                <pic:cNvPicPr/>
              </pic:nvPicPr>
              <pic:blipFill>
                <a:blip r:embed="${rId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
                <a:stretch><a:fillRect/></a:stretch>
              </pic:blipFill>
              <pic:spPr>
                <a:xfrm>
                  <a:off x="0" y="0"/>
                  <a:ext cx="${Math.round(cxEmu)}" cy="${Math.round(cyEmu)}"/>
                </a:xfrm>
                <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
              </pic:spPr>
            </pic:pic>
          </a:graphicData>
        </a:graphic>
      </wp:inline>
    </w:drawing></w:r>`;
  }

  function fitBoxEmu(imgW, imgH, maxW, maxH) {
    const ratio = Math.min(maxW / imgW, maxH / imgH);
    return { cx: imgW * ratio, cy: imgH * ratio };
  }

  function emptySpacerP(lineTwips = 80) {
    return `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="${lineTwips}" w:lineRule="exact"/></w:pPr></w:p>`;
  }

  // ---------- Build Complete .docx ----------
  async function buildDocxBlob(data) {
    const mediaEntries = [];
    const rels = [];
    let nextRId = 1;
    let nextDocPrId = 10;

    function addMedia(filename, bytes) {
      const rId = `rId${nextRId++}`;
      mediaEntries.push({ name: `word/media/${filename}`, data: bytes });
      rels.push({
        id: rId,
        type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
        target: `media/${filename}`
      });
      return rId;
    }

    // 1. 家のイラストをPNG化して埋め込み準備
    let houseRId = null;
    const housePngBytes = await svgElementToPngBytes(data.houseSvgElement);
    if (housePngBytes) {
      houseRId = addMedia('house.png', housePngBytes);
    }

    // 2. フォトコーナーの写真を準備
    const embeddedPhotos = [];
    for (let i = 0; i < Math.min(4, (data.photos || []).length); i++) {
      const photo = data.photos[i];
      const bytes = dataUrlToBytes(photo.dataUrl);
      const dims = await loadImageSize(photo.dataUrl);
      const isPng = photo.dataUrl.startsWith('data:image/png');
      const ext = isPng ? 'png' : 'jpeg';
      const rId = addMedia(`photo_${i + 1}.${ext}`, bytes);
      embeddedPhotos.push({ rId, width: dims.width, height: dims.height, caption: photo.caption || '' });
    }

    // ---------- 左カラム構築 ----------
    const logoFontRun = `<w:r>
      ${rPr({ sizeHalfPt: 58, bold: true, italic: true, color: '9E1B1E', font: 'Arial' })}
      <w:t xml:space="preserve">${xmlEsc(data.logoText || 'HOME')} </w:t>
    </w:r>`;

    const houseDrawing = houseRId
      ? makeInlineDrawing(houseRId, 555000, 464000, nextDocPrId++, 'HouseIllustration')
      : '';

    const classIssueParagraphXml = `<w:p>
      <w:pPr>
        <w:pBdr>
          <w:bottom w:val="dashed" w:sz="6" w:space="3" w:color="94A3B8"/>
        </w:pBdr>
        <w:spacing w:before="15" w:after="35" w:line="230" w:lineRule="auto"/>
        <w:jc w:val="left"/>
      </w:pPr>
      <w:r>
        ${rPr({ sizeHalfPt: 20, bold: true, color: '0F172A' })}
        <w:t xml:space="preserve">${xmlEsc(data.className || '')} </w:t>
      </w:r>
      <w:r>
        ${rPr({ sizeHalfPt: 17, bold: true, color: 'FFFFFF', fill: '1E3A5F' })}
        <w:t xml:space="preserve"> 第${xmlEsc(data.issueNumber || '〇')}号 </w:t>
      </w:r>
    </w:p>`;

    // CT_TblPrBase order: tblW -> jc -> tblBorders -> tblLayout -> tblCellMar
    const headerBoxXml = `<w:tbl>
      <w:tblPr>
        <w:tblW w:w="7720" w:type="dxa"/>
        <w:jc w:val="center"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="12" w:space="0" w:color="1E3A5F"/>
          <w:left w:val="single" w:sz="30" w:space="0" w:color="9E1B1E"/>
          <w:bottom w:val="single" w:sz="12" w:space="0" w:color="1E3A5F"/>
          <w:right w:val="single" w:sz="12" w:space="0" w:color="1E3A5F"/>
          <w:insideH w:val="none"/>
          <w:insideV w:val="single" w:sz="10" w:space="0" w:color="1E3A5F"/>
        </w:tblBorders>
        <w:tblLayout w:type="fixed"/>
        <w:tblCellMar>
          <w:top w:w="65" w:type="dxa"/><w:left w:w="100" w:type="dxa"/>
          <w:bottom w:w="65" w:type="dxa"/><w:right w:w="100" w:type="dxa"/>
        </w:tblCellMar>
      </w:tblPr>
      <w:tblGrid><w:gridCol w:w="4090"/><w:gridCol w:w="3630"/></w:tblGrid>
      <w:tr>
        <w:trPr><w:trHeight w:val="1200" w:hRule="atLeast"/></w:trPr>
        <w:tc>
          <w:tcPr>
            <w:tcW w:w="4090" w:type="dxa"/>
            <w:shd w:val="clear" w:color="auto" w:fill="FCFAF5"/>
            <w:vAlign w:val="center"/>
          </w:tcPr>
          <w:p>
            <w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="center"/></w:pPr>
            ${logoFontRun}
            ${houseDrawing}
          </w:p>
        </w:tc>
        <w:tc>
          <w:tcPr>
            <w:tcW w:w="3630" w:type="dxa"/>
            <w:shd w:val="clear" w:color="auto" w:fill="F4F7FB"/>
            <w:vAlign w:val="center"/>
          </w:tcPr>
          ${makeParagraph(data.schoolName || '', { sizeHalfPt: 17, bold: true, color: '475569', spaceAfter: 15, line: 215 })}
          ${classIssueParagraphXml}
          ${makeParagraph(`発行者 ${data.publisherName || ''}`, { sizeHalfPt: 17, bold: false, color: '334155', spaceAfter: 15, line: 215 })}
          ${makeParagraph(data.issueDateText || '', { sizeHalfPt: 17, bold: true, color: '1E3A5F', spaceAfter: 0, line: 215 })}
        </w:tc>
      </w:tr>
    </w:tbl>`;

    const articleTitleBordersXml = `<w:pBdr>
      <w:top w:val="single" w:sz="4" w:space="4" w:color="D5DFEC"/>
      <w:left w:val="single" w:sz="30" w:space="8" w:color="1E3A5F"/>
      <w:bottom w:val="single" w:sz="12" w:space="5" w:color="1E3A5F"/>
      <w:right w:val="single" w:sz="4" w:space="4" w:color="E2E8F0"/>
    </w:pBdr>`;

    const articleSizeHalfPt = Math.max(16, Math.round(parseFloat(data.articleFontSize || 13.5) * 1.48));
    const leftColumnContent =
      headerBoxXml +
      emptySpacerP(80) +
      makeParagraph(data.articleTitle || 'タイトル', {
        align: 'left',
        sizeHalfPt: 30,
        bold: true,
        color: data.articleTitle ? '0F172A' : '94A3B8',
        pBdrXml: articleTitleBordersXml,
        shdFill: 'F3F7FC',
        indentLeft: 40,
        indentRight: 40,
        spaceBefore: 40,
        spaceAfter: 120,
        line: 270
      }) +
      makeMultilineParagraphs(data.articleBody || '', {
        align: 'left',
        sizeHalfPt: articleSizeHalfPt,
        color: '1A202C',
        spaceBefore: 0,
        spaceAfter: 50,
        line: 290
      });

    // ---------- 右カラム：① フォトコーナー ----------
    let photoInnerXml = emptySpacerP(40);
    if (embeddedPhotos.length === 1) {
      const p = embeddedPhotos[0];
      const fit = fitBoxEmu(p.width, p.height, 4100000, 1420000);
      photoInnerXml = `<w:p><w:pPr><w:spacing w:before="30" w:after="20"/><w:jc w:val="center"/></w:pPr>
        ${makeInlineDrawing(p.rId, fit.cx, fit.cy, nextDocPrId++, 'Photo1')}</w:p>` +
        (p.caption ? makeParagraph(p.caption, { align: 'center', sizeHalfPt: 16, bold: true, color: '334155', spaceAfter: 0, line: 200 }) : '');
    } else if (embeddedPhotos.length === 2 || embeddedPhotos.length === 3) {
      const cols = embeddedPhotos.length;
      const cellW = Math.floor(7500 / cols);
      const maxImgW = cols === 2 ? 2120000 : 1400000;
      const maxImgH = 1360000;
      const gridCols = Array(cols).fill(`<w:gridCol w:w="${cellW}"/>`).join('');
      const cells = embeddedPhotos.map((p, idx) => {
        const fit = fitBoxEmu(p.width, p.height, maxImgW, maxImgH);
        // CT_TcPrBase order: tcW -> tcBorders -> shd -> vAlign
        return `<w:tc>
          <w:tcPr>
            <w:tcW w:w="${cellW}" w:type="dxa"/>
            <w:tcBorders>
              <w:top w:val="single" w:sz="4" w:space="0" w:color="E5DCC8"/>
              <w:left w:val="single" w:sz="4" w:space="0" w:color="E5DCC8"/>
              <w:bottom w:val="single" w:sz="4" w:space="0" w:color="E5DCC8"/>
              <w:right w:val="single" w:sz="4" w:space="0" w:color="E5DCC8"/>
            </w:tcBorders>
            <w:shd w:val="clear" w:color="auto" w:fill="FFFFFF"/>
            <w:vAlign w:val="center"/>
          </w:tcPr>
          <w:p><w:pPr><w:spacing w:before="20" w:after="20"/><w:jc w:val="center"/></w:pPr>
            ${makeInlineDrawing(p.rId, fit.cx, fit.cy, nextDocPrId++, `Photo${idx + 1}`)}</w:p>
          ${p.caption ? makeParagraph(p.caption, { align: 'center', sizeHalfPt: 15, bold: true, color: '334155', spaceAfter: 10, line: 190 }) : ''}
        </w:tc>`;
      }).join('');
      photoInnerXml = `<w:tbl>
        <w:tblPr>
          <w:tblW w:w="${cellW * cols}" w:type="dxa"/>
          <w:jc w:val="center"/>
          <w:tblBorders><w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/><w:insideH w:val="none"/><w:insideV w:val="none"/></w:tblBorders>
          <w:tblLayout w:type="fixed"/>
        </w:tblPr>
        <w:tblGrid>${gridCols}</w:tblGrid>
        <w:tr>${cells}</w:tr>
      </w:tbl>${emptySpacerP(30)}`;
    } else if (embeddedPhotos.length === 4) {
      const cellW = 3750;
      const makeRow = (pair, startIdx) => `<w:tr>${pair.map((p, i) => {
        const fit = fitBoxEmu(p.width, p.height, 1980000, 680000);
        return `<w:tc>
          <w:tcPr>
            <w:tcW w:w="${cellW}" w:type="dxa"/>
            <w:tcBorders>
              <w:top w:val="single" w:sz="4" w:space="0" w:color="E5DCC8"/>
              <w:left w:val="single" w:sz="4" w:space="0" w:color="E5DCC8"/>
              <w:bottom w:val="single" w:sz="4" w:space="0" w:color="E5DCC8"/>
              <w:right w:val="single" w:sz="4" w:space="0" w:color="E5DCC8"/>
            </w:tcBorders>
            <w:shd w:val="clear" w:color="auto" w:fill="FFFFFF"/>
            <w:vAlign w:val="center"/>
          </w:tcPr>
          <w:p><w:pPr><w:spacing w:before="15" w:after="10"/><w:jc w:val="center"/></w:pPr>
            ${makeInlineDrawing(p.rId, fit.cx, fit.cy, nextDocPrId++, `Photo${startIdx + i + 1}`)}</w:p>
          ${p.caption ? makeParagraph(p.caption, { align: 'center', sizeHalfPt: 14, bold: true, color: '334155', spaceAfter: 10, line: 170 }) : ''}
        </w:tc>`;
      }).join('')}</w:tr>`;
      photoInnerXml = `<w:tbl>
        <w:tblPr>
          <w:tblW w:w="7500" w:type="dxa"/>
          <w:jc w:val="center"/>
          <w:tblBorders><w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/><w:insideH w:val="none"/><w:insideV w:val="none"/></w:tblBorders>
          <w:tblLayout w:type="fixed"/>
        </w:tblPr>
        <w:tblGrid><w:gridCol w:w="3750"/><w:gridCol w:w="3750"/></w:tblGrid>
        ${makeRow(embeddedPhotos.slice(0, 2), 0)}
        ${makeRow(embeddedPhotos.slice(2, 4), 2)}
      </w:tbl>${emptySpacerP(30)}`;
    }

    const photoCornerBoxXml = `<w:tbl>
      <w:tblPr>
        <w:tblW w:w="7900" w:type="dxa"/>
        <w:jc w:val="center"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="12" w:space="0" w:color="C98A18"/>
          <w:left w:val="single" w:sz="12" w:space="0" w:color="C98A18"/>
          <w:bottom w:val="single" w:sz="12" w:space="0" w:color="C98A18"/>
          <w:right w:val="single" w:sz="12" w:space="0" w:color="C98A18"/>
          <w:insideH w:val="single" w:sz="10" w:space="0" w:color="C98A18"/>
          <w:insideV w:val="none"/>
        </w:tblBorders>
        <w:tblLayout w:type="fixed"/>
        <w:tblCellMar>
          <w:top w:w="50" w:type="dxa"/><w:left w:w="100" w:type="dxa"/>
          <w:bottom w:w="50" w:type="dxa"/><w:right w:w="100" w:type="dxa"/>
        </w:tblCellMar>
      </w:tblPr>
      <w:tblGrid><w:gridCol w:w="7900"/></w:tblGrid>
      <w:tr>
        <w:trPr><w:trHeight w:val="380" w:hRule="atLeast"/></w:trPr>
        <w:tc>
          <w:tcPr>
            <w:tcW w:w="7900" w:type="dxa"/>
            <w:shd w:val="clear" w:color="auto" w:fill="FDE99C"/>
            <w:vAlign w:val="center"/>
          </w:tcPr>
          ${makeParagraph(`◆ ${data.photoCornerTitle || 'フォトコーナー'} ◆`, { align: 'center', sizeHalfPt: 20, bold: true, color: '78350F', spaceAfter: 0, line: 220 })}
        </w:tc>
      </w:tr>
      <w:tr>
        <w:trPr><w:trHeight w:val="2670" w:hRule="atLeast"/></w:trPr>
        <w:tc>
          <w:tcPr>
            <w:tcW w:w="7900" w:type="dxa"/>
            <w:shd w:val="clear" w:color="auto" w:fill="FFFDF7"/>
            <w:vAlign w:val="top"/>
          </w:tcPr>
          ${photoInnerXml}
        </w:tc>
      </w:tr>
    </w:tbl>`;

    // ---------- 右カラム：② ★保護者の皆様へ★ ----------
    const parentsSizeHalfPt = Math.max(15, Math.round(parseFloat(data.parentsFontSize || 12) * 1.48));
    const parentsBoxXml = `<w:tbl>
      <w:tblPr>
        <w:tblW w:w="7900" w:type="dxa"/>
        <w:jc w:val="center"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="12" w:space="0" w:color="276749"/>
          <w:left w:val="single" w:sz="12" w:space="0" w:color="276749"/>
          <w:bottom w:val="single" w:sz="12" w:space="0" w:color="276749"/>
          <w:right w:val="single" w:sz="12" w:space="0" w:color="276749"/>
          <w:insideH w:val="single" w:sz="12" w:space="0" w:color="1E4E38"/>
          <w:insideV w:val="none"/>
        </w:tblBorders>
        <w:tblLayout w:type="fixed"/>
        <w:tblCellMar>
          <w:top w:w="50" w:type="dxa"/><w:left w:w="140" w:type="dxa"/>
          <w:bottom w:w="50" w:type="dxa"/><w:right w:w="140" w:type="dxa"/>
        </w:tblCellMar>
      </w:tblPr>
      <w:tblGrid><w:gridCol w:w="7900"/></w:tblGrid>
      <w:tr>
        <w:trPr><w:trHeight w:val="380" w:hRule="atLeast"/></w:trPr>
        <w:tc>
          <w:tcPr>
            <w:tcW w:w="7900" w:type="dxa"/>
            <w:shd w:val="clear" w:color="auto" w:fill="276749"/>
            <w:vAlign w:val="center"/>
          </w:tcPr>
          ${makeParagraph('★保護者の皆様へ★', { align: 'center', sizeHalfPt: 20, bold: true, color: 'FFFFFF', spaceAfter: 0, line: 220 })}
        </w:tc>
      </w:tr>
      <w:tr>
        <w:trPr><w:trHeight w:val="2620" w:hRule="atLeast"/></w:trPr>
        <w:tc>
          <w:tcPr>
            <w:tcW w:w="7900" w:type="dxa"/>
            <w:shd w:val="clear" w:color="auto" w:fill="F6FBF8"/>
            <w:tcMar>
              <w:top w:w="100" w:type="dxa"/><w:left w:w="150" w:type="dxa"/>
              <w:bottom w:w="90" w:type="dxa"/><w:right w:w="150" w:type="dxa"/>
            </w:tcMar>
            <w:vAlign w:val="top"/>
          </w:tcPr>
          ${makeMultilineParagraphs(data.parentsNote || '', { align: 'left', sizeHalfPt: parentsSizeHalfPt, color: '1A202C', spaceAfter: 35, line: 250 })}
        </w:tc>
      </w:tr>
    </w:tbl>`;

    // ---------- 右カラム：③ 来週の予定表 ----------
    // 列幅合計: 380 + 820 + 440*6 + 360*3 + 2980 = 7900
    const colWidths = [380, 820, 440, 440, 440, 440, 440, 440, 360, 360, 360, 2980];
    const colHeaders = ['月', '日', '1', '2', '3', '4', '5', '6', '給', '清', '部', '備考'];

    const scheduleGridXml = colWidths.map((w) => `<w:gridCol w:w="${w}"/>`).join('');

    const apronStr = data.apronText !== undefined
      ? data.apronText
      : ((data.apronGroups || []).slice().sort((a, b) => a - b).join('・'));
    let leftBannerStr = data.scheduleWeekRangeText
      ? `来週の予定（${data.scheduleWeekRangeText}）`
      : (data.scheduleBannerText || '');
    if (!data.scheduleWeekRangeText && apronStr) {
      leftBannerStr = leftBannerStr.replace(/\s*要エプロン持参.*$/, '');
    }

    const bannerParagraphXml = `<w:p>
      <w:pPr>
        <w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>
        <w:jc w:val="left"/>
      </w:pPr>
      <w:r>
        ${rPr({ sizeHalfPt: 17, bold: true, color: 'FFFFFF' })}
        <w:t xml:space="preserve">${xmlEsc(leftBannerStr)}</w:t>
      </w:r>
      ${apronStr ? `<w:r>${rPr({ sizeHalfPt: 16, bold: true, color: 'FFFFFF' })}<w:t xml:space="preserve">　 </w:t></w:r><w:r>${rPr({ sizeHalfPt: 16, bold: true, color: '78350F', fill: 'FEF3C7' })}<w:t xml:space="preserve"> 要エプロン持参 ${xmlEsc(apronStr)}班 </w:t></w:r>` : ''}
    </w:p>`;

    const bannerRowXml = `<w:tr>
      <w:trPr><w:trHeight w:val="360" w:hRule="atLeast"/></w:trPr>
      <w:tc>
        <w:tcPr>
          <w:tcW w:w="7900" w:type="dxa"/>
          <w:gridSpan w:val="12"/>
          <w:tcBorders>
            <w:top w:val="single" w:sz="14" w:space="0" w:color="1E3A5F"/>
            <w:left w:val="single" w:sz="14" w:space="0" w:color="1E3A5F"/>
            <w:bottom w:val="single" w:sz="10" w:space="0" w:color="1E3A5F"/>
            <w:right w:val="single" w:sz="14" w:space="0" w:color="1E3A5F"/>
          </w:tcBorders>
          <w:shd w:val="clear" w:color="auto" w:fill="1E3A5F"/>
          <w:vAlign w:val="center"/>
        </w:tcPr>
        ${bannerParagraphXml}
      </w:tc>
    </w:tr>`;

    const majorRightCols = new Set([1, 7, 10]); // 日(1)・6限(7)・部(10)の右罫線を太めに
    const headerRowXml = `<w:tr>
      <w:trPr><w:trHeight w:val="320" w:hRule="atLeast"/></w:trPr>
      ${colHeaders.map((h, i) => `<w:tc>
        <w:tcPr>
          <w:tcW w:w="${colWidths[i]}" w:type="dxa"/>
          <w:tcBorders>
            <w:top w:val="single" w:sz="10" w:space="0" w:color="1E3A5F"/>
            <w:left w:val="single" w:sz="6" w:space="0" w:color="7C8BA1"/>
            <w:bottom w:val="single" w:sz="10" w:space="0" w:color="1E3A5F"/>
            <w:right w:val="single" w:sz="${majorRightCols.has(i) ? 10 : 6}" w:space="0" w:color="${majorRightCols.has(i) ? '334155' : '7C8BA1'}"/>
          </w:tcBorders>
          <w:shd w:val="clear" w:color="auto" w:fill="E8EEF6"/>
          <w:vAlign w:val="center"/>
        </w:tcPr>
        ${makeParagraph(h, { align: 'center', sizeHalfPt: 17, bold: true, color: '1E3A5F', spaceAfter: 0, line: 230 })}
      </w:tc>`).join('')}
    </w:tr>`;

    const weekDates = data.weekDates || [];
    const monthSpans = data.monthSpans || [5, 0, 0, 0, 0];

    const majorRightBorderXml = `<w:tcBorders><w:right w:val="single" w:sz="10" w:space="0" w:color="334155"/></w:tcBorders>`;

    const dayRowsXml = (data.scheduleRows || data.schedule || []).map((row, idx) => {
      const span = monthSpans[idx];
      const monthMergeXml = span > 0 ? '<w:vMerge w:val="restart"/>' : '<w:vMerge/>';
      const monthText = span > 0 ? (weekDates[idx]?.month || '') : '';

      const monthCell = `<w:tc>
        <w:tcPr>
          <w:tcW w:w="${colWidths[0]}" w:type="dxa"/>
          ${monthMergeXml}
          <w:shd w:val="clear" w:color="auto" w:fill="EEF3F9"/>
          <w:vAlign w:val="center"/>
        </w:tcPr>
        ${makeParagraph(monthText, { align: 'center', sizeHalfPt: 17, bold: true, color: '1E3A5F', spaceAfter: 0, line: 230 })}
      </w:tc>`;

      const dayCell = `<w:tc>
        <w:tcPr>
          <w:tcW w:w="${colWidths[1]}" w:type="dxa"/>
          ${majorRightBorderXml}
          <w:shd w:val="clear" w:color="auto" w:fill="F6F8FB"/>
          <w:vAlign w:val="center"/>
        </w:tcPr>
        ${makeParagraph(weekDates[idx]?.dayLabel || '', { align: 'center', sizeHalfPt: 16, bold: true, color: '1E293B', spaceAfter: 0, line: 230 })}
      </w:tc>`;

      const makeFlagCells = () => ['lunch', 'clean', 'club'].map((key, fIdx) => {
        const val = row[key] || '';
        const isOff = val === '×';
        return `<w:tc>
          <w:tcPr>
            <w:tcW w:w="${colWidths[8 + fIdx]}" w:type="dxa"/>
            ${fIdx === 2 ? majorRightBorderXml : ''}
            <w:vAlign w:val="center"/>
          </w:tcPr>
          ${makeParagraph(val, { align: 'center', sizeHalfPt: 17, bold: true, color: isOff ? '991B1B' : '1E293B', spaceAfter: 0, line: 230 })}
        </w:tc>`;
      }).join('');

      const noteText = row.noteText !== undefined ? row.noteText : (row.note || '');
      const noteCell = `<w:tc>
        <w:tcPr><w:tcW w:w="${colWidths[11]}" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr>
        ${makeMultilineParagraphs(noteText, { align: 'left', sizeHalfPt: 15, color: '1E293B', spaceAfter: 0, line: 230 })}
      </w:tc>`;

      if (row.kind === 'holiday') {
        const spanWidth = colWidths.slice(2, 11).reduce((a, b) => a + Number(b), 0);
        const spanCell = `<w:tc>
          <w:tcPr>
            <w:tcW w:w="${spanWidth}" w:type="dxa"/>
            <w:gridSpan w:val="9"/>
            ${majorRightBorderXml}
            <w:shd w:val="clear" w:color="auto" w:fill="FEF2F2"/>
            <w:vAlign w:val="center"/>
          </w:tcPr>
          ${makeParagraph(row.spanText || '休み', { align: 'center', sizeHalfPt: 17, bold: true, color: '991B1B', spaceAfter: 0, line: 230 })}
        </w:tc>`;
        return `<w:tr>
          <w:trPr><w:trHeight w:val="640" w:hRule="atLeast"/></w:trPr>
          ${monthCell}${dayCell}${spanCell}${noteCell}
        </w:tr>`;
      }

      if (row.kind === 'event') {
        const spanWidth = colWidths.slice(2, 8).reduce((a, b) => a + Number(b), 0);
        const spanCell = `<w:tc>
          <w:tcPr>
            <w:tcW w:w="${spanWidth}" w:type="dxa"/>
            <w:gridSpan w:val="6"/>
            ${majorRightBorderXml}
            <w:shd w:val="clear" w:color="auto" w:fill="EFF6FF"/>
            <w:vAlign w:val="center"/>
          </w:tcPr>
          ${makeParagraph(row.spanText || '行事', { align: 'center', sizeHalfPt: 17, bold: true, color: '1E3A5F', spaceAfter: 0, line: 230 })}
        </w:tc>`;
        return `<w:tr>
          <w:trPr><w:trHeight w:val="640" w:hRule="atLeast"/></w:trPr>
          ${monthCell}${dayCell}${spanCell}${makeFlagCells()}${noteCell}
        </w:tr>`;
      }

      const periodCells = row.periods.map((subj, pIdx) => {
        const lines = formatPeriodLines(subj);
        const runs = lines.map((ln, lIdx) =>
          `${lIdx > 0 ? '<w:br/>' : ''}<w:t xml:space="preserve">${xmlEsc(ln)}</w:t>`
        ).join('');
        return `<w:tc>
          <w:tcPr>
            <w:tcW w:w="${colWidths[2 + pIdx]}" w:type="dxa"/>
            ${pIdx === 5 ? majorRightBorderXml : ''}
            <w:vAlign w:val="center"/>
          </w:tcPr>
          <w:p>
            <w:pPr><w:spacing w:before="0" w:after="0" w:line="230" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>
            <w:r>${rPr({ sizeHalfPt: 15, color: '1E293B' })}${runs}</w:r>
          </w:p>
        </w:tc>`;
      }).join('');

      return `<w:tr>
        <w:trPr><w:trHeight w:val="640" w:hRule="atLeast"/></w:trPr>
        ${monthCell}${dayCell}${periodCells}${makeFlagCells()}${noteCell}
      </w:tr>`;
    }).join('');

    const scheduleTableXml = `<w:tbl>
      <w:tblPr>
        <w:tblW w:w="7900" w:type="dxa"/>
        <w:jc w:val="center"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="14" w:space="0" w:color="1E3A5F"/>
          <w:left w:val="single" w:sz="14" w:space="0" w:color="1E3A5F"/>
          <w:bottom w:val="single" w:sz="14" w:space="0" w:color="1E3A5F"/>
          <w:right w:val="single" w:sz="14" w:space="0" w:color="1E3A5F"/>
          <w:insideH w:val="single" w:sz="6" w:space="0" w:color="7C8BA1"/>
          <w:insideV w:val="single" w:sz="6" w:space="0" w:color="7C8BA1"/>
        </w:tblBorders>
        <w:tblLayout w:type="fixed"/>
        <w:tblCellMar>
          <w:top w:w="34" w:type="dxa"/><w:left w:w="32" w:type="dxa"/>
          <w:bottom w:w="34" w:type="dxa"/><w:right w:w="32" w:type="dxa"/>
        </w:tblCellMar>
      </w:tblPr>
      <w:tblGrid>${scheduleGridXml}</w:tblGrid>
      ${bannerRowXml}
      ${headerRowXml}
      ${dayRowsXml}
    </w:tbl>`;

    const rightColumnContent =
      photoCornerBoxXml +
      emptySpacerP(80) +
      parentsBoxXml +
      emptySpacerP(80) +
      scheduleTableXml +
      emptySpacerP(30); // OOXML必須: セル末尾は<w:p>で閉じる

    // ---------- 外枠2カラムテーブル ----------
    const mainTableXml = `<w:tbl>
      <w:tblPr>
        <w:tblW w:w="16158" w:type="dxa"/>
        <w:jc w:val="center"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="28" w:space="0" w:color="1E3A5F"/>
          <w:left w:val="single" w:sz="12" w:space="0" w:color="1E3A5F"/>
          <w:bottom w:val="single" w:sz="12" w:space="0" w:color="1E3A5F"/>
          <w:right w:val="single" w:sz="12" w:space="0" w:color="1E3A5F"/>
          <w:insideH w:val="none"/>
          <w:insideV w:val="single" w:sz="8" w:space="0" w:color="64748B"/>
        </w:tblBorders>
        <w:tblLayout w:type="fixed"/>
        <w:tblCellMar>
          <w:top w:w="110" w:type="dxa"/><w:left w:w="120" w:type="dxa"/>
          <w:bottom w:w="80" w:type="dxa"/><w:right w:w="120" w:type="dxa"/>
        </w:tblCellMar>
      </w:tblPr>
      <w:tblGrid><w:gridCol w:w="7998"/><w:gridCol w:w="8160"/></w:tblGrid>
      <w:tr>
        <w:trPr><w:trHeight w:val="10400" w:hRule="atLeast"/></w:trPr>
        <w:tc>
          <w:tcPr><w:tcW w:w="7998" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr>
          ${leftColumnContent}
        </w:tc>
        <w:tc>
          <w:tcPr><w:tcW w:w="8160" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr>
          ${rightColumnContent}
        </w:tc>
      </w:tr>
    </w:tbl>`;

    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    ${mainTableXml}
    ${emptySpacerP(20)}
    <w:sectPr>
      <w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>
      <w:pgMar w:top="340" w:right="340" w:bottom="340" w:left="340" w:header="0" w:footer="0" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

    const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

    const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

    const documentRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${rels.map((r) => `<Relationship Id="${r.id}" Type="${r.type}" Target="${r.target}"/>`).join('\n  ')}
</Relationships>`;

    const zipEntries = [
      { name: '[Content_Types].xml', data: contentTypesXml },
      { name: '_rels/.rels', data: rootRelsXml },
      { name: 'word/_rels/document.xml.rels', data: documentRelsXml },
      { name: 'word/document.xml', data: documentXml },
      ...mediaEntries
    ];

    return createZipBlob(
      zipEntries,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
  }

  return { buildDocxBlob };
})();
