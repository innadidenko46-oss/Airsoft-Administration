import { User } from 'firebase/auth';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  AirsoftWorkshopSettings,
  AttachmentImage,
  PartsCatalogItem,
  PaymentStatus,
  QuoteLineItem,
  RepairCalculationResult,
  RepairStage,
  RepairTicketInput,
  SavedRepairOrder,
  ServiceRateItem,
} from '../types/airsoft';

export const SHARED_WORKSPACE_ID = 'airsoft-serwis';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as unknown as T;
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      if (val !== undefined) {
        out[key] = stripUndefined(val);
      }
    }
    return out as T;
  }
  return value;
}

export function sanitizeFirestoreId(rawId: string, fallbackPrefix = 'rep'): string {
  const cleaned = rawId.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 128);
  return cleaned || `${fallbackPrefix}-${Date.now()}`;
}

export async function ensureUserProfile(user: User): Promise<void> {
  const path = `users/${user.uid}`;
  const ref = doc(db, 'users', user.uid);
  const email = (user.email || '').trim().slice(0, 200);
  const displayName = (user.displayName || '').trim().slice(0, 120);

  let existingSnap;
  try {
    existingSnap = await getDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  if (!existingSnap.exists()) {
    try {
      await setDoc(ref, {
        uid: user.uid,
        email,
        displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
    return;
  }

  const data = existingSnap.data();
  if (data.email !== email || (data.displayName || '') !== displayName) {
    try {
      await updateDoc(ref, {
        email,
        displayName,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }
}

export interface AirsoftConfigData {
  partsCatalog: PartsCatalogItem[];
  serviceRates: ServiceRateItem[];
  suppliers: string[];
  settings: AirsoftWorkshopSettings;
}

export interface AirsoftDraftData {
  currentTicket: RepairTicketInput;
  quoteItems: QuoteLineItem[];
  quoteAttachments: AttachmentImage[];
}

export function subscribeWorkspaceConfig(
  onData: (data: AirsoftConfigData | null) => void
): () => void {
  const path = `workspaces/${SHARED_WORKSPACE_ID}/settings/config`;
  const ref = doc(db, 'workspaces', SHARED_WORKSPACE_ID, 'settings', 'config');

  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      const raw = snap.data();
      onData({
        partsCatalog: Array.isArray(raw.partsCatalog)
          ? (raw.partsCatalog as PartsCatalogItem[])
          : [],
        serviceRates: Array.isArray(raw.serviceRates)
          ? (raw.serviceRates as ServiceRateItem[])
          : [],
        suppliers: Array.isArray(raw.suppliers)
          ? (raw.suppliers as string[])
          : [],
        settings: (raw.settings || {}) as AirsoftWorkshopSettings,
      });
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export async function saveWorkspaceConfig(
  uid: string,
  partsCatalog: PartsCatalogItem[],
  serviceRates: ServiceRateItem[],
  suppliers: string[],
  settings: AirsoftWorkshopSettings
): Promise<void> {
  const path = `workspaces/${SHARED_WORKSPACE_ID}/settings/config`;
  const ref = doc(db, 'workspaces', SHARED_WORKSPACE_ID, 'settings', 'config');
  const updatePayload = stripUndefined({
    partsCatalog: partsCatalog.slice(0, 200),
    serviceRates: serviceRates.slice(0, 100),
    suppliers: suppliers.slice(0, 30),
    settings,
    updatedAt: serverTimestamp(),
  });

  let existingSnap;
  try {
    existingSnap = await getDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  if (!existingSnap.exists()) {
    try {
      await setDoc(ref, {
        ownerId: uid,
        ...updatePayload,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
    return;
  }

  try {
    await updateDoc(ref, updatePayload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function subscribeWorkspaceDraft(
  onData: (data: AirsoftDraftData | null) => void
): () => void {
  const path = `workspaces/${SHARED_WORKSPACE_ID}/settings/draft`;
  const ref = doc(db, 'workspaces', SHARED_WORKSPACE_ID, 'settings', 'draft');

  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      const raw = snap.data();
      onData({
        currentTicket: (raw.currentTicket || {}) as RepairTicketInput,
        quoteItems: Array.isArray(raw.quoteItems)
          ? (raw.quoteItems as QuoteLineItem[])
          : [],
        quoteAttachments: Array.isArray(raw.quoteAttachments)
          ? (raw.quoteAttachments as AttachmentImage[])
          : [],
      });
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export async function saveWorkspaceDraft(
  uid: string,
  currentTicket: RepairTicketInput,
  quoteItems: QuoteLineItem[],
  quoteAttachments: AttachmentImage[]
): Promise<void> {
  const path = `workspaces/${SHARED_WORKSPACE_ID}/settings/draft`;
  const ref = doc(db, 'workspaces', SHARED_WORKSPACE_ID, 'settings', 'draft');
  const updatePayload = stripUndefined({
    currentTicket,
    quoteItems: quoteItems.slice(0, 100),
    quoteAttachments: quoteAttachments.slice(0, 6),
    updatedAt: serverTimestamp(),
  });

  let existingSnap;
  try {
    existingSnap = await getDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  if (!existingSnap.exists()) {
    try {
      await setDoc(ref, {
        ownerId: uid,
        ...updatePayload,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
    return;
  }

  try {
    await updateDoc(ref, updatePayload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

function timestampToIso(value: unknown, fallbackIso?: string): string {
  if (typeof fallbackIso === 'string' && fallbackIso.length > 0) {
    return fallbackIso;
  }
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  return new Date().toISOString();
}

function mapDocToRepairOrder(
  docId: string,
  raw: Record<string, unknown>
): SavedRepairOrder {
  return {
    id: (raw.id as string) || docId,
    createdAt: timestampToIso(
      raw.createdAt,
      raw.recordedAtIso as string | undefined
    ),
    stage: (raw.stage as RepairStage) || 'przyjecie',
    paymentStatus: (raw.paymentStatus as PaymentStatus) || 'oczekuje',
    documentRef: (raw.documentRef as string) || '',
    ticket: raw.ticket as RepairTicketInput,
    result: raw.result as RepairCalculationResult,
    replicaLabel: (raw.replicaLabel as string) || 'Replika ASG',
    partsSummary: (raw.partsSummary as string) || 'Brak części',
  };
}

export function subscribeRepairOrders(
  onData: (orders: SavedRepairOrder[]) => void
): () => void {
  const path = `workspaces/${SHARED_WORKSPACE_ID}/repairs`;
  const q = query(
    collection(db, 'workspaces', SHARED_WORKSPACE_ID, 'repairs'),
    where('workspaceId', '==', SHARED_WORKSPACE_ID)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items: SavedRepairOrder[] = snapshot.docs.map((d) =>
        mapDocToRepairOrder(d.id, d.data())
      );
      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function createRepairOrderRecord(
  uid: string,
  order: SavedRepairOrder
): Promise<void> {
  const safeId = sanitizeFirestoreId(order.id, 'rep');
  const path = `workspaces/${SHARED_WORKSPACE_ID}/repairs/${safeId}`;
  const ref = doc(db, 'workspaces', SHARED_WORKSPACE_ID, 'repairs', safeId);
  const payload = stripUndefined({
    id: safeId,
    workspaceId: SHARED_WORKSPACE_ID,
    ownerId: uid,
    stage: order.stage,
    paymentStatus: order.paymentStatus,
    documentRef: (order.documentRef || '').slice(0, 160),
    recordedAtIso: order.createdAt.slice(0, 40),
    ticket: order.ticket,
    result: order.result,
    replicaLabel: (order.replicaLabel || 'Replika ASG').slice(0, 160),
    partsSummary: (order.partsSummary || 'Brak części').slice(0, 160),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await setDoc(ref, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateRepairOrderFields(
  repairId: string,
  patch: Partial<{
    stage: RepairStage;
    paymentStatus: PaymentStatus;
    documentRef: string;
    ticket: RepairTicketInput;
    result: RepairCalculationResult;
    replicaLabel: string;
    partsSummary: string;
  }>
): Promise<void> {
  const safeId = sanitizeFirestoreId(repairId, 'rep');
  const path = `workspaces/${SHARED_WORKSPACE_ID}/repairs/${safeId}`;
  const ref = doc(db, 'workspaces', SHARED_WORKSPACE_ID, 'repairs', safeId);
  const cleanPatch: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };

  if (patch.stage !== undefined) cleanPatch.stage = patch.stage;
  if (patch.paymentStatus !== undefined)
    cleanPatch.paymentStatus = patch.paymentStatus;
  if (patch.documentRef !== undefined) {
    cleanPatch.documentRef = patch.documentRef.slice(0, 160);
  }
  if (patch.ticket !== undefined) cleanPatch.ticket = stripUndefined(patch.ticket);
  if (patch.result !== undefined) cleanPatch.result = stripUndefined(patch.result);
  if (patch.replicaLabel !== undefined) {
    cleanPatch.replicaLabel = patch.replicaLabel.slice(0, 160);
  }
  if (patch.partsSummary !== undefined) {
    cleanPatch.partsSummary = patch.partsSummary.slice(0, 160);
  }

  try {
    await updateDoc(ref, cleanPatch);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteRepairOrderRecord(repairId: string): Promise<void> {
  const safeId = sanitizeFirestoreId(repairId, 'rep');
  const path = `workspaces/${SHARED_WORKSPACE_ID}/repairs/${safeId}`;
  const ref = doc(db, 'workspaces', SHARED_WORKSPACE_ID, 'repairs', safeId);
  try {
    await deleteDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

async function ensureAirsoftWorkspaceRoot(): Promise<void> {
  const path = `workspaces/${SHARED_WORKSPACE_ID}`;
  const ref = doc(db, 'workspaces', SHARED_WORKSPACE_ID);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        id: SHARED_WORKSPACE_ID,
        name: 'AIRSOFT Serwis & Custom',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function bootstrapAirsoftWorkspaceIfEmpty(
  uid: string,
  seed: {
    partsCatalog: PartsCatalogItem[];
    serviceRates: ServiceRateItem[];
    suppliers: string[];
    settings: AirsoftWorkshopSettings;
    currentTicket: RepairTicketInput;
    quoteItems: QuoteLineItem[];
    quoteAttachments: AttachmentImage[];
  }
): Promise<void> {
  await ensureAirsoftWorkspaceRoot();

  const configRef = doc(
    db,
    'workspaces',
    SHARED_WORKSPACE_ID,
    'settings',
    'config'
  );
  const draftRef = doc(
    db,
    'workspaces',
    SHARED_WORKSPACE_ID,
    'settings',
    'draft'
  );
  const repairsCheckQuery = query(
    collection(db, 'workspaces', SHARED_WORKSPACE_ID, 'repairs'),
    where('workspaceId', '==', SHARED_WORKSPACE_ID),
    limit(1)
  );

  let configSnap;
  let draftSnap;
  try {
    [configSnap, draftSnap] = await Promise.all([
      getDoc(configRef),
      getDoc(draftRef),
      getDocs(repairsCheckQuery),
    ]);
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.GET,
      `workspaces/${SHARED_WORKSPACE_ID}`
    );
  }

  if (!configSnap.exists()) {
    await saveWorkspaceConfig(
      uid,
      seed.partsCatalog,
      seed.serviceRates,
      seed.suppliers,
      seed.settings
    );
  }

  if (!draftSnap.exists()) {
    await saveWorkspaceDraft(
      uid,
      seed.currentTicket,
      seed.quoteItems,
      seed.quoteAttachments
    );
  }
}
