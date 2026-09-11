# JobMatch — Gmail G1B.3: raport checkpointu

**Data:** 6 września 2026
**Status:** PASS — GOOGLE CLOUD, SUPABASE DEPLOY I OAUTH RUNTIME POTWIERDZONE
**Zakres:** testowy projekt Google Cloud, bezpieczne sekrety Supabase, zdalna migracja i wdrożenie siedmiu Edge Functions oraz test OAuth/status/search; bez panelu UI G2

## 1. Stan Git na wejściu

- checkout: `C:\Users\katar\OneDrive\Desktop\AIDEAS VC\NewJobCopilot\JobMatch_2.0`;
- branch: `feat/cv-parser-v2`;
- HEAD: `8accdc5 feat: add Gmail Edge Function gateway`;
- branch był o trzy commity przed `origin/feat/cv-parser-v2`;
- niezwiązane pliki `Wideo — skrót .lnk` oraz `docs/JobMatch_Gmail_Implementation_Plan_v1.1.md` pozostawały untracked i nie zostały zmienione;
- nie wykonano `git add`, commita ani push.

## 2. Zrealizowany zakres

- skonfigurowano oddzielny testowy projekt Google Cloud i włączono Gmail API;
- ekran zgody działa w trybie External / Testing z zakresem `gmail.readonly`;
- dodano trzy zatwierdzone konta testowe;
- utworzono aktywnego klienta OAuth dla callbacku Supabase, a wcześniejsze dane klienta objęte incydentem zostały zastąpione;
- zapisano siedem wymaganych sekretów bez umieszczania ich w repozytorium;
- zastosowano migrację `20260905191208_gmail_private_foundation.sql`;
- wdrożono siedem funkcji `gmail-*` z wersjonowanym import map;
- wykonano techniczny test publicznego callbacku, ochrony JWT i preflight CORS;
- wykonano pełny przepływ OAuth w przeglądarce dla zatwierdzonego konta testowego;
- potwierdzono aktywne połączenie oraz wyszukiwanie wyłącznie w formie liczby wyników;
- nie uruchomiono automatycznej analizy AI i nie wyświetlono treści wiadomości, tokenów ani identyfikatorów Gmail.

## 3. Konfiguracja zdalna

- Google Cloud project: `jobmatch-gmail-test`;
- Supabase project ref: `apqtzsohcvaxqcsjwlxo`;
- tryb OAuth: `External / Testing`;
- zakres: `https://www.googleapis.com/auth/gmail.readonly`;
- test users: 3;
- zapisane sekrety: 7;
- wdrożone funkcje: 7.

Nazwy kont testowych oraz wartości sekretów nie są utrwalane w tym raporcie.

## 4. Walidacja

| Kontrola | Wynik |
| --- | --- |
| Migracja zdalna | PASS — `20260905191208_gmail_private_foundation.sql` zastosowana |
| Deploy Edge Functions | PASS — 7/7 |
| Callback bez poprawnego state | PASS — HTTP 303 |
| Sześć funkcji chronionych bez JWT | PASS — HTTP 401 |
| Preflight `gmail-search` z dozwolonego originu | PASS — HTTP 204 |
| OAuth Google w przeglądarce | PASS — powrót do `/import?gmail=connected` |
| Status połączenia | PASS — `active` |
| Wyszukiwanie Gmail | PASS — 19 wyników |
| Limit wyników | PASS — 19 <= 25 |
| Treść wiadomości lub tokeny w diagnostyce | PASS — nie wyświetlono |
| Manual PASS użytkownika | PASS — potwierdzony 6 września 2026 |
| `npm.cmd test`, typecheck i build | NOT RERUN — brak zmian funkcjonalnych od zatwierdzonego commita G1B.2 |
| Panel Gmail na ekranie importu | NOT IMPLEMENTED — zakres G2 |

## 5. Bezpieczeństwo i incydent rotacji

Pierwsza przerwana próba konfiguracji nie zachowała kompletu danych OAuth. Dane klienta i klucze techniczne zostały zastąpione, wcześniejsze klienty OAuth usunięto, a aktywne wartości zapisano bez ujawniania ich w Git ani w raporcie. Pozostał jeden aktywny klient OAuth przeznaczony do bezpiecznej rotacji.

## 6. Manualna weryfikacja

Użytkownik zatwierdził zakres tylko do odczytu przed przyznaniem dostępu Google i po zakończonym teście potwierdził decyzję `PASS G1B.3`.

Tymczasowa lokalna strona testowa została usunięta po weryfikacji. Ekran `Import raportu` nadal nie zawiera panelu Gmail, ponieważ jego implementacja należy do G2.

## 7. Blokery i znane ograniczenia

- G1B.3 nie obejmuje panelu „Wyszukaj na mailu” ani integracji z istniejącym koszykiem importu;
- test przeglądarkowy potwierdził OAuth, status i wyszukiwanie; import wybranej wiadomości, potwierdzenie receipt i odłączenie pozostają pokryte testami G1B.2, bez ręcznego przepływu UI w G1B.3;
- aplikacja OAuth pozostaje w trybie testowym i jest dostępna tylko dla dodanych test users;
- nie wykonano publicznej weryfikacji Google;
- niezwiązane pliki untracked pozostają poza proponowanym zakresem commita.

## 8. Bramka

```text
G1B.3 Google Cloud setup = PASS
Supabase migration/secrets/deploy = PASS
technical endpoint smoke = PASS
browser OAuth/status/search = PASS
manual user decision = PASS
G1B = CLOSED
G2 UI integration = STOP — NOT STARTED
```

Proponowany zakres commita: wyłącznie `docs/checkpoints/JobMatch_Gmail_G1B3_Checkpoint_Report.md`.

Proponowany komunikat:

```text
docs: record Gmail G1B.3 deployment pass
```
