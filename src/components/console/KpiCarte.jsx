/**
 * KpiCarte - Baikal Console
 * Carte KPI avec accent metier (adaptation du KpiCard de Pack Vendeur au
 * theme baikal). accent: default | success | info | warning | danger.
 */
const ACCENTS = {
  default: 'text-white',
  success: 'text-emerald-400',
  info: 'text-blue-400',
  warning: 'text-amber-400',
  danger: 'text-red-400',
};

export default function KpiCarte({ label, valeur, sous, accent = 'default' }) {
  return (
    <div className="bg-baikal-surface border border-baikal-border rounded-lg p-4">
      <p className="text-xs font-mono text-baikal-text uppercase">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${ACCENTS[accent] || ACCENTS.default}`}>
        {valeur}
      </p>
      {sous && <p className="text-xs text-baikal-text opacity-60 mt-1">{sous}</p>}
    </div>
  );
}
