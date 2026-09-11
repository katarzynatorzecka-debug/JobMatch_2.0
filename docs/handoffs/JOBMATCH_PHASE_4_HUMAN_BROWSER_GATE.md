# JOBMATCH — PHASE 4 HUMAN BROWSER GATE

Wykonaj ten test w osobnej sesji ChatGPT w Chrome. Codex nie wykonuje browser smoke.
Nie zmieniaj kodu, migracji ani Git. Nie poprawiaj zakładki Oferty i nie rozpoczynaj Phase 4.1 ani Phase 5.

## Cel

Potwierdzić, że jedna aktywna paczka importu pozostaje tą samą paczką po:

`/import → analiza → /offers → /import → refresh → logout/login`.

## Przebieg

1. Uruchom aktualny JobMatch i zaloguj się na to samo konto authenticated workspace.
2. Wejdź na `/import`, kliknij `Zacznij od nowa` i zaimportuj `rocketjobs-report-2.eml` (raport z 2 ofertami).
3. Potwierdź przed analizą: dokładnie 1 raport i dokładnie 2 widoczne oferty. Uruchom jedno `Przeprowadź analizę`.
4. Po zakończeniu zapisz z ekranu lub dołączonego logu: `import_session_id` (jeśli jest dostępny), nazwę raportu, tytuły/ID obu ofert, Hard Filter, score, coverage, confidence, reliability i freshness.
5. Przejdź do `/offers`. Wyszukaj obie oferty po tytule lub ID i potwierdź, że są obecne oraz mają te same zapisane wyniki.
6. Wróć do `/import`. Musi być ten sam raport, ta sama sesja importu, te same 2 oferty i te same wyniki HF/AI.
7. Wykonaj refresh strony. Ponownie potwierdź ten sam raport, `import_session_id`, 2 oferty i wyniki.
8. Wykonaj logout, następnie login na to samo konto. Ponownie potwierdź ten sam raport, `import_session_id`, 2 oferty i wyniki.

Nie uruchamiaj ponownie analizy przy krokach 5–8. Reuse/replay ma nie powodować nowego provider call.

## Kryterium wyniku

Zwróć krótki raport:

```text
JOBMATCH — PHASE 4 HUMAN BROWSER GATE RESULT
VERDICT: PASS albo BLOCKED
URL/build:
import_session_id przed nawigacją:
import_session_id po powrocie:
import_session_id po refreshu:
import_session_id po reloginie:
raport:
oferty i ID:
HF/AI results:
score / coverage / confidence / reliability / freshness:
provider calls: initial=..., replay/navigation/refresh/relogin=...
evidence: krótki opis lub screenshoty
BLOCKER: tylko jeśli wystąpił, z dokładnym krokiem i objawem
```

PASS tylko wtedy, gdy identyfikator sesji, raport, 2 oferty oraz zapisane wyniki są spójne we wszystkich punktach. Przy rozbieżności — `BLOCKED`; nie naprawiaj jej w tej sesji.
