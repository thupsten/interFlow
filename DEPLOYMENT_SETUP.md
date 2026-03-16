# IntraFlow – Deployment & Email Setup

Complete setup for production deployment and email notifications.

---

## 1. Production URL

Your app: **https://inter-flow.vercel.app**

---

## 2. Email Notifications (Supabase Edge Function)

### Step A: Deploy the Edge Function

1. Go to [Supabase Dashboard](https://supabase.com/dashboard) → your project
2. **Edge Functions** → **Deploy a new function** → **Via Editor**
3. **Name:** `send-notification-email`
4. Replace the default code with the contents of `supabase/functions/send-notification-email/index.ts`
5. Click **Deploy**

### Step B: Add Secrets

1. **Project Settings** (gear) → **Edge Functions** → **Secrets**
2. Click **Add new secret** and add:

| Name | Value |
|------|-------|
| `RESEND_API_KEY` | Your Resend API key from [resend.com](https://resend.com) → API Keys |
| `APP_URL` | `https://inter-flow.vercel.app` |

**Note:** `APP_URL` is used by both `invite-user` and `send-notification-email` functions for correct links in emails.

**CLI alternative** (if Supabase CLI is installed):
```bash
supabase secrets set RESEND_API_KEY=your_resend_key_here
supabase secrets set APP_URL=https://inter-flow.vercel.app
```

### Step C: Create Database Webhook

1. **Database** → **Webhooks** → **Create a new webhook**
2. **Name:** `send-notification-email`
3. **Table:** `notifications`
4. **Events:** Insert
5. **Type:** Supabase Edge Function
6. **Function:** `send-notification-email`
7. Save

---

## 3. Supabase Auth – Site URL (CRITICAL for invite emails)

The invite email was showing `localhost` because Auth URL was misconfigured. Fix it:

1. **Project Settings** → **Authentication** → **URL Configuration**
2. Set **Site URL** to: `https://inter-flow.vercel.app` (replace any localhost value)
3. Under **Redirect URLs**, add:
   - `https://inter-flow.vercel.app/**`
   - `https://inter-flow.vercel.app/accept-invite`
4. Remove `http://localhost:3000` and `http://localhost:4200` if you don't need local dev

---

## 4. Environment (already configured)

Production `src/environments/environment.ts` has:
- `appUrl: 'https://inter-flow.vercel.app'` ✓
- Supabase URL and anon key ✓

---

## 5. Resend API Key Security

**Important:** Regenerate your Resend API key if it was ever committed or shared insecurely.

1. Go to [resend.com](https://resend.com) → **API Keys**
2. Delete the old key and create a new one
3. Update the `RESEND_API_KEY` secret in Supabase (Step B above)

---

## 6. Redeploy invite-user Function

The `invite-user` function was updated to always use the production URL for invite links (never localhost). Redeploy it:

1. **Edge Functions** → open `invite-user`
2. The code now uses `APP_URL` when the client passes localhost
3. Click **Deploy** (or paste the updated code from `supabase/functions/invite-user/index.ts`)

---

## Checklist

- [ ] Supabase Auth **Site URL** = `https://inter-flow.vercel.app` (fixes localhost in invite email)
- [ ] Supabase Auth **Redirect URLs** include `https://inter-flow.vercel.app/**`
- [ ] Edge Function `send-notification-email` deployed
- [ ] Edge Function `invite-user` redeployed (with localhost fix)
- [ ] Secrets `RESEND_API_KEY` and `APP_URL` set in Supabase
- [ ] Database webhook for `notifications` INSERT created

---

## Test

1. **Invite:** Admin invites a user → invite email should link to `https://inter-flow.vercel.app/accept-invite`
2. **Notification:** Assign a task or mention someone → notification email should have “View details” linking to production
