/**
 * AdminsSite - Baikal Console
 * ============================================================================
 * Bloc « Accès console » d'un site : les personnes qui administrent ce site
 * depuis Baikal (admin.droits_sites), avec leur grille par module (ferme /
 * lecture / ecriture). Liste, ajout par email d'un compte existant (tout en
 * ecriture par defaut), reglage des modules, retrait. Super admin uniquement
 * (EF admin-droits).
 *
 * Utilise par la page Paramétrage (fiche du site) et par la page Utilisateurs
 * (onglet « Accès console »). La vue d'ensemble de tous les sites est dans
 * l'etage Baikal (/baikal?tab=acces).
 * ============================================================================
 */

import { useState, useEffect, useCallback } from 'react';
import { UserPlus, X, Check } from 'lucide-react';
import { droitsService } from '../../services/droits.service';
import ModulesDroits from './ModulesDroits';

function LigneAcces({ acces, appId, onChanged, onRevoke }) {
  const [modules, setModules] = useState(acces.modules || {});
  const [sauve, setSauve] = useState(false);
  const [erreur, setErreur] = useState(null);

  useEffect(() => { setModules(acces.modules || {}); }, [acces.modules]);

  const changer = async (suivant) => {
    setModules(suivant);
    setErreur(null);
    const { error } = await droitsService.setModules(appId, acces.userId, suivant);
    if (error) { setErreur(error.message); return; }
    setSauve(true);
    setTimeout(() => setSauve(false), 1500);
    onChanged?.();
  };

  return (
    <li className="py-2 border-b border-baikal-border last:border-0 space-y-1.5">
      <div className="flex items-center gap-2 text-sm text-baikal-text font-mono">
        <span>{acces.email}</span>
        {acces.nom && <span className="opacity-60">({acces.nom})</span>}
        {sauve && <Check className="w-3.5 h-3.5 text-green-400" />}
        <button
          onClick={() => onRevoke(acces.userId)}
          title="Retirer l'accès"
          className="ml-auto p-1 text-baikal-text hover:text-red-400 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <ModulesDroits modules={modules} onChange={changer} />
      {erreur && <p className="text-red-400 text-xs">{erreur}</p>}
    </li>
  );
}

export default function AdminsSite({ appId, titre = 'Accès console', aide }) {
  const [admins, setAdmins] = useState([]);
  const [email, setEmail] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState(null);

  const charger = useCallback(async () => {
    const { data, error } = await droitsService.list(appId);
    if (error) setErreur(error.message);
    else setAdmins(data || []);
  }, [appId]);

  useEffect(() => { charger(); }, [charger]);

  const ajouter = async () => {
    if (!email.includes('@')) return;
    setOccupe(true);
    setErreur(null);
    const { error } = await droitsService.grant(appId, email.trim());
    setOccupe(false);
    if (error) setErreur(error.message);
    else { setEmail(''); charger(); }
  };

  const retirer = async (userId) => {
    setErreur(null);
    const { error } = await droitsService.revoke(appId, userId);
    if (error) setErreur(error.message);
    else charger();
  };

  return (
    <div className="space-y-2">
      <p className="text-sm text-baikal-text opacity-70">{titre}</p>
      {aide && <p className="text-xs text-baikal-text opacity-60">{aide}</p>}
      {admins.length === 0 && (
        <p className="text-xs text-baikal-text opacity-50">Aucun — seul le super admin voit ce site.</p>
      )}
      <ul>
        {admins.map((a) => (
          <LigneAcces key={a.userId} acces={a} appId={appId} onRevoke={retirer} />
        ))}
      </ul>
      <div className="flex items-center gap-2 pt-1">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') ajouter(); }}
          placeholder="email d'un compte existant"
          className="px-2 py-1.5 rounded border border-baikal-border bg-baikal-bg text-baikal-text focus:border-baikal-cyan outline-none font-mono text-sm w-64"
        />
        <button
          onClick={ajouter}
          disabled={occupe || !email.includes('@')}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-baikal-cyan text-baikal-cyan hover:bg-baikal-cyan/10 transition-colors disabled:opacity-50 text-sm"
        >
          <UserPlus className="w-4 h-4" />
          Ajouter
        </button>
        <span className="text-xs text-baikal-text opacity-50">Tout en écriture par défaut, à régler ensuite.</span>
      </div>
      {erreur && <p className="text-red-400 text-sm">{erreur}</p>}
    </div>
  );
}
