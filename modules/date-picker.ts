/** تقویم شمسی یکپارچه — پنل شناور روی body تا در فاکتور و برگه‌ها حتماً دیده شود. */

const normalize = (value: string) =>
  value
    .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

const MONTH_NAMES = ['', 'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
const WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

export function todayJalali(): string {
  const parts = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find(x => x.type === 'year')?.value || '1400';
  const m = parts.find(x => x.type === 'month')?.value || '01';
  const d = parts.find(x => x.type === 'day')?.value || '01';
  return `${y}/${m}/${d}`;
}

export function persianParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  return {
    year: Number(parts.find(x => x.type === 'year')?.value),
    month: Number(parts.find(x => x.type === 'month')?.value),
    day: Number(parts.find(x => x.type === 'day')?.value),
  };
}

function parseJalali(value: string): { y: number; m: number; d: number } | null {
  const match = normalize(value).match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!match) return null;
  const y = Number(match[1]), m = Number(match[2]), d = Number(match[3]);
  if (y < 1200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

function formatJalali(y: number, m: number, d: number): string {
  return `${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`;
}

function findJalaliYearStart(year: number): Date | null {
  const probe = new Date(year + 621, 2, 15, 12, 0, 0);
  for (let i = 0; i < 25; i++) {
    const d = new Date(probe);
    d.setDate(probe.getDate() + i);
    const p = persianParts(d);
    if (p.year === year && p.month === 1 && p.day === 1) return d;
  }
  // fallback سال قبل/بعد تقریبی
  for (let yOff = 620; yOff <= 623; yOff++) {
    for (let day = 18; day <= 24; day++) {
      const candidate = new Date(year + yOff - 1, 2, day, 12, 0, 0);
      const p = persianParts(candidate);
      if (p.year === year && p.month === 1 && p.day === 1) return candidate;
    }
  }
  return null;
}

function daysOfJalaliMonth(year: number, month: number): Date[] {
  const yearStart = findJalaliYearStart(year);
  if (!yearStart) return [];
  const monthOffset = month <= 6 ? (month - 1) * 31 : 186 + (month - 7) * 30;
  const first = new Date(yearStart);
  first.setDate(first.getDate() + monthOffset);
  let start = first;
  const fp = persianParts(first);
  if (fp.year !== year || fp.month !== month || fp.day !== 1) {
    let found: Date | null = null;
    for (let i = -5; i <= 8; i++) {
      const t = new Date(first);
      t.setDate(first.getDate() + i);
      const p = persianParts(t);
      if (p.year === year && p.month === month && p.day === 1) { found = t; break; }
    }
    if (!found) return [];
    start = found;
  }
  const days: Date[] = [];
  for (let i = 0; i < 32; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    const p = persianParts(day);
    if (p.year !== year || p.month !== month) break;
    days.push(day);
  }
  return days;
}

/** پنل واحد سراسری روی body */
let globalPanel: HTMLDivElement | null = null;
let activeInput: HTMLInputElement | null = null;
let viewYear = 1400;
let viewMonth = 1;
let docCloseBound = false;

function ensureGlobalPanel(): HTMLDivElement {
  if (globalPanel && document.body.contains(globalPanel)) return globalPanel;
  globalPanel = document.createElement('div');
  globalPanel.id = 'anbarinJalaliCalendarPanel';
  globalPanel.className = 'invoice-jalali-calendar anbarin-jalali-floating';
  globalPanel.hidden = true;
  globalPanel.style.cssText = [
    'position:fixed',
    'z-index:11000',
    'display:none',
    'min-width:280px',
    'max-width:320px',
    'padding:12px',
    'border:1px solid var(--border-color,#cbd5e1)',
    'border-radius:12px',
    'background:var(--card-bg,var(--surface,#fff))',
    'box-shadow:0 12px 36px rgba(0,0,0,.22)',
    'color:inherit',
  ].join(';');
  document.body.appendChild(globalPanel);
  return globalPanel;
}

function hidePanel(): void {
  const panel = ensureGlobalPanel();
  panel.hidden = true;
  panel.style.display = 'none';
  activeInput = null;
}

function positionPanel(anchor: HTMLElement): void {
  const panel = ensureGlobalPanel();
  panel.style.display = 'block';
  panel.hidden = false;
  // موقتاً برای اندازه‌گیری
  panel.style.left = '0px';
  panel.style.top = '0px';
  const rect = anchor.getBoundingClientRect();
  const pw = panel.offsetWidth || 300;
  const ph = panel.offsetHeight || 280;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = rect.right - pw; // راست‌چین زیر فیلد
  if (left < 8) left = 8;
  if (left + pw > vw - 8) left = Math.max(8, vw - pw - 8);
  let top = rect.bottom + 6;
  if (top + ph > vh - 8) top = Math.max(8, rect.top - ph - 6);
  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(top)}px`;
}

function renderGlobalPanel(): void {
  const panel = ensureGlobalPanel();
  if (!activeInput) return;
  const days = daysOfJalaliMonth(viewYear, viewMonth);
  if (!days.length) {
    panel.innerHTML = `<div class="jalali-cal-head"><b>تقویم</b></div><p style="padding:8px;margin:0">نمایش این ماه ممکن نیست.</p>`;
    positionPanel(activeInput);
    return;
  }
  const first = days[0];
  const offset = (first.getDay() + 1) % 7;
  panel.innerHTML =
    `<div class="jalali-cal-head" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:8px">` +
    `<button type="button" data-cal-prev aria-label="ماه قبل" style="border:1px solid var(--border-color,#ddd);background:var(--card-bg,#fff);border-radius:8px;padding:6px 10px;cursor:pointer;color:inherit">‹</button>` +
    `<b style="font-size:14px">${MONTH_NAMES[viewMonth]} ${viewYear}</b>` +
    `<button type="button" data-cal-next aria-label="ماه بعد" style="border:1px solid var(--border-color,#ddd);background:var(--card-bg,#fff);border-radius:8px;padding:6px 10px;cursor:pointer;color:inherit">›</button>` +
    `</div>` +
    `<div class="jalali-cal-grid" style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;text-align:center">` +
    WEEKDAYS.map(n => `<span class="weekday" style="font-weight:700;padding:4px 0;font-size:12px">${n}</span>`).join('') +
    Array.from({ length: offset }, () => '<span></span>').join('') +
    days.map(day => {
      const p = persianParts(day);
      const val = formatJalali(p.year, p.month, p.day);
      return `<button type="button" data-jdate="${val}" style="border:1px solid var(--border-color,#ddd);background:var(--card-bg,#fff);border-radius:8px;padding:8px 4px;cursor:pointer;color:inherit;font-variant-numeric:tabular-nums">${p.day}</button>`;
    }).join('') +
    `</div>`;

  panel.querySelector('[data-cal-prev]')?.addEventListener('click', ev => {
    ev.preventDefault();
    ev.stopPropagation();
    viewMonth--;
    if (viewMonth < 1) { viewMonth = 12; viewYear--; }
    renderGlobalPanel();
  });
  panel.querySelector('[data-cal-next]')?.addEventListener('click', ev => {
    ev.preventDefault();
    ev.stopPropagation();
    viewMonth++;
    if (viewMonth > 12) { viewMonth = 1; viewYear++; }
    renderGlobalPanel();
  });
  panel.querySelectorAll<HTMLButtonElement>('[data-jdate]').forEach(btn => {
    btn.addEventListener('click', ev => {
      ev.preventDefault();
      ev.stopPropagation();
      if (!activeInput) return;
      activeInput.value = btn.dataset.jdate || '';
      activeInput.dispatchEvent(new Event('input', { bubbles: true }));
      activeInput.dispatchEvent(new Event('change', { bubbles: true }));
      hidePanel();
    });
  });

  positionPanel(activeInput);
}

