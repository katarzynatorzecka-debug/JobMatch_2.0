# JobMatch — Gmail G0: bramka wykonalności, produktu i bezpieczeństwa

**Wersja:** 1.0
**Data:** 5 września 2026
**Status:** PASS — G1A GO
**Zakres:** decyzje i architektura przed G1A; bez kodu funkcjonalnego, migracji, sekretów i połączenia z Google

## 1. Werdykt

### Wersja testowa/prywatna

**GO dla G1A**, a następnie warunkowe GO dla G1B na osobnym projekcie Google Cloud w trybie Testing.

Zakres `https://www.googleapis.com/auth/gmail.readonly` jest zakresem ograniczonym (restricted). Tryb Testing pozwala pracować z listą wskazanych użytkowników testowych, ale wyświetla ostrzeżenie o niezweryfikowanej aplikacji, ma limit użytkowników testowych, a autoryzacja i refresh token dla tego zakresu wygasają po 7 dniach.

### Wersja publiczna

**NO-GO na tym etapie.** Publiczne wdrożenie wymaga osobnego projektu produkcyjnego Google Cloud, kompletnej strony produktu i polityki prywatności na zweryfikowanej domenie, uzasadnienia minimalnego zakresu, filmu demonstracyjnego, weryfikacji OAuth oraz — przy przechowywaniu lub przesyłaniu danych restricted-scope przez serwer — oceny bezpieczeństwa i późniejszej recertyfikacji.

G1A nie wymaga rozstrzygnięcia publicznej publikacji, ponieważ używa wyłącznie mocków i fixture'ów. G1B może rozpocząć się wyłącznie dla środowiska testowego po skonfigurowaniu projektu Google Cloud i sekretów.

## 2. Potwierdzone uwarunkowania obecnej aplikacji

- Interfejs PL/EN oraz komunikaty importu są wdrożone i stanowią gotową bazę dla nowych kluczy Gmail.
- `ImportedReport.source` obecnie łączy kanał pozyskania (`.eml` lub link) z pochodzeniem raportu.
- Schemat `ImportedReport` dopuszcza obecnie tylko `rocketjobs-eml`, mimo że kontrakt TypeScript zawiera także `job-url`.
- Parser raportu pracuje na znormalizowanym tekście, a `postal-mime` przyjmuje `ArrayBuffer` pliku `.eml`.
- Canonical fingerprint zawiera `sourceType`. Bez refaktoryzacji Gmail i `.eml` mogą tworzyć różne fingerprinty tej samej oferty.
- Limit istniejącego pliku `.eml` wynosi 10 MB.
- Edge Functions uwierzytelniają użytkownika przez Supabase Auth, ale istniejące funkcje zwracają obecnie CORS `*`. Nowe funkcje Gmail muszą używać ścisłej allowlisty originów.
- Repozytorium nie zawiera `supabase/config.toml`; przed G1B należy jawnie ustalić `verify_jwt` dla każdej nowej funkcji i utrwalić konfigurację wdrożenia.

## 3. Zatwierdzana architektura

```text
Użytkownik zalogowany do JobMatch
  -> gmail-oauth-start (Supabase JWT wymagany)
  -> zapis hash(state), właściciela, expiry i dozwolonego return target
  -> przekierowanie najwyższego poziomu do Google OAuth
  -> gmail-oauth-callback (publiczny callback, bez JWT przeglądarki)
  -> atomowa walidacja i jednokrotne zużycie state
  -> wymiana authorization code po stronie serwera
  -> szyfrowany refresh token w prywatnej tabeli
  -> przekierowanie 303 do /import

/import
  -> gmail-search (Supabase JWT wymagany)
  -> Gmail messages.list + messages.get(format=metadata)
  -> tylko: opaque preview id, zamaskowany nadawca, temat, data, size/status
  -> użytkownik wybiera wiadomości
  -> gmail-import-selected (Supabase JWT wymagany)
  -> Gmail messages.get(format=raw)
  -> kontrola rozmiaru, dekodowanie base64url i parser RFC822
  -> znormalizowany ImportedReport
  -> istniejący koszyk, workspace i deduplikacja
  -> brak automatycznego uruchomienia AI
```

### Callback i adresy powrotu

Google powinien znać jeden stabilny HTTPS callback Edge Function, np.:

