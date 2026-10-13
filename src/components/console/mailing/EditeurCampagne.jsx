/**
 * EditeurCampagne - Mailing
 * ============================================================================
 * Composer une campagne : cible (population + filtres, compteur et
 * echantillon en direct), objet, corps HTML avec variables, apercu fidele
 * (le message reel du premier destinataire), envoi de test, lancement.
 *
 * Le compteur vient de la MEME fonction que celle du worker (segment.ts) :
 * le nombre annonce est le nombre envoye.
 * Une campagne partie ne change plus de cible ; objet et corps restent
 * corrigeables tant qu'elle n'est pas terminee.
 * ============================================================================
 */
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Monitor, Rocket, Save, Send, Smartphone, Trash2 } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { mailingService } from '../../../services/mailing.service';
import { Erreur } from '../etats';
import { Badge, BadgeCampagne, Bouton, Chip, fmtNombre, POPULATIONS } from './commun';

const STATUTS_PROSPECT = [
  ['nouveau', 'Nouveau'], ['contacte', 'Contacté'], ['relance', 'Relancé'], ['repondu', 'A répondu'],
];

const CORPS_INITIAL = `<p>Bonjour {{nom|}},</p>
<p>…</p>
<p>Bien cordialement,</p>`;

function Champ({ label, children }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-baikal-text opacity-70">{label}</span>
      {children}
    </label>
  );
}

const classeInput = 'w-full px-3 py-2 bg-baikal-bg border border-baikal-border rounded-md text-sm text-white placeholder:text-baikal-text/50 focus:outline-none focus:border-baikal-cyan';