function openForInput(input: HTMLInputElement, anchor?: HTMLElement): void {
  const parsed = parseJalali(input.value) || parseJalali(todayJalali());
  viewYear = parsed?.y || 1400;
  viewMonth = parsed?.m || 1;
  activeInput = input;
  renderGlobalPanel();
  positionPanel(anchor || input);
}

export function attachJalaliCalendar(
  input: HTMLInputElement,
  button?: HTMLButtonElement | null,
  _panel?: HTMLElement | null,
): void {
  if (!input) return;

  let btn =
    button ||
    input.parentElement?.querySelector<HTMLButtonElement>('.jalali-cal-btn, #invoiceJalaliCalendar, [data-jalali-cal-btn]') ||
    null;

  // اگر دکمه نبود، بساز
  if (!btn) {
    const wrap = document.createElement('div');
    wrap.className = 'invoice-jalali-date';
    wrap.style.display = 'flex';
    wrap.style.gap = '6px';
    wrap.style.alignItems = 'center';
    input.parentNode?.insertBefore(wrap, input);
    wrap.appendChild(input);
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-secondary jalali-cal-btn';
    btn.setAttribute('aria-label', 'تقویم شمسی');
    btn.title = 'تقویم شمسی';
    btn.textContent = '▦';
    wrap.appendChild(btn);
  }

  // همیشه لیسنر تازه (حتی بعد از انتقال DOM)
  if (btn.dataset.calBound === '1' && (btn as any).__anbarinCalHandler) {
    btn.removeEventListener('click', (btn as any).__anbarinCalHandler);
  }

  const handler = (ev: Event) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (activeInput === input && globalPanel && !globalPanel.hidden && globalPanel.style.display !== 'none') {
      hidePanel();
      return;
    }
    openForInput(input, btn || input);
  };
  (btn as any).__anbarinCalHandler = handler;
  btn.addEventListener('click', handler);
  btn.dataset.calBound = '1';
  input.dataset.calendarEnhanced = 'true';
  input.setAttribute('inputmode', 'numeric');
  input.setAttribute('autocomplete', 'off');

  if (!(input as any).__anbarinCalBlur) {
    const onBlur = () => {
      const p = parseJalali(input.value);
      if (p) input.value = formatJalali(p.y, p.m, p.d);
    };
    (input as any).__anbarinCalBlur = onBlur;
    input.addEventListener('blur', onBlur);
  }
}

