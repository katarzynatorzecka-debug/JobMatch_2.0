# JobMatch — Gmail G1A: raport checkpointu

**Data:** 5 września 2026
**Status:** READY FOR REVIEW
**Zakres:** neutralny kontrakt importu i Gmail na mockach

## 1. Zrealizowany zakres

- rozdzielono pochodzenie raportu (`reportProvider`) od kanału pozyskania (`acquisitionChannel`);
- dodano wersję 2 kontraktu `ImportedReport` oraz normalizację zapisanych raportów wersji 1;
- zachowano kompatybilne wartości `source` używane przez istniejący workspace;
- dostosowano `.eml`, import linku, demo i przywracanie workspace do wspólnego buildera raportu;
- canonical fingerprint opiera się na pochodzeniu oferty, a nie kanale importu;
- dodano neutralne odczytywanie RFC822 z `ArrayBuffer`;
- dodano typowane DTO Gmail, builder zapytań i obsługę `format=raw`/base64url;
- dodano mock gateway oraz adapter importujący maksymalnie pięć wiadomości równolegle;
- Gmail RAW jest parsowany do `ImportedReport` i nie jest przekazywany do UI;
- dodano komunikaty błędów Gmail w PL i EN;
- nie dodano automatycznego uruchamiania analizy AI.

## 2. Testy

Potwierdzono:

- równoważność danych oferty z `.eml` i Gmail RAW;
- wiadomości text-only, HTML-only i multipart;
- ignorowanie załączników;
- kontrolowane błędy dla uszkodzonej, pustej i zbyt dużej wiadomości;
- dekodowanie base64url bez paddingu;
- filtry nadawcy, tematu, dat i paginacji;
- limit 25 wyników oraz domyślne ostatnie 30 dni;
- maksymalnie pięć równoległych pobrań;
- wspólny fingerprint oferty niezależnie od kanału `.eml`/Gmail;
- regresję importu bezpośredniego linku;
- zgodność słowników PL/EN.

| Polecenie | Wynik |
| --- | --- |
| `npm.cmd test` | PASS — 85 plików, 441 testów |
| `npm.cmd run typecheck` | PASS |
| `npm.cmd run build` | PASS |
| `git diff --check` | PASS |

Build zawiera istniejące ostrzeżenie Vite o chunku większym niż 500 kB. Nie jest ono związane z G1A.

## 3. Granice checkpointu

Nie wykonano:

- migracji bazy danych;
- zmian RLS;
- utworzenia lub wdrożenia Edge Functions Gmail;
- konfiguracji Google Cloud;
- ustawiania sekretów;
- OAuth;
- połączenia z prawdziwym kontem Gmail;
- panelu Gmail w interfejsie;
- testu przeglądarkowego.

Pole `sourceType` pozostaje kompatybilne z istniejącym workspace, natomiast neutralne `reportProvider` i `acquisitionChannel` są już obecne w wejściu workspace i lokalnych metadanych. Ich trwały model bazodanowy należy do G1B.

## 4. Bramka

```text
G1A = READY FOR REVIEW
G1B = STOP — wymaga osobnej zgody, migracji, Google Cloud i sekretów
```

Proponowany zakres commita: wyłącznie kontrakty importu, adapter/mock Gmail, testy, tłumaczenia i ten raport.

Proponowany komunikat commita:

```text
feat: add mocked Gmail import foundation
```
