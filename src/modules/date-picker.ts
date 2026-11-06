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

function daysOfJalaliMonth(year: number, month: number): Date[] {
  const yearProbe = new Date(year + 621, 2, 20, 12);
  let yearStart: Date | null = null;
  for (let i = -7; i <= 7; i++) {
    const candidate = new Date(yearProbe);
    candidate.setDate(candidate.getDate() + i);
    const p = persianParts(candidate);
    if (p.year === year && p.month === 1 && p.day === 1) { yearStart = candidate; break; }
  }
  if (!yearStart) return [];
  const monthOffset = month <= 6 ? (month - 1) * 31 : 186 + (month - 7) * 30;
  const first = new Date(yearStart);
  first.setDate(first.getDate() + monthOffset);
  const firstParts = persianParts(first);
  if (firstParts.year !== year || firstParts.month !== month || firstParts.day !== 1) return [];
  const days: Date[] = [];
  for (let i = 0; i < 32; i++) {
    const day = new Date(first);
    day.setDate(day.getDate() + i);
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
  if (!days.length) return;
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
  panel.dataset.calYear = String(year);
  panel.dataset.calMonth = String(month);

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
    });
  });
}

function openPanelFor(input: HTMLInputElement, panel: HTMLElement): void {
  const parsed = parseJalali(input.value) || parseJalali(todayJalali());
  const y = parsed?.y || 1400;
  const m = parsed?.m || 1;
  closeAllPanels(panel);
  renderPanel(panel, input, y, m);
}

function wrapInput(input: HTMLInputElement): void {
  if (input.dataset.calendarEnhanced === 'true') return;
  if (input.type === 'date' || input.type === 'datetime-local' || input.type === 'month' || input.type === 'time') return;
  if (input.disabled || input.readOnly) return;

  // اگر از قبل ساختار فاکتور دارد، فقط رویداد را وصل کن
  const existingBtn = input.parentElement?.querySelector<HTMLButtonElement>('.jalali-cal-btn, #invoiceJalaliCalendar');
  const existingPanel =
    input.parentElement?.parentElement?.querySelector<HTMLElement>('.invoice-jalali-calendar') ||
    input.parentElement?.querySelector<HTMLElement>('.invoice-jalali-calendar') ||
    document.getElementById('invoiceJalaliCalendarPanel');

  if (existingBtn && existingPanel) {
    input.dataset.calendarEnhanced = 'true';
    if (!existingBtn.dataset.calBound) {
      existingBtn.dataset.calBound = '1';
      existingBtn.addEventListener('click', ev => {
        ev.preventDefault();
        ev.stopPropagation();
        if (existingPanel.hidden === false) existingPanel.hidden = true;
        else openPanelFor(input, existingPanel);
      });
    }
    // یکدست‌سازی ارقام
    input.addEventListener('blur', () => {
      const p = parseJalali(input.value);
      if (p) input.value = formatJalali(p.y, p.m, p.d);
    });
    return;
  }

  input.dataset.calendarEnhanced = 'true';
  input.setAttribute('inputmode', 'numeric');
  input.setAttribute('autocomplete', 'off');
  if (!input.placeholder) input.placeholder = '1405/01/01';

  const wrap = document.createElement('div');
  wrap.className = 'invoice-jalali-date';
  input.parentNode?.insertBefore(wrap, input);
  wrap.appendChild(input);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-secondary jalali-cal-btn';
  btn.setAttribute('aria-label', 'تقویم شمسی');
  btn.title = 'تقویم شمسی';
  btn.textContent = '▦';
  wrap.appendChild(btn);

  const panel = document.createElement('div');
  panel.className = 'invoice-jalali-calendar';
  panel.hidden = true;
  wrap.insertAdjacentElement('afterend', panel);

  btn.addEventListener('click', ev => {
    ev.preventDefault();
    ev.stopPropagation();
    if (!panel.hidden) panel.hidden = true;
    else openPanelFor(input, panel);
  });

  input.addEventListener('blur', () => {
    const p = parseJalali(input.value);
    if (p) input.value = formatJalali(p.y, p.m, p.d);
  });
}

function isDateField(input: HTMLInputElement): boolean {
  if (input.dataset.calendarEnhanced === 'true') return false;
  if (input.type === 'date' || input.type === 'datetime-local' || input.type === 'month' || input.type === 'time') return false;
  if (input.disabled || input.readOnly) return false;
  // فیلدهای مخفی یا داخل کانتینر مخفی را هم اگر id تاریخ دارند پوشش می‌دهیم مگر خود input مخفی باشد
  if (input.hidden) return false;
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
  wrapInput(input);
}

export function enhanceDateFields(root: ParentNode = document): void {
  root.querySelectorAll<HTMLInputElement>('input').forEach(enhance);
}

export function initUnifiedDatePickers(): void {
  enhanceDateFields(document);
  document.addEventListener('click', ev => {
    const t = ev.target as HTMLElement;
    if (t.closest('.invoice-jalali-calendar') || t.closest('.invoice-jalali-date') || t.closest('.jalali-cal-btn')) return;
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
