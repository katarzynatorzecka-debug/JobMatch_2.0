# JobMatch — Gmail G1B: handoff implementacyjny

**Wersja:** 1.0  
**Data:** 5 września 2026  
**Status:** PREPARED — implementacja niewykonana  
**Wejście:** G0 `43e9945`, G1A `bf68e6e`  
**Zakres:** rzeczywisty backend Gmail dla prywatnej wersji testowej; bez panelu Gmail w UI

## 1. Cel G1B

G1B ma zastąpić mock Gmaila rzeczywistym, bezpiecznym połączeniem:

```text
Supabase Auth użytkownika
  -> Google OAuth w pełnej przeglądarce
  -> szyfrowany refresh token po stronie Supabase
  -> wyszukiwanie metadanych Gmail
  -> pobranie RAW wyłącznie zaznaczonych wiadomości
  -> parsowanie RAW wewnątrz Edge Function
  -> ImportedReport v2 bez RAW i tokenów w przeglądarce
```

G1B nie dodaje jeszcze kafelka „Wyszukaj na mailu”. Integracja z ekranem importu należy do G2.

## 2. Zatwierdzone ograniczenia

- Gmail v1 jest prywatny/testowy i działa wyłącznie dla kont testowych.
- Zakres OAuth: tylko `https://www.googleapis.com/auth/gmail.readonly`.
- Domyślny zakres wyszukiwania: ostatnie 30 dni.
- Maksymalnie 25 wyników na stronę.
- Maksymalny rozmiar wiadomości po dekodowaniu: 10 MB.
- Maksymalnie 5 równoległych pobrań `messages.get`.
- Domyślny preset RocketJobs wyszukuje `from:no-reply@rocketjobs.pl`; temat wiadomości nie jest wymaganym filtrem.
- Załączniki są ignorowane.
- Gmail RAW, HTML, access token i refresh token nie trafiają do przeglądarki ani logów.
- Import nie uruchamia automatycznie analizy AI.
- Działające importy `.eml` i bezpośredniego linku pozostają bez zmian funkcjonalnych.

## 3. Podział wykonania

### G1B.1 — lokalny kontrakt bezpieczeństwa i migracja

Zakres:

1. dodać migrację prywatnego schematu Gmail;
2. dodać typowane DTO odpowiedzi Edge Functions;
3. zaimplementować kryptografię tokenów, HMAC identyfikatorów i stan OAuth;
4. dodać testy migracji, izolacji użytkowników i kryptografii;
5. nie wykonywać `db push`, nie ustawiać sekretów i nie wdrażać funkcji.

Brama końcowa: przegląd diffu i osobna zgoda użytkownika.

### G1B.2 — Edge Functions z atrapą Google API

Zakres:

1. dodać funkcje OAuth, statusu, wyszukiwania, importu i odłączenia;
2. korzystać z testowego adaptera HTTP Google, bez prawdziwych tokenów;
3. uruchomić testy błędów, limitów, CORS i braku wycieku danych;
4. potwierdzić regresję `.eml`, linku oraz PL/EN;
5. nie wdrażać funkcji i nie otwierać przeglądarki.

Brama końcowa: przegląd diffu i osobna zgoda użytkownika.

### G1B.3 — testowe Google Cloud i wdrożenie Supabase

Zakres wykonywany dopiero po osobnej zgodzie:

1. konfiguracja testowego projektu Google Cloud i kont testowych;
2. ustawienie sekretów Supabase bez ujawniania ich w czacie, logach i Git;
3. kontrolowany `db push --dry-run`, potem migracja;
4. wdrożenie wyłącznie nowych funkcji Gmail;
5. test OAuth i Gmail API w pełnej przeglądarce;
6. test odłączenia oraz wygaśnięcia/odwołania tokenu.

Test przeglądarkowy jest twardą bramą. Zgodnie z decyzją użytkownika praca ma się przed nim zatrzymać, aby można było przełączyć model na wariant obsługujący wbudowaną przeglądarkę Codex.

## 4. Model danych

Utworzyć prywatny schemat `private_gmail`. Nie dodawać go do exposed schemas Supabase Data API. Odebrać domyślne uprawnienia `public`, `anon` i `authenticated`; dostęp otrzymuje wyłącznie `service_role` oraz ściśle wskazane funkcje wewnętrzne.

### `private_gmail.connections`

