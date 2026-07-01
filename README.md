# Poslovni plan i tehnička dokumentacija — Football PredictorZ

Dobrodošli na službenu prezentaciju i tehničku dokumentaciju platforme **Football PredictorZ** (v2.0).

Ovaj dokument služi kao poslovni plan i tehnički vodič za aplikaciju, detaljno opisujući njezinu svrhu, društvenu vrijednost, pravila igre, tehničku arhitekturu, te dosadašnji poslovni uspjeh.

---

## 1. Sažetak Projekta (Executive Summary)

**Football PredictorZ** je napredna, visoko interaktivna sportska platforma namijenjena prognozi rezultata nogometnih utakmica i dugoročnih turnirskih ishoda. Koncipirana je kao Progressive Web App (PWA) koja korisnicima omogućuje natjecanje u javnim i privatnim ligama uz trenutno (real-time) praćenje rezultata.

### Ključni podaci o projektu:
* **Trenutna aktivnost**: Platforma je aktivno konfigurirana za **FIFA Svjetsko prvenstvo 2026.** (`wc2026`) i englesku **Premier ligu 2025/26.** (`pl2526`).
* **Trenutni uspjeh**: U igri aktivno sudjeluje **26 igrača** koji svakodnevno prate utakmice, unose prognoze i natječu se za pobjedu u ligama.
* **Glavne značajke**:
  1. Real-time sinkronizacija rezultata i tablica uživo pomoću Firebase baze podataka.
  2. Sustav privatnih liga s podrškom za administrativno praćenje plaćanja.
  3. Lokalne vremenske zone automatski prilagođene svakom korisniku.
  4. Jedinstvena zaštita integriteta ljestvice kroz sustav zaključavanja predviđanja (anti-copy-cat mehanizam).

---

## 2. Svrha Projekta i Društvena Vrijednost

Uobičajeno praćenje sportskih natjecanja često je pasivno. **Football PredictorZ** mijenja taj odnos i pretvara sportske događaje u dinamično, gamificirano društveno iskustvo.

### Ključni stupovi vrijednosti:
* **Povezivanje zajednice**: Privatne lige okupljaju prijatelje, obitelj i radne kolege, stvarajući stalne teme za zdravu komunikaciju i interakciju.
* **Analitičko razmišljanje**: Umjesto pukog nagađanja, igrači analiziraju formu timova, povijest susreta, izostanke ključnih igrača i statistiku kako bi ostvarili prednost na ljestvici.
* **Integritet i fer igra**: Korisnici moraju zaključati vlastitu prognozu za utakmicu kako bi vidjeli prognoze drugih, čime se eliminira prepisivanje rezultata u zadnji čas.
* **Pošten financijski model**: U natjecateljskim ligama ulazna naknada iznosi fiksno **€20** po sudioniku. Pobjednik lige osvaja **100% ukupnog fonda** (Winner-Takes-All), a platforma zadržava **0% provizije** (0% platform fee), što potiče transparentnost i povjerenje.

---

## 3. Pravila Igre i Sustav Bodovanja

Bodovanje je optimizirano kako bi se nagradila preciznost prognoza, a istovremeno očuvala dinamika natjecanja.

### 3.1 Utakmice (Skupna faza i lige)
Korisnici unose prognoze rezultata utakmica prije početka svakog susreta. Bodovi se dodjeljuju na sljedeći način:
* **Točan rezultat (Exact Score) — 3 boda**: Igrač pogađa točan rezultat utakmice (npr. prognoza 2:1, završilo 2:1).
* **Točan ishod (Correct Outcome) — 1 bod**: Igrač pogađa pobjednika ili neriješen ishod, ali s drugačijim omjerom golova (npr. prognoza 2:0, završilo 3:1).
* **Netočan ishod — 0 bodova**: Promašeni ishod i rezultat utakmice.

#### Pravila za Nokaut Fazu:
* Rezultat se ocjenjuje prema stanju na kraju produžetaka (nakon 120 minuta). Jedanaesterci se ne računaju u konačan rezultat prognoze (susret koji završi penalima službeno je neriješen).
* Ukoliko igrač prognozira neriješeni rezultat u nokaut fazi, obavezan je odabrati ekipu koja prolazi dalje (bilo kroz produžetke ili jedanaesterce). Pogodak prolaza donosi **dodatni +1 bonus bod**.

---

