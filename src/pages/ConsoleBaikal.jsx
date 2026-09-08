/**
 * ConsoleBaikal.jsx - Baikal Console — l'étage Baikal
 * ============================================================================
 * Ce qui n'appartient à aucun site, super admin uniquement. Deux onglets
 * (décision d'Eric du 08/09/2026, c'est l'étage locataire) :
 *   - Comptes : tout ce qui concerne un client de Baikal — création, ses
 *     sites et le niveau par module, statut super admin, mot de passe, email,
 *     blocage (SectionComptes ; EF admin-comptes + admin-droits)
 *   - Sites : le tableau de bord du portefeuille, registre config.apps avec
 *     compteurs, et en bas les métiers repliés (SectionSites)
 * Les demandes déposées sur withbaikal.io sont les prospects du site Baikal :
 * /prospect sur le site « Baikal », pas ici.
 * Route : /baikal?tab=comptes|sites (les anciens onglets acces, superadmins,
 * registre, metiers, demandes sont redirigés).
 * ============================================================================
 */

import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ListChecks, AlertCircle } from 'lucide-react';
import ConsoleLayout from '../components/console/ConsoleLayout';
import SectionComptes from '../components/console/SectionComptes';
import SectionSites from '../components/console/SectionSites';
import { useAuth } from '../contexts/AuthContext';
import { useApp } from '../contexts/AppContext';

const ONGLETS = ['comptes', 'sites'];
// Anciens onglets : les liens et favoris continuent de marcher.
const REDIRECTIONS = { acces: 'comptes', superadmins: 'comptes', registre: 'sites', metiers: 'sites' };

function ongletDe(searchParams) {
  const t = searchParams.get('tab');
  return ONGLETS.includes(t) ? t : 'comptes';
}

function ContenuBaikal() {
  const { isSuperAdmin } = useAuth();
  const { setCurrentApp } = useApp();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = ongletDe(searchParams);

  useEffect(() => {
    if (!isSuperAdmin) navigate('/clients', { replace: true });
  }, [isSuperAdmin, navigate]);

  useEffect(() => {
    const demande = searchParams.get('tab');
    if (demande === 'demandes') {
      // Les demandes sont les prospects du site Baikal.
      setCurrentApp('baikal');
      navigate('/prospect', { replace: true });
      return;
    }
    if (!ONGLETS.includes(demande)) {
      setSearchParams({ tab: REDIRECTIONS[demande] || 'comptes' }, { replace: true });
    }
  }, [searchParams, setSearchParams, navigate, setCurrentApp]);

  if (!isSuperAdmin) {
    return (
      <div className="p-4 flex items-center gap-2 text-baikal-text">
        <AlertCircle className="w-4 h-4" /> Réservé au super admin.
      </div>
    );
  }

  const titres = {
    comptes: ['Comptes', 'Les clients de Baikal : qui administre quoi, et le compte lui-même'],
    sites: ['Sites', 'Le portefeuille : chaque site, ses comptes, ce qui est branché'],
  };
  const [titre, sousTitre] = titres[tab];

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <div className="p-2 bg-baikal-cyan/20 rounded-md">
          <ListChecks className="w-5 h-5 text-baikal-cyan" />
        </div>
        <div>
          <h1 className="text-lg font-mono font-bold text-white">BAIKAL · {titre.toUpperCase()}</h1>
          <p className="text-xs text-baikal-text font-mono">{sousTitre}</p>
        </div>
      </div>
      {tab === 'comptes' && <SectionComptes />}
      {tab === 'sites' && <SectionSites />}
    </div>
  );
}

export default function ConsoleBaikal() {
  const [searchParams] = useSearchParams();
  return (
    <ConsoleLayout actif={`baikal-${ongletDe(searchParams)}`}>
      <ContenuBaikal />
    </ConsoleLayout>
  );
}