| Pole | Kontrakt |
| --- | --- |
| `id` | UUID, primary key |
| `user_id` | UUID, FK do `auth.users`, unique, cascade delete |
| `account_email_hmac` | HMAC z adresu zwróconego przez Gmail profile; bez jawnego adresu |
| `masked_email` | opcjonalna wartość prezentacyjna, np. `k***@gmail.com` |
| `refresh_token_ciphertext` | zaszyfrowany token |
| `refresh_token_nonce` | losowy nonce 96-bit |
| `key_version` | wersja klucza szyfrowania |
| `granted_scopes` | tablica przyznanych zakresów |
| `status` | `active`, `reauth_required`, `revoked` |
| `created_at`, `updated_at`, `last_used_at`, `revoked_at` | znaczniki czasu |

Jedno aktywne połączenie na użytkownika w v1. `user_id` jest tożsamością właściciela; nie należy rozszerzać zakresów OAuth tylko po to, aby pozyskać Google `sub`.

### `private_gmail.oauth_states`

| Pole | Kontrakt |
| --- | --- |
| `id` | UUID, primary key |
| `user_id` | UUID, FK do `auth.users`, cascade delete |
| `state_hash` | SHA-256/HMAC wartości `state`, unique |
| `pkce_verifier_ciphertext`, `pkce_nonce`, `key_version` | zaszyfrowany verifier PKCE |
| `return_target` | kod z zamkniętego zbioru, bez dowolnego URL |
| `expires_at` | maksymalnie 10 minut |
| `used_at`, `created_at` | jednokrotne użycie i audyt |

Zużycie `state` musi być atomowe: poprawny rekord, ten sam flow, niewygasły i `used_at is null`; operacja od razu ustawia `used_at`.

### `private_gmail.import_receipts`

| Pole | Kontrakt |
| --- | --- |
| `id` | UUID, primary key |
| `user_id`, `connection_id` | właściciel i połączenie |
| `message_hmac` | HMAC Gmail message id; bez jawnego id |
| `status` | `staged` albo `committed` |
| `import_session_id` | nullable FK do `public.import_sessions` |
| `staged_at`, `committed_at` | znaczniki czasu |

Unikalność: `(user_id, connection_id, message_hmac)`.

`alreadyImported=true` oznacza wyłącznie `committed`. Samo pobranie lub dodanie do koszyka ustawia `staged`, więc usunięcie raportu przed właściwym importem nie tworzy fałszywego komunikatu „już zaimportowano”. Potwierdzenie `committed` następuje dopiero po sukcesie istniejącego `workspace_import_report`.

## 5. Edge Functions

| Funkcja | JWT | Odpowiedzialność |
| --- | --- | --- |
| `gmail-oauth-start` | wymagany | tworzy state + PKCE i zwraca Google authorization URL |
| `gmail-oauth-callback` | brak JWT | waliduje i zużywa state, wymienia code, zapisuje szyfrowany token, zwraca 303 |
| `gmail-connection-status` | wymagany | zwraca wyłącznie status i zamaskowane konto |
| `gmail-search` | wymagany | `messages.list`, następnie metadata maksymalnie po 5 równolegle |
| `gmail-import-selected` | wymagany | pobiera RAW, parsuje po stronie Edge i zwraca `ImportedReport` v2 |
| `gmail-confirm-import` | wymagany | po sukcesie workspace zmienia receipt na `committed` |
| `gmail-disconnect` | wymagany | próbuje revoke w Google, następnie zawsze usuwa lokalny token |

Każda funkcja z JWT wyprowadza `user_id` z ważnego tokenu Supabase, nigdy z payloadu klienta. Callback nie korzysta z CORS, ponieważ jest nawigacją najwyższego poziomu.

### Konfiguracja funkcji

Repo nie ma obecnie `supabase/config.toml`. W G1B.1 należy go dodać albo przygotować równoważny, wersjonowany manifest wdrożeniowy. Wymagane ustawienia:

- `verify_jwt = true` dla wszystkich funkcji użytkownika;
- `verify_jwt = false` wyłącznie dla `gmail-oauth-callback`;
- callback samodzielnie i atomowo waliduje `state`;
- brak przypadkowego dziedziczenia opcji CLI między funkcjami.

### Współdzielony kod Edge

Umieścić moduły serwerowe pod `supabase/functions/_shared/gmail/`:

- `auth.ts` — użytkownik Supabase i klient service-role;
- `cors.ts` — ścisła allowlista originów;
- `crypto.ts` — AES-256-GCM, HMAC, AAD i rotacja kluczy;
- `oauthState.ts` — state, PKCE i atomowe zużycie;
- `googleClient.ts` — OAuth, refresh, Gmail list/get/profile/revoke;
- `limits.ts` — 30 dni, 25 wyników, 10 MB, concurrency 5;
- `errors.ts` — stabilne kody techniczne;
- `reportParser.ts` — Deno-compatible RFC822 -> bezpieczny tekst -> `ImportedReport`.