### 3.2 Globalna Predviđanja (Turnirska)
Prije početka prve utakmice prvenstva, igrači moraju zaključati svoja dugoročna predviđanja. Ova predviđanja nose značajan broj bodova i često odlučuju o konačnom pobjedniku:
* **Prvak (Champion)**: 10 bodova.
* **Drugo mjesto**: 5 bodova.
* **Treće mjesto**: 5 bodova.
* **Najbolji strijelac (Zlatna kopačka)**: 5 bodova.
* **Najbolji asistent**: 5 bodova.
* **Najbolji vratar (Najviše clean sheets)**: 5 bodova.

---

### 3.3 Određivanje Poretka i Tiebreaker
Korisnici se rangiraju prema ukupnom broju bodova. U slučaju jednakog broja bodova na ljestvici, primjenjuje se **tiebreaker pravilo**: prednost na tablici ima korisnik s većim brojem pogođenih **točnih rezultata (Exact Scores, 3 boda)**.

---

## 4. Tehnička Arhitektura

Football PredictorZ je izgrađen pomoću modernih web tehnologija prilagođenih za rad na svim uređajima (mobile-first dizajn):

* **Frontend**: React + Vite (brz rad, optimizirano vrijeme učitavanja).
* **Dizajn**: Vanilla CSS sa staklenim elementima (glassmorphism) i dinamičkim mikrostilovima, u potpunosti prilagođen mobilnim telefonima.
* **Baza podataka**: Firebase Realtime Database. Omogućuje trenutačni prijenos podataka i promjena u ljestvici uživo tijekom trajanja utakmice.
* **Autentifikacija**: Firebase Authentication za siguran login korisnika.
* **Hosting**: Firebase Hosting (optimizirano za isporuku preko globalnog CDN-a te konfigurirano kao PWA).
* **Integracija s API-jem**: Periodična sinkronizacija s API-Football (`apifootball.com`) za preuzimanje točnih rezultata, statistike strijelaca, asistenata i clean sheetova.

---

## 5. Kodna Struktura i Opis Glavnih Modula

Kodna baza je strukturirana modularno, odvajajući logiku prikaza, pomoćne funkcije i servise:

* **`src/components/AdminPanel.jsx`**: Centralna ploča za administraciju. Omogućuje ručni unos rezultata, sinkronizaciju s API-jem, konfiguraciju API ključeva, upravljanje pravima korisnika (User, Admin, Super Admin), odobravanje uplata u ligama te izravno uređivanje globalnih prognoza korisnika uz automatsku rekalkulaciju ljestvice.
* **`src/components/Leaderboard.jsx`**: Prikaz poredaka u ligama. Uključuje statistiku korisnika (omjeri pogodaka) i inovativnu simulaciju bodova uživo na temelju trenutnih rezultata. Klikom na svakog korisnika otvara se detaljan portal s njegovim prognozama.
* **`src/components/MatchList.jsx`**: Sučelje za pregled rasporeda i unos prognoza. Podržava automatski prikaz vremenskih zona, prepoznavanje neriješenih rezultata u nokaut fazi s brzim odabirom tima za prolaz te jasne indikacije o statusu zaključavanja.
* **`src/components/PlayerStats.jsx`**: Modul za praćenje statistike igrača. Sadrži tablice najboljih strijelaca, asistenata i vratara s ugrađenim administratorskim kontrolama za ručnu izmjenu i brzi vertikalni brojač (increment/decrement), te opciju 'Tko je odabrao' za uvid u globalne prognoze drugih korisnika.
* **`src/utils/matchData.js`**: Sadrži uslužne matematičke funkcije za izračun bodova (`calculatePoints`) i rekurzivno rješavanje knockout faza (`resolveKnockoutMatches`) iz baze podataka kako bi se automatski kreirale prave momčadi u kosturu natjecanja.

---

## 6. Trenutni Uspjeh i Plan Razvoja

Projekt je u potpunosti funkcionalan i uspješno okuplja **26 aktivnih natjecatelja**.

### Buduće smjernice razvoja:
1. Proširenje platforme na UEFA Ligu prvaka i druga nacionalna prvenstva.
2. Uvođenje push obavijesti (podsjetnika) za korisnike prije zatvaranja unosa za utakmice.
3. Napredni analitika (kretanje pozicije kroz kola u obliku interaktivnih grafikona).
