# HudHud Connector Protocol v1

HudHud uses a deterministic connector workflow so connector creation does not depend on high model reasoning.

## Rule set

1. Identify the provider.
2. Prefer a known provider gateway when one exists.
3. Otherwise build a declarative connector recipe from the provider API description.
4. Require HTTPS.
5. Use the provider's official authentication method.
6. Request least-privilege scopes.
7. Never put API keys, access tokens, client secrets, or refresh tokens in browser storage or chat.
8. A recipe is not a live connection. Activation requires secure server-side gateway approval and user authorization.
9. Never execute arbitrary browser-supplied URLs. Server-side gateways must validate and allowlist hosts to prevent SSRF.
10. If required credentials, scopes, approvals, or provider details are missing, ask for the missing item instead of inventing it.

## Connector recipe

- id
- name
- category
- provider_id (optional)
- base_url
- auth
- scopes[]
- actions[]
- health_check
- protocol_version
- status

## Default-model behavior

The model should treat the protocol as a checklist, not as a reasoning challenge. It can select a catalog provider, fill a connector recipe, explain missing authorization, and hand execution to the secure gateway. High reasoning is useful for unusual APIs, but it is not required for normal connector setup.
