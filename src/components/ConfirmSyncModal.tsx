import React from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';

export interface PendingConfirmationAction {
  title: string;
  description: string;
  affectedItems: string[];
  confirmLabel: string;
  isDestructive?: boolean;
  onConfirm: () => Promise<void> | void;
}

interface ConfirmSyncModalProps {
  action: PendingConfirmationAction | null;
  isProcessing: boolean;
  isConnectedToGoogle: boolean;
  onCancel: () => void;
}

export const ConfirmSyncModal: React.FC<ConfirmSyncModalProps> = ({
  action,
  isProcessing,
  isConnectedToGoogle,
  onCancel,
}) => {
  if (!action) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                action.isDestructive
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : 'border-slate-200 bg-slate-100 text-slate-800'
              }`}
            >
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <h2 id="confirm-modal-title" className="text-base font-semibold text-slate-900">
                {action.title}
              </h2>
              <p className="mt-1 text-sm text-slate-600">{action.description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isProcessing}
            aria-label="Cerrar confirmación"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {action.affectedItems.length > 0 && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-medium text-slate-500">
              Elementos afectados ({action.affectedItems.length}):
            </p>
            <ul className="mt-2 max-h-44 space-y-1.5 overflow-y-auto text-xs text-slate-700">
              {action.affectedItems.map((item, index) => (
                <li key={index} className="flex items-baseline gap-2">
                  <span className="font-mono text-slate-400 tabular-nums">
                    {String(index + 1).padStart(2, '0')}.
                  </span>
                  <span className="truncate">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-3 text-xs text-slate-500">
          {isConnectedToGoogle
            ? 'Esta acción actualizará directamente tus datos en Google Tasks con tu permiso.'
            : 'Estás en modo de prueba interactivo. Al conectar tu cuenta con Google, los cambios se reflejarán en vivo en tu Google Tasks.'}
        </p>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isProcessing}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => action.onConfirm()}
            disabled={isProcessing}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 ${
              action.isDestructive
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-slate-900 hover:bg-slate-800'
            }`}
          >
            <Check className="h-3.5 w-3.5" />
            <span>{isProcessing ? 'Aplicando cambios...' : action.confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
