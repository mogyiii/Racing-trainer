# **Motor Skill Trainer \- Izommemória Fejlesztő Szoftver**

Ez a dokumentum egy technikai tervet vázol fel egy olyan egyedi szoftver fejlesztéséhez, amely segít a szimulátoros kigyorsítási technika (pedál- és kormánykezelés) tökéletesítésében, lecsupaszítva minden zavaró vizuális tényezőt.

## ---

**1\. Koncepció**

A cél az **izommemória** fejlesztése. A szoftver nem pályát vagy autót renderel, hanem a bemeneti adatokat (input) hasonlítja össze egy ideális matematikai görbével, és vizuális/auditív visszajelzést ad a hibákról.

## **2\. Technikai Architektúra**

### **Frontend & API**

* **Környezet:** Angular vagy Vanilla JavaScript (minimalista megközelítés a késleltetés elkerülése végett).  
* **Adatbevitel:** WebHID API. Ez lehetővé teszi a kormánykerék és pedálok (Logitech, Thrustmaster, Fanatec) nyers adatainak elérését közvetlenül a böngészőből.  
* **Megjelenítés:** HTML5 Canvas API (60+ FPS frissítéssel a sima görbe-megjelenítéshez).

### **Adatfeldolgozás (Normalizálás)**

A különböző hardverek más-más tartományban küldenek adatokat (pl. 0-255 vagy 0-65535). Ezt le kell képezni egy egységes **0.0 \- 1.0** skálára.

* throttle\_norm \= current\_raw / max\_raw  
* steering\_norm \= (current\_raw \- center\_raw) / range

## ---

**3\. Funkcionális Modulok**

### **A. "The Grip Model" (Tapadási Algoritmus)**

Mivel nincs teljes fizikai motor, egy absztrakt modellt használunk, ami a kormányállás és a gázpedál összefüggését figyeli.

* **Képlet:** *L \= 1.0 \- (Math.abs(steering \- 0.5) \* k)*  
* Ahol *k* egy érzékenységi szorzó (pl. 1.2).  
* **Logika:** Ha a gázpedál állása meghaladja *L* értékét, a rendszer "kipörgést" jelez.

### **B. Gyakorló Módok**

#### **1\. "Curve Follower" (Görbekövetés)**

* A képernyőn egy előre definiált **Ease-in-out** vagy **S-görbe** halad át.  
* A felhasználónak a gázpedállal egy pöttyöt kell a görbén tartania.  
* **Cél:** A láb finommotorikus mozgásának fejlesztése a 0-30% közötti tartományban.

#### **2\. "Reaction Drill" (Reakciós gyakorlat)**

* A szoftver hirtelen változtatja a "virtuális kormányállást".  
* A felhasználónak azonnal korrigálnia kell a gázpedállal a tapadási limit (*L*) alá.

## ---

**4\. Megvalósítási Útmutató (Lépésről-lépésre)**

1. **Hardver Kapcsolat:** HID eszköz csatlakoztatása és az indexek (tengelyek) azonosítása.  
2. **Kalibráció:** Minimum és maximum értékek mentése a szoftverben.  
3. **Grafikon Rajzoló:** Egy futó vonaldiagram létrehozása, ami a gázpedál állását mutatja az idő függvényében.  
4. **Hiba Jelzés:** Ha a gáz \> limit, a képernyő villanjon pirosan, és szólaljon meg egy 440Hz-es szinusz hang.  
5. **Statisztika:** Menthető JSON fájlok a fejlődés nyomon követésére (Accuracy %, Reaction time).

## ---

**5\. Példa Kód (Nyers Input Kezelés)**

`async function connectDevice() {`  
  `const devices = await navigator.hid.requestDevice({ filters: [] });`  
  `const device = devices[0];`  
  `await device.open();`

  `device.oninputreport = (event) => {`  
    `const { data } = event;`  
    `// Az index hardverfüggő (pl. Logitech G29 gázpedál a 4. byte)`  
    `const throttleRaw = data.getUint8(4);`   
    `updateUI(throttleRaw);`  
  `};`  
`}`

## ---

**6\. Szakág-Specifikus Szimulációs Módok
Ebben a szekcióban a szoftvernek a valós fizikai határokat és a különböző hajtásláncok (hátsókerék vs. összkerék) dinamikáját kell szimulálnia.  

A. Formula 1 Mód (A "Sebességfüggő Tapadás")
Az F1-ben a leszorítóerő miatt a tapadás nem állandó.

Dinamikus Limit: Minél nagyobb a virtuális sebesség, annál több gázt enged meg a szoftver.  

Kritikus tartomány: 0–100 km/h között a gázpedál tartománya legyen extrém érzékeny (20% felett már "kipörög" a modell), míg 200 km/h felett engedje a 100%-ot.  

Gyakorlat: Kormánykifordítás melletti kigyorsítás imitálása, ahol a kormány egyenesedésével párhuzamosan kell a gázt "beengedni".  

B. Rallycross Mód (A "Laza Talaj" Dinamika)
Itt a cél nem a tapadás megőrzése, hanem az optimális kerékforgás (slip ratio) megtalálása.  

Összkerékhajtás szimuláció: A gázpedál állása nem csak a gyorsulást, hanem a kanyarodást is befolyásolja a modellben.  

"Slide Control": Olyan gyakorlat, ahol a szoftver fix kormányszöget kér, neked pedig egy meghatározott (pl. 75%-os) gázállást kell tartanod, hogy az autó "ne pörögjön meg", de ne is lassuljon le.  

C. MX-5 / GT Mód (A "Progresszív Határ")
Ez a mód segít neked az iRacing-es problémádnál, ahol a "nyúlós" érzést kell megszoknod.  

Gumimelegedés büntetés: Ha a modell szerint 1 másodpercnél tovább tartod a gázt a tapadási limit felett, a limit ideiglenesen 10%-kal csökken (szimulálva a túlmelegedő gumit).  

Súlypont-áthelyezés visszajelzés: Ha hirtelen lépsz le a gázról vagy hirtelen rúgsz bele, a szoftver jelezze az instabilitást.  

**7\. Adatvezérelt Fejlesztési Lehetőségek
Valós telemetria import: Lehetőség .csv fájlok (pl. iRacing Garage61 adatok) betöltésére, amiket a szoftver "Target Curve"-ként jelenít meg.  

Izommemória hőtérkép: Egy statisztikai nézet, ami megmutatja, melyik gázpedál-állományban (pl. 10-30% között) vagy a legpontatlanabb.  

Reakcióidő mérés: Kigyorsítási triggerre (pl. lámpa elalszik) való indulás pontosságának mérése.