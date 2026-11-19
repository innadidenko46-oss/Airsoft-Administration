import {
  AirsoftWorkshopSettings,
  DiagnosticCheckItem,
  PartsCatalogItem,
  QaCheckItem,
  RepairTicketInput,
  ReplicaInternalSpecs,
  ServiceRateItem,
} from '../types/airsoft';

export const DEFAULT_SUPPLIERS: string[] = [
  'Taiwangun',
  'Gunfire',
  'SpecShop',
  'Azteko',
  'Powair6',
  'Magazyn własny',
  'Inny',
];

export const INTAKE_ACCESSORY_OPTIONS: string[] = [
  'Magazynek(ki)',
  'Bateria LiPo',
  'Pokrowiec / Walizka',
  'Tłumik / Tracer',
  'Kolimator / Optyka',
  'Ładowarka',
  'W częściach / rozebrana',
];

export const DEFAULT_INTERNAL_SPECS: ReplicaInternalSpecs = {
  gearboxVersion: 'V2',
  nozzleLengthMm: '',
  innerBarrelMm: '',
  cylinderType: '',
  bearingsMm: '8 mm',
  testBattery: '11.1V LiPo',
  etuSettings: '',
};

export const DEFAULT_QA_CHECKS: QaCheckItem[] = [
  {
    id: 'qa-feeding',
    label: 'Test podawania kulek na magazynku mid-cap (SEMI / AUTO)',
    done: false,
  },
  {
    id: 'qa-safety',
    label: 'Sprawny selektor ognia (SAFE / SEMI / AUTO) i blokada spustu',
    done: false,
  },
  {
    id: 'qa-spring',
    label: 'Wyzerowany pre-cocking i rozprężona sprężyna przed spakowaniem',
    done: false,
  },
  {
    id: 'qa-bolts',
    label: 'Dokręcona śruba regulacji silnika, piny body i kontrola luzów',
    done: false,
  },
  {
    id: 'qa-oldparts',
    label: 'Spakowane stare / wymienione części do zwrotu klientowi',
    done: false,
  },
];

export const DEFAULT_DIAGNOSTIC_CHECKS: DiagnosticCheckItem[] = [
  {
    id: 'chk-pneumatics',
    subsystem: 'Układ pneumatyczny (szczelność cylinder / tłok / dysza)',
    state: 'niesprawdzono',
    note: '',
  },
  {
    id: 'chk-gears',
    subsystem: 'Zębatki, łożyska, podkładkowanie (Shimming) & AoE',
    state: 'niesprawdzono',
    note: '',
  },
  {
    id: 'chk-piston',
    subsystem: 'Tłok, sprężyna główna i prowadnica sprężyny',
    state: 'niesprawdzono',
    note: '',
  },
  {
    id: 'chk-hopup',
    subsystem: 'Komora Hop-Up, gumka, dystanser i lufa wewnętrzna',
    state: 'niesprawdzono',
    note: '',
  },
  {
    id: 'chk-electronics',
    subsystem: 'Elektryka, kostka stykowa / Mosfet / ETU',
    state: 'niesprawdzono',
    note: '',
  },
  {
    id: 'chk-motor',
    subsystem: 'Silnik, zębatka silnika, okablowanie i wtyk baterii',
    state: 'niesprawdzono',
    note: '',
  },
  {
    id: 'chk-external',
    subsystem: 'Body, selektor ognia, spust i podawanie magazynka',
    state: 'niesprawdzono',
    note: '',
  },
];

export function createEmptyDiagnosticChecks(): DiagnosticCheckItem[] {
  return DEFAULT_DIAGNOSTIC_CHECKS.map((item) => ({ ...item }));
}

export function createDefaultQaChecklist(): QaCheckItem[] {
  return DEFAULT_QA_CHECKS.map((item) => ({ ...item }));
}

export function createEmptyInternalSpecs(): ReplicaInternalSpecs {
  return { ...DEFAULT_INTERNAL_SPECS };
}

