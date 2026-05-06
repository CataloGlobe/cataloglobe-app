# Security Advisor — Stato post-hardening

Stato target dopo hardening aprile 2026. Per pattern obbligatori su nuove funzioni SQL e nuove policy, vedi `CLAUDE.md` → Pattern obbligatori.

## Sintesi

Chiusi **81 advisor su 112** (errori → 0, warning → 27, info → 4). I 27 warning residui sono **tutti intenzionali**, NON da fixare.

## Warning residui (intenzionali)

### 18 × `authenticated_security_definer_function_executable`

15 RPC frontend:
- `accept_invite_by_token`, `decline_invite_by_token`
- `change_member_role`, `leave_tenant`, `remove_tenant_member`
- `get_invite_info_by_token`, `get_my_deleted_tenants`, `get_my_pending_invites`
- `get_schedule_featured_contents`
- `get_tenant_members`, `get_tenant_public_info`
- `invite_tenant_member`, `resend_invite`, `revoke_invite`
- `update_tenant_logo`

3 eccezioni RLS-critiche (usate da ~150 policy RLS, non revocabili):
- `get_my_tenant_ids`
- `get_public_tenant_ids`
- `get_user_tenants`

### 7 × `anon_security_definer_function_executable`

5 anon-legittime (flow invito via link email + pagina pubblica):
- `accept_invite_by_token`, `decline_invite_by_token`
- `get_invite_info_by_token`
- `get_schedule_featured_contents`
- `get_tenant_public_info`

2 eccezioni RLS pubbliche:
- `get_public_tenant_ids`
- `get_user_tenants`

### 1 × `extension_in_public` (`pg_net`)

Deferito (alto rischio break Edge Functions / cron, basso beneficio).

### 1 × `auth_leaked_password_protection`

Bloccato su piano Free. Attivare quando passi a Pro (vedi `docs/roadmap.md`).

## Info residui (by-design)

I 4 INFO `rls_enabled_no_policy` sono intenzionali:
- `audit_events`, `otp_challenges`, `stripe_processed_events`, `webhook_errors`

Tabelle accessibili solo via service_role da Edge Functions, deny-all implicito per anon/authenticated.
