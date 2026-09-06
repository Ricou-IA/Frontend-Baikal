/**
 * AdminsSite - Baikal Console
 * ============================================================================
 * Bloc « Accès console » d'un site : les personnes qui administrent ce site
 * depuis Baikal (admin.droits_sites). Liste, ajout par email d'un compte
 * existant, retrait. Super admin uniquement (EF admin-droits).
 *
 * Utilisé par la page Sites (fiche du site) et par la page Utilisateurs
 * (onglet « Accès console »). Extrait de Sites.jsx le 06/09/2026.
 * ============================================================================
 */

import { useState, useEffect, useCallback } from 'react';
import { UserPlus, X } from 'lucide-react';
import { droitsService } from '../../services/droits.service';

export default function AdminsSite({ appId, titre = 'Admins délégués', aide }) {
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
      <ul className="space-y-1">
        {admins.map((a) => (
          <li key={a.userId} className="flex items-center gap-2 text-sm text-baikal-text font-mono">
            <span>{a.email}</span>
            {a.nom && <span className="opacity-60">({a.nom})</span>}
            <button
              onClick={() => retirer(a.userId)}
              title="Retirer le droit"
              className="p-1 text-baikal-text hover:text-red-400 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2">
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
      </div>
      {erreur && <p className="text-red-400 text-sm">{erreur}</p>}
    </div>
  );
}
