/** Local-device accounts. This is a convenience gate, not server-grade identity/security. */
import type { AppRole } from './authorization';
import { settings, saveSettingsNow, logAudit } from './state';
import { setOperatorName } from './storage';
import { toast } from './ui';
import { applyRoleUI } from './filters-roles';

type LocalUser = { id: string; username: string; name: string; role: AppRole; salt: string; hash: string; disabled: boolean; createdAt: string };
const USERS_KEY = 'anbarin_local_users_v1';
let users: LocalUser[] = [];
let activeUser: LocalUser | null = null;
const enc = new TextEncoder();
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));
function readUsers(): LocalUser[] {
  try { const value = JSON.parse(localStorage.getItem(USERS_KEY) || '[]'); return Array.isArray(value) ? value.filter(u => u && typeof u.username === 'string' && typeof u.hash === 'string') : []; }
  catch { return []; }
}
async function hashPassword(password: string, salt: Uint8Array): Promise<string> {
  if (!crypto?.subtle) throw new Error('مرورگر از رمزنگاری امن پشتیبانی نمی‌کند');
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 180000, hash: 'SHA-256' }, key, 256);
  return b64(new Uint8Array(bits));
}
function persist(): void { localStorage.setItem(USERS_KEY, JSON.stringify(users)); }
function showGate(): void {
  document.getElementById('localAuthGate')?.remove();
  const gate = document.createElement('div'); gate.id = 'localAuthGate'; gate.className = 'local-auth-gate';
  const first = users.length === 0;
  gate.innerHTML = `<form class="local-auth-card" id="localAuthForm"><div class="local-auth-mark">انبارین پرو</div><h2>${first ? 'ساخت مدیر اصلی' : 'ورود به برنامه'}</h2><p>${first ? 'برای شروع، حساب مدیر دستگاه را بسازید.' : 'برای ادامه نام کاربری و رمز عبور را وارد کنید.'}</p>${first ? '<label>نام نمایشی<input name="name" required maxlength="60" autocomplete="name"></label>' : ''}<label>نام کاربری<input name="username" required maxlength="40" autocomplete="username" autocapitalize="none"></label><label>رمز عبور<input name="password" type="password" required minlength="8" autocomplete="current-password"></label>${first ? '<label>تکرار رمز عبور<input name="confirm" type="password" required minlength="8" autocomplete="new-password"></label>' : ''}<p class="local-auth-error" id="localAuthError" role="alert"></p><button class="btn btn-primary btn-block" type="submit">${first ? 'ایجاد حساب مدیر' : 'ورود'}</button><small>حساب‌ها فقط روی همین دستگاه ذخیره می‌شوند؛ حذف داده‌های مرورگر ممکن است آن‌ها را از بین ببرد.</small></form>`;
  document.body.appendChild(gate);
  const form = gate.querySelector('form')!;
  form.addEventListener('submit', async e => {
    e.preventDefault(); const data = new FormData(form); const username = String(data.get('username') || '').trim().toLowerCase(); const password = String(data.get('password') || '');
    const error = gate.querySelector('#localAuthError')!; error.textContent = '';
    try {
      if (first) {
        const name = String(data.get('name') || '').trim();
        if (password !== String(data.get('confirm') || '')) throw new Error('تکرار رمز عبور یکسان نیست.');
        if (!/^[\p{L}\p{N}_.-]{3,40}$/u.test(username)) throw new Error('نام کاربری باید ۳ تا ۴۰ نویسه و بدون فاصله باشد.');
        if (password.length < 8) throw new Error('رمز عبور باید حداقل ۸ نویسه باشد.');
        const salt = crypto.getRandomValues(new Uint8Array(16));
        users = [{ id: crypto.randomUUID(), username, name: name || 'مدیر', role: 'admin', salt: b64(salt), hash: await hashPassword(password, salt), disabled: false, createdAt: new Date().toISOString() }]; persist();
      }
      const user = users.find(u => u.username === username && !u.disabled);
      if (!user || await hashPassword(password, unb64(user.salt)) !== user.hash) throw new Error('نام کاربری یا رمز عبور نادرست است.');
      activate(user);
    } catch (err) { error.textContent = err instanceof Error ? err.message : 'ورود انجام نشد.'; }
  });
}
function activate(user: LocalUser): void {
  activeUser = user; settings.role = user.role; saveSettingsNow(); setOperatorName(user.name);
  const roleSelect = document.getElementById('setRole') as HTMLSelectElement | null; if (roleSelect) { roleSelect.value = user.role; roleSelect.disabled = true; roleSelect.title = 'نقش از حساب کاربری تعیین می‌شود'; } logAudit('ورود کاربر', { username: user.username, role: user.role });
  document.getElementById('localAuthGate')?.remove(); updateAccountBadge(); renderUsers(); applyRoleUI();
}
function updateAccountBadge(): void {
  let button = document.getElementById('localAuthLock') as HTMLButtonElement | null;
  if (!button) { button = document.createElement('button'); button.id = 'localAuthLock'; button.className = 'btn btn-sm btn-secondary local-auth-lock'; document.body.appendChild(button); }
  button.textContent = activeUser ? `🔒 ${activeUser.name} · خروج` : 'قفل برنامه';
  button.onclick = () => { if (!activeUser) return; logAudit('خروج کاربر', { username: activeUser.username }); activeUser = null; showGate(); };
}
export function initLocalAuth(): void {
  users = readUsers(); activeUser = null; showGate(); updateAccountBadge();
  const roleSelect = document.getElementById('setRole') as HTMLSelectElement | null; if (roleSelect) roleSelect.disabled = true;
  const settingsCard = document.querySelector('#roleSettingsPanel');
  if (settingsCard && !document.getElementById('localUsersPanel')) {
    const panel = document.createElement('div'); panel.id = 'localUsersPanel'; panel.className = 'local-users-panel';
    panel.innerHTML = `<h3>حساب‌های محلی دستگاه</h3><p>مدیریت حساب‌ها فقط با حساب مدیر فعال است.</p><div id="localUsersList"></div><button class="btn btn-secondary btn-block" id="localAddUser">＋ افزودن کاربر</button><button class="btn btn-secondary btn-block" id="localChangePassword">تغییر رمز حساب من</button>`;
    settingsCard.parentElement?.appendChild(panel);
    panel.querySelector('#localAddUser')?.addEventListener('click', async () => {
      if (activeUser?.role !== 'admin') return toast('فقط مدیر می‌تواند کاربر بسازد', 'error');
      const username = (prompt('نام کاربری جدید (بدون فاصله):') || '').trim().toLowerCase(); if (!username) return;
      if (!/^[\p{L}\p{N}_.-]{3,40}$/u.test(username) || users.some(u => u.username === username)) return toast('نام کاربری نامعتبر یا تکراری است', 'error');
      const name = (prompt('نام نمایشی:') || '').trim(); const password = prompt('رمز عبور اولیه (حداقل ۸ نویسه):') || ''; const role = (prompt('نقش را وارد کنید: admin / counter / viewer', 'counter') || 'counter') as AppRole;
      if (password.length < 8 || !['admin','counter','viewer'].includes(role)) return toast('رمز یا نقش معتبر نیست', 'error');
      const salt = crypto.getRandomValues(new Uint8Array(16)); users.push({ id: crypto.randomUUID(), username, name: name || username, role, salt: b64(salt), hash: await hashPassword(password, salt), disabled: false, createdAt: new Date().toISOString() }); persist(); renderUsers(); toast('کاربر ساخته شد', 'success');
    });
    panel.querySelector('#localChangePassword')?.addEventListener('click', async () => {
      if (!activeUser) return; const old = prompt('رمز فعلی:') || ''; if (await hashPassword(old, unb64(activeUser.salt)) !== activeUser.hash) return toast('رمز فعلی اشتباه است', 'error');
      const next = prompt('رمز جدید (حداقل ۸ نویسه):') || ''; if (next.length < 8) return toast('رمز جدید کوتاه است', 'error'); const salt = crypto.getRandomValues(new Uint8Array(16)); activeUser.salt = b64(salt); activeUser.hash = await hashPassword(next, salt); persist(); toast('رمز تغییر کرد', 'success');
    });
    renderUsers();
  }
}
function renderUsers(): void {
  const list = document.getElementById('localUsersList'); if (!list) return; list.replaceChildren();
  for (const user of users) { const row = document.createElement('div'); row.className = 'local-user-row'; const label = document.createElement('span'); label.textContent = `${user.name} (${user.username}) · ${user.role}${user.disabled ? ' · غیرفعال' : ''}`; row.append(label);
    if (activeUser?.role === 'admin' && user.id !== activeUser.id) { const toggle = document.createElement('button'); toggle.className = 'btn btn-sm btn-secondary'; toggle.textContent = user.disabled ? 'فعال‌سازی' : 'غیرفعال‌سازی'; toggle.onclick = () => { user.disabled = !user.disabled; persist(); renderUsers(); }; row.append(toggle); }
    list.append(row);
  }
}
