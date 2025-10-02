(() => {
  const d = document;
  const box = d.getElementById('box');
  const bar = d.getElementById('proposal');
  const actions = d.getElementById('proposal-actions');
  const msg = bar.querySelector('.proposal__msg');
  //const languageSelect = d.getElementById('language');
  const overlay = document.getElementById('overlay');
  const copyBtn = d.getElementById('copy-btn');
  const clearBtn = d.getElementById('clear-btn');
  const toast = d.getElementById('copy-toast');

  const trigger = document.querySelector(".custom-select__trigger");
  const options = document.querySelector(".custom-options");
  const hiddenInput = document.getElementById("language");

  let lastActive = null;
   const learnBtn = document.getElementById('learn-toggle');
    const panel = document.getElementById('learn-panel');
    if (!learnBtn || !panel) return;

  let composing = false;
  let pendingRule = null, pendingStart = null, pendingLen = null, pendingCaret = null;
  let rules = [];
  let UI = { title:'', subtitle:'', example:'', proposition:'', yes:'', no:'' };
  const SUB = {'0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉'};
  const SUP = {'0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','+':'⁺','-':'⁻'};

  const LANG_FILES = { fr: 'rules-fr.json', ko: 'rules-ko.json', en: 'rules-en.json' };


  // ------------ 언어 로딩 ------------
  async function loadLanguage(lang) {
    const file = LANG_FILES[lang] || LANG_FILES.en;
    try {
      const res = await fetch(file, { cache: 'no-store' });
      if (!res.ok) {
        const text = await res.text();
        console.error('[rules] fetch 실패:', res.status, res.statusText, text.slice(0,200));
        return;
      }
      const data = await res.json();

      // UI 주입
      if (data['ui-text']) applyUI(data['ui-text']);

      // 규칙 정규화
      rules = normalizeRules(data);
      // console.log('[rules] loaded:', file, rules);
    } catch (e) {
      console.error('[rules] 예외:', e);
    }
  }

  function updateOptions(selectedValue) {
    // 모든 li를 다시 보이게
    options.querySelectorAll("li").forEach(li => {
      li.hidden = false;
    });

    // 현재 선택된 값(li)을 숨김
    if (selectedValue) {
      const current = options.querySelector(`li[data-value="${selectedValue}"]`);
      if (current) current.hidden = true;
    }
  }

  // 초기화: trigger의 data-value에 맞게 반영
  updateOptions(hiddenInput.value || trigger.dataset.value);

  // --------- select -----------------
   trigger.addEventListener("click", () => {
    const expanded = trigger.getAttribute("aria-expanded") === "true";
    trigger.setAttribute("aria-expanded", !expanded);
    options.hidden = expanded;
  });

  options.addEventListener("click", (e) => {
    if (e.target.tagName === "LI") {
      trigger.textContent = e.target.textContent + " ▾";
      //hiddenInput.value = e.target.dataset.value;
      const lang = e.target.dataset.value;
      hiddenInput.value = lang;

      options.hidden = true;
      trigger.setAttribute("aria-expanded", "false");

      loadLanguage(lang);  

      updateOptions(lang);
    }
  });

  function applyUI(ui) {
    UI = {
      ...UI,
      title: ui.title ?? UI.title,
      subtitle: ui.subtitle ?? UI.subtitle,
      langChoice: ui.langChoice ?? UI.langChoice,
      example: ui.example ?? UI.example,
      proposition: ui.proposition ?? UI.proposition,
      yes: ui.yes ?? UI.yes,
      no: ui.no ?? UI.no,
      choicePrompt: ui.choicePrompt ?? UI.choicePrompt,
      replacePrompt: ui.replacePrompt ?? UI.replacePrompt,
      copy: ui.copy ?? UI.copy,
      success: ui.success ?? UI.success,
      clear: ui.clear ?? UI.clear,
      learnMore: ui["learn-more"] ?? UI.learnMore,
      hint: ui.hint ?? UI.hint,
      hintList: Array.isArray(ui["hint-list"]) ? ui["hint-list"] : UI.hintList
    };

    if (UI.title) document.title = UI.title;

    const titleEl = d.querySelector('.title');
    const subEl   = d.querySelector('.sub');
    const langChoice = d.querySelector('.langChoice');
    const ta      = d.getElementById('box');
    const copyBtnEl  = d.getElementById('copy-btn');
    const clearBtnEl = d.getElementById('clear-btn');

    const learnBtn = d.getElementById('learn-toggle');
    const hintEl   = d.querySelector('.learn-hint');
    const listEl   = d.querySelector('.learn-list');

    if (titleEl) titleEl.innerHTML = UI.title || '';
    //if (subEl)   subEl.innerHTML   = UI.subtitle || '';
    if (langChoice)   langChoice.innerHTML   = UI.langChoice || '';
    if (copyBtnEl && UI.copy) copyBtnEl.textContent = UI.copy;
    if (clearBtnEl && UI.clear) clearBtnEl.textContent = UI.clear;
    
    if (learnBtn) learnBtn.textContent = UI.learnMore || 'Learn more';
    if (hintEl) hintEl.textContent = UI.hint || '';
    if (listEl) {
      listEl.innerHTML = '';
      (UI.hintList || []).forEach(item => {
        const li = d.createElement('li');
        li.textContent = item;
        listEl.appendChild(li);
      });
    }

    // 🔹 example을 textarea placeholder로 적용
    if (ta && UI.subtitle) {
      ta.placeholder = UI.subtitle;
    }
  }

  function normalizeRules(data) {
    const out = [];

     // 0) espacement → NNBSP 규칙 생성
    if (Array.isArray(data.espacement)) {
      const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      data.espacement.forEach(group => {
        const isBefore = group.template === 'espace_fine_before';
        const isAfter  = group.template === 'espace_fine_after';
        if (!isBefore && !isAfter) return;

        //const groupMsg = group.message || '';                // 🔹 추가
        (group.chars || []).forEach(ch => {
          const pattern = esc(ch);
          out.push({
            type: 'replace',
            id: `${group.id}-${ch}`,
            match: [pattern],
            replace: null,
            replaceTemplate: isBefore ? '\u202F$&' : '$&\u202F',
            message: group.message ?? '',                                // 🔹 기존 '' → 그룹 메시지
            nnBefore: isBefore,
            nnAfter:  isAfter,
            compiled: [new RegExp(pattern + '$')]
          });
        });
      });
    }

    // 1) replacement → 예/아니오 규칙
    if (Array.isArray(data.replacement)) {
      data.replacement.forEach((r, i) => {
        const match = Array.isArray(r.match) ? r.match : (r.match ? [r.match] : []);
        const usesBackref = typeof r.replace === 'string' && /\$\d+/.test(r.replace);
        
        out.push({
          type: 'replace',
          id: r.id ?? `rep-${i}`,
          match,
          replace: usesBackref ? null : (r.replace ?? null),
          replaceTemplate: usesBackref ? r.replace : (r.replaceTemplate ?? null),
          message: r.message ?? '',
          transform: r.transform ?? null,
          compiled: match.map(m => new RegExp(m + '$'))
        });
      });
    }

    // 2) choices → 다중 선택 규칙
    if (Array.isArray(data.choices)) {
      data.choices.forEach((r, i) => {
        const match = Array.isArray(r.match) ? r.match : (r.match ? [r.match] : []);
        out.push({
          type: 'choice',
          id: r.id ?? `ch-${i}`,
          match,
          displayMatch: r.displayMatch ?? '',
          choices: Array.isArray(r.choices) ? r.choices : [],
          message: r.message ?? '', // 있으면 사용
          compiled: match.map(m => new RegExp(m + '$'))
        });
      });
    }

    return out;
  }

  function toSubDigits(s){ return s.replace(/\d/g, d => SUB[d] || d); }
  function toSup(digits = '', sign = '') {
    const supDigits = digits.replace(/\d/g, d => SUP[d] || d);
    const supSign   = sign ? (SUP[sign] || sign) : '';
    return supDigits + supSign; // "²", "²⁻", "⁻" 등
  }

  // ------------ 입력 처리 ------------
  box.addEventListener('compositionstart', () => composing = true);
  box.addEventListener('compositionend',   () => { composing = false; onInput(); });
  box.addEventListener('input', onInput);

  function onInput() {
    if (composing || box.disabled) return;
    if (!rules.length) return;

    const val = box.value;
    const caret = box.selectionStart;
    const tail = val.slice(0, caret);

    for (const r of rules) {
      for (let i = 0; i < r.compiled.length; i++) {
        const re = r.compiled[i];
        const m  = tail.match(re);
        if (!m) continue;

        // 🔸 NNBSP 중복 방지
        if (r.nnBefore) {
          const prev = val.charAt(caret - m[0].length - 1);
          if (prev === '\u202F' || prev === '\u00A0') continue; // 이미 얇은/일반 NBSP 있음
        }
        if (r.nnAfter) {
          const next = val.charAt(caret); // 매치 직후 문자
          if (next === '\u202F' || next === '\u00A0') continue;
        }

        // 치환 범위(기본: 매치 전체)
        const start = caret - m[0].length;
        const len   = m[0].length;

        pendingRule  = r;
        pendingStart = start;
        pendingLen   = len;
        pendingCaret = caret;

        showBar(r);
        disableInput();
        return; // 첫 매칭만 처리
      }
    }
  }

  // ------------ 제안/버튼 렌더 ------------
  function showBar(rule) {
  const head = UI.proposition || UI.proposition;
  const body = rule.message || (
    rule.type === 'choice' ? (UI.choicePrompt || '아래에서 하나를 선택하세요')
                           : (UI.replacePrompt || '이 구간을 바꿀까요?')
  );
  msg.innerHTML = `<strong>${head}</strong> ${body}`;

  renderActions(rule);

  // ✨ 모달 열기
  lastActive = document.activeElement;
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');

  bar.classList.add('open');
  bar.setAttribute('aria-hidden', 'false');

  // 스크롤 잠금
  document.body.style.overflow = 'hidden';

  const firstBtn = actions.querySelector('button');
  firstBtn && firstBtn.focus();
}

function hideBar() {
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');

  bar.classList.remove('open');
  bar.setAttribute('aria-hidden', 'true');

  // 스크롤 복귀
  document.body.style.overflow = '';

  // 포커스 원복
  if (lastActive && lastActive.focus) {
    lastActive.focus();
  }
}

  function renderActions(rule) {
    actions.innerHTML = '';

    if (rule.type === 'choice') {
      rule.choices.forEach(c => {
        const b = d.createElement('button');
        b.type = 'button';
        b.className = 'btn yes';
        b.textContent = c.label;
        b.addEventListener('click', () => applyReplaceString(c.replace));
        actions.appendChild(b);
      });
    } else {
      const yes = d.createElement('button');
      yes.type = 'button';
      yes.className = 'btn yes';
      yes.textContent = UI.yes;
      yes.addEventListener('click', () => applyReplaceRule(rule));

      const no = d.createElement('button');
      no.type = 'button';
      no.className = 'btn no';
      no.textContent = UI.no;
      no.addEventListener('click', cancelProposal);

      actions.appendChild(yes);
      actions.appendChild(no);
    }
  }

  // ------------ 치환 적용 ------------
  function applyReplaceRule(rule) {
    if (pendingRule == null || pendingStart == null) { cancelProposal(); return; }

    const val = box.value;
    let newVal;
    let newCaret;

    if (rule.transform === 'digitsToSub') {
      const seg = val.slice(pendingStart, pendingStart + pendingLen);
      const replaced = seg.replace(/(\d+)$/, (_, nums) => toSubDigits(nums));
      box.value = val.slice(0, pendingStart) + replaced + val.slice(pendingStart + pendingLen);
      finishAndFocus(pendingCaret ?? (pendingStart + replaced.length));
      return;
    }

    if (rule.transform === 'chargeToSuper') {
      const seg = val.slice(0, pendingCaret);
      const newTail = seg.replace(/\^?(\d+)?([+\-])$/, (_, d, s) => toSup(d, s));
      box.value = newTail + val.slice(pendingCaret);
      finishAndFocus(newTail.length);
      return;
    }

    if (rule.transform === 'digitsToSuper') {
      const seg = val.slice(pendingStart, pendingStart + pendingLen);
      const replaced = seg.replace(/^\^(\d+)/, (_, nums) => toSup(nums));
      box.value = val.slice(0, pendingStart) + replaced + val.slice(pendingStart + pendingLen);
      finishAndFocus(pendingStart + replaced.length);
      return;
    }

    if (rule.replaceTemplate) {
      // 템플릿 치환: tail의 끝 매치를 템플릿으로 교체
      const tail = val.slice(0, pendingCaret);
      const union = rule.match.length === 1 ? rule.match[0] : '(?:' + rule.match.join('|') + ')';
      const re = new RegExp(union + '$');
      const replacedTail = tail.replace(re, rule.replaceTemplate);
      const delta = replacedTail.length - tail.length; 
      newVal = replacedTail + val.slice(pendingCaret);
      newCaret = pendingCaret + delta;   
    } else {
      // 전체 치환: 매치 구간만 replace로 치환
      const before = val.slice(0, pendingStart);
      const after  = val.slice(pendingStart + pendingLen);
      newVal = before + (rule.replace ?? '') + after;
      const delta = (rule.replace ?? '').length - pendingLen;
      newCaret = (pendingCaret ?? (pendingStart + pendingLen)) + delta;
    }

    box.value = newVal;
    //const newCaret = calcCaretAfter(rule, pendingCaret, pendingLen);
    finishAndFocus(newCaret);
  }

  function applyReplaceString(replaceStr) {
    if (pendingRule == null || pendingStart == null) { cancelProposal(); return; }

    const val = box.value;
    const before = val.slice(0, pendingStart);
    const after  = val.slice(pendingStart + pendingLen);
    box.value = before + replaceStr + after;

    const delta = replaceStr.length - pendingLen;
    const newCaret = (pendingCaret ?? (pendingStart + pendingLen)) + delta;
    finishAndFocus(newCaret);
  }

  function calcCaretAfter(rule, caret, matchedLen) {
    if (rule.replaceTemplate) {
      // 템플릿 치환은 길이 예측이 어려우므로 현재 위치 유지 시도
      return caret;
    } else {
      const delta = (rule.replace ?? '').length - matchedLen;
      return (caret ?? 0) + delta;
    }
  }

  function finishAndFocus(caretPos) {
    enableInput();
    hideBar();
    box.focus();
    const pos = Math.max(0, Math.min(caretPos, box.value.length));
    box.setSelectionRange(pos, pos);
    clearPending();
  }

  // ------------ 공통 유틸 ------------
  function cancelProposal() {
    enableInput();
    hideBar();
    box.focus();
    const c = pendingCaret ?? box.value.length;
    box.setSelectionRange(c, c);
    clearPending();
  }

  function disableInput() { box.disabled = true; }
  function enableInput()  { box.disabled = false; }

  function clearPending() {
    pendingRule = null; pendingStart = null; pendingLen = null; pendingCaret = null;
  }

  // 오버레이 클릭 시 취소
  overlay.addEventListener('click', cancelProposal);

  // Esc로 닫기 (네가 이미 keydown 핸들링 하고 있으면 그대로 동작)
  document.addEventListener('keydown', e => {
  if (!bar.classList.contains('open')) return;
  if (e.key === 'Escape') { e.preventDefault(); cancelProposal(); }
  if (e.key === 'Enter')  {
    e.preventDefault();
    const firstBtn = actions.querySelector('button');
    firstBtn && firstBtn.click();
  }
});
  // 초기 로드 & 언어 변경
  //loadLanguage(languageSelect.value || 'ko');
  // languageSelect.addEventListener('change', () => loadLanguage(languageSelect.value || 'ko'));
  loadLanguage(hiddenInput.value || 'en');

//클립보드에 복사 버튼
function showCopied() {
  if (!toast || !UI.success) return;
  toast.textContent = UI.success;
  toast.hidden = false;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
    toast.hidden = true;
  }, 1200);
}

//learn-more 토글버튼
 learnBtn.addEventListener('click', () => {
    const open = learnBtn.getAttribute('aria-expanded') === 'true';
    learnBtn.setAttribute('aria-expanded', String(!open));
    panel.hidden = open;
    panel.classList.toggle('open', !open);
  });

copyBtn.addEventListener('click', async () => {
  const text = box.value;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const selStart = box.selectionStart, selEnd = box.selectionEnd;
      box.select();
      document.execCommand('copy');
      box.setSelectionRange(selStart, selEnd);
    }
    if (text.trim()) showCopied();
  } catch (e) {
    console.error('copy failed:', e);
  }
});

clearBtn.addEventListener('click', () => {
  // 제안 모달이 열려있다면 닫고
  //if (bar.classList.contains('open')) cancelProposal();

  // 내용 삭제 + 상태 리셋
  box.value = '';
  clearPending();           // pendingRule 등 초기화 (네가 이미 만든 함수)
  enableInput();            // 혹시 disable 되어 있으면
  box.focus();
  box.setSelectionRange(0, 0);
});

document.addEventListener("click", (e) => {
    if (!e.target.closest(".custom-select")) {
      options.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
    }
  });

})();
