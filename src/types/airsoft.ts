export type AppView =
  | 'home'
  | 'workbench'
  | 'procurement'
  | 'quote'
  | 'history'
  | 'database';

export type ServiceScope =
  | 'diagnostyka_naprawa'
  | 'przeglad'
  | 'kastomizacja'
  | 'diagnostyka_tylko';

export type RepairStage =
  | 'przyjecie'
  | 'diagnostyka'
  | 'oczekuje_akceptacji'
  | 'zakup_czesci'
  | 'w_realizacji'
  | 'testy_chrono'
  | 'gotowe';

export type PaymentStatus = 'oczekuje' | 'zaliczka' | 'oplacone' | 'wyslane';

export type DriveType = 'AEG' | 'HPA' | 'GBB' | 'CO2' | 'Spring' | 'Inny';

export type DiagnosticState =
  | 'niesprawdzono'
  | 'ok'
  | 'uwaga'
  | 'usterka'
  | 'nd';

export type PartCategory =
  | 'Pneumatyka'
  | 'Gearbox / Napęd'
  | 'Hop-Up / Lufa'
  | 'Elektronika / Mosfet'
  | 'Zewnętrzne / Body'
  | 'HPA / GBB'
  | 'Materiały serwisowe';

export type PartPurchaseStatus =
  | 'do_zamowienia'
  | 'zamowione'
  | 'na_miejscu'
  | 'zamontowane';

export type IncomeTaxMode = 'gross_up' | 'markup';

export interface AttachmentImage {
  id: string;
  dataUrl: string;
  caption: string;
}

export interface DiagnosticCheckItem {
  id: string;
  subsystem: string;
  state: DiagnosticState;
  note: string;
}

export interface QaCheckItem {
  id: string;
  label: string;
  done: boolean;
}

export interface ReplicaInternalSpecs {
  gearboxVersion: string;
  nozzleLengthMm: string;
  innerBarrelMm: string;
  cylinderType: string;
  bearingsMm: string;
  testBattery: string;
  etuSettings: string;
}

export interface ChronoReadings {
  bbWeightGrams: number;
  beforeFps: number;
  beforeJoule: number;
  beforeRps: number;
  beforeSeries?: string;
  targetFps: number;
  afterFps: number;
  afterJoule: number;
  afterRps: number;
  afterSeries?: string;
}

export interface RepairPartItem {
  id: string;
  catalogId?: string;
  name: string;
  category: PartCategory;
  supplier: string;
  productUrl: string;
  quantity: number;
  purchaseUnitCost: number;
  clientUnitPrice: number;
  purchaseStatus: PartPurchaseStatus;
  suppliedByClient?: boolean;
  orderRef?: string;
  note?: string;
}

export interface LaborTaskItem {
  id: string;
  serviceId?: string;
  name: string;
  hours: number;
  hourlyRate: number;
  fixedPrice: number;
  useFixedPrice: boolean;
}

export interface PartsCatalogItem {
  id: string;
  name: string;
  category: PartCategory;
  supplier: string;
  productUrl: string;
  defaultPurchaseCost: number;
  defaultClientPrice: number;
  notes?: string;
}

export interface ServiceRateItem {
  id: string;
  name: string;
  category: string;
  defaultHours: number;
  fixedPrice: number;
  useFixedPrice: boolean;
  notes?: string;
}

export interface RepairTicketInput {
  editingOrderId?: string;
  stage: RepairStage;
  serviceScope: ServiceScope;
  projectName: string;
  replicaBrand: string;
  replicaModel: string;
  driveType: DriveType;
  serialOrMarking: string;
  targetReadyDate?: string;
  intakeAccessories?: string[];
  intakeCondition: string;
  internalSpecs?: ReplicaInternalSpecs;
  clientName: string;
  clientContact: string;
  clientDeliveryInfo: string;
  orderSource: string;
  reportedFault: string;
  diagnosisSummary: string;
  diagnosticChecks: DiagnosticCheckItem[];
  qaChecklist?: QaCheckItem[];
  chrono: ChronoReadings;
  parts: RepairPartItem[];
  laborTasks: LaborTaskItem[];
  extraMaterialsFlat: number;
  diagnosticFee: number;
  prioritySurchargePercent: number;
  attachments: AttachmentImage[];
  technicalNotes: string;
  incomeTaxRate: number;
  incomeTaxMode: IncomeTaxMode;
  vatRate: number;
}

export interface RepairCalculationResult {
  partsPurchaseCostTotal: number;
  partsClientTotal: number;
  partsMarginProfit: number;
  partsCountTotal: number;
  partsToOrderCount: number;
  partsOrderedCount: number;
  partsReadyCount: number;
  partsClientSuppliedCount?: number;
  laborTotal: number;
  laborHoursTotal: number;
  consumablesCost: number;
  diagnosticFee: number;
  prioritySurchargeAmount: number;
  netPrice: number;
  priceWithIncomeTax: number;
  incomeTaxAmount: number;
  grossPrice: number;
  vatAmount: number;
  workshopProfit: number;
  profitMarginPercent: number;
}

export interface QuoteLineItem {
  id: string;
  kind?: 'part' | 'labor' | 'diagnostic';
  name: string;
  specLabel: string;
  quantity: number;
  unitNetPrice: number;
  totalNetPrice: number;
  totalWithIncomeTax: number;
  totalGrossPrice: number;
  totalCost: number;
  totalProfit: number;
}

export interface SavedRepairOrder {
  id: string;
  createdAt: string;
  stage: RepairStage;
  paymentStatus: PaymentStatus;
  documentRef?: string;
  ticket: RepairTicketInput;
  result: RepairCalculationResult;
  replicaLabel: string;
  partsSummary: string;
}

export interface AirsoftWorkshopSettings {
  companyName: string;
  companyNip: string;
  companyEmail: string;
  companyPhone: string;
  defaultTechHourlyRate: number;
  defaultDiagnosticFee: number;
  defaultPartsMarkupPercent: number;
  defaultConsumablesFee: number;
  defaultIncomeTaxRate: number;
  defaultIncomeTaxMode: IncomeTaxMode;
  defaultVatRate: number;
}