function Case({ coche, onChange, children, disabled }) {
  return (
    <label className={`flex items-center gap-1.5 text-xs text-baikal-text select-none ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <input type="checkbox" checked={coche} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="accent-baikal-cyan" />
      {children}
    </label>
  );
}

export default function EditeurCampagne({ appId, etat, campagne: initiale, ecriture, onFerme, onChange }) {
  const { user } = useAuth();
  const populations = Object.keys(etat.populations || {});
  const [c, setC] = useState(() => initiale ?? {
    nom: '',
    population: populations[0],
    criteres: {},
    objet: '',
    corps_html: CORPS_INITIAL,
    statut: 'brouillon',
  });
  const [apercu, setApercu] = useState(null);
  const [rendu, setRendu] = useState(null);
  const [mobile, setMobile] = useState(false);
  const [adresseTest, setAdresseTest] = useState(user?.email || '');
  const [message, setMessage] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const corpsRef = useRef(null);

  const cibleFigee = c.statut !== 'brouillon';
  const contenuFige = c.statut === 'terminee' || !ecriture;
  const colonnes = new Set(etat.populations?.[c.population] || []);
  const crit = c.criteres || {};
  const setCrit = (maj) => setC((x) => ({ ...x, criteres: { ...(x.criteres || {}), ...maj } }));
  const basculer = (cle, v) => {
    const liste = crit[cle] || [];
    setCrit({ [cle]: liste.includes(v) ? liste.filter((x) => x !== v) : [...liste, v] });
  };

  // Compteur + echantillon, debounce 400 ms, garde de peremption.
  const cleCible = JSON.stringify([c.population, c.criteres]);
  useEffect(() => {
    if (!c.population) return undefined;
    let actif = true;
    const t = setTimeout(() => {
      mailingService.apercu(appId, c.population, c.criteres).then(({ data, error }) => {
        if (!actif) return;
        if (error) setErreur(error.message); else setApercu(data);
      });
    }, 400);
    return () => { actif = false; clearTimeout(t); };
  }, [appId, cleCible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apercu fidele, debounce 600 ms.
  const cleRendu = JSON.stringify([c.objet, c.corps_html, c.population, c.criteres]);
  useEffect(() => {
    let actif = true;
    const t = setTimeout(() => {
      mailingService.rendu(appId, {
        objet: c.objet, corps_html: c.corps_html, population: c.population, criteres: c.criteres,
      }).then(({ data }) => { if (actif && data) setRendu(data); });
    }, 600);
    return () => { actif = false; clearTimeout(t); };
  }, [appId, cleRendu]); // eslint-disable-line react-hooks/exhaustive-deps

  function insererVariable(v) {
    const el = corpsRef.current;
    const jeton = `{{${v}}}`;
    if (!el) { setC((x) => ({ ...x, corps_html: x.corps_html + jeton })); return; }
    const { selectionStart: d, selectionEnd: f } = el;
    setC((x) => ({ ...x, corps_html: x.corps_html.slice(0, d) + jeton + x.corps_html.slice(f) }));
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = d + jeton.length; });
  }

  async function enregistrer() {
    setOccupe(true); setErreur(null); setMessage(null);
    const { data, error } = await mailingService.enregistrer(appId, c);
    setOccupe(false);
    if (error) { setErreur(error.message); return null; }
    setC((x) => ({ ...x, ...data }));
    setMessage('Enregistrée');
    onChange?.();
    return data;
  }

  async function envoyerTest() {
    setOccupe(true); setErreur(null); setMessage(null);
    const { data, error } = await mailingService.test(appId, {
      objet: c.objet, corps_html: c.corps_html, population: c.population, criteres: c.criteres,
    }, adresseTest);
    setOccupe(false);
    if (error) setErreur(error.message); else setMessage(`Test envoyé à ${data.envoye}`);
  }

  const plafond = etat.envoi?.plafond_jour || 200;
  const total = apercu?.total ?? 0;
  const jours = Math.max(1, Math.ceil(total / plafond));

  async function lancer() {
    const sauvee = await enregistrer();
    if (!sauvee) return;
    const ok = window.confirm(
      `Lancer « ${sauvee.nom} » vers ${fmtNombre(total)} destinataire(s) ?\n\n` +
      `Envoi automatique par lots, ${fmtNombre(plafond)} par jour maximum ` +
      `(${jours} jour${jours > 1 ? 's' : ''} environ). Suspendable à tout moment.`,
    );
    if (!ok) return;
    setOccupe(true);
    const { error } = await mailingService.lancer(appId, sauvee.id);
    setOccupe(false);
    if (error) { setErreur(error.message); return; }
    onChange?.();
    onFerme(sauvee.id, true);
  }

  async function supprimer() {
    if (!c.id || !window.confirm('Supprimer ce brouillon ?')) return;
    const { error } = await mailingService.supprimer(appId, c.id);
    if (error) { setErreur(error.message); return; }
    onChange?.();
    onFerme(null);
  }

  const envoiPret = Boolean(etat.envoi?.expediteur && etat.envoi?.cle);
  const categories = etat.categories || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button onClick={() => onFerme(c.id ?? null, c.statut !== 'brouillon')} className="flex items-center gap-2 text-sm text-baikal-text hover:text-baikal-cyan">
          <ArrowLeft className="w-4 h-4" /> Campagnes
        </button>
        <div className="flex items-center gap-2 flex-wrap">
          {c.id && <BadgeCampagne statut={c.statut} />}
          {ecriture && c.statut === 'brouillon' && c.id && (
            <Bouton variante="danger" onClick={supprimer} disabled={occupe}><Trash2 className="w-4 h-4" />Supprimer</Bouton>
          )}
          {!contenuFige && (
            <Bouton onClick={enregistrer} disabled={occupe}><Save className="w-4 h-4" />Enregistrer</Bouton>
          )}
          {ecriture && ['brouillon', 'suspendue'].includes(c.statut) && (
            <Bouton variante="primaire" onClick={lancer} disabled={occupe || !envoiPret || total === 0 || !c.objet.trim()}
              titre={!envoiPret ? 'Expéditeur ou clé Resend manquant' : undefined}>
              <Rocket className="w-4 h-4" />{c.statut === 'suspendue' ? 'Reprendre' : 'Lancer'}
            </Bouton>
          )}
        </div>
      </div>

      {erreur && <Erreur message={erreur} />}
      {message && <p className="text-sm text-emerald-400">{message}</p>}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Colonne gauche : cible et contenu */}
        <div className="space-y-4">
          <div className="bg-baikal-surface border border-baikal-border rounded-lg p-4 space-y-3">
            <Champ label="Nom de la campagne">
              <input value={c.nom} disabled={contenuFige} onChange={(e) => setC({ ...c, nom: e.target.value })}
                placeholder="Relance diagnostiqueurs octobre" className={classeInput} />
            </Champ>

            <div className="space-y-2">
              <span className="text-xs text-baikal-text opacity-70">Destinataires</span>
              <div className="flex gap-1.5 flex-wrap">
                {populations.map((p) => (
                  <Chip key={p} actif={c.population === p} disabled={cibleFigee}
                    onClick={() => setC({ ...c, population: p, criteres: {} })}>
                    {POPULATIONS[p] || p}
                  </Chip>
                ))}
              </div>
            </div>

            {c.population === 'prospects' && (
              <div className="space-y-2">
                {colonnes.has('metier') && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs text-baikal-text opacity-60 mr-1">Métier</span>
                    {(etat.metiers || []).map((m) => (
                      <Chip key={m.slug} actif={(crit.metiers || []).includes(m.slug)} disabled={cibleFigee}
                        onClick={() => basculer('metiers', m.slug)}>{m.libelle}</Chip>
                    ))}
                  </div>
                )}
                {colonnes.has('statut') && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs text-baikal-text opacity-60 mr-1">Statut</span>
                    {STATUTS_PROSPECT.map(([s, l]) => (
                      <Chip key={s} actif={(crit.statuts || []).includes(s)} disabled={cibleFigee}
                        onClick={() => basculer('statuts', s)}>{l}</Chip>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-4 flex-wrap">
                  {colonnes.has('code_postal') && (
                    <input value={crit.departement || ''} disabled={cibleFigee} maxLength={3} placeholder="Dépt"
                      onChange={(e) => setCrit({ departement: e.target.value })}
                      className="w-20 px-3 py-1.5 bg-baikal-bg border border-baikal-border rounded-md text-sm text-white uppercase placeholder:normal-case focus:outline-none focus:border-baikal-cyan" />
                  )}
                  {colonnes.has('client_depuis') && (
                    <Case coche={crit.exclureClients !== false} disabled={cibleFigee}
                      onChange={(v) => setCrit({ exclureClients: v })}>Hors clients</Case>
                  )}
                  {colonnes.has('dernier_contact_le') && (
                    <Case coche={crit.jamaisContactes === true} disabled={cibleFigee}
                      onChange={(v) => setCrit({ jamaisContactes: v })}>Jamais contactés</Case>
                  )}
                </div>
              </div>
            )}

            {c.population === 'clients' && colonnes.has('paye_le') && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-baikal-text opacity-60 mr-1">Paiement</span>
                {[['tous', 'Tous'], ['payes', 'Ont payé'], ['non_payes', "N'ont pas payé"]].map(([v, l]) => (
                  <Chip key={v} actif={(crit.paye || 'tous') === v} disabled={cibleFigee}
                    onClick={() => setCrit({ paye: v })}>{l}</Chip>
                ))}
              </div>
            )}

            {c.population === 'comptes' && colonnes.has('actif') && (
              <Case coche={crit.actifs !== false} disabled={cibleFigee}
                onChange={(v) => setCrit({ actifs: v })}>Comptes actifs seulement</Case>
            )}

            {c.population !== 'prospects' && colonnes.has('categorie') && categories.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-baikal-text opacity-60 mr-1">Catégorie</span>
                {categories.map((k) => (
                  <Chip key={k.slug} actif={(crit.categories || []).includes(k.slug)} disabled={cibleFigee}
                    onClick={() => basculer('categories', k.slug)}>{k.libelle}</Chip>
                ))}
              </div>
            )}

            <Case coche={crit.exclureDejaEcrits === true} disabled={cibleFigee}
              onChange={(v) => setCrit({ exclureDejaEcrits: v })}>
              Exclure les adresses déjà écrites par une campagne
            </Case>

            <div className="pt-2 border-t border-baikal-border/60">
              <p className="text-sm text-baikal-text">
                <span className="text-baikal-cyan font-semibold tabular-nums">{fmtNombre(total)}</span>
                {' '}destinataire(s) ciblé(s)
                {total > 0 && <span className="opacity-60"> · {fmtNombre(plafond)}/jour → {jours} j</span>}
              </p>
              {(apercu?.echantillon || []).length > 0 && (
                <ul className="mt-2 text-xs text-baikal-text opacity-70 space-y-0.5 max-h-40 overflow-y-auto">
                  {apercu.echantillon.map((d) => (
                    <li key={d.email} className="truncate">
                      {d.nom ? <span className="text-white/80">{d.nom}</span> : null} {d.email}
                      {d.commune ? <span className="opacity-60"> · {d.commune}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="bg-baikal-surface border border-baikal-border rounded-lg p-4 space-y-3">
            <Champ label="Objet">
              <input value={c.objet} disabled={contenuFige} onChange={(e) => setC({ ...c, objet: e.target.value })}
                placeholder="Objet du mail" className={classeInput} />
            </Champ>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-baikal-text opacity-60 mr-1">Insérer</span>
              {(etat.variables || []).map((v) => (
                <Chip key={v} disabled={contenuFige} onClick={() => insererVariable(v)}>{`{{${v}}}`}</Chip>
              ))}
              <span className="text-[11px] text-baikal-text opacity-50">repli : {'{{nom|Madame, Monsieur}}'}</span>
            </div>
            <textarea ref={corpsRef} value={c.corps_html} disabled={contenuFige} rows={16}
              onChange={(e) => setC({ ...c, corps_html: e.target.value })}
              className={`${classeInput} font-mono text-xs leading-5`} />
          </div>
        </div>

        {/* Colonne droite : apercu et test */}
        <div className="space-y-4">
          <div className="bg-baikal-surface border border-baikal-border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-xs text-baikal-text min-w-0">
                <div className="truncate"><span className="opacity-60">De :</span> {etat.envoi?.expediteur || <Badge couleur="red">aucun expéditeur</Badge>}</div>
                <div className="truncate"><span className="opacity-60">Objet :</span> <span className="text-white">{rendu?.objet || '—'}</span></div>
                {rendu?.destinataire && <div className="truncate opacity-60">Rendu pour {rendu.destinataire}</div>}
              </div>
              <div className="flex gap-1">
                <Chip actif={!mobile} onClick={() => setMobile(false)}><Monitor className="w-3.5 h-3.5" /></Chip>
                <Chip actif={mobile} onClick={() => setMobile(true)}><Smartphone className="w-3.5 h-3.5" /></Chip>
              </div>
            </div>
            <div className="flex justify-center bg-white rounded-md overflow-hidden">
              <iframe title="Aperçu" sandbox="" srcDoc={rendu?.html || ''}
                style={{ width: mobile ? 375 : '100%', height: 560, border: 0 }} />
            </div>
          </div>

          {ecriture && (
            <div className="bg-baikal-surface border border-baikal-border rounded-lg p-4 flex items-center gap-2 flex-wrap">
              <input value={adresseTest} onChange={(e) => setAdresseTest(e.target.value)} placeholder="adresse de test"
                className={`${classeInput} flex-1 min-w-[200px]`} />
              <Bouton onClick={envoyerTest} disabled={occupe || !envoiPret || !c.objet.trim()}>
                <Send className="w-4 h-4" />Envoyer un test
              </Bouton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
