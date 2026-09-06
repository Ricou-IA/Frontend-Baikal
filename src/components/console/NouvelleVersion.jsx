/**
 * NouvelleVersion.jsx - Baikal Console
 * ============================================================================
 * Detecte qu'une nouvelle version du site a ete deployee pendant que l'onglet
 * etait ouvert, et propose de recharger. Sans cela, un onglet garde l'ancien
 * code pendant des heures et l'on croit qu'une correction n'est pas livree
 * (vecu le 07/09/2026 avec la modale de suppression).
 *
 * Methode : le nom hache du bundle principal (assets/index-XXXX.js) change a
 * chaque build. On relit index.html sans cache toutes les cinq minutes et au
 * retour sur l'onglet ; s'il cite un autre bundle que celui charge, on
 * affiche le bandeau. Aucun rechargement automatique : l'utilisateur peut
 * etre en train de saisir.
 * ============================================================================
 */
import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

const MOTIF = /assets\/index-[A-Za-z0-9_-]+\.js/;

function bundleCourant() {
  const script = [...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src')).find((src) => MOTIF.test(src || ''));
  const m = script ? script.match(MOTIF) : null;
  return m ? m[0] : null;
}

export default function NouvelleVersion() {
  const [disponible, setDisponible] = useState(false);

  useEffect(() => {
    const courant = bundleCourant();
    if (!courant) return undefined; // dev server : pas de bundle hache
    let actif = true;
    const verifier = async () => {
      try {
        const res = await fetch(`/index.html?v=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const html = await res.text();
        const m = html.match(MOTIF);
        if (actif && m && m[0] !== courant) setDisponible(true);
      } catch {
        // Hors ligne ou proxy : on retentera au prochain passage.
      }
    };
    const intervalle = setInterval(verifier, 5 * 60 * 1000);
    const surRetour = () => { if (document.visibilityState === 'visible') verifier(); };
    document.addEventListener('visibilitychange', surRetour);
    return () => {
      actif = false;
      clearInterval(intervalle);
      document.removeEventListener('visibilitychange', surRetour);
    };
  }, []);

  if (!disponible) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg border border-baikal-cyan bg-baikal-surface shadow-xl text-sm text-baikal-text">
      <span>Une nouvelle version de Baikal est en ligne.</span>
      <button
        onClick={() => window.location.reload()}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-baikal-cyan text-baikal-cyan hover:bg-baikal-cyan/10 transition-colors"
      >
        <RefreshCw className="w-4 h-4" />
        Recharger
      </button>
    </div>
  );
}