export const INITIAL_TICKET_INPUT: RepairTicketInput = {
  stage: 'przyjecie',
  serviceScope: 'diagnostyka_naprawa',
  projectName: '',
  replicaBrand: '',
  replicaModel: '',
  driveType: 'AEG',
  serialOrMarking: '',
  targetReadyDate: '',
  intakeAccessories: [],
  intakeCondition: '',
  internalSpecs: createEmptyInternalSpecs(),
  clientName: '',
  clientContact: '',
  clientDeliveryInfo: '',
  orderSource: 'E-mail',
  reportedFault: '',
  diagnosisSummary: '',
  diagnosticChecks: createEmptyDiagnosticChecks(),
  qaChecklist: createDefaultQaChecklist(),
  chrono: {
    bbWeightGrams: 0.2,
    beforeFps: 0,
    beforeJoule: 0,
    beforeRps: 0,
    beforeSeries: '',
    targetFps: 400,
    afterFps: 0,
    afterJoule: 0,
    afterRps: 0,
    afterSeries: '',
  },
  parts: [],
  laborTasks: [
    {
      id: 'labor-init-1',
      serviceId: 'srv-przeglad-zerowy',
      name: 'Przegląd zerowy / Serwis okresowy AEG (Shimming + AoE + Smarowanie)',
      hours: 1.5,
      hourlyRate: 120,
      fixedPrice: 180,
      useFixedPrice: true,
    },
  ],
  extraMaterialsFlat: 25,
  diagnosticFee: 0,
  prioritySurchargePercent: 0,
  attachments: [],
  technicalNotes: '',
  incomeTaxRate: 5.5,
  incomeTaxMode: 'gross_up',
  vatRate: 23,
};

export const DEFAULT_PARTS_CATALOG: PartsCatalogItem[] = [
  {
    id: 'part-ml-macaron-60',
    name: 'Gumka Hop-Up Maple Leaf Macaron 60°',
    category: 'Hop-Up / Lufa',
    supplier: 'Taiwangun',
    productUrl: 'https://www.taiwangun.com/',
    defaultPurchaseCost: 34,
    defaultClientPrice: 39,
    notes: 'Uniwersalna gumka do replik 350-450 FPS',
  },
  {
    id: 'part-ml-omega',
    name: 'Dystanser Maple Leaf Omega Nub',
    category: 'Hop-Up / Lufa',
    supplier: 'Taiwangun',
    productUrl: 'https://www.taiwangun.com/',
    defaultPurchaseCost: 21,
    defaultClientPrice: 25,
    notes: 'Wymagany do gumek Macaron / MR.Hop',
  },
  {
    id: 'part-perun-v2',
    name: 'Układ Mosfet Perun V2 Hybrid',
    category: 'Elektronika / Mosfet',
    supplier: 'SpecShop',
    productUrl: 'https://www.specshop.pl/',
    defaultPurchaseCost: 315,
    defaultClientPrice: 345,
    notes: 'Optyczny układ sterowania do Gearbox V2',
  },
  {
    id: 'part-shs-13-1',
    name: 'Zębatki stalowe CNC SHS 13:1 High Speed',
    category: 'Gearbox / Napęd',
    supplier: 'Taiwangun',
    productUrl: 'https://www.taiwangun.com/',
    defaultPurchaseCost: 89,
    defaultClientPrice: 105,
    notes: 'Do szybkiej reakcji na spust i wysokiego ROF',
  },
  {
    id: 'part-shs-piston-14',
    name: 'Tłok SHS 14 stalowych zębów (lekki)',
    category: 'Pneumatyka',
    supplier: 'Taiwangun',
    productUrl: 'https://www.taiwangun.com/',
    defaultPurchaseCost: 48,
    defaultClientPrice: 59,
    notes: 'Wymaga korekty AoE przy montażu',
  },
  {
    id: 'part-epes-nozzle',
    name: 'Dysza uszczelniona CNC (z o-ringiem)',
    category: 'Pneumatyka',
    supplier: 'Azteko',
    productUrl: 'https://azteko.pl/',
    defaultPurchaseCost: 38,
    defaultClientPrice: 45,
    notes: 'Dobrać dokładną długość pod model repliki',
  },
  {
    id: 'part-zci-barrel-602',
    name: 'Lufa precyzyjna stalowa 6.02 mm (363 mm)',
    category: 'Hop-Up / Lufa',
    supplier: 'Gunfire',
    productUrl: 'https://gunfire.com/',
    defaultPurchaseCost: 115,
    defaultClientPrice: 135,
    notes: 'Stal nierdzewna do karabinków szturmowych',
  },
  {
    id: 'part-motor-ht-22tpa',
    name: 'Silnik neodymowy High-Torque 22TPA (długi)',
    category: 'Gearbox / Napęd',
    supplier: 'Gunfire',
    productUrl: 'https://gunfire.com/',
    defaultPurchaseCost: 175,
    defaultClientPrice: 199,
    notes: 'Stabilny prąd rozruchowy z zębatkami 13:1 / 16:1',
  },
  {
    id: 'part-spring-m120',
    name: 'Sprężyna główna Guarder SP120 / M120',
    category: 'Pneumatyka',
    supplier: 'SpecShop',
    productUrl: 'https://www.specshop.pl/',
    defaultPurchaseCost: 44,
    defaultClientPrice: 52,
    notes: 'Docelowo ok. 400-420 FPS na szczelnym układzie',
  },
  {
    id: 'part-tdeans-wiring',
    name: 'Zestaw T-Deans + przewód niskooporowy 16AWG',
    category: 'Materiały serwisowe',
    supplier: 'Magazyn własny',
    productUrl: '',
    defaultPurchaseCost: 14,
    defaultClientPrice: 25,
    notes: 'Złącze wysokoprądowe i termokurcz',
  },
];