Nie importować w funkcji wdrażanej modułów z `src/` bez wcześniejszego potwierdzenia bundlowania przez CLI. Kontrakt DTO może być zdublowany testem zgodności albo przeniesiony do neutralnego, współdzielonego pakietu dostępnego dla obu runtime'ów.

## 6. OAuth i przekierowania

- Przepływ: Authorization Code + `state` + PKCE S256.
- Google zna jeden stabilny HTTPS callback Supabase.
- `return_target` jest kodem, np. `local`, `staging`, `production`; klient nie przekazuje dowolnego URL.
- Dokładne adresy dla kodów są zapisane w sekretnej/serwerowej konfiguracji.
- Callback zwraca `303 See Other` do `/import?gmail=connected` albo bezpiecznego kodu błędu.
- Token response i parametry callbacku nie mogą być logowane.
- Jeżeli testowy klient Google odrzuci PKCE, implementacja zatrzymuje się do decyzji; nie wolno usuwać PKCE po cichu.

## 6a. Domyślne wyszukiwanie RocketJobs

Pierwsze wyszukiwanie po otwarciu kanału Gmail używa zapytania:

```text
from:no-reply@rocketjobs.pl newer_than:30d
```

- różne tytuły raportów nie ograniczają wyników;
- temat pozostaje wyłącznie opcjonalnym filtrem zaawansowanym;
- użytkownik może zmienić zakres dat;
- pusty wynik nie uruchamia automatycznie szerszego wyszukiwania;
- zmiana nadawcy jest możliwa tylko jako jawna opcja zaawansowana;
- serwer po pobraniu zaznaczonej wiadomości ponownie waliduje znormalizowany nagłówek `From` oraz obecność obsługiwanych linków/ofert RocketJobs;
- test kontraktu musi potwierdzić zapytanie `from:\"no-reply@rocketjobs.pl\" newer_than:30d` generowane przez obecny builder.

## 7. Sekrety

W Supabase Secrets, nigdy jako `VITE_*`:

```text
GOOGLE_GMAIL_CLIENT_ID
GOOGLE_GMAIL_CLIENT_SECRET
GOOGLE_GMAIL_REDIRECT_URI
GMAIL_TOKEN_ENCRYPTION_KEY_V1
GMAIL_MESSAGE_HMAC_KEY_V1
GMAIL_ALLOWED_ORIGINS
GMAIL_RETURN_TARGETS
```

Klucze szyfrowania i HMAC muszą być niezależnymi, losowymi wartościami 32-bajtowymi. Sekrety należy wprowadzać bezpośrednio do bezpiecznego mechanizmu Supabase; użytkownik nie powinien wklejać ich do rozmowy.

## 8. Kontrakt prywatności i logów

Do logów wolno zapisać:

- kod diagnostyczny;
- status HTTP Google;
- liczbę wyników/pobranych wiadomości;
- czas operacji;
- wewnętrzny correlation id niezawierający Gmail message id.

Nie wolno logować:

- zapytania Gmail;
- adresu nadawcy i tematu;
- Gmail message id ani thread id;
- RAW, tekstu lub HTML wiadomości;
- authorization code, access tokenu, refresh tokenu i PKCE verifiera;
- danych ofert wyciągniętych z wiadomości.

## 9. Obsługa błędów

Publiczne DTO używa kodów, które frontend tłumaczy PL/EN:

- `GMAIL_NOT_CONNECTED`;
- `GMAIL_REAUTH_REQUIRED`;
- `GMAIL_PERMISSION_DENIED`;
- `GMAIL_RATE_LIMITED` z kontrolowanym `retryAfter`;
- `GMAIL_TIMEOUT`;
- `GMAIL_MESSAGE_TOO_LARGE`;
- `GMAIL_MESSAGE_INVALID`;
- `GMAIL_REPORT_EMPTY`;
- `GMAIL_PROVIDER_UNAVAILABLE`;
- `GMAIL_OAUTH_STATE_INVALID`;
- `GMAIL_OAUTH_STATE_EXPIRED`;
- `GMAIL_OAUTH_CANCELLED`.

`401 invalid_grant` podczas odświeżania tokenu ustawia połączenie na `reauth_required`; nie należy wykonywać nieskończonych retry.

## 10. Testy wymagane przed wdrożeniem

### Migracja i uprawnienia

- schemat prywatny nie jest wystawiony przez Data API;
- `anon` i `authenticated` nie mają dostępu do tabel ani funkcji wewnętrznych;
- usunięcie użytkownika usuwa połączenie, state i receipts;
- unikalność połączenia i receipt działa również przy wyścigu;
- uprzywilejowane funkcje mają ustalony `search_path`.

### Kryptografia i OAuth

