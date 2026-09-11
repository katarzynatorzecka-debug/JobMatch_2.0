# JobMatch — Gmail G1B.2: raport checkpointu

**Data:** 5 września 2026
**Status:** IMPLEMENTATION PASS — LOCAL GATEWAY CORS PARTIAL — READY FOR COMMIT APPROVAL
**Zakres:** siedem lokalnych Edge Functions Gmail, adapter Google testowany przez wstrzyknięty HTTP i parser serwerowy; bez wdrożenia i bez prawdziwego OAuth

## 1. Stan Git na wejściu

- checkout: `C:\Users\katar\OneDrive\Desktop\AIDEAS VC\NewJobCopilot\JobMatch_2.0`;
- branch: `feat/cv-parser-v2`;
- HEAD: `e54e35a feat: add secure Gmail connection foundation`;
- branch był o dwa commity przed `origin/feat/cv-parser-v2`;
- niezwiązane pliki `Wideo — skrót .lnk` oraz `docs/JobMatch_Gmail_Implementation_Plan_v1.1.md` pozostawały untracked i nie zostały zmienione;
- nie wykonano `git add`, commita ani push.

## 2. Zrealizowany zakres

- dodano siedem jawnych entrypointów Edge Functions: start i callback OAuth, status, wyszukiwanie, import zaznaczonych wiadomości, potwierdzenie receipt i odłączenie;
- funkcje użytkownika wyprowadzają `user_id` z ważnego JWT Supabase, ignorując ewentualną tożsamość w payloadzie;
- callback bez JWT atomowo zużywa `state`, waliduje PKCE oraz konfigurację redirectu i kończy bezpiecznym `303`;
- dodano bezpośredni dostęp serwerowy do prywatnego schematu Postgres przez `SUPABASE_DB_URL`, bez wystawiania `private_gmail` przez Data API;
- refresh token i PKCE pozostają szyfrowane AES-256-GCM z AAD; odczyt starszego klucza powoduje zapis aktywną wersją;
- identyfikatory Gmail są zwracane klientowi wyłącznie jako zaszyfrowane, powiązane z użytkownikiem i połączeniem `messageRef`;
- wyszukiwanie domyślnie używa `from:"no-reply@rocketjobs.pl" newer_than:30d`, limitu 25 i maksymalnie pięciu równoległych pobrań metadanych;
- przed wyborem pobierane są wyłącznie metadane; RAW jest pobierany tylko dla jawnie wybranych referencji;
- limit 10 MB jest sprawdzany przed i po dekodowaniu RAW;
- parser RFC822 działa po stronie Edge, ponownie waliduje nadawcę oraz linki/oferty RocketJobs i ignoruje załączniki jako źródło danych;
- odpowiedź importu zawiera `ImportedReport` v2 i receipt, bez RAW, HTML, tokenów i jawnego Gmail message id;
- receipt pozostaje `staged` do potwierdzenia istniejącej sesji importu `active` albo `partial`;
- odłączenie zawsze usuwa lokalne połączenie także po błędzie zdalnego revoke;
- nie dodano logowania danych Gmail i nie podłączono automatycznej analizy AI.

## 3. Zmienione pliki

- `package.json`, `package-lock.json` — dokładna zależność `postgres@3.4.7`;
- `supabase/functions/deno.json` — wersjonowane mapowania npm dla runtime Deno;
- `supabase/functions/_shared/gmail/crypto.ts`, `oauthState.ts` — eksport konwersji bytea i importy zgodne z bundlerem Deno;
- nowe moduły serwerowe: `contracts.ts`, `cors.ts`, `errors.ts`, `googleClient.ts`, `limits.ts`, `messageRef.ts`, `query.ts`, `reportParser.ts`, `runtime.ts`, `service.ts`, `store.ts`;
- nowe testy: `cors.test.ts`, `functionGateway.test.ts`, `googleClient.test.ts`, `messageRef.test.ts`, `query.test.ts`, `reportParser.test.ts`, `service.test.ts`;
- entrypointy `index.ts` w siedmiu katalogach `supabase/functions/gmail-*`;
- ten raport checkpointu.

## 4. Walidacja

