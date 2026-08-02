# JobMatch — pre-audit Git inventory i plan podziału commitów

**Cel:** odczytowy podział aktualnego drzewa roboczego przed `AUDITafterCheckpoint07`.  
**Gałąź:** `master`  
**Ostatni commit:** `f2fb37e feat: complete real AI job match analysis flow`  
**Staging area:** pusta.  
**Uwaga:** `git diff --stat` obejmuje wyłącznie pliki śledzone; pliki oznaczone `??` zostały sklasyfikowane osobno.

## 1. Podsumowanie decyzji

Proponowane są **5 osobne commity**. Nie należy tworzyć commitu zbiorczego.

| Nr | Zakres | Proponowany komunikat | Status review |
| ---: | --- | --- | --- |
| 1 | Checkpoint 7 — źródła ofert | `feat: add live offer content source integration` | gotowy do osobnego review funkcjonalnego |
| 2 | Visual Alignment — Access Gate | `feat: rebuild JobMatch access gate visual design` | wymaga osobnego review wizualnego/PMO |
| 3 | AIDEAS — bezpieczeństwo `.env.example` | `chore: replace public Supabase config with env placeholders` | gotowy do review bezpieczeństwa |
| 4 | AIDEAS — kompatybilność timestampów | `fix: accept Supabase timestamp offsets in imported reports` | gotowy do review funkcjonalnego |
| 5 | AIDEAS — dokumentacja audytowa | `docs: add AIDEAS security and synthetic data audit evidence` | PMO review przed decyzją o publikacji dokumentów |

Finalny SQL z UUID kont Auth i raport CP7 nie są przypisane automatycznie do żadnego commitu; wymagają decyzji PMO (grupa G).

## 2. Pełna inwentaryzacja plików

### A. Checkpoint 7 — feature scope

| Plik | Typ | Decyzja |
| --- | --- | --- |
| `src/contracts/jobAnalysis.ts` | kod | commit 1 |
| `src/contracts/offerSource.ts` | kod | commit 1 |
| `src/schemas/offerSourceSchemas.ts` | kod/walidacja | commit 1 |
| `src/features/analysis/analysisOrchestrator.ts` | kod | commit 1 |
| `src/features/analysis/analysisOrchestrator.test.ts` | test | commit 1 |
| `src/features/analysis/offerContentProvider.ts` | kod | commit 1 |
| `src/features/analysis/offerContentProvider.test.ts` | test | commit 1 |
| `src/features/offers/offerContentFetcher.ts` | kod | commit 1 |
| `src/features/offers/offerContentFetcher.test.ts` | test | commit 1 |
| `src/features/offers/offerContentNormalizer.ts` | kod | commit 1 |
| `src/features/offers/offerContentNormalizer.test.ts` | test | commit 1 |
| `src/features/offers/offerSourceRepository.ts` | kod | commit 1 |
| `src/pages/ImportAnalysisPage.tsx` | kod/UI funkcjonalne | commit 1 |
| `src/pages/OffersPage.tsx` | kod/UI funkcjonalne | commit 1; sprawdzić przy stagingu, że nie zawiera hunków czysto wizualnych |
| `src/pages/OfferDetailsPage.tsx` | kod/UI funkcjonalne | commit 1 |
| `supabase/functions/fetch-offer-page/index.ts` | Edge Function | commit 1; wdrożenie było wykonywane oddzielnie od Git |
| `supabase/migrations/20260731_offer_page_sources.sql` | migracja | commit 1 |

**Zakres:** znormalizowane źródła ofert RocketJobs, repozytoria, migracja, pobranie po stronie Edge Function, jakość źródła i UI postępu. Ten commit nie powinien zawierać assetów Access Gate ani dokumentacji AIDEAS.

### B. Visual Alignment

| Plik | Typ | Decyzja |
| --- | --- | --- |
| `src/app/AppShell.tsx` | kod UI | commit 2 |
| `src/features/access/AccessGate.tsx` | kod UI | commit 2 |
| `src/styles/global.css` | style | commit 2 |
| `public/assets/jobmatch-logo.png` | asset używany przez `AppShell` i `AccessGate` | commit 2 |
| `public/assets/jobmatch-access-background-v2.png` | asset używany w `global.css` | commit 2 |
| `public/assets/jobmatch-access-art.png` | asset nieodwoływany przez kod | grupa G — decyzja PMO przed commitem |