- round-trip AES-GCM i wykrywanie manipulacji;
- AAD uniemożliwia przełożenie tokenu między użytkownikami/połączeniami;
- odczyt poprzedniej wersji klucza i zapis aktywną wersją;
- nieważny, wygasły, powtórzony lub obcy state jest odrzucany;
- nieznany `return_target` jest odrzucany;
- PKCE challenge/verifier jest zgodny;
- callback nie ujawnia code/tokenów w odpowiedzi ani logach.

### Gmail API i parser

- query ogranicza daty do zatwierdzonego zakresu;
- `maxResults` nie przekracza 25;
- paginacja działa bez utraty filtrów;
- pobierane są tylko metadane przed wyborem;
- RAW pobierany jest wyłącznie dla zaznaczonych id;
- liczba równoległych pobrań nie przekracza 5;
- limit 10 MB liczony jest po dekodowaniu;
- RAW nie pojawia się w DTO;
- obsłużone są 401/403/429/5xx/timeout;
- parser zachowuje parytet `.eml` i Gmail dla tych samych fixture'ów;
- załączniki są ignorowane.

### Regresja produktu

- wszystkie testy `.eml` pozostają zielone;
- wszystkie testy importu bezpośredniego linku pozostają zielone;
- canonical fingerprint nie zależy od `acquisitionChannel`;
- import nie wywołuje analizy AI;
- nowe komunikaty mają PL i EN;
- `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run build`, `git diff --check` — PASS.

## 11. Checklista konfiguracji Google Cloud — zadanie manualne

1. Utworzyć oddzielny projekt testowy Google Cloud.
2. Włączyć Gmail API.
3. Skonfigurować OAuth consent screen jako External / Testing.
4. Dodać wyłącznie wskazane konta testowe.
5. Dodać zakres `gmail.readonly`.
6. Utworzyć OAuth Client typu Web application.
7. Dodać dokładny callback Supabase Edge Function.
8. Ustawić client id/secret bezpośrednio w Supabase Secrets.
9. Nie wysyłać aplikacji do publicznej weryfikacji w G1B.

## 12. Kolejność wdrożenia i bramy STOP

1. **Implementacja G1B.1 lokalnie** — STOP przed `git add`/commitem i przed migracją zdalną.
2. **Implementacja G1B.2 lokalnie** — STOP przed `git add`/commitem i przed deployem funkcji.
3. **Google Cloud manual setup** — STOP, użytkownik potwierdza projekt i konta testowe.
4. **Supabase dry-run** — wymaga zgody; raport dokładnego diffu migracji.
5. **Migracja i secrets** — wymagają osobnej zgody; bez ujawniania wartości.
6. **Deploy nowych funkcji Gmail** — wymaga osobnej zgody.
7. **Test techniczny endpointów** — bez danych prywatnych w raporcie.
8. **Test OAuth w przeglądarce Codex** — STOP i przełączenie modelu przed rozpoczęciem.
9. **Manual PASS użytkownika** — dopiero wtedy G1B może zostać uznany za zakończony.

## 13. Kryteria ukończenia G1B

G1B jest PASS tylko wtedy, gdy:

- użytkownik może połączyć testowe konto Gmail i zobaczyć status połączenia;
- wyszukiwanie zwraca bezpieczne preview maksymalnie 25 wiadomości;
- zaznaczone wiadomości są parsowane po stronie Edge;
- przeglądarka nie otrzymuje RAW ani tokenów;
- limity 30 dni / 25 / 10 MB / 5 są wymuszone serwerowo;
- deduplikacja receipt odróżnia `staged` od `committed`;
- odłączenie usuwa lokalny token nawet po błędzie zdalnego revoke;
- import `.eml`, import linku oraz PL/EN mają testy regresji PASS;
- nie uruchomiono automatycznej analizy AI;
- test manualny OAuth został wykonany i potwierdzony przez użytkownika.

## 14. Stan i proponowane commity

Ten dokument przygotowuje G1B, ale nie rozpoczyna implementacji. Nie dodano migracji, funkcji, sekretów ani konfiguracji Google Cloud.

Rekomendowane osobne commity po akceptacji i wykonaniu etapów:

```text
feat: add secure Gmail connection foundation
feat: add Gmail Edge Function gateway
```

Nie łączyć migracji, testowej konfiguracji Google i panelu UI G2 w jeden commit.

## 15. Źródła normatywne

- Supabase Edge Function auth: https://supabase.com/docs/guides/functions/auth
- Supabase Edge Function secrets: https://supabase.com/docs/guides/functions/secrets
- Supabase changelog: https://supabase.com/changelog
- Google OAuth web-server flow: https://developers.google.com/identity/protocols/oauth2/web-server
- Gmail `users.messages.list`: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list
- Gmail `users.messages.get`: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get
