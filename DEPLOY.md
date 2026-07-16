# نشر PSAUX Verify API على Render (رابط ثابت ودائم)

المستودع جاهز بالكامل. تبقّى خطوتان فقط تحتاج حسابك الشخصي:

---

## الخطوة 1 — ارفع المشروع على GitHub

1. افتح https://github.com/new
2. اسم المستودع: `psaux-verify-api` — اختر **Public** — لا تضف README/‏.gitignore (المشروع فيه كل شي).
3. اضغط **Create repository**.
4. انسخ رابط المستودع (مثل `https://github.com/USERNAME/psaux-verify-api.git`).
5. في هذي الجلسة اكتب (استبدل الرابط برابطك):

   ```
   !bash /Users/ell/psaux-api/push-to-github.sh https://github.com/USERNAME/psaux-verify-api.git
   ```

   أول مرة بيطلب تسجيل دخول GitHub (يفتح المتصفح أو يطلب توكن) — عادي.

---

## الخطوة 2 — انشر على Render

1. افتح https://render.com → **Get Started** → سجّل بـ **GitHub** (أسهل).
2. **New +** → **Web Service** → اختر مستودع `psaux-verify-api`.
3. Render يقرأ ملف `render.yaml` تلقائياً — كل الإعدادات جاهزة:
   - Build: `npm install`
   - Start: `node server.js`
   - Node 20 — الخطة المجانية.
4. اضغط **Create Web Service** → انتظر أول نشر (~2 دقيقة).
5. بتحصل رابط ثابت مثل:  **`https://psaux-verify-api.onrender.com`**

هذا الرابط **دائم** — نفس الرابط دايماً، يشتغل من أي جهاز، HTTPS جاهز (ما يحتاج أي إعداد ATS/cleartext في التطبيق).

---

## الروابط اللي تحطها في التطبيق (Flutter)

بعد ما يطلع رابط Render (نسمّيه `BASE`)، كل موقع له نقطة استقبال:

| الموقع | الغرض | الـ endpoint |
|--------|-------|--------------|
| PSAUxLONDON | شهادات TASK / الباركود | `POST {BASE}/api/psaux/ingest` |
| Tatawwu | شهادات التطوع | `POST {BASE}/api/tatawwu/ingest` |
| Fitness PSAUx | تسجيل دخول الجيم | `POST {BASE}/api/gym/ingest` |

### طريقة الإرسال من التطبيق
- **إمّا** `multipart/form-data` مع حقل `image` (ملف الصورة) + `from` (اسم/معرّف اختياري).
- **أو** JSON: `{ "image": "<base64>", "from": "user123" }`

### الرد
```json
{ "id": "...", "status": "approved", "reason": "...", "details": { ... } }
```
`status` = `approved` أو `rejected`. التطبيق يقرأه ويضيف النقاط لو approved.

---

## ملاحظة مهمة عن الخطة المجانية
- **بطء أول طلب:** لو الخدمة نامت (بعد ~15 دقيقة خمول) أول طلب ياخذ ~30–50 ثانية يصحى، بعدها سريع. هذا طبيعي في المجاني.
- **التخزين مؤقت:** الصور والسجلات المخزّنة في `data/` تُمسح عند إعادة النشر/التشغيل. هذا ما يأثر على وظيفة التحقق (التطبيق يرسل صورة → يرجع الحكم فوراً)؛ يأثر فقط لو ربطنا لوحات المراجعة تقرأ من الـAPI لاحقاً. لو احتجت تخزين دائم أضيف قاعدة بيانات بسيطة.
