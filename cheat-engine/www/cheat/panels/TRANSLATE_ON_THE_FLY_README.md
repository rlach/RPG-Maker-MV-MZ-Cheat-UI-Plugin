# Translate On The Fly - Documentation

## Opis
Panel "Translate On The Fly" pozwala na automatyczne tłumaczenie dialogów i wiadomości w grze w czasie rzeczywistym za pomocą Google Translate.

## Funkcjonalność

### Główne funkcje:
1. **Automatyczne tłumaczenie** - wszystkie teksty w grze są automatycznie tłumaczone gdy funkcja jest włączona
2. **Wybór języków** - możliwość wyboru języka źródłowego i docelowego
3. **Cache tłumaczeń** - raz przetłumaczone teksty są zapisywane w cache dla szybszego działania
4. **Statystyki** - licznik przetłumaczonych tekstów oraz podgląd ostatniego tłumaczenia

### Domyślne ustawienia:
- **Język źródłowy**: Japoński (ja)
- **Język docelowy**: Angielski (en)
- **Status**: Wyłączony

## Jak używać

### Włączenie tłumaczenia:
1. Otwórz menu cheat (domyślnie klawiszem)
2. Przejdź do: **Settings → Translate On The Fly**
3. Zaznacz checkbox **"Enable Real-time Translation"**

### Zmiana języków:
1. W panelu wybierz język źródłowy z listy "Source Language"
2. Wybierz język docelowy z listy "Target Language"
3. Ustawienia są automatycznie zapisywane

### Dostępne języki:
- English (en)
- Japanese (ja)
- Spanish (es)
- French (fr)
- German (de)
- Italian (it)
- Portuguese (pt)
- Russian (ru)
- Korean (ko)
- Chinese Simplified (zh-CN)
- Chinese Traditional (zh-TW)
- Polish (pl)

## Implementacja techniczna

### Architektura:
- **Hook na Game_Message.prototype.allText()** - przechwytuje teksty przed wyświetleniem
- **Cache system** - Map przechowująca przetłumaczone teksty (klucz: język_źródłowy-język_docelowy-tekst)
- **Asynchroniczne tłumaczenie** - tłumaczenia działają w tle, nie blokując gry
- **MyMemory Translation API** - wykorzystuje darmowe API tłumaczeniowe (https://mymemory.translated.net)

### API Translation:
- **Serwis**: MyMemory Translation API
- **Limit**: 10,000 znaków dziennie (wersja darmowa)
- **Bez wymagań**: Nie wymaga klucza API ani rejestracji
- **Metoda**: HTTP GET request przez axios

### Wydajność:
- Raz przetłumaczony tekst jest zapisywany w pamięci
- Zmiana języków czyści cache
- Teksty są tłumaczone tylko raz

### Pliki:
- `cheat/panels/TranslateOnTheFlyPanel.js` - główny komponent panelu
- `cheat/CheatModal.js` - rejestracja w menu

## Uwagi

### Ograniczenia:
- Wymaga połączenia z internetem (używa MyMemory API)
- Limit 10,000 znaków dziennie w wersji darmowej
- Tłumaczenie odbywa się asynchronicznie - pierwsze wyświetlenie może pokazać oryginalny tekst
- Cache jest trzymany tylko w pamięci - po restarcie gry trzeba tłumaczyć od nowa
- Jakość tłumaczenia zależy od API MyMemory

### Wskazówki:
- Dla najlepszych rezultatów, zostaw grę na chwilę przy pierwszym dialogu aby tłumaczenie zostało załadowane
- Możesz zmienić języki w dowolnym momencie - cache zostanie wyczyszczony
- Statystyki pokazują ile tekstów zostało przetłumaczonych w bieżącej sesji

## Przyszłe usprawnienia (opcjonalne)

Potencjalne ulepszenia które można dodać:
1. Persistent cache (zapis do localStorage/pliku)
2. Prekompilacja często używanych tekstów
3. Wybór różnych silników tłumaczenia
4. Eksport/import przetłumaczonych tekstów
5. Manualna edycja tłumaczeń