function isDateField(input: HTMLInputElement): boolean {
  if (input.type === 'date' || input.type === 'datetime-local' || input.type === 'month' || input.type === 'time') return false;
  if (input.disabled || input.readOnly || input.hidden) return false;
  const id = (input.id || '').toLowerCase();
  const name = (input.name || '').toLowerCase();
  const placeholder = input.placeholder || '';
  const label = input.closest('label')?.textContent || '';
  return (
    input.id === 'invoiceDate' ||
    input.id === 'jeDate' ||
    input.id === 'fyStart' ||
    input.id === 'fyEnd' ||
    input.id === 'arFrom' ||
    input.id === 'arTo' ||
    input.id === 'opDate' ||
    /(^|[-_])(date|from|to|start|end|due|expiry|issued|period)([-_]|$)/i.test(id) ||
    /(^|[-_])(date|from|to|start|end|due)([-_]|$)/i.test(name) ||
    /۱۴۰\d\s*\/|\d{4}\s*\/\d{2}\s*\/\d{2}|yyyy\s*\/\s*mm\s*\/\s*dd|140\d\s*\//i.test(placeholder) ||
    /تاریخ/.test(label)
  );
}

function enhance(input: HTMLInputElement): void {
  if (!isDateField(input)) return;
  attachJalaliCalendar(input);
}

export function enhanceDateFields(root: ParentNode = document): void {
  root.querySelectorAll<HTMLInputElement>('input').forEach(enhance);
}

export function initUnifiedDatePickers(): void {
  enhanceDateFields(document);

  if (!docCloseBound) {
    docCloseBound = true;
    document.addEventListener(
      'pointerdown',
      ev => {
        const t = ev.target as HTMLElement;
        if (!globalPanel || globalPanel.hidden || globalPanel.style.display === 'none') return;
        if (globalPanel.contains(t)) return;
        if (t.closest('.jalali-cal-btn') || t.id === 'invoiceJalaliCalendar' || t.closest('#invoiceJalaliCalendar')) return;
        if (t.closest('.invoice-jalali-date')) return;
        hidePanel();
      },
      true,
    );
    window.addEventListener('resize', () => {
      if (activeInput && globalPanel && !globalPanel.hidden) positionPanel(activeInput);
    });
    window.addEventListener('scroll', () => {
      if (activeInput && globalPanel && !globalPanel.hidden) positionPanel(activeInput);
    }, true);
  }

  const observer = new MutationObserver(records => {
    for (const record of records) {
      for (const node of [...record.addedNodes]) {
        if (!(node instanceof HTMLElement)) continue;
        if (node instanceof HTMLInputElement) enhance(node);
        else enhanceDateFields(node);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
