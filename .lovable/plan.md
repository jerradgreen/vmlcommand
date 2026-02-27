

## Making Your App Private After Publishing

Right now your app has no authentication — anyone with the URL can see your financial data. To lock it down so only you can access it, we need to add a simple login gate.

### Approach: Password-Protected Login

Since you're the only user, the simplest approach is a single login page that requires your email and password. Every page in the app will redirect to login if you're not authenticated.

### Implementation Steps

**Step 1 — Enable authentication and create your account**
- Configure the auth system with email/password sign-in
- You'll create your account once, then use it to log in going forward

**Step 2 — Create a Login page**
- Simple email + password form at `/login`
- No signup form (you don't want anyone else creating accounts)
- Include a "forgot password" flow just in case

**Step 3 — Add an auth guard wrapper**
- Wrap all existing routes in a component that checks for an active session
- If not logged in → redirect to `/login`
- If logged in → show the app normally

**Step 4 — Add a logout button**
- Small logout button in the app layout (sidebar or header)

### Files modified
- `src/pages/Login.tsx` — new login page
- `src/pages/ResetPassword.tsx` — new password reset page
- `src/components/AuthGuard.tsx` — new auth wrapper component
- `src/App.tsx` — wrap routes with auth guard, add `/login` route
- `src/components/AppLayout.tsx` — add logout button

### What this means for publishing
Once this is implemented, anyone who visits your published URL will see a login screen. Only you (with your email and password) can get past it. Your financial data stays private.