```text
https://<PROJECT_REF>.supabase.co/functions/v1/gmail-oauth-callback
```

Frontendowe adresy `localhost`, staging/preview i produkcja nie powinny być osobnymi dynamicznymi callbackami Google. Są one dozwolonymi celami końcowego przekierowania z Edge Function i muszą pochodzić z zamkniętej allowlisty. Nie wolno przyjmować dowolnego `return_to` ani wildcardu dla Vercel Preview. Dla testów preview należy użyć jednego stałego adresu stagingowego albo jawnie dodanego originu.

### Funkcje i uwierzytelnienie

- `gmail-oauth-start`, `gmail-connection-status`, `gmail-search`, `gmail-import-selected`, `gmail-disconnect`: wymagają ważnego Supabase user JWT i każdorazowo wyprowadzają właściciela z tokenu, nigdy z payloadu klienta.
- `gmail-oauth-callback`: musi być osiągalny bez Supabase JWT, ale akceptuje wyłącznie ważny authorization code i losowy, krótko żyjący, jednokrotny `state`.
- Callback nie używa CORS — jest nawigacją najwyższego poziomu. Pozostałe endpointy korzystają z jawnej allowlisty originów.
- Google OAuth nie może działać w osadzonym webview. Autoryzacja odbywa się przez pełną, wspieraną przeglądarkę.

## 4. Tokeny i kryptografia

- Google Client Secret, klucze szyfrowania i klucz HMAC znajdują się wyłącznie w Supabase Secrets.
- Refresh token jest szyfrowany AES-256-GCM z losowym 96-bitowym nonce dla każdego zapisu.
- AAD wiąże ciphertext co najmniej z `user_id`, identyfikatorem połączenia i wersją schematu.
- Rekord przechowuje `key_version`, nonce i ciphertext; nie przechowuje tokenu jawnie.
- Klucz HMAC dla identyfikatorów wiadomości jest oddzielny od klucza szyfrowania tokenów.
- Rotacja: nowy klucz staje się aktywny, odczyt nadal obsługuje poprzednią wersję, a rekord jest ponownie szyfrowany przy najbliższym użyciu lub kontrolowanej migracji.
- Access token pozostaje wyłącznie w pamięci pojedynczego wywołania Edge Function.
- Odłączenie konta wywołuje revoke po stronie Google, a następnie usuwa lokalny token niezależnie od powodzenia zdalnego revoke.

## 5. Prywatność danych Gmail

Rekomendowany wariant minimalizacji:

- lista pobiera tylko metadane potrzebne do wyboru;
- pełna treść jest pobierana dopiero dla zaznaczonych wiadomości;
- parser działa po stronie serwerowej, a przeglądarka otrzymuje znormalizowany `ImportedReport`, nie Gmail RAW;
- RAW, treść HTML, załączniki i access token nie są zapisywane w bazie ani logowane;
- załączniki są ignorowane;
- zapis importu przechowuje wyłącznie HMAC identyfikatora wiadomości, identyfikator sesji i datę;
- błędy i telemetria używają kodów technicznych bez tematów, nadawców, treści, zapytań i identyfikatorów Gmail.

Ten wariant zmienia założenie planu dotyczące przejściowego wysłania RAW do przeglądarki. Jest bezpieczniejszy i zmniejsza powierzchnię ekspozycji danych. Wymaga jednak, aby neutralny parser z G1A był możliwy do uruchomienia również w Edge Function.

## 6. Parametry wersji testowej

| Parametr | Rekomendowana decyzja |
| --- | --- |
| Model publikacji | External / Testing, wyłącznie wskazane konta testowe |
| Konta Gmail | jedno aktywne połączenie na użytkownika JobMatch |
| Zakres OAuth | tylko `gmail.readonly` |
| Dostęp offline | tak, z obsługą 7-dniowego wygaśnięcia w trybie Testing |
| Domyślny zakres dat | ostatnie 30 dni |
| Wyniki na stronę | maksymalnie 25 |
| Limit wiadomości | 10 MB po dekodowaniu, zgodny z `.eml` |
| Równoległe `messages.get` | maksymalnie 5 |
| Załączniki | ignorowane w v1 |
| Analiza AI po imporcie | nigdy automatycznie |
| Preset RocketJobs | dopiero po potwierdzeniu rzeczywistego nadawcy i tematów |
| Środowiska Google Cloud | osobny projekt testowy; osobny projekt produkcyjny w przyszłości |