**Ryzyko mieszania:** `AccessGate.tsx` i `global.css` są rozbudowaną zmianą wizualną. Nie należy łączyć ich z CP7 ani z poprawką timestampu. `jobmatch-access-art.png` nie ma obecnie referencji w `src`; nie należy dodawać go domyślnie tylko dlatego, że znajduje się w `public/`.

### C. AIDEAS — security and audit documentation

| Plik | Typ | Decyzja |
| --- | --- | --- |
| `.env.example` | konfiguracja przykładowa | commit 3 |
| `docs/audits/JobMatch_AIDEAS_Security_Synthetic_HTTP_Audit.md` | dokumentacja audytowa | commit 5, po review PMO |

Zmiana `.env.example` zastępuje konkretne wartości placeholderami. Jest logicznie niezależna od dokumentu audytowego oraz od timestampu.

### D. AIDEAS — timestamp compatibility fix

| Plik | Typ | Decyzja |
| --- | --- | --- |
| `src/schemas/importSchemas.ts` | poprawka walidacji | commit 4 |
| `src/schemas/importSchemas.test.ts` | test regresji | commit 4 |
| `docs/audits/JobMatch_AIDEAS_Import_Format_Diagnosis.md` | diagnoza źródła poprawki | commit 5, po review PMO |

Ta paczka zmienia wyłącznie `importedAt` na `z.string().datetime({ offset: true })` i dodaje trzy testy timestampów. Nie należy łączyć jej z danymi syntetycznymi ani migracją CP7.

### E. AIDEAS — synthetic data / SQL / audit evidence

| Plik | Typ | Decyzja |
| --- | --- | --- |
| `docs/audits/JobMatch_AIDEAS_Synthetic_Data_Plan_and_SQL.md` | plan i SQL do akceptacji | commit 5, po review PMO |
| `docs/audits/JobMatch_AIDEAS_Synthetic_Data_UI_Visibility_Audit.md` | dowód diagnostyczny | commit 5, po review PMO |
| `docs/audits/JobMatch_PreAudit_Git_Inventory_and_Commit_Plan.md` | niniejszy raport | commit 5, po review PMO |

Te dokumenty nie są wymagane przez runtime aplikacji. Powinny wejść do osobnego commitu dokumentacyjnego wyłącznie, jeżeli PMO chce je utrzymywać w repozytorium.

### F. Temporary or private files — do not commit

| Plik / katalog | Typ | Powód |
| --- | --- | --- |
| `po dodaniu billing w openAI nadal jest blad.png` | screenshot diagnostyczny | plik roboczy, nie jest assetem produktu ani testem automatycznym |
| `test rapot 1.pdf` | lokalny PDF testowy | źródłowy plik testowy; nie jest fixture kontrolowanym przez testy |
| `design/access-gate-proposals/proposal-1-warm-editorial.png` | propozycja wizualna | materiał projektowy, nieużywany przez runtime |
| `design/access-gate-proposals/proposal-2-career-journey.png` | propozycja wizualna | materiał projektowy, nieużywany przez runtime |

Nie należy automatycznie dodawać całych katalogów `design/`, `public/` ani `docs/`.

### G. Unclear — requires PMO decision

| Plik | Typ | Powód decyzji PMO |
| --- | --- | --- |
| `docs/audits/JobMatch_AIDEAS_Synthetic_Data_FINAL_SQL_READY_FOR_INSERT.sql` | SQL z UUID kont Auth | zawiera realne UUID syntetycznych kont w projekcie; nie są sekretami, ale plik ma charakter operacyjny i może nie powinien być utrzymywany w historii repozytorium |
| `JobMatch_Checkpoint_7_Final_Report.md` | raport checkpointu | materiał przekazania poza standardowym katalogiem `docs/`; ustalić, czy ma być artefaktem repozytorium czy dokumentem zewnętrznym |
| `public/assets/jobmatch-access-art.png` | asset | brak referencji w kodzie; ustalić, czy ma być wykorzystany w kolejnym zakresie, czy pozostawiony poza repozytorium |

## 3. Konfikty i ryzyka mieszania zakresów

