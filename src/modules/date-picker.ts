/** تقویم شمسی یکپارچه — ظاهر یکسان در فاکتور، اسناد، سال مالی و گزارش‌ها (ارقام لاتین). */
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
  // حوالی ۲۱ مارس میلادی را جستجو می‌کنیم
  for (let day = 18; day <= 24; day++) {
    for (const yOff of [621, 622]) {
      const candidate = new Date(year + yOff - 1, 2, day, 12, 0, 0);
      // year+621 roughly maps; also try year+622-1
      const p = persianParts(candidate);
      if (p.year === year && p.month === 1 && p.day === 1) return candidate;
    }
  }
  // جستجوی گسترده‌تر
  const probe = new Date(year + 621, 2, 15, 12);
  for (let i = 0; i < 20; i++) {
    const d = new Date(probe);
    d.setDate(probe.getDate() + i);
    const p = persianParts(d);
    if (p.year === year && p.month === 1 && p.day === 1) return d;
  }
  return null;
}

function daysOfJalaliMonth(year: number, month: number): Date[] {
  const yearStart = findJalaliYearStart(year);
  if (!yearStart) return [];
  const monthOffset = month <= 6 ? (month - 1) * 31 : 186 + (month - 7) * 30;
  const first = new Date(yearStart);
  first.setDate(first.getDate() + monthOffset);
  const firstParts = persianParts(first);
  // اگر روز اول ماه دقیق نبود، نزدیک‌ترین روز ۱ را پیدا کن
  let start = first;
  if (firstParts.year !== year || firstParts.month !== month || firstParts.day !== 1) {
    let found: Date | null = null;
    for (let i = -3; i <= 5; i++) {
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

function closeAllPanels(except?: HTMLElement): void {
  document.querySelectorAll<HTMLElement>('.invoice-jalali-calendar').forEach(panel => {
    if (panel !== except) panel.hidden = true;
  });
}

function renderPanel(panel: HTMLElement, input: HTMLInputElement, year: number, month: number): void {
  const days = daysOfJalaliMonth(year, month);
  if (!days.length) {
    panel.innerHTML = `<div class="jalali-cal-head"><b>خطا در تقویم</b></div><p class="hint" style="padding:8px">امکان نمایش این ماه نیست.</p>`;
    panel.hidden = false;
    return;
  }
  const first = days[0];
  const offset = (first.getDay() + 1) % 7;
  panel.innerHTML =
    `<div class="jalali-cal-head">` +
    `<button type="button" data-cal-prev aria-label="ماه قبل">‹</button>` +
    `<b>${MONTH_NAMES[month]} ${year}</b>` +
    `<button type="button" data-cal-next aria-label="ماه بعد">›</button>` +
    `</div>` +
    `<div class="jalali-cal-grid">` +
    WEEKDAYS.map(n => `<span class="weekday">${n}</span>`).join('') +
    Array.from({ length: offset }, () => '<span></span>').join('') +
    days.map(day => {
      const p = persianParts(day);
      return `<button type="button" data-jdate="${formatJalali(p.year, p.month, p.day)}">${p.day}</button>`;
    }).join('') +
    `</div>`;
  panel.hidden = false;
  panel.style.display = 'block';
  panel.style.zIndex = '10180';
  panel.style.position = 'absolute';

  panel.querySelector('[data-cal-prev]')?.addEventListener('click', ev => {
    ev.preventDefault();
    ev.stopPropagation();
    let m = month - 1, y = year;
    if (m < 1) { m = 12; y--; }
    renderPanel(panel, input, y, m);
  });
  panel.querySelector('[data-cal-next]')?.addEventListener('click', ev => {
    ev.preventDefault();
    ev.stopPropagation();
    let m = month + 1, y = year;
    if (m > 12) { m = 1; y++; }
    renderPanel(panel, input, y, m);
  });
  panel.querySelectorAll<HTMLButtonElement>('[data-jdate]').forEach(btn => {
    btn.addEventListener('click', ev => {
      ev.preventDefault();
      ev.stopPropagation();
      input.value = btn.dataset.jdate || '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      panel.hidden = true;
      panel.style.display = 'none';
    });
  });
}

function openPanelFor(input: HTMLInputElement, panel: HTMLElement): void {
  const parsed = parseJalali(input.value) || parseJalali(todayJalali());
  const y = parsed?.y || 1400;
  const m = parsed?.m || 1;
  closeAllPanels(panel);
  // اطمینان از والد نسبی
  const host = panel.parentElement;
  if (host && getComputedStyle(host).position === 'static') {
    host.style.position = 'relative';
  }
  renderPanel(panel, input, y, m);
}

/** اتصال دستی تقویم به یک input + دکمه + پنل موجود یا ساخته‌شده */
export function attachJalaliCalendar(input: HTMLInputElement, button?: HTMLButtonElement | null, panel?: HTMLElement | null): void {
  if (!input) return;
  let btn = button || input.parentElement?.querySelector<HTMLButtonElement>('.jalali-cal-btn, #invoiceJalaliCalendar, [data-jalali-cal-btn]') || null;
  let pan = panel
    || input.parentElement?.parentElement?.querySelector<HTMLElement>('.invoice-jalali-calendar')
    || input.parentElement?.querySelector<HTMLElement>('.invoice-jalali-calendar')
    || null;

  if (!btn) {
    // ساخت ساختار
    const wrap = document.createElement('div');
    wrap.className = 'invoice-jalali-date';
    wrap.style.position = 'relative';
    input.parentNode?.insertBefore(wrap, input);
    wrap.appendChild(input);
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-secondary jalali-cal-btn';
    btn.setAttribute('aria-label', 'تقویم شمسی');
    btn.title = 'تقویم شمسی';
    btn.textContent = '▦';
    wrap.appendChild(btn);
    pan = document.createElement('div');
    pan.className = 'invoice-jalali-calendar';
    pan.hidden = true;
    wrap.appendChild(pan);
  } else if (!pan) {
    pan = document.createElement('div');
    pan.className = 'invoice-jalali-calendar';
    pan.hidden = true;
    const host = btn.parentElement || input.parentElement;
    host?.appendChild(pan);
  }

  if (btn.dataset.calBound === '1') return;
  btn.dataset.calBound = '1';
  input.dataset.calendarEnhanced = 'true';
  const panelEl = pan!;
  btn.addEventListener('click', ev => {
    ev.preventDefault();
    ev.stopPropagation();
    if (!panelEl.hidden && panelEl.style.display !== 'none') {
      panelEl.hidden = true;
      panelEl.style.display = 'none';
    } else {
      openPanelFor(input, panelEl);
    }
  });
  input.addEventListener('blur', () => {
    const p = parseJalali(input.value);
    if (p) input.value = formatJalali(p.y, p.m, p.d);
  });
}

function isDateField(input: HTMLInputElement): boolean {
  if (input.dataset.calendarEnhanced === 'true') return false;
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
  document.addEventListener('click', ev => {
    const t = ev.target as HTMLElement;
    if (t.closest('.invoice-jalali-calendar') || t.closest('.invoice-jalali-date') || t.closest('.jalali-cal-btn') || t.id === 'invoiceJalaliCalendar') return;
    closeAllPanels();
  });
  const observer = new MutationObserver(records => {
    for (const record of records) {
      for (const node of [...record.addedNodes]) {
        if (!(node instanceof HTMLElement)) continue;
        if (node instanceof HTMLInputElement) enhance(node);
        enhanceDateFields(node);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
