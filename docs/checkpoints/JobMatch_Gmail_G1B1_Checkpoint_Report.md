# JobMatch — Gmail G1B.1: raport checkpointu

**Data:** 5 września 2026
**Status:** RUNTIME PASS — READY FOR COMMIT APPROVAL
**Zakres:** lokalny kontrakt bezpieczeństwa, prywatna migracja i typowane DTO; bez zmian zdalnych

## 1. Stan Git na wejściu

- branch: `feat/cv-parser-v2`;
- HEAD po zatwierdzeniu handoffu: `44bad51 docs: prepare Gmail G1B implementation handoff`;
- branch był o jeden commit przed `origin/feat/cv-parser-v2`;
- niezwiązany plik `Wideo — skrót .lnk` pozostawał untracked i nie został zmieniony.

## 2. Zrealizowany zakres

- dodano prywatny schemat `private_gmail`;
- dodano tabele `connections`, `oauth_states` i `import_receipts`;
- odebrano dostęp `public`, `anon` i `authenticated`, pozostawiając dostęp serwerowy;
- włączono i wymuszono RLS jako ochronę dodatkową bez polityk klienckich;
- dodano atomowe, service-role-only zużycie OAuth state;
- rozróżniono receipts `staged` i `committed`;
- dodano konfigurację `verify_jwt` dla siedmiu planowanych funkcji Gmail;
- tylko callback Google ma `verify_jwt = false`;
- dodano typowane DTO bez RAW, tokenów i rzeczywistego Gmail message id;
- publiczny kontrakt korzysta z nieprzezroczystego `messageRef`;
- dodano preset RocketJobs `from:no-reply@rocketjobs.pl`, bez wymaganego filtra tematu;
- dodano AES-256-GCM z 96-bitowym nonce i AAD;
- dodano HMAC-SHA-256, hash state, PKCE S256 i 10-minutowy TTL;
- dodano key ring obsługujący odczyt poprzedniej i zapis aktywną wersją klucza.

## 3. Zmienione pliki

- `supabase/migrations/20260905191208_gmail_private_foundation.sql`;
- `supabase/config.toml`;
- `supabase/functions/_shared/gmail/crypto.ts`;
- `supabase/functions/_shared/gmail/oauthState.ts`;
- testy modułów kryptografii i OAuth state;
- `src/features/gmail/gmailContracts.ts`;
- `src/features/gmail/gmailQueryBuilder.ts`;
- `src/features/gmail/gmailEdgeContracts.ts`;
- testy DTO, konfiguracji funkcji i kontraktu migracji;
- ten raport checkpointu.

## 4. Walidacja

| Kontrola | Wynik |
| --- | --- |
| Testy celowane | PASS — 5 plików, 19 testów |
| Pełne `npm.cmd test` | PASS — 90 plików, 460 testów |
| `npm.cmd run typecheck` | PASS |
| `npm.cmd run build` | PASS |
| `git diff --check` | PASS |
| Statyczny kontrakt migracji i uprawnień | PASS |
| Lokalna aplikacja migracji do Postgresa | PASS — `20260905191208` zastosowana i obecna w lokalnej historii migracji |
| Runtime schema/RLS/ACL/function assertions | PASS — wszystkie 11 asercji katalogowych zwróciło `true` |
| Supabase DB advisors (security) | PASS — no issues found |
| Supabase DB lint (`private_gmail`) | PASS — no schema errors found |
| Migracja zdalna | NOT RUN — poza zakresem i bez zgody |
| Test manualny UI | NOT APPLICABLE — G1B.1 nie dodaje UI |

Build zawiera istniejące ostrzeżenie Vite o chunku większym niż 500 kB. Nie jest ono związane z G1B.1.

## 5. Zdarzenie narzędziowe

Supabase CLI `2.111.0` nie utworzył migracji poleceniem `migration new`, zwracając `LegacyMigrationNewWriteError` dla istniejącego katalogu `supabase/migrations`. Po sprawdzeniu wersji i pomocy CLI plik został utworzony ręcznie w obowiązującym formacie timestampu.

Podczas walidacji runtime instalacja `C:\Program Files\Supabase\supabase.exe` nie mogła uruchomić samej bazy z powodu braku pomocniczego `supabase-go`. Pełny `supabase start` dodatkowo zatrzymał się na deklarowanych w `config.toml` ścieżkach funkcji Gmail, których implementacja należy dopiero do G1B.2. Oficjalny Supabase CLI `2.116.0` uruchomiony przez `npx` poprawnie wykonał `db start`, zastosował lokalne migracje i potwierdził ich historię. `db push --local --dry-run --skip-vault` zwrócił `Local database is up to date`. Nie użyto `db reset`, Vault ani żadnej operacji zdalnej.

## 6. Granice i znane ograniczenia

- migracja została zastosowana i zweryfikowana lokalnie, ale nie została zastosowana zdalnie;
- nie utworzono rzeczywistych Edge Functions;
- nie ustawiono sekretów;
- nie skonfigurowano Google Cloud;
- nie wykonano OAuth ani testu przeglądarkowego;
- `messageRef` zostanie zaszyfrowany/podpisany i rozwiązany wyłącznie po stronie Edge w G1B.2;
- przed przyszłym, osobno zatwierdzonym zdalnym `db push` nadal jest wymagany kontrolowany dry-run wobec dokładnie wskazanego projektu;
- obecne importy `.eml` i linku nie zostały funkcjonalnie zmienione.
- `npm.cmd ci` raportuje 4 istniejące alerty audytu o wysokiej wadze; nie uruchomiono automatycznej naprawy poza zakresem G1B.1.

## 7. Bramka

```text
G1B.1 = RUNTIME PASS — READY FOR COMMIT APPROVAL
G1B.2 = STOP — wymaga osobnej decyzji użytkownika
remote db push = NOT AUTHORIZED
secrets = NOT AUTHORIZED
Edge Function deploy = NOT AUTHORIZED
browser OAuth test = NOT STARTED
```

Proponowany zakres commita: wyłącznie lokalny fundament G1B.1 i ten raport.

Proponowany komunikat:

```text
feat: add secure Gmail connection foundation
```