1. `src/pages/OffersPage.tsx` należy funkcjonalnie do CP7, ale jest częścią widocznego UI. Przed stagingiem trzeba sprawdzić hunkowy diff; obecnie zmiana dotyczy źródła danych/etykiet oraz licznika analiz, nie globalnego stylu.
2. `docs/` zawiera dokumenty z trzech różnych tematów: security, syntetyczne dane oraz timestamp. Nie wolno dodawać katalogu rekurencyjnie bez zatwierdzonej listy plików.
3. `public/` zawiera dwa używane assety Visual Alignment i jeden nieużywany. Dodanie całego katalogu przypadkowo dodałoby element wymagający decyzji PMO.
4. Plik SQL finalny ma wartości UUID kont Auth. Nie zawiera kluczy ani haseł, ale powinien otrzymać świadomą decyzję o przechowywaniu w Git.
5. `design/`, screenshot i PDF nie wspierają builda, testów ani runtime; ich obecność w commicie utrudni audyt i historię zmian.

## 4. Dokładny plan stagingu — do wykonania dopiero po zgodzie

### Commit 1 — Checkpoint 7

```powershell
git add src/contracts/jobAnalysis.ts src/contracts/offerSource.ts src/schemas/offerSourceSchemas.ts src/features/analysis/analysisOrchestrator.ts src/features/analysis/analysisOrchestrator.test.ts src/features/analysis/offerContentProvider.ts src/features/analysis/offerContentProvider.test.ts src/features/offers/offerContentFetcher.ts src/features/offers/offerContentFetcher.test.ts src/features/offers/offerContentNormalizer.ts src/features/offers/offerContentNormalizer.test.ts src/features/offers/offerSourceRepository.ts src/pages/ImportAnalysisPage.tsx src/pages/OffersPage.tsx src/pages/OfferDetailsPage.tsx supabase/functions/fetch-offer-page/index.ts supabase/migrations/20260731_offer_page_sources.sql
git diff --cached --stat
git diff --cached
git commit -m "feat: add live offer content source integration"
```

### Commit 2 — Visual Alignment

```powershell
git add src/app/AppShell.tsx src/features/access/AccessGate.tsx src/styles/global.css public/assets/jobmatch-logo.png public/assets/jobmatch-access-background-v2.png
git diff --cached --stat
git diff --cached
git commit -m "feat: rebuild JobMatch access gate visual design"
```

### Commit 3 — `.env.example`

```powershell
git add .env.example
git diff --cached -- .env.example
git commit -m "chore: replace public Supabase config with env placeholders"
```

### Commit 4 — timestamp offset

```powershell
git add src/schemas/importSchemas.ts src/schemas/importSchemas.test.ts
git diff --cached -- src/schemas/importSchemas.ts src/schemas/importSchemas.test.ts
git commit -m "fix: accept Supabase timestamp offsets in imported reports"
```

### Commit 5 — dokumentacja audytowa, tylko po decyzji PMO

```powershell
git add docs/audits/JobMatch_AIDEAS_Security_Synthetic_HTTP_Audit.md docs/audits/JobMatch_AIDEAS_Synthetic_Data_Plan_and_SQL.md docs/audits/JobMatch_AIDEAS_Synthetic_Data_UI_Visibility_Audit.md docs/audits/JobMatch_AIDEAS_Import_Format_Diagnosis.md docs/audits/JobMatch_PreAudit_Git_Inventory_and_Commit_Plan.md
git diff --cached --stat
git diff --cached
git commit -m "docs: add AIDEAS security and synthetic data audit evidence"
```

`docs/audits/JobMatch_AIDEAS_Synthetic_Data_FINAL_SQL_READY_FOR_INSERT.sql` nie jest częścią żadnego z powyższych stagingów. Tak samo poza stagingiem pozostają `JobMatch_Checkpoint_7_Final_Report.md`, `design/`, `po dodaniu billing w openAI nadal jest blad.png`, `test rapot 1.pdf` i `public/assets/jobmatch-access-art.png`.

## 5. Stan Git w chwili audytu

`git status --short` zawiera modyfikacje śledzonych plików Checkpointu 7, Visual Alignment, `.env.example`, poprawki timestampu oraz opisane wyżej pliki nieśledzone. Raport nie zmienia żadnego z wcześniej istniejących plików.

GIT INVENTORY GOTOWY DO PMO REVIEW. NIE WYKONANO GIT ADD, COMMITU, PUSH ANI ZMIAN W PLIKACH.
