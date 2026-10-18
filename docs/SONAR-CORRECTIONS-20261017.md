# Sonar corrective candidate — 2026-10-17

Evidence: ORBIS-SONAR-HISTORY-READ-20261017-080342.txt. These are the original reported line numbers, before this patch.

Source fixes are prepared. Termux targeted/full certification and a new remote Sonar scan remain required; zero current issues is not claimed. No merge, deploy or live database changes are performed.

| File and original line | Rule | Finding |
| --- | --- | --- |
| `src/profile/CommonAccountProfile.tsx:28` | `typescript:S6551` | 'data.get(key)??''' may use Object's default stringification format ('[object Object]') when stringified. |

Fix: accept string form values only, preserving empty optional fields; regression includes a file-valued control.

Checkpoint: parent main b2b74e02c6c581c34f9eed08e48a79f44b3454f7. Financial gateway access remains a separate blocker.

Next: owner runs guarded patch and exact-source certification, shares its single Downloads report, then approves the reviewed commit/push. A new remote Sonar result is needed before release.
