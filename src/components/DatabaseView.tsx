import React, { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import {
  AirsoftWorkshopSettings,
  IncomeTaxMode,
  PartCategory,
  PartsCatalogItem,
  ServiceRateItem,
} from '../types/airsoft';
import { formatPln } from '../utils/airsoftCalculations';
import { InfoTooltip } from './InfoTooltip';

interface DatabaseViewProps {
  partsCatalog: PartsCatalogItem[];
  serviceRates: ServiceRateItem[];
  suppliers: string[];
  settings: AirsoftWorkshopSettings;
  onSavePartsCatalog: (next: PartsCatalogItem[]) => void;
  onSaveServiceRates: (next: ServiceRateItem[]) => void;
  onSaveSuppliers: (next: string[]) => void;
  onSaveSettings: (next: AirsoftWorkshopSettings) => void;
  onNotify: (msg: string) => void;
}

const PART_CATEGORIES: PartCategory[] = [
  'Pneumatyka',
  'Gearbox / Napęd',
  'Hop-Up / Lufa',
  'Elektronika / Mosfet',
  'Zewnętrzne / Body',
  'HPA / GBB',
  'Materiały serwisowe',
];

export const DatabaseView: React.FC<DatabaseViewProps> = ({
  partsCatalog,
  serviceRates,
  suppliers,
  settings,
  onSavePartsCatalog,
  onSaveServiceRates,
  onSaveSuppliers,
  onSaveSettings,
  onNotify,
}) => {
  const [newPart, setNewPart] = useState<{
    name: string;
    category: PartCategory;
    supplier: string;
    productUrl: string;
    defaultPurchaseCost: number;
    defaultClientPrice: number;
  }>({
    name: '',
    category: 'Pneumatyka',
    supplier: suppliers[0] || 'Taiwangun',
    productUrl: '',
    defaultPurchaseCost: 50,
    defaultClientPrice: 60,
  });

  const [newService, setNewService] = useState({
    name: '',
    category: 'Serwis AEG',
    defaultHours: 1,
    fixedPrice: 120,
    useFixedPrice: true,
  });

  const [newSupplierName, setNewSupplierName] = useState('');

  const handleUpdatePart = (id: string, patch: Partial<PartsCatalogItem>) => {
    onSavePartsCatalog(
      partsCatalog.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  const handleAddPart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPart.name.trim()) return;
    const item: PartsCatalogItem = {
      id: `part-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      name: newPart.name.trim(),
      category: newPart.category,
      supplier: newPart.supplier.trim() || 'Inny',
      productUrl: newPart.productUrl.trim(),
      defaultPurchaseCost: Math.max(0, newPart.defaultPurchaseCost || 0),
      defaultClientPrice: Math.max(0, newPart.defaultClientPrice || 0),
    };
    onSavePartsCatalog([...partsCatalog, item]);
    setNewPart({
      name: '',
      category: 'Pneumatyka',
      supplier: suppliers[0] || 'Taiwangun',
      productUrl: '',
      defaultPurchaseCost: 50,
      defaultClientPrice: 60,
    });
    onNotify(`Dodano część do katalogu: ${item.name}`);
  };

  const handleUpdateService = (id: string, patch: Partial<ServiceRateItem>) => {
    onSaveServiceRates(
      serviceRates.map((srv) => (srv.id === id ? { ...srv, ...patch } : srv))
    );
  };

  const handleAddService = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newService.name.trim()) return;
    const item: ServiceRateItem = {
      id: `srv-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      name: newService.name.trim(),
      category: newService.category.trim() || 'Serwis ASG',
      defaultHours: Math.max(0.1, newService.defaultHours || 1),
      fixedPrice: Math.max(0, newService.fixedPrice || 0),
      useFixedPrice: newService.useFixedPrice,
    };
    onSaveServiceRates([...serviceRates, item]);
    setNewService({
      name: '',
      category: 'Serwis AEG',
      defaultHours: 1,
      fixedPrice: 120,
      useFixedPrice: true,
    });
    onNotify(`Dodano usługę do cennika: ${item.name}`);
  };

  const handleAddSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newSupplierName.trim();
    if (!cleaned) return;
    if (suppliers.some((s) => s.toLowerCase() === cleaned.toLowerCase())) {
      onNotify('Taki sklep / dostawca znajduje się już na liście.');
      return;
    }
    onSaveSuppliers([...suppliers, cleaned]);
    setNewSupplierName('');
    onNotify(`Dodano dostawcę: ${cleaned}`);
  };

  const handleRemoveSupplier = (name: string) => {
    if (suppliers.length <= 1) return;
    onSaveSuppliers(suppliers.filter((s) => s !== name));
  };

  const supplierOptions = suppliers.length > 0 ? suppliers : ['Taiwangun', 'Gunfire', 'SpecShop', 'Inny'];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Section 1: Parts Catalog */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex items-center gap-1.5 border-b border-slate-100 pb-3">
          <h2 className="text-base font-semibold text-slate-900">
            Katalog części naprawczych i tuningowych
          </h2>
          <InfoTooltip text="Szablony części dodawanych jednym kliknięciem w warsztacie. Możesz wpisać domyślny sklep, link do sklepu, koszt zakupu i cenę dla klienta." />
        </div>

        {/* Mobile Cards */}
        <div className="mt-4 space-y-3 md:hidden">
          {partsCatalog.map((part) => (
            <div
              key={part.id}
              className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <input
                  type="text"
                  value={part.name}
                  onChange={(e) => handleUpdatePart(part.id, { name: e.target.value })}
                  aria-label="Nazwa części"
                  className="flex-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:border-[#e88a00] focus:outline-none"
                />
                <button
                  type="button"
                  disabled={partsCatalog.length <= 1}
                  onClick={() =>
                    onSavePartsCatalog(partsCatalog.filter((x) => x.id !== part.id))
                  }
                  className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 shrink-0"
                  title="Usuń część"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-medium text-slate-500">
                    Kategoria
                  </label>
                  <select
                    value={part.category}
                    onChange={(e) =>
                      handleUpdatePart(part.id, {
                        category: e.target.value as PartCategory,
                      })
                    }
                    className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 focus:border-[#e88a00] focus:outline-none"
                  >
                    {PART_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-slate-500">
                    Sklep / Dostawca
                  </label>
                  <select
                    value={part.supplier}
                    onChange={(e) =>
                      handleUpdatePart(part.id, { supplier: e.target.value })
                    }
                    className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 focus:border-[#e88a00] focus:outline-none"
                  >
                    {supplierOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-slate-500">
                    Zakup (zł)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={part.defaultPurchaseCost}
                    onChange={(e) =>
                      handleUpdatePart(part.id, {
                        defaultPurchaseCost: Math.max(
                          0,
                          parseFloat(e.target.value) || 0
                        ),
                      })
                    }
                    className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs tabular-nums focus:border-[#e88a00] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-slate-500">
                    Klient (zł)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={part.defaultClientPrice}
                    onChange={(e) =>
                      handleUpdatePart(part.id, {
                        defaultClientPrice: Math.max(
                          0,
                          parseFloat(e.target.value) || 0
                        ),
                      })
                    }
                    className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs tabular-nums focus:border-[#e88a00] focus:outline-none"
                  />
                </div>
              </div>
              <input
                type="text"
                value={part.productUrl}
                onChange={(e) =>
                  handleUpdatePart(part.id, { productUrl: e.target.value })
                }
                placeholder="https://... link do sklepu"
                className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-[#e88a00] focus:outline-none"
              />
            </div>
          ))}
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-2 font-medium">Nazwa części</th>
                <th className="py-2 px-2 font-medium">Kategoria</th>
                <th className="py-2 px-2 font-medium">Sklep / Dostawca</th>
                <th className="py-2 px-2 font-medium">Link do oferty</th>
                <th className="py-2 px-2 font-medium text-right">Zakup (zł)</th>
                <th className="py-2 px-2 font-medium text-right">Klient (zł)</th>
                <th className="py-2 px-2 font-medium text-right">Marża</th>
                <th className="py-2 pl-2 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {partsCatalog.map((part) => {
                const margin = part.defaultClientPrice - part.defaultPurchaseCost;
                return (
                  <tr key={part.id}>
                    <td className="py-2 pr-2">
                      <input
                        type="text"
                        value={part.name}
                        onChange={(e) =>
                          handleUpdatePart(part.id, { name: e.target.value })
                        }
                        aria-label="Nazwa części"
                        className="w-full min-w-[200px] rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:border-[#e88a00] focus:outline-none"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <select
                        value={part.category}
                        onChange={(e) =>
                          handleUpdatePart(part.id, {
                            category: e.target.value as PartCategory,
                          })
                        }
                        aria-label="Kategoria części"
                        className="w-36 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 focus:border-[#e88a00] focus:outline-none"
                      >
                        {PART_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-2">
                      <select
                        value={part.supplier}
                        onChange={(e) =>
                          handleUpdatePart(part.id, { supplier: e.target.value })
                        }
                        aria-label="Sklep dostawcy"
                        className="w-32 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 focus:border-[#e88a00] focus:outline-none"
                      >
                        {supplierOptions.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                        {!supplierOptions.includes(part.supplier) && (
                          <option value={part.supplier}>{part.supplier}</option>
                        )}
                      </select>
                    </td>
                    <td className="py-2 px-2">
                      <input
                        type="text"
                        value={part.productUrl}
                        onChange={(e) =>
                          handleUpdatePart(part.id, { productUrl: e.target.value })
                        }
                        placeholder="https://..."
                        aria-label="Link do produktu"
                        className="w-40 rounded-md border border-slate-200 px-2 py-1.5 text-xs text-slate-600 focus:border-[#e88a00] focus:outline-none"
                      />
                    </td>
                    <td className="py-2 px-2 text-right">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={part.defaultPurchaseCost}
                        onChange={(e) =>
                          handleUpdatePart(part.id, {
                            defaultPurchaseCost: Math.max(
                              0,
                              parseFloat(e.target.value) || 0
                            ),
                          })
                        }
                        aria-label="Koszt zakupu"
                        className="w-20 rounded-md border border-slate-200 px-2 py-1.5 text-right font-mono text-xs tabular-nums focus:border-[#e88a00] focus:outline-none"
                      />
                    </td>
                    <td className="py-2 px-2 text-right">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={part.defaultClientPrice}
                        onChange={(e) =>
                          handleUpdatePart(part.id, {
                            defaultClientPrice: Math.max(
                              0,
                              parseFloat(e.target.value) || 0
                            ),
                          })
                        }
                        aria-label="Cena dla klienta"
                        className="w-20 rounded-md border border-slate-200 px-2 py-1.5 text-right font-mono text-xs tabular-nums focus:border-[#e88a00] focus:outline-none"
                      />
                    </td>
                    <td
                      className={`py-2 px-2 text-right font-mono font-semibold tabular-nums whitespace-nowrap ${
                        margin >= 0 ? 'text-emerald-700' : 'text-red-600'
                      }`}
                    >
                      {formatPln(margin, 0)}
                    </td>
                    <td className="py-2 pl-2 text-right">
                      <button
                        type="button"
                        disabled={partsCatalog.length <= 1}
                        onClick={() =>
                          onSavePartsCatalog(
                            partsCatalog.filter((x) => x.id !== part.id)
                          )
                        }
                        className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                        title="Usuń część"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <form
          onSubmit={handleAddPart}
          className="mt-4 grid grid-cols-2 gap-2.5 rounded-lg bg-slate-50 p-3.5 sm:grid-cols-12 sm:items-end"
        >
          <div className="col-span-2 sm:col-span-3">
            <label className="block text-[11px] font-medium text-slate-600">
              Nowa część (nazwa)
            </label>
            <input
              type="text"
              required
              placeholder="np. Głowica cylindra CNC"
              value={newPart.name}
              onChange={(e) => setNewPart({ ...newPart, name: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#e88a00] focus:outline-none"
            />
          </div>
          <div className="col-span-1 sm:col-span-2">
            <label className="block text-[11px] font-medium text-slate-600">
              Kategoria
            </label>
            <select
              value={newPart.category}
              onChange={(e) =>
                setNewPart({ ...newPart, category: e.target.value as PartCategory })
              }
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-900 focus:border-[#e88a00] focus:outline-none"
            >
              {PART_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-1 sm:col-span-2">
            <label className="block text-[11px] font-medium text-slate-600">
              Sklep
            </label>
            <select
              value={newPart.supplier}
              onChange={(e) =>
                setNewPart({ ...newPart, supplier: e.target.value })
              }
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-900 focus:border-[#e88a00] focus:outline-none"
            >
              {supplierOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2 sm:col-span-2">
            <label className="block text-[11px] font-medium text-slate-600">
              Link (opcjonalnie)
            </label>
            <input
              type="text"
              placeholder="https://..."
              value={newPart.productUrl}
              onChange={(e) =>
                setNewPart({ ...newPart, productUrl: e.target.value })
              }
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-900 focus:border-[#e88a00] focus:outline-none"
            />
          </div>
          <div className="col-span-1 sm:col-span-1">
            <label className="block text-[11px] font-medium text-slate-600">
              Zakup (zł)
            </label>
            <input
              type="number"
              min="0"
              value={newPart.defaultPurchaseCost}
              onChange={(e) => {
                const cost = Math.max(0, parseFloat(e.target.value) || 0);
                setNewPart({
                  ...newPart,
                  defaultPurchaseCost: cost,
                  defaultClientPrice: Math.round(
                    cost * (1 + settings.defaultPartsMarkupPercent / 100)
                  ),
                });
              }}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 font-mono text-xs tabular-nums focus:border-[#e88a00] focus:outline-none"
            />
          </div>
          <div className="col-span-1 sm:col-span-1">
            <label className="block text-[11px] font-medium text-slate-600">
              Klient (zł)
            </label>
            <input
              type="number"
              min="0"
              value={newPart.defaultClientPrice}
              onChange={(e) =>
                setNewPart({
                  ...newPart,
                  defaultClientPrice: Math.max(0, parseFloat(e.target.value) || 0),
                })
              }
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 font-mono text-xs tabular-nums focus:border-[#e88a00] focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5 text-[#e88a00]" />
            Dodaj
          </button>
        </form>
      </section>

      {/* Section 2: Service Labor Rates */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex items-center gap-1.5 border-b border-slate-100 pb-3">
          <h2 className="text-base font-semibold text-slate-900">
            Cennik usług serwisowych i robocizny
          </h2>
          <InfoTooltip text="Standardowe pakiety serwisowe (przegląd zerowy, shimming, montaż mosfetu, konwersja HPA) wykorzystywane do szybkiego kosztorysowania." />
        </div>

        {/* Mobile Service Cards */}
        <div className="mt-4 space-y-3 md:hidden">
          {serviceRates.map((srv) => (
            <div
              key={srv.id}
              className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <input
                  type="text"
                  value={srv.name}
                  onChange={(e) =>
                    handleUpdateService(srv.id, { name: e.target.value })
                  }
                  className="flex-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:border-[#e88a00] focus:outline-none"
                />
                <button
                  type="button"
                  disabled={serviceRates.length <= 1}
                  onClick={() =>
                    onSaveServiceRates(serviceRates.filter((x) => x.id !== srv.id))
                  }
                  className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 shrink-0"
                  title="Usuń usługę"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] font-medium text-slate-500">
                    Kategoria
                  </label>
                  <input
                    type="text"
                    value={srv.category}
                    onChange={(e) =>
                      handleUpdateService(srv.id, { category: e.target.value })
                    }
                    className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 focus:border-[#e88a00] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-slate-500">
                    Czas (h)
                  </label>
                  <input
                    type="number"
                    min="0.1"
                    step="0.25"
                    value={srv.defaultHours}
                    onChange={(e) =>
                      handleUpdateService(srv.id, {
                        defaultHours: Math.max(0.1, parseFloat(e.target.value) || 0.5),
                      })
                    }
                    className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 font-mono text-xs tabular-nums focus:border-[#e88a00] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-slate-500">
                    Ryczałt (zł)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="10"
                    value={srv.fixedPrice}
                    onChange={(e) =>
                      handleUpdateService(srv.id, {
                        fixedPrice: Math.max(0, parseFloat(e.target.value) || 0),
                      })
                    }
                    className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 font-mono text-xs tabular-nums focus:border-[#e88a00] focus:outline-none"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Service Table */}
        <div className="hidden md:block mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-2 font-medium">Nazwa usługi</th>
                <th className="py-2 px-2 font-medium">Kategoria</th>
                <th className="py-2 px-2 font-medium text-right">Domyślny czas (h)</th>
                <th className="py-2 px-2 font-medium text-center">Tryb rozliczenia</th>
                <th className="py-2 px-2 font-medium text-right">Cena ryczałt (zł)</th>
                <th className="py-2 px-2 font-medium text-right">Stawka efektywna</th>
                <th className="py-2 pl-2 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {serviceRates.map((srv) => {
                const effectivePrice = srv.useFixedPrice
                  ? srv.fixedPrice
                  : srv.defaultHours * settings.defaultTechHourlyRate;
                return (
                  <tr key={srv.id}>
                    <td className="py-2 pr-2">
                      <input
                        type="text"
                        value={srv.name}
                        onChange={(e) =>
                          handleUpdateService(srv.id, { name: e.target.value })
                        }
                        aria-label="Nazwa usługi"
                        className="w-full min-w-[240px] rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:border-[#e88a00] focus:outline-none"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <input
                        type="text"
                        value={srv.category}
                        onChange={(e) =>
                          handleUpdateService(srv.id, { category: e.target.value })
                        }
                        aria-label="Kategoria usługi"
                        className="w-36 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 focus:border-[#e88a00] focus:outline-none"
                      />
                    </td>
                    <td className="py-2 px-2 text-right">
                      <input
                        type="number"
                        min="0.1"
                        step="0.25"
                        value={srv.defaultHours}
                        onChange={(e) =>
                          handleUpdateService(srv.id, {
                            defaultHours: Math.max(
                              0.1,
                              parseFloat(e.target.value) || 0.5
                            ),
                          })
                        }
                        aria-label="Czas pracy h"
                        className="w-20 rounded-md border border-slate-200 px-2 py-1.5 text-right font-mono text-xs tabular-nums focus:border-[#e88a00] focus:outline-none"
                      />
                    </td>
                    <td className="py-2 px-2 text-center">
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateService(srv.id, {
                            useFixedPrice: !srv.useFixedPrice,
                          })
                        }
                        className={`rounded-md border px-2.5 py-1 text-[11px] font-medium ${
                          srv.useFixedPrice
                            ? 'border-amber-200 bg-amber-50 text-amber-800'
                            : 'border-slate-200 bg-white text-slate-700'
                        }`}
                      >
                        {srv.useFixedPrice ? 'Ryczałt' : 'Godzinowo'}
                      </button>
                    </td>
                    <td className="py-2 px-2 text-right">
                      <input
                        type="number"
                        min="0"
                        step="10"
                        value={srv.fixedPrice}
                        onChange={(e) =>
                          handleUpdateService(srv.id, {
                            fixedPrice: Math.max(0, parseFloat(e.target.value) || 0),
                          })
                        }
                        aria-label="Cena ryczałtowa"
                        className="w-24 rounded-md border border-slate-200 px-2 py-1.5 text-right font-mono text-xs tabular-nums focus:border-[#e88a00] focus:outline-none"
                      />
                    </td>
                    <td className="py-2 px-2 text-right font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                      {formatPln(effectivePrice)}
                    </td>
                    <td className="py-2 pl-2 text-right">
                      <button
                        type="button"
                        disabled={serviceRates.length <= 1}
                        onClick={() =>
                          onSaveServiceRates(
                            serviceRates.filter((x) => x.id !== srv.id)
                          )
                        }
                        className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                        title="Usuń usługę"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <form
          onSubmit={handleAddService}
          className="mt-4 grid grid-cols-2 gap-2.5 rounded-lg bg-slate-50 p-3.5 sm:grid-cols-12 sm:items-end"
        >
          <div className="col-span-2 sm:col-span-5">
            <label className="block text-[11px] font-medium text-slate-600">
              Nowa usługa (nazwa)
            </label>
            <input
              type="text"
              required
              placeholder="np. Wymiana lufy i osiowanie komory Hop-Up"
              value={newService.name}
              onChange={(e) =>
                setNewService({ ...newService, name: e.target.value })
              }
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#e88a00] focus:outline-none"
            />
          </div>
          <div className="col-span-1 sm:col-span-2">
            <label className="block text-[11px] font-medium text-slate-600">
              Kategoria
            </label>
            <input
              type="text"
              value={newService.category}
              onChange={(e) =>
                setNewService({ ...newService, category: e.target.value })
              }
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-900 focus:border-[#e88a00] focus:outline-none"
            />
          </div>
          <div className="col-span-1 sm:col-span-1">
            <label className="block text-[11px] font-medium text-slate-600">
              Czas (h)
            </label>
            <input
              type="number"
              min="0.1"
              step="0.25"
              value={newService.defaultHours}
              onChange={(e) =>
                setNewService({
                  ...newService,
                  defaultHours: Math.max(0.1, parseFloat(e.target.value) || 1),
                })
              }
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 font-mono text-xs tabular-nums focus:border-[#e88a00] focus:outline-none"
            />
          </div>
          <div className="col-span-1 sm:col-span-2">
            <label className="block text-[11px] font-medium text-slate-600">
              Cena ryczałt (zł)
            </label>
            <input
              type="number"
              min="0"
              step="10"
              value={newService.fixedPrice}
              onChange={(e) =>
                setNewService({
                  ...newService,
                  fixedPrice: Math.max(0, parseFloat(e.target.value) || 0),
                })
              }
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 font-mono text-xs tabular-nums focus:border-[#e88a00] focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="col-span-1 sm:col-span-2 inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5 text-[#e88a00]" />
            Dodaj usługę
          </button>
        </form>
      </section>

      {/* Section 3: Suppliers, Rates & Taxes, Workshop Info */}
      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
        {/* Suppliers */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex items-center gap-1.5">
            <h2 className="text-base font-semibold text-slate-900">
              Sklepy i dostawcy części
            </h2>
            <InfoTooltip text="Lista sklepów do przypisywania przy zakupie części naprawczych i grupowania zbiorczych zamówień." />
          </div>

          <div className="mt-4 space-y-2">
            {suppliers.map((sup) => (
              <div
                key={sup}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs"
              >
                <span className="font-medium text-slate-900">{sup}</span>
                <button
                  type="button"
                  disabled={suppliers.length <= 1}
                  onClick={() => handleRemoveSupplier(sup)}
                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                  title="Usuń dostawcę"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <form onSubmit={handleAddSupplier} className="mt-4 flex gap-2">
            <input
              type="text"
              value={newSupplierName}
              onChange={(e) => setNewSupplierName(e.target.value)}
              placeholder="np. CombatZone / Allegro"
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-[#e88a00] focus:outline-none"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5 text-[#e88a00]" />
              Dodaj
            </button>
          </form>
        </section>

        {/* Workshop Default Rates & Taxes */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex items-center gap-1.5">
            <h2 className="text-base font-semibold text-slate-900">
              Stawki warsztatu i podatki
            </h2>
            <InfoTooltip text="Domyślne stawki roboczogodziny technika, opłat eksploatacyjnych, marży na częściach oraz podatków obowiązujących przy nowych zleceniach." />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Roboczogodzina (zł/h)
              </label>
              <input
                type="number"
                min="0"
                step="10"
                value={settings.defaultTechHourlyRate}
                onChange={(e) =>
                  onSaveSettings({
                    ...settings,
                    defaultTechHourlyRate: Math.max(
                      0,
                      parseFloat(e.target.value) || 0
                    ),
                  })
                }
                className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-xs tabular-nums focus:border-[#e88a00] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Narzut na części (%)
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={settings.defaultPartsMarkupPercent}
                onChange={(e) =>
                  onSaveSettings({
                    ...settings,
                    defaultPartsMarkupPercent: Math.max(
                      0,
                      parseFloat(e.target.value) || 0
                    ),
                  })
                }
                className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-xs tabular-nums focus:border-[#e88a00] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Chemia / podkładki (zł)
              </label>
              <input
                type="number"
                min="0"
                step="5"
                value={settings.defaultConsumablesFee}
                onChange={(e) =>
                  onSaveSettings({
                    ...settings,
                    defaultConsumablesFee: Math.max(
                      0,
                      parseFloat(e.target.value) || 0
                    ),
                  })
                }
                className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-xs tabular-nums focus:border-[#e88a00] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Opłata diagnostyczna (zł)
              </label>
              <input
                type="number"
                min="0"
                step="10"
                value={settings.defaultDiagnosticFee}
                onChange={(e) =>
                  onSaveSettings({
                    ...settings,
                    defaultDiagnosticFee: Math.max(
                      0,
                      parseFloat(e.target.value) || 0
                    ),
                  })
                }
                className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-xs tabular-nums focus:border-[#e88a00] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Podatek doch. (%)
              </label>
              <select
                value={settings.defaultIncomeTaxRate}
                onChange={(e) =>
                  onSaveSettings({
                    ...settings,
                    defaultIncomeTaxRate: parseFloat(e.target.value),
                  })
                }
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 font-mono text-xs tabular-nums focus:border-[#e88a00] focus:outline-none"
              >
                <option value={0}>0%</option>
                <option value={5.5}>5,5%</option>
                <option value={8.5}>8,5%</option>
                <option value={12}>12%</option>
                <option value={19}>19%</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">
                VAT (%)
              </label>
              <select
                value={settings.defaultVatRate}
                onChange={(e) =>
                  onSaveSettings({
                    ...settings,
                    defaultVatRate: parseFloat(e.target.value),
                  })
                }
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 font-mono text-xs tabular-nums focus:border-[#e88a00] focus:outline-none"
              >
                <option value={23}>23%</option>
                <option value={8}>8%</option>
                <option value={0}>0% / Zw.</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-700">
                Tryb ryczałtu / podatku dochodowego
              </label>
              <select
                value={settings.defaultIncomeTaxMode}
                onChange={(e) =>
                  onSaveSettings({
                    ...settings,
                    defaultIncomeTaxMode: e.target.value as IncomeTaxMode,
                  })
                }
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-[#e88a00] focus:outline-none"
              >
                <option value="gross_up">Ubruttowienie (ryczałt w cenie)</option>
                <option value="markup">Narzut prosty (+%)</option>
              </select>
            </div>
          </div>
        </section>

        {/* Workshop Contact Data */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex items-center gap-1.5">
            <h2 className="text-base font-semibold text-slate-900">
              Dane serwisu (do kosztorysów PDF)
            </h2>
            <InfoTooltip text="Dane widoczne w nagłówku generowanego kosztorysu PDF oraz w stopce wiadomości e-mail PL/UKR." />
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Nazwa serwisu / pracowni
              </label>
              <input
                type="text"
                value={settings.companyName}
                onChange={(e) =>
                  onSaveSettings({ ...settings, companyName: e.target.value })
                }
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-[#e88a00] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">
                NIP
              </label>
              <input
                type="text"
                value={settings.companyNip}
                onChange={(e) =>
                  onSaveSettings({ ...settings, companyNip: e.target.value })
                }
                placeholder="opcjonalnie"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-[#e88a00] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">
                E-mail serwisu
              </label>
              <input
                type="email"
                value={settings.companyEmail}
                onChange={(e) =>
                  onSaveSettings({ ...settings, companyEmail: e.target.value })
                }
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-[#e88a00] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Telefon kontaktowy
              </label>
              <input
                type="text"
                value={settings.companyPhone}
                onChange={(e) =>
                  onSaveSettings({ ...settings, companyPhone: e.target.value })
                }
                placeholder="+48 ..."
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-[#e88a00] focus:outline-none"
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
