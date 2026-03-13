# Email Notifications Setup

When users receive in-app notifications (task assignments, mentions, interest approvals, etc.), they can also receive email copies.

## 1. Deploy the Edge Function

```bash
supabase functions deploy send-notification-email
```

## 2. Set Secrets

In **Supabase Dashboard** → **Project Settings** → **Edge Functions** → **Secrets**, add:

| Secret        | Description                          |
|---------------|--------------------------------------|
| `RESEND_API_KEY` | Your [Resend](https://resend.com) API key |
| `APP_URL`     | Your app URL (e.g. `https://intraflow.example.com`) for "View details" links |

**Note:** Without `RESEND_API_KEY`, the function will skip sending emails (no-op). The app continues to work with in-app notifications only.

## 3. Create Database Webhook

In **Supabase Dashboard** → **Database** → **Webhooks** → **Create a new webhook**:

- **Name:** `send-notification-email`
- **Table:** `notifications`
- **Events:** `Insert`
- **Type:** `Supabase Edge Function`
- **Function:** `send-notification-email`

The webhook will automatically pass the new notification row to the function.

## 4. Resend Setup (Production)

1. Sign up at [resend.com](https://resend.com)
2. Verify your domain for production emails
3. Update the `from` field in `supabase/functions/send-notification-email/index.ts`:
   ```ts
   from: "IntraFlow <notifications@yourdomain.com>",
   ```

The default `onboarding@resend.dev` works for testing but has sending limits.