export const DEFAULT_SERVICE_RATES: ServiceRateItem[] = [
  {
    id: 'srv-diag',
    name: 'Diagnostyka usterki + rozbiórka i pomiary chrono',
    category: 'Diagnostyka',
    defaultHours: 0.75,
    fixedPrice: 80,
    useFixedPrice: true,
    notes: 'Pełny przegląd na stole + raport usterek (często wliczane w naprawę)',
  },
  {
    id: 'srv-przeglad-zerowy',
    name: 'Przegląd zerowy / Serwis okresowy AEG (Shimming + AoE + Smarowanie)',
    category: 'Serwis AEG',
    defaultHours: 1.5,
    fixedPrice: 180,
    useFixedPrice: true,
    notes: 'Czyszczenie, podkładkowanie zębatek, korekta AoE, uszczelnienie pneumatyki',
  },
  {
    id: 'srv-gearbox-rebuild',
    name: 'Rozbiórka i naprawa główna Gearbox V2 / V3',
    category: 'Naprawa',
    defaultHours: 1.75,
    fixedPrice: 210,
    useFixedPrice: true,
    notes: 'Wymiana uszkodzonych podzespołów i kalibracja napędu',
  },
  {
    id: 'srv-mosfet',
    name: 'Instalacja i programowanie układu Mosfet / ETU (Perun, Gate)',
    category: 'Elektronika',
    defaultHours: 1.25,
    fixedPrice: 140,
    useFixedPrice: true,
    notes: 'Montaż z okablowaniem, kalibracja spustu i selektora',
  },
  {
    id: 'srv-hopup-rhop',
    name: 'Tuning układu Hop-Up / Montaż R-Hop i lufy',
    category: 'Celność / Tuning',
    defaultHours: 1.0,
    fixedPrice: 120,
    useFixedPrice: true,
    notes: 'Stabilizacja komory, dopasowanie dystansera i testy skupienia',
  },
  {
    id: 'srv-hpa',
    name: 'Konwersja repliki na układ HPA + osiowanie i FCU',
    category: 'Kastomizacja HPA',
    defaultHours: 2.5,
    fixedPrice: 280,
    useFixedPrice: true,
    notes: 'Osiowanie dyszy względem komory Hop-Up i konfiguracja dwell/ROF',
  },
  {
    id: 'srv-gbb-service',
    name: 'Serwis i uszczelnienie repliki GBB / Magazynków',
    category: 'Serwis GBB',
    defaultHours: 1.0,
    fixedPrice: 130,
    useFixedPrice: true,
    notes: 'Czyszczenie zaworów, smarowanie prowadnic i wymiana o-ringów',
  },
  {
    id: 'srv-tdeans',
    name: 'Przelutowanie wtyku na T-Deans / XT60',
    category: 'Elektronika',
    defaultHours: 0.4,
    fixedPrice: 50,
    useFixedPrice: true,
    notes: 'Lutowanie i izolacja koszulką termokurczliwą',
  },
];

export const DEFAULT_WORKSHOP_SETTINGS: AirsoftWorkshopSettings = {
  companyName: 'AIRSOFT Serwis & Custom',
  companyNip: '',
  companyEmail: 'serwis@airsoft-custom.pl',
  companyPhone: '',
  defaultTechHourlyRate: 120,
  defaultDiagnosticFee: 0,
  defaultPartsMarkupPercent: 10,
  defaultConsumablesFee: 25,
  defaultIncomeTaxRate: 5.5,
  defaultIncomeTaxMode: 'gross_up',
  defaultVatRate: 23,
};