## 7. Konieczne korekty planu G1A

1. Rozdzielić `acquisitionChannel` (`eml`, `gmail`, `url`) od `reportProvider`/`offerProvider` (`rocketjobs`, inne w przyszłości).
2. Nie dodawać `gmail` bezpośrednio do wartości używanej przez canonical fingerprint.
3. Ujednolicić rozbieżność między kontraktem TypeScript i schematem Zod dla importu linku.
4. Podzielić parser na:
   - dekodowanie RFC822 do bezpiecznej reprezentacji tekstowej,
   - czysty parser raportu do `ImportedReport`.
5. Zapewnić zgodność neutralnego parsera z przeglądarką i Deno/Supabase Edge Runtime.
6. Mock Gmaila ma zwracać te same DTO co przyszłe Edge Functions, bez tokenów i prywatnych danych w fixture'ach.
7. Deduplikację testować między wszystkimi kanałami, a nie tylko wewnątrz jednego raportu.
8. Każdy nowy komunikat i błąd ma mieć klucz PL/EN od pierwszego commita.

## 8. Model danych do zatwierdzenia przed G1B

- Tabele tokenów i stanów OAuth należy umieścić w nieeksponowanym schemacie prywatnym albo odebrać `anon` i `authenticated` wszystkie uprawnienia Data API; RLS pozostaje obroną dodatkową.
- `gmail_connections` ma unikalność `(user_id)` dla jednego aktywnego połączenia w v1.
- `gmail_oauth_states` przechowuje hash state, expiry, `used_at`, właściciela, dokładny callback i kod dozwolonego return target. Zużycie state musi być atomowe.
- `gmail_import_receipts` przechowuje HMAC message id i unikalność `(user_id, connection_id, message_hmac)`.
- Funkcje uprzywilejowane nie mogą być publicznie wykonywalne. Jeżeli potrzebny jest `SECURITY DEFINER`, powinien być w nieeksponowanym schemacie, mieć ustalony `search_path`, kontrolę `auth.uid()` tam, gdzie istnieje kontekst użytkownika, oraz jawnie ograniczone `EXECUTE`.

## 9. Zatwierdzone decyzje użytkownika

1. Gmail v1 pozostaje funkcją prywatną/testową dla wskazanych kont Google, bez publicznej publikacji.
2. Gmail RAW jest parsowany w Edge Function i nie trafia do przeglądarki.
3. Parametry domyślne: ostatnie 30 dni, 25 wyników na stronę, wiadomość do 10 MB i maksymalnie 5 równoległych pobrań.

Decyzje 1–3 zostały zatwierdzone przez użytkownika 5 września 2026.

Przed G2 pozostaje dostarczenie — bez treści wiadomości — 2–3 rzeczywistych par `nadawca/domena + charakterystyczny fragment tematu`, aby zbudować preset RocketJobs.

## 10. Bramka

```text
G0 = PASS
G1A = GO
G1B = BLOCKED do czasu utworzenia testowego projektu Google Cloud,
      wskazania testowych kont i bezpiecznego ustawienia sekretów
Public launch = NO-GO do czasu weryfikacji Google i oceny bezpieczeństwa
```

## 11. Źródła normatywne

- Google: Gmail API scopes — `gmail.readonly` jako restricted scope: https://developers.google.com/workspace/gmail/api/auth/scopes
- Google: wymagania weryfikacji OAuth: https://support.google.com/cloud/answer/13464321
- Google: tryb Testing i użytkownicy testowi: https://support.google.com/cloud/answer/15549945
- Google: OAuth 2.0 dla aplikacji web-server: https://developers.google.com/identity/protocols/oauth2/web-server
- Google: polityki OAuth i zakaz embedded user-agent: https://developers.google.com/identity/protocols/oauth2/policies
- Supabase: zabezpieczanie Edge Functions: https://supabase.com/docs/guides/functions/auth
- Supabase: bezpieczeństwo danych i RLS: https://supabase.com/docs/guides/database/secure-data

## 12. Stan repozytorium

Dokument jest jedyną zmianą G0. Nie zmieniono kodu funkcjonalnego, migracji, konfiguracji Supabase, sekretów ani stanu Google Cloud. Nie wykonano testu runtime, ponieważ G0 nie uruchamia integracji.
