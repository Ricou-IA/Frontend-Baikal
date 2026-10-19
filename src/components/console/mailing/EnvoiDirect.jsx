/**
 * EnvoiDirect - Mailing (lot 4)
 * ============================================================================
 * « Envoyer un mail » depuis une fiche (prospect, client, compte), sans la
 * quitter : objet, texte, redaction assistee, test, envoi. Derriere, une
 * campagne liste d'une adresse (action envoyer_direct) : meme worker, meme
 * journal, meme suivi que toute campagne. En dessous, les mails Baikal deja
 * recus par cette adresse.
 * ============================================================================
 */
import { useCallback, useEffect, useState } from 'react';
import { Mail, Send, Sparkles, X } from 'lucide-react';
import { useApp } from '../../../contexts/AppContext';
import { useAuth } from '../../../contexts/AuthContext';
import { useDroitModule } from '../../../hooks/useDroitModule';
import { mailingService } from '../../../services/mailing.service';
import EditeurTexte from './EditeurTexte';
import { BadgeEnvoi, Bouton, fmtDateHeure } from './commun';

const CORPS_INITIAL = '<p>Bonjour {{nom|}},</p><p></p>';
const classeInput = 'w-full px-3 py-2 bg-baikal-bg border border-baikal-border rounded-md text-sm text-white placeholder:text-baikal-text/50 focus:outline-none focus:border-baikal-cyan';

function Historique({ lignes }) {
  if (!lignes) return null;
  if (lignes.length === 0) {
    return <p className="text-xs text-baikal-text opacity-60">Aucun mail Baikal envoyé à cette adresse.</p>;
  }
  return (
    <ul className="space-y-1">
      {lignes.map((l) => (
        <li key={`${l.campagne_id}-${l.touche}`} className="flex items-center gap-2 text-xs text-baikal-text">
          <span className="tabular-nums opacity-70 w-24 shrink-0">{fmtDateHeure(l.envoye_le || l.reserve_le)}</span>
          <span className="flex-1 truncate text-white/90" title={l.campagne || ''}>{l.objet || l.campagne || '—'}</span>
          <BadgeEnvoi statut={l.statut} />
        </li>
      ))}
    </ul>
  );
}

// Bouton + panneau. population : celle de la fiche (prospects, clients,
// comptes) pour que {{nom}} se resolve comme dans ses campagnes.
export default function EnvoiDirect({ population, email, nom }) {
  const { currentApp } = useApp();
  const { user } = useAuth();
  const { lecture, ecriture } = useDroitModule('mailing');
  const [ouvert, setOuvert] = useState(false);
  const [objet, setObjet] = useState('');
  const [corps, setCorps] = useState(CORPS_INITIAL);
  const [version, setVersion] = useState(0);
  const [brief, setBrief] = useState('');
  const [occupe, setOccupe] = useState(null); // 'rediger' | 'test' | 'envoi'
  const [message, setMessage] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [historique, setHistorique] = useState(null);

  const chargerHistorique = useCallback(() => {
    if (!email) return;
    mailingService.historique(currentApp, email).then(({ data, error }) => setHistorique(error ? null : data || []));
  }, [currentApp, email]);

  useEffect(() => { chargerHistorique(); }, [chargerHistorique]);

  if (!email || !lecture) return null;

  const contenu = { objet, corps_html: corps, population, criteres: { emails: [email] } };

  async function rediger(consigne) {
    setOccupe('rediger'); setErreur(null); setMessage(null);
    const { data, error } = await mailingService.rediger(currentApp, {
      consigne, brief, criteres: { emails: [email] }, objet, corps_html: corps, profilsLibelles: [], rang: 1,
    });
    setOccupe(null);
    if (error) { setErreur(error.message); return; }
    if (data.objet) setObjet(data.objet);
    if (data.corps_html) { setCorps(data.corps_html); setVersion((v) => v + 1); }
  }

  async function tester() {
    setOccupe('test'); setErreur(null); setMessage(null);
    const { data, error } = await mailingService.test(currentApp, contenu, user?.email);
    setOccupe(null);
    if (error) setErreur(error.message); else setMessage(`Test envoyé à ${data.envoye}`);
  }

  async function envoyer() {
    if (!window.confirm(`Envoyer ce mail à ${nom || email} ?`)) return;
    setOccupe('envoi'); setErreur(null); setMessage(null);
    const { error } = await mailingService.envoyerDirect(currentApp, { population, email, nom, objet, corps_html: corps });
    setOccupe(null);
    if (error) { setErreur(error.message); return; }
    setMessage('Envoyé : il part dans la minute, son suivi apparaît ci-dessous.');
    setObjet(''); setCorps(CORPS_INITIAL); setVersion((v) => v + 1); setBrief('');
    // Le worker reserve puis envoie : l'historique se relit apres quelques secondes.
    setTimeout(chargerHistorique, 4000);
    setTimeout(chargerHistorique, 20000);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs uppercase tracking-wide text-baikal-text opacity-70">Mails Baikal</span>
        {ecriture && !ouvert && (
          <Bouton onClick={() => setOuvert(true)}><Mail className="w-4 h-4" />Envoyer un mail</Bouton>
        )}
      </div>

      {ouvert && (
        <div className="rounded-lg border border-baikal-border bg-baikal-bg/40 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-white">À {nom ? `${nom} · ` : ''}{email}</span>
            <button type="button" onClick={() => setOuvert(false)} className="text-baikal-text hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-2">
            <input value={brief} onChange={(e) => setBrief(e.target.value)}
              placeholder="En une phrase, ce que vous voulez lui dire (pour l'IA)" className={classeInput} />
            <Bouton onClick={() => rediger('rediger')} disabled={Boolean(occupe)}>
              <Sparkles className="w-4 h-4" />{occupe === 'rediger' ? '…' : 'Rédiger'}
            </Bouton>
          </div>
          <input value={objet} onChange={(e) => setObjet(e.target.value)} placeholder="Objet" className={classeInput} />
          <EditeurTexte valeur={corps} version={version} onChange={setCorps} variables={['nom', 'commune', 'site']} />
          {erreur && <p className="text-xs text-red-400">{erreur}</p>}
          {message && <p className="text-xs text-emerald-400">{message}</p>}
          <div className="flex items-center justify-end gap-2">
            <Bouton onClick={tester} disabled={Boolean(occupe) || !objet.trim()} titre={`Vers ${user?.email || 'vous'}`}>
              <Send className="w-4 h-4" />Tester
            </Bouton>
            <Bouton variante="primaire" onClick={envoyer} disabled={Boolean(occupe) || !objet.trim()}>
              <Send className="w-4 h-4" />{occupe === 'envoi' ? 'Envoi…' : 'Envoyer'}
            </Bouton>
          </div>
        </div>
      )}

      <Historique lignes={historique} />
    </div>
  );
}
