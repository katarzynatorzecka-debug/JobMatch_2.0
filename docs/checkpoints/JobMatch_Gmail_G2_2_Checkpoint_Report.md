# JobMatch — Gmail G2.2: raport checkpointu

**Data:** 6 września 2026
**Status:** IMPLEMENTATION PASS — RUNTIME SEARCH/IMPORT PASS — COMMIT AUTHORIZED
**Zakres:** wyszukiwanie metadanych Gmail, wybór wiadomości i import raportów do istniejącego koszyka; bez automatycznego uruchomienia analizy AI

## 1. Stan Git na wejściu

- checkout: `C:\Users\katar\OneDrive\Desktop\AIDEAS VC\NewJobCopilot\JobMatch_2.0`;
- branch: `feat/cv-parser-v2`;
- HEAD: `cce3f26 feat: add Gmail connection panel`;
- branch był o pięć commitów przed `origin/feat/cv-parser-v2`;
- niezwiązane pliki `Wideo — skrót .lnk` oraz `docs/JobMatch_Gmail_Implementation_Plan_v1.1.md` pozostawały untracked i nie zostały zmienione;
- nie wykonano `git add`, commita ani push dla G2.2.

## 2. Zrealizowany zakres

- aktywne połączenie Gmail udostępnia przycisk „Wyszukaj raporty”;
- panel wyszukiwania rozwija się na pełną szerokość obszaru źródeł;
- dodano preset RocketJobs i filtry: nadawca/domena, temat, data od i data do;
- domyślny backendowy zakres pozostaje ograniczony do ostatnich 30 dni;
- wyniki prezentują wyłącznie bezpieczny nadawca, temat, datę oraz stan wcześniejszego importu;
- użytkownik może zaznaczyć jedną lub wiele wiadomości;
- wiadomości oznaczone „Już zaimportowano” są wyłączone z ponownego wyboru;
- przycisk „Importuj zaznaczone” pobiera RAW wyłącznie dla wybranych wiadomości przez Edge Function;
- klient usuwa pola spoza jawnego kontraktu podglądu i importu;
- raporty zwrócone przez Edge Function są walidowane schematem `ImportedReport` v2;
- zaimportowane raporty trafiają do istniejącego koszyka i nie uruchamiają analizy AI;
- widoczna nazwa raportu Gmail zawiera czytelną datę i godzinę wiadomości zamiast technicznego UUID;
- techniczny `fileName` pozostaje w danych wewnętrznych i nie jest renderowany użytkownikowi;
- receipt Gmail jest zachowywany w istniejącym stanie `sessionStorage`;
- receipt jest potwierdzany dopiero po sukcesie `workspace_import_report` i ustawieniu aktywnej sesji;
- dodano obsługę kolejnej strony wyników przez `nextPageToken`;
- dodano stany: początkowy, ładowanie, brak wyników, błędny zakres dat, utracone połączenie, brak uprawnień, limit API, timeout, błąd dostawcy i błędy importu;
- wszystkie nowe teksty mają wersję polską i angielską.

## 3. Zmienione pliki

- `src/features/gmail/components/GmailImportPanel.tsx`;
- `src/features/gmail/gmailApiClient.ts`;
- `src/features/gmail/gmailApiClient.test.ts`;
- `src/features/gmail/gmailEdgeContracts.ts`;
- `src/features/gmail/gmailReportPresentation.ts`;
- `src/features/gmail/gmailReportPresentation.test.ts`;
- `src/features/import/importBatchState.ts`;
- `src/features/analysis/integratedAnalysisFlow.ts`;
- `src/features/analysis/integratedAnalysisFlow.test.ts`;
- `src/pages/ImportAnalysisPage.tsx`;
- `src/i18n/translationTypes.ts`;
- `src/i18n/translations/pl.ts`;
- `src/i18n/translations/en.ts`;
- `src/styles/global.css`;
- ten raport checkpointu.

## 4. Walidacja

