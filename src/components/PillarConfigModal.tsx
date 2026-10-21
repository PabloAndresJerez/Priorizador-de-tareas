import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { type PriorityPillar, DEFAULT_PILLARS } from '../utils/priorityEngine';

interface PillarConfigModalProps {
  isOpen: boolean;
  pillars: PriorityPillar[];
  onClose: () => void;
  onSavePillars: (updated: PriorityPillar[]) => void;
}

const PRESET_COLORS = [
  '#0F766E', // Teal (Salud)
  '#B45309', // Ochre (Familia)
  '#1D4ED8', // Blue (Trabajo)
  '#4338CA', // Indigo (Finanzas)
  '#6D28D9', // Violet (Aprendizaje)
  '#BE185D', // Rose (Ocio)
  '#15803D', // Forest Green
  '#334155', // Slate
];

export const PillarConfigModal: React.FC<PillarConfigModalProps> = ({
  isOpen,
  pillars,
  onClose,
  onSavePillars,
}) => {
  const [draftPillars, setDraftPillars] = useState<PriorityPillar[]>(pillars);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newKeywords, setNewKeywords] = useState('');
  const [newWeight, setNewWeight] = useState(7);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleWeightChange = (id: string, weight: number) => {
    setDraftPillars((prev) =>
      prev.map((p) => (p.id === id ? { ...p, weight } : p))
    );
  };

  const handleMovePillar = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= draftPillars.length) return;
    const copy = [...draftPillars];
    const [moved] = copy.splice(index, 1);
    copy.splice(targetIndex, 0, moved);
    const reranked = copy.map((p, idx) => ({
      ...p,
      rank: idx + 1,
    }));
    setDraftPillars(reranked);
  };

  const handleDeletePillar = (id: string) => {
    if (draftPillars.length <= 2) {
      setErrorMsg('Debes mantener al menos 2 dimensiones de prioridad activas.');
      return;
    }
    setErrorMsg(null);
    const filtered = draftPillars
      .filter((p) => p.id !== id)
      .map((p, idx) => ({ ...p, rank: idx + 1 }));
    setDraftPillars(filtered);
  };

  const handleAddPillar = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) {
      setErrorMsg('Ingresa un nombre para la nueva prioridad (ej. Deporte, Arte, Comunidad).');
      return;
    }
    const slug = trimmed
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || `pilar-${Date.now()}`;

    if (draftPillars.some((p) => p.id === slug)) {
      setErrorMsg('Ya existe una dimensión con ese nombre.');
      return;
    }

    const keywords = newKeywords
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);

    const nextPillar: PriorityPillar = {
      id: slug,
      name: trimmed,
      description: newDescription.trim() || 'Dimensión personalizada para clasificar y priorizar tareas.',
      weight: newWeight,
      rank: draftPillars.length + 1,
      keywords: keywords.length > 0 ? keywords : [trimmed.toLowerCase()],
      accentHex: PRESET_COLORS[draftPillars.length % PRESET_COLORS.length],
    };

    setDraftPillars([...draftPillars, nextPillar]);
    setNewName('');
    setNewDescription('');
    setNewKeywords('');
    setNewWeight(7);
    setErrorMsg(null);
  };

  const handleRestoreDefaults = () => {
    setDraftPillars(DEFAULT_PILLARS);
    setErrorMsg(null);
  };

  const handleSave = () => {
    onSavePillars(draftPillars);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pillar-modal-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-slate-200 bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 id="pillar-modal-title" className="text-lg font-semibold text-slate-900">
              Configurar Dimensiones de Prioridad
            </h2>
            <p className="text-xs text-slate-500">
              Define el peso (1 a 10) y el orden jerárquico de tus pilares vitales (Salud, Familia, Ocio, etc.) para ordenar tus tareas.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar configuración de prioridades"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          {errorMsg && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700">
              {errorMsg}
            </div>
          )}

          <div className="space-y-3">
            {draftPillars.map((pillar, index) => (
              <div
                key={pillar.id}
                className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-xs font-semibold text-slate-400 tabular-nums">
                      0{index + 1}.
                    </span>
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-xs"
                      style={{ backgroundColor: pillar.accentHex }}
                    />
                    <span className="text-sm font-semibold text-slate-900">{pillar.name}</span>
                    <span className="text-xs text-slate-400">·</span>
                    <span className="font-mono text-xs text-slate-600 tabular-nums">
                      Peso {pillar.weight}/10
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{pillar.description}</p>
                  <p className="mt-1 text-xs text-slate-400 truncate">
                    Palabras clave auto-detección: {pillar.keywords.join(', ')}
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor={`weight-${pillar.id}`}
                      className="text-xs font-medium text-slate-600 whitespace-nowrap"
                    >
                      Importancia:
                    </label>
                    <input
                      id={`weight-${pillar.id}`}
                      type="range"
                      min={1}
                      max={10}
                      value={pillar.weight}
                      onChange={(e) => handleWeightChange(pillar.id, Number(e.target.value))}
                      className="h-1.5 w-24 cursor-pointer accent-slate-900"
                    />
                  </div>

                  <div className="flex items-center gap-1 border-l border-slate-200 pl-3">
                    <button
                      type="button"
                      onClick={() => handleMovePillar(index, -1)}
                      disabled={index === 0}
                      aria-label={`Subir prioridad ${pillar.name}`}
                      className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMovePillar(index, 1)}
                      disabled={index === draftPillars.length - 1}
                      aria-label={`Bajar prioridad ${pillar.name}`}
                      className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeletePillar(pillar.id)}
                      aria-label={`Eliminar prioridad ${pillar.name}`}
                      className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <form
            onSubmit={handleAddPillar}
            className="rounded-lg border border-slate-200 bg-white p-4"
          >
            <h3 className="text-sm font-semibold text-slate-900">
              Añadir nueva dimensión de prioridad
            </h3>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="new-pillar-name" className="block text-xs font-medium text-slate-700">
                  Nombre de la prioridad
                </label>
                <input
                  id="new-pillar-name"
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ej. Espiritualidad, Mascotas..."
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="new-pillar-keywords" className="block text-xs font-medium text-slate-700">
                  Palabras clave (separadas por coma)
                </label>
                <input
                  id="new-pillar-keywords"
                  type="text"
                  value={newKeywords}
                  onChange={(e) => setNewKeywords(e.target.value)}
                  placeholder="meditar, veterinario, paseo"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="new-pillar-weight" className="block text-xs font-medium text-slate-700">
                  Peso inicial ({newWeight}/10)
                </label>
                <input
                  id="new-pillar-weight"
                  type="range"
                  min={1}
                  max={10}
                  value={newWeight}
                  onChange={(e) => setNewWeight(Number(e.target.value))}
                  className="mt-2.5 h-1.5 w-full cursor-pointer accent-slate-900"
                />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <input
                type="text"
                aria-label="Descripción de la nueva prioridad"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Descripción breve (opcional)"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-100 px-3.5 py-1.5 text-xs font-semibold text-slate-900 hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Agregar dimensión</span>
              </button>
            </div>
          </form>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
          <button
            type="button"
            onClick={handleRestoreDefaults}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Restaurar pilares predeterminados</span>
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              Guardar y recalcular prioridades
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
