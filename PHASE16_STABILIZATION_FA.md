# مرحله ۱۶ — پایدارسازی انتشار ۱.۵.۵

## تغییرات
- اصلاح نسخه‌های GitHub Actions به نسخه‌های پایدار v4 برای checkout، setup-node، setup-java و upload-artifact.
- افزودن حداقل مجوز `contents: read` به workflow.
- بررسی صریح وجود `sdkmanager` و توقف با پیام روشن در صورت نبود آن.
- افزایش نسخه برنامه به ۱.۵.۵ و Android versionCode به ۱۷.
- شناسه برنامه `com.anbarian.app` حفظ شده است.
- منطق مجوز/لایسنس (`src/modules/license.ts`) عمداً تغییر داده نشده است.

## اجرای ساخت
Workflow با Push به شاخه main/master یا اجرای دستی از Actions شروع می‌شود.
خروجی Debug APK برای تست است و نباید به‌عنوان نسخه به‌روزرسانی مشتری توزیع شود.
ساخت Release APK فقط در صورت تنظیم هر چهار Secret امضای انتشار انجام می‌شود: `ANBARIN_KEYSTORE_BASE64`, `ANBARIN_KEYSTORE_PASSWORD`, `ANBARIN_KEY_ALIAS`, `ANBARIN_KEY_PASSWORD`.

## محدودیت راستی‌آزمایی
اجرای واقعی GitHub Actions، ساخت APK و تست روی دستگاه در این محیط انجام نشده؛ نتیجه باید در تب Actions گیت‌هاب بررسی شود.
