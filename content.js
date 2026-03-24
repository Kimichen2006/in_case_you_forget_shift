// ============================================================
// 注音亂碼修復器 - content.js
// 依賴：lib/dict.js（由 build_dict.py 生成）
// 快捷鍵：選取亂碼文字 → Alt+Space → 點選候選字
// ============================================================

(function () {
  'use strict';

  // ── 1. 注音鍵盤對照表 ──────────────────────────────────────
  const KEY_MAP = {
    '1':'ㄅ', 'q':'ㄆ', 'a':'ㄇ', 'z':'ㄈ',
    '2':'ㄉ', 'w':'ㄊ', 's':'ㄋ', 'x':'ㄌ',
    'e':'ㄍ', 'd':'ㄎ', 'c':'ㄏ',
    'r':'ㄐ', 'f':'ㄑ', 'v':'ㄒ',
    '5':'ㄓ', 't':'ㄔ', 'g':'ㄕ', 'b':'ㄖ',
    'y':'ㄗ', 'h':'ㄘ', 'n':'ㄙ',
    'u':'ㄧ', 'j':'ㄨ', 'm':'ㄩ',
    '8':'ㄚ', 'i':'ㄛ', 'k':'ㄜ', ',':'ㄝ',
    '9':'ㄞ', 'o':'ㄟ', 'l':'ㄠ', '.':'ㄡ',
    '0':'ㄢ', 'p':'ㄣ', ';':'ㄤ', '/':'ㄥ',
    '-':'ㄦ',
  };

  // 聲調鍵：按鍵 → 聲調符號
  const TONE_MAP = {
    ' ': '',   // 一聲（陰平，不標）
    '6': 'ˊ', // 二聲（陽平）
    '3': 'ˇ', // 三聲（上聲）
    '4': 'ˋ', // 四聲（去聲）
    '7': '˙', // 輕聲
  };

  const TONE_KEYS = new Set(Object.keys(TONE_MAP));

  // ── 2. 亂碼 → 注音音節序列 ────────────────────────────────
  function parseRawInput(raw) {
    const syllables = [];
    let current = '';
    const chars = raw.toLowerCase().split('');

    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];

      if (ch === '2') {
        // 歧義鍵：ㄉ 或 二聲
        const nextCh = chars[i + 1];
        const nextIsBopomofo = nextCh && KEY_MAP[nextCh] && !TONE_KEYS.has(nextCh);
        if (current && !nextIsBopomofo) {
          syllables.push({ bopomofo: current, tone: 'ˊ' });
          current = '';
        } else {
          current += 'ㄉ';
        }
      } else if (TONE_KEYS.has(ch)) {
        if (current) {
          syllables.push({ bopomofo: current, tone: TONE_MAP[ch] });
          current = '';
        }
      } else if (KEY_MAP[ch]) {
        current += KEY_MAP[ch];
      }
    }

    if (current) {
      syllables.push({ bopomofo: current, tone: '' });
    }

    return syllables;
  }

  // ── 3. 查字典，組合候選詞 ──────────────────────────────────
  function lookupCandidates(syllables) {
    if (!syllables.length) return [];

    const perSyllable = syllables.map(({ bopomofo, tone }) => {
      const withTone    = BOPOMOFO_DICT[bopomofo + tone]    || [];
      const withoutTone = tone ? (BOPOMOFO_DICT[bopomofo] || []) : [];
      return [...new Set([...withTone, ...withoutTone])].slice(0, 5);
    });

    const results = [];
    function combine(idx, current) {
      if (results.length >= 8) return;
      if (idx === perSyllable.length) {
        if (current) results.push(current);
        return;
      }
      const cands = perSyllable[idx];
      if (!cands.length) { combine(idx + 1, current + '?'); return; }
      for (const c of cands) {
        combine(idx + 1, current + c);
        if (results.length >= 8) return;
      }
    }
    combine(0, '');
    return [...new Set(results)];
  }

  // ── 4. 取得選取文字及位置 ──────────────────────────────────
  let savedInputEl = null, savedInputStart = 0, savedInputEnd = 0, savedRange = null;

  function getSelectedText() {
    const active = document.activeElement;
    const tag = active && active.tagName;

    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      const start = active.selectionStart;
      const end   = active.selectionEnd;
      const text  = active.value.slice(start, end);
      if (!text) return null;
      savedInputEl = active; savedInputStart = start; savedInputEnd = end; savedRange = null;
      const rect = active.getBoundingClientRect();
      return { text, x: rect.left + 16, y: rect.top + rect.height + 6 };
    }

    const sel = window.getSelection();
    if (!sel || !sel.toString().trim()) return null;
    const text  = sel.toString();
    const range = sel.getRangeAt(0);
    const rect  = range.getBoundingClientRect();
    savedRange = range.cloneRange(); savedInputEl = null;
    return { text, x: rect.left, y: rect.bottom + 6 };
  }

  // ── 5. 替換選取文字 ────────────────────────────────────────
  function replaceWith(text) {
    if (savedInputEl) {
      const el = savedInputEl;
      el.value = el.value.slice(0, savedInputStart) + text + el.value.slice(savedInputEnd);
      el.selectionStart = el.selectionEnd = savedInputStart + text.length;
      el.focus();
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (savedRange) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRange);
      try { document.execCommand('insertText', false, text); }
      catch (_) { savedRange.deleteContents(); savedRange.insertNode(document.createTextNode(text)); }
    }
    savedRange = null; savedInputEl = null;
  }

  // ── 6. 彈窗 ────────────────────────────────────────────────
  let popupEl = null;

  function createPopup() {
    if (popupEl) return;
    popupEl = document.createElement('div');
    popupEl.id = 'bpmf-popup';
    popupEl.innerHTML = `
      <div class="bpmf-header">
        <span class="bpmf-label">注音轉換</span>
        <button class="bpmf-close">✕</button>
      </div>
      <div class="bpmf-raw"></div>
      <div class="bpmf-candidates"></div>
      <div class="bpmf-hint">點選候選字，或按數字鍵 1–8 選擇</div>
    `;
    document.body.appendChild(popupEl);
    popupEl.querySelector('.bpmf-close').addEventListener('click', hidePopup);
    document.addEventListener('mousedown', (e) => {
      if (popupEl?.style.display !== 'none' && !popupEl.contains(e.target)) hidePopup();
    }, true);
  }

  function showPopup(x, y, rawText, candidates) {
    createPopup();
    popupEl.querySelector('.bpmf-raw').textContent = rawText;

    const container = popupEl.querySelector('.bpmf-candidates');
    container.innerHTML = '';

    if (!candidates.length) {
      container.innerHTML = '<span class="bpmf-empty">找不到對應的中文字</span>';
    } else {
      candidates.forEach((word, i) => {
        const btn = document.createElement('button');
        btn.className = 'bpmf-candidate';
        btn.dataset.index = i;
        btn.innerHTML = `<sup>${i + 1}</sup>${word}`;
        btn.addEventListener('click', () => { replaceWith(word); hidePopup(); });
        container.appendChild(btn);
      });
    }

    popupEl.style.display = 'block';
    requestAnimationFrame(() => {
      const pw = popupEl.offsetWidth, ph = popupEl.offsetHeight;
      const vw = window.innerWidth,   vh = window.innerHeight;
      const sx = window.scrollX,      sy = window.scrollY;
      let left = x + sx, top = y + sy;
      if (left + pw > vw + sx - 12) left = vw + sx - pw - 12;
      if (left < sx + 8) left = sx + 8;
      if (top + ph > vh + sy - 12) top = (y - ph - 10) + sy;
      popupEl.style.left = left + 'px';
      popupEl.style.top  = top  + 'px';
      popupEl.classList.add('bpmf-visible');
    });
  }

  function hidePopup() {
    if (!popupEl) return;
    popupEl.classList.remove('bpmf-visible');
    setTimeout(() => { if (popupEl) popupEl.style.display = 'none'; }, 150);
  }

  // ── 7. 鍵盤監聽 ────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {

    if (e.altKey && e.code === 'KeyA') {
      e.preventDefault();
      e.stopPropagation();

      const sel = getSelectedText();
      if (!sel) return;

      if (typeof BOPOMOFO_DICT === 'undefined') {
        alert('[注音修復器] 字典尚未載入，請確認 lib/dict.js 已放入插件資料夾');
        return;
      }

      const syllables  = parseRawInput(sel.text);
      if (!syllables.length) return;

      const candidates = lookupCandidates(syllables);
      showPopup(sel.x, sel.y, sel.text, candidates);
      return;
    }

    if (e.key === 'Escape') { hidePopup(); return; }

    if (popupEl && popupEl.style.display !== 'none') {
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 8) {
        const btn = popupEl.querySelector(`.bpmf-candidate[data-index="${num - 1}"]`);
        if (btn) { e.preventDefault(); btn.click(); }
      }
    }

  }, true);

})();