| Kontrola | Wynik |
| --- | --- |
| Testy celowane Gmail, prezentacji raportu i integracji receipt | PASS — 3 pliki, 16 testów |
| Pełne `npm.cmd test` | PASS — 99 plików, 492 testy |
| `npm.cmd run typecheck` | PASS |
| `npm.cmd run build` | PASS |
| `git diff --check` | PASS |
| Rozwinięcie panelu wyszukiwania | PASS |
| Preset RocketJobs | PASS — 19 podglądów |
| Limit odpowiedzi | PASS — 19 <= 25 |
| Lista nadawca/temat/data | PASS — widoczna w UI; dane nieutrwalone w raporcie |
| Zaznaczenie wiadomości | PASS — import aktywny dopiero po wyborze |
| Import jednej wybranej wiadomości | PASS — raport dodany do koszyka |
| Czytelna nazwa raportu Gmail | PASS — data i godzina widoczne, UUID i `.eml` niewidoczne |
| Automatyczna analiza AI | PASS — nie uruchomiono |
| Odtworzenie koszyka po odświeżeniu | PASS |
| Zachowanie receipt w modelu koszyka | PASS — zapisane wraz z raportem |
| Potwierdzenie receipt po imporcie workspace | PASS w teście integracyjnym kolejności |
| Rzeczywiste oznaczenie „Już zaimportowano” | NOT RUN — wymagałoby zatwierdzenia importu workspace przez uruchomienie analizy |
| Paginacja runtime | NOT RUN — konto testowe zwróciło 19 wyników bez kolejnej strony |
| Odłączenie | NOT RUN — zachowano działające połączenie testowe |

Build nadal emituje istniejące ostrzeżenie Vite o chunkach większych niż 500 kB.

## 5. Bezpieczeństwo i prywatność

- wyszukiwanie nie pobiera RAW wiadomości;
- RAW pobierany jest po stronie Edge wyłącznie dla jawnie zaznaczonych wiadomości;
- treść RAW, tokeny i jawny Gmail message id nie są częścią kontraktu klienta;
- klient przebudowuje odpowiedzi z dozwolonych pól i odrzuca nieprawidłowe schematy;
- identyfikator receipt nie jest częścią widocznej nazwy raportu;
- tematy wiadomości użyte w teście nie są zapisane w raporcie ani logach repozytorium;
- test runtime nie uruchomił analizy AI;
- przetestowano jedną wiadomość, pozostawiając jej receipt w stanie `staged` do czasu właściwego importu workspace.

## 6. Blokery i znane ograniczenia

- rzeczywisty `committed` receipt i etykieta „Już zaimportowano” wymagają świadomego uruchomienia istniejącej analizy, ponieważ dopiero wtedy aplikacja wykonuje `workspace_import_report`;
- kolejna strona wyników nie była dostępna na koncie testowym; obsługę `nextPageToken` potwierdzają kontrakt i testy;
- filtr nadawcy jest domyślnie przywracany do zatwierdzonego adresu RocketJobs, gdy backend otrzyma pustą wartość;
- importowane raporty są zachowywane w sesji bieżącej karty przeglądarki zgodnie z istniejącym mechanizmem koszyka;
- szeroki układ i pełna lista wymagają oceny użytkownika;
- niezwiązane pliki untracked pozostają poza proponowanym zakresem commita.

## 7. Bramka

```text
G2.2 implementation = PASS
tests/typecheck/build = PASS
authenticated Gmail search = PASS
selected report import to basket = PASS
automatic AI analysis = NOT TRIGGERED
human runtime review of report label = PASS
git add/commit = AUTHORIZED BY USER
git push = STOP — NOT AUTHORIZED
```

Zakres zatwierdzonego commita: wyłącznie czternaście plików implementacji i ten raport G2.2. Wykluczyć `Wideo — skrót .lnk` oraz `docs/JobMatch_Gmail_Implementation_Plan_v1.1.md`.

Proponowany komunikat:

```text
feat: add Gmail search and report import
```
