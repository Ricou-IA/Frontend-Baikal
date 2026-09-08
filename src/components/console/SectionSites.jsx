/**
 * SectionSites - Baikal Console
 * ============================================================================
 * L'onglet Sites de l'étage Baikal (/baikal?tab=sites) : le tableau de bord
 * du portefeuille. Une ligne par site du registre config.apps avec ce que
 * Baikal sait compter chez lui (comptes, organisations, admins délégués,
 * demandes pour le site Baikal) et ce qui est branché (SEO, Stripe). Les
 * clients d'un site en modèle « clients » se comptent dans son module
 * Clients, lu en direct chez lui, pas ici.
 *
 * La création d'un site reste une migration faite ensemble ; ses réglages
 * s'éditent dans son Paramétrage. En bas, repliés, les métiers : le
 * vocabulaire commun des badges Prospects / Clients (admin.metier).
 * ============================================================================
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings2, ChevronDown, ChevronRight, Tags, AlertCircle } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { comptesService } from '../../services/comptes.service';
import SectionMetiers from './SectionMetiers';

const dateFr = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR') : '—');

function Point({ actif, titre }) {
  return (
    <span
      title={titre}
      className={`inline-block w-2 h-2 rounded-full ${actif ? 'bg-green-400' : 'bg-baikal-border'}`}
    />
  );
}

export default function SectionSites() {
  const navigate = useNavigate();
  const { setCurrentApp } = useApp();
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [metiersOuverts, setMetiersOuverts] = useState(false);

  useEffect(() => {
    comptesService.sites().then(({ data, error }) => {
      if (error) setErreur(error.message);
      else setDonnees(data);
    });
  }, []);

  const ouvrirParametrage = (id) => {
    setCurrentApp(id);
    navigate('/sites');
  };

  const sites = donnees?.sites || [];
  const totaux = sites.reduce((t, s) => ({
    comptes: t.comptes + (s.comptes || 0),
    organisations: t.organisations + (s.organisations || 0),
  }), { comptes: 0, organisations: 0 });

  return (
    <div className="space-y-4">
      <div className="bg-baikal-surface border border-baikal-border rounded-md p-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <p className="text-baikal-text flex-1 min-w-[16rem]">
          Le portefeuille : chaque site du registre, ce que Baikal y compte et ce qui est
          branché. La création d'un site reste une migration faite ensemble.
        </p>
        {donnees && (
          <div className="flex gap-6 font-mono text-xs text-baikal-text">
            <span><span className="text-white text-base">{sites.filter((s) => s.actif).length}</span> sites actifs</span>
            <span><span className="text-white text-base">{totaux.comptes}</span> comptes</span>
            <span><span className="text-white text-base">{totaux.organisations}</span> organisations</span>
            <span><span className="text-white text-base">{donnees.superAdmins}</span> super admins</span>
          </div>
        )}
      </div>
      {erreur && <p className="flex items-center gap-2 text-sm text-red-400"><AlertCircle className="w-4 h-4" />{erreur}</p>}
      {!donnees && !erreur && <p className="text-baikal-text font-mono text-sm">Chargement…</p>}

      {donnees && (
        <div className="bg-baikal-surface border border-baikal-border rounded-md overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-baikal-bg/50 text-[11px] font-mono uppercase text-baikal-text">
                <th className="px-3 py-2 text-left">Site</th>
                <th className="px-3 py-2 text-left">Modèle</th>
                <th className="px-3 py-2 text-right">Comptes</th>
                <th className="px-3 py-2 text-right">Organisations</th>
                <th className="px-3 py-2 text-right">Admins Baikal</th>
                <th className="px-3 py-2 text-left">Dernier compte</th>
                <th className="px-3 py-2 text-left">Branché</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {sites.map((s) => (
                <tr key={s.id} className={`border-t border-baikal-border ${s.actif ? '' : 'opacity-50'}`}>
                  <td className="px-3 py-2">
                    <p className="text-sm text-white">{s.name}</p>
                    <p className="text-xs font-mono text-baikal-text">{s.domaine || s.id}</p>
                  </td>
                  <td className="px-3 py-2 text-sm text-baikal-text whitespace-nowrap">
                    {s.modele === 'clients' ? 'Clients' : 'Organisations'}
                  </td>
                  <td className="px-3 py-2 text-sm text-right font-mono text-white">
                    {s.modele === 'clients' && s.id !== 'baikal'
                      ? <span className="text-baikal-text" title="Les clients se comptent dans le module Clients du site">—</span>
                      : s.comptes}
                  </td>
                  <td className="px-3 py-2 text-sm text-right font-mono text-white">
                    {s.modele === 'clients' ? <span className="text-baikal-text">—</span> : s.organisations}
                  </td>
                  <td className="px-3 py-2 text-sm text-right font-mono text-white">{s.admins}</td>
                  <td className="px-3 py-2 text-sm text-baikal-text whitespace-nowrap">
                    {s.id === 'baikal' && s.demandes !== null
                      ? <span>{s.demandesNouvelles} demande{s.demandesNouvelles > 1 ? 's' : ''} nouvelle{s.demandesNouvelles > 1 ? 's' : ''} / {s.demandes}</span>
                      : dateFr(s.dernierCompte)}
                  </td>
                  <td className="px-3 py-2 text-sm whitespace-nowrap">
                    <span className="inline-flex items-center gap-3 text-xs text-baikal-text">
                      <span className="inline-flex items-center gap-1"><Point actif={s.seo} titre={s.seo ? 'Search Console renseignée' : 'Search Console absente'} />SEO</span>
                      <span className="inline-flex items-center gap-1"><Point actif={s.stripe} titre={s.stripe ? 'Stripe branché' : 'Stripe absent'} />Stripe</span>
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {s.actif ? (
                      <button
                        onClick={() => ouvrirParametrage(s.id)}
                        className="inline-flex items-center gap-1 text-xs text-baikal-cyan hover:underline"
                      >
                        <Settings2 className="w-3.5 h-3.5" /> Paramétrage
                      </button>
                    ) : <span className="text-xs text-baikal-text">inactif</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Métiers : le vocabulaire commun, replié — on n'y touche que pour
          ajouter un métier qu'un site expose déjà. */}
      <div className="bg-baikal-surface border border-baikal-border rounded-md">
        <button
          onClick={() => setMetiersOuverts((o) => !o)}
          className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm text-white hover:bg-baikal-bg/40 transition-colors"
        >
          {metiersOuverts ? <ChevronDown className="w-4 h-4 text-baikal-text" /> : <ChevronRight className="w-4 h-4 text-baikal-text" />}
          <Tags className="w-4 h-4 text-baikal-cyan" />
          Métiers
          <span className="text-xs text-baikal-text ml-2">
            le vocabulaire des badges Prospects et Clients, commun à tous les sites
          </span>
        </button>
        {metiersOuverts && <div className="px-4 pb-4"><SectionMetiers /></div>}
      </div>
    </div>
  );
}