| Kontrola | Wynik |
| --- | --- |
| Testy celowane Gmail Edge | PASS — 9 plików, 30 testów |
| Pełne `npm.cmd test` | PASS — 97 plików, 482 testy |
| `npm.cmd run typecheck` | PASS |
| `npm.cmd run build` | PASS |
| `git diff --check` | PASS |
| Bundlowanie i start lokalnych Edge Functions | PASS — Supabase Edge Runtime `1.74.3`, Deno `2.1.4` |
| Callback z nieważnym state | PASS — `303` do `/import?gmail=error&code=GMAIL_OAUTH_STATE_INVALID`, bez code i tokenów |
| Brak JWT dla funkcji użytkownika | PASS — gateway zwrócił `401 UNAUTHORIZED_NO_AUTH_HEADER` |
| Ważny lokalny JWT i dozwolony origin | PASS — `200`, wyłącznie `{"state":"disconnected"}` |
| Ważny lokalny JWT i obcy origin | PASS — handler zwrócił `403 GMAIL_PERMISSION_DENIED` |
| Sprzątnięcie syntetycznej tożsamości | PASS — lokalny użytkownik testowy usunięty w `finally` |
| Preflight i dokładny nagłówek CORS przez lokalny Kong | PARTIAL — Kong `2.8.1` odpowiada `Access-Control-Allow-Origin: *` przed handlerem i nadpisuje nagłówek odpowiedzi |
| Parytet Gmail/`.eml` i brak auto-analizy | PASS — test adaptera porównuje treść raportu i potwierdza brak wywołania analizy |
| Regresja importu `.eml`, linku, fingerprintu i słowników PL/EN | PASS w pełnym zestawie testów |
| Prawdziwy Google OAuth/API | NOT RUN — G1B.3, poza zatwierdzonym zakresem |
| Migracja lub deploy zdalny | NOT RUN — bez autoryzacji |
| Test przeglądarkowy | NOT RUN — twarda brama G1B.3 |

Build nadal emituje istniejące ostrzeżenie Vite o chunkach większych niż 500 kB. Nie wynika ono z gatewaya Gmail.

## 5. CORS — wynik techniczny

Implementacja funkcji wymusza allowlistę niezależnie od nagłówka gatewaya: dozwolony origin przechodzi, a obcy origin z tym samym ważnym JWT otrzymuje `403`. Test jednostkowy potwierdza również, że bezpośrednia odpowiedź handlera ustawia dokładny dozwolony origin i nie ustawia go dla żądania odrzuconego.

Lokalny Kong przechwytuje `OPTIONS` przed uruchomieniem funkcji i zwraca wildcard zarówno dla originu dozwolonego, jak i obcego. Dodaje też wildcard do odpowiedzi funkcji. Z tego powodu precyzyjnego nagłówka allowlisty nie można oznaczyć jako end-to-end PASS w lokalnym stosie. Skuteczność blokady serwerowej jest potwierdzona; zachowanie nagłówków hostowanego gatewaya pozostaje do weryfikacji po osobno zatwierdzonym deployu G1B.3.

## 6. Granice i znane ograniczenia

- użyto wyłącznie syntetycznych sekretów lokalnych i atrap odpowiedzi Google; tymczasowy ignorowany plik środowiska został usunięty;
- nie użyto prawdziwego konta Gmail, authorization code, access tokenu ani refresh tokenu;
- nie ustawiono sekretów Supabase i nie skonfigurowano Google Cloud;
- nie wykonano zdalnego `db push`, deployu Edge Functions ani testu UI;
- rzeczywiste ścieżki Google 401/403/429/5xx/timeout są pokryte kontrolowanym adapterem HTTP, a nie połączeniem z usługą Google;
- pełny przepływ zapisu połączenia i receipt w bazie zostanie zweryfikowany z rzeczywistym OAuth dopiero w G1B.3;
- lokalny stos Supabase pozostaje uruchomiony w Docker Desktop; proces `functions serve` został zatrzymany;
- istniejące, niezwiązane pliki untracked pozostają poza proponowanym zakresem commita.

## 7. Bramka

```text
G1B.2 implementation = PASS
local gateway exact CORS headers = PARTIAL
G1B.2 review/commit = WAITING FOR USER APPROVAL
G1B.3 Google Cloud/secrets/remote migration/deploy = STOP — NOT AUTHORIZED
browser OAuth test = STOP — NOT STARTED
```

Proponowany zakres commita: wyłącznie moduły, entrypointy, testy, zależność runtime i ten raport G1B.2. Wykluczyć `Wideo — skrót .lnk` oraz `docs/JobMatch_Gmail_Implementation_Plan_v1.1.md`.

Proponowany komunikat:

```text
feat: add Gmail Edge Function gateway
```
