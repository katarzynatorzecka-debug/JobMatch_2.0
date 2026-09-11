# JobMatch — Gmail G2.1: raport checkpointu

**Data:** 6 września 2026
**Status:** IMPLEMENTATION PASS — HUMAN REVIEW REQUIRED
**Zakres:** widoczny panel połączenia Gmail oraz trzy równorzędne źródła importu; bez wyszukiwania i importu wiadomości G2.2

## 1. Stan Git na wejściu

- checkout: `C:\Users\katar\OneDrive\Desktop\AIDEAS VC\NewJobCopilot\JobMatch_2.0`;
- branch: `feat/cv-parser-v2`;
- HEAD: `2ffc398 docs: record Gmail G1B.3 deployment pass`;
- branch był o cztery commity przed `origin/feat/cv-parser-v2`;
- niezwiązane pliki `Wideo — skrót .lnk` oraz `docs/JobMatch_Gmail_Implementation_Plan_v1.1.md` pozostawały untracked i nie zostały zmienione;
- nie wykonano `git add`, commita ani push.

## 2. Zrealizowany zakres

- przebudowano początkowy ekran importu na trzy równorzędne kafelki:
  1. „Wyszukaj na mailu”;
  2. „Dodaj raporty w formacie .eml”;
  3. „Wklej link do oferty”;
- dodano frontendowego klienta trzech wdrożonych funkcji G1B: status, start OAuth i odłączenie;
- odpowiedzi Edge Functions są walidowane przed użyciem w interfejsie;
- adres przekierowania OAuth jest akceptowany wyłącznie dla HTTPS na `accounts.google.com`;
- lokalne uruchomienie wybiera callback `local`, a środowisko nielokalne `production`;
- panel pokazuje stan: ładowanie, brak połączenia, aktywne połączenie, wymagana ponowna autoryzacja albo błąd;
- aktywne konto jest prezentowane wyłącznie w postaci zamaskowanej zwracanej przez backend;
- przycisk odłączenia wymaga jawnego potwierdzenia użytkownika;
- wynik callbacku `gmail=connected` albo bezpieczny kod błędu jest prezentowany i następnie usuwany z adresu;
- Gmail pozostaje wyłączony w trybie demo z jasnym wyjaśnieniem;
- dodano pełne teksty PL i EN;
- układ reaguje na szerokość ekranu: trzy, dwie albo jedna kolumna;
- istniejący import .eml i import linku zachowały swoje akcje.

## 3. Zmienione pliki

- `src/features/gmail/gmailApiClient.ts` — bezpieczny klient status/start/disconnect;
- `src/features/gmail/gmailApiClient.test.ts` — walidacja kontraktu klienta, błędów i callback target;
- `src/features/gmail/components/GmailImportPanel.tsx` — panel stanu i akcji połączenia;
- `src/pages/ImportAnalysisPage.tsx` — trzy kafelki źródeł importu;
- `src/i18n/translationTypes.ts` — typy nowych kluczy;
- `src/i18n/translations/pl.ts`, `src/i18n/translations/en.ts` — teksty PL/EN;
- `src/styles/global.css` — responsywny układ i stany wizualne;
- ten raport checkpointu.

## 4. Walidacja

| Kontrola | Wynik |
| --- | --- |
| Testy celowane klienta Gmail i i18n | PASS — 2 pliki, 9 testów |
| Pełne `npm.cmd test` | PASS — 98 plików, 486 testów |
| `npm.cmd run typecheck` | PASS |
| `npm.cmd run build` | PASS |
| `git diff --check` | PASS |
| Lokalny ekran `/import` | PASS — trzy źródła importu widoczne |
| Rzeczywisty status połączenia | PASS — `active`, konto zamaskowane |
| Callback `gmail=connected` | PASS — komunikat sukcesu i oczyszczenie adresu |
| Przełączenie PL/EN | PASS — nowe teksty zmieniają język |
| Wąski viewport | PASS — kafelki układają się w jednej kolumnie |
| Desktop trzy kolumny | STATIC — reguła CSS; wymaga oceny użytkownika w szerokim oknie |
| Start nowego OAuth | NOT RUN — połączenie już aktywne |
| Odłączenie | NOT RUN — zachowano działające połączenie testowe |

Build emituje istniejące ostrzeżenie Vite o chunkach większych niż 500 kB. Zmiana G2.1 nie dodaje nowej zależności runtime.

## 5. Bezpieczeństwo

- przeglądarka nie otrzymuje refresh tokenu ani RAW wiadomości;
- panel nie loguje danych konta lub odpowiedzi Gmail;
- kody błędów są mapowane na kontrolowane komunikaty;
- klient odrzuca nieprawidłowy status, odpowiedź odłączenia i URL OAuth spoza Google Accounts;
- status oraz akcje są dostępne tylko w trybie zalogowanym;
- tryb demo nie wywołuje Gmail API.

## 6. Blokery i znane ograniczenia

- G2.1 nie zawiera filtrów, listy wiadomości, zaznaczania, importu do koszyka, paginacji ani etykiety „Już zaimportowano”; to zakres G2.2;
- połączenie środowiska staging nie jest wybierane automatycznie; G2.1 rozróżnia lokalne i produkcyjne uruchomienie;
- przycisk odłączenia nie został ręcznie użyty, aby nie unieważnić potwierdzonego połączenia;
- szeroki układ trzech kolumn wymaga wizualnej akceptacji użytkownika;
- niezwiązane pliki untracked pozostają poza proponowanym zakresem commita.

## 7. Bramka

```text
G2.1 implementation = PASS
tests/typecheck/build = PASS
authenticated runtime status = PASS
human visual review = WAITING
G2.2 search/import flow = STOP — NOT STARTED
git add/commit/push = STOP — NOT AUTHORIZED
```

Proponowany zakres commita: wyłącznie osiem plików implementacji i ten raport G2.1. Wykluczyć `Wideo — skrót .lnk` oraz `docs/JobMatch_Gmail_Implementation_Plan_v1.1.md`.

Proponowany komunikat:

```text
feat: add Gmail connection panel
```
