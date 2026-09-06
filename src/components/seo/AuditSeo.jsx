/**
 * AuditSeo.jsx - Baikal Console
 * ============================================================================
 * L'audit SEO lance depuis Baikal : la grille du flash audit (trafic en jours
 * ouvres, ventes selon les deux comptes, clusters, requetes suivies et pages
 * cles en requete x page, appareils, autorite Moz, chantiers), calculee par
 * l'EF admin-rapport, puis un texte redige par le modele que l'on relit.
 * « Enregistrer » archive l'audit ; le rapport au partenaire reprend le
 * dernier audit de sa periode.
 * ============================================================================
 */
import { useEffect, useState } from 'react';
import { AlertTriangle, Sparkles, Save, Eye, Trash2 } from 'lucide-react';
import { Chargement, Erreur, LigneVide, Section, Vide } from '../console/etats';
import SelecteurPeriode, { libellePeriode, moisPeriode } from '../rapports/SelecteurPeriode';
import { seoService } from '../../services/seo.service';
import ConfirmModal from '../ui/ConfirmModal';
import TableauTrafic from './TableauTrafic';

const CHAMP = 'px-2 py-1.5 rounded border border-baikal-border bg-baikal-bg text-baikal-text focus:border-baikal-cyan outline-none text-sm';
const BOUTON = 'flex items-center gap-1.5 px-3 py-1.5 rounded border text-sm transition-colors disabled:opacity-50';
const CLUSTERS = {
  en_ligne: 'En ligne', prix: 'Prix', modele: 'Modèle', foncia: 'Foncia / Nexity / Citya',
  delai: 'Délai', tantiemes: 'Tantièmes', remboursement: 'Remboursement', autre: 'Autre',
};
const APPAREILS = { mobile: 'Mobile', desktop: 'Ordinateur', tablet: 'Tablette' };

const nb = (n) => new Intl.NumberFormat('fr-FR').format(Number(n || 0));
const pos = (n) => (n === null || n === undefined ? '—' : Number(n).toFixed(1).replace('.', ','));
const pct = (n) => `${Math.round(Number(n || 0) * 100)} %`;
// Variation de position : negatif = gain de places (vert), positif = perte.
function Variation({ actuel, precedent }) {
  if (actuel === null || actuel === undefined || precedent === null || precedent === undefined) return <span className="opacity-40">—</span>;
  const d = Number(actuel) - Number(precedent);
  if (Math.abs(d) < 0.05) return <span className="opacity-60">=</span>;
  return <span className={d < 0 ? 'text-emerald-400' : 'text-red-400'}>{d < 0 ? '▲' : '▼'} {Math.abs(d).toFixed(1).replace('.', ',')}</span>;
}
const majuscule = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
function moisPrecedent() {
  const d = new Date();
  const p = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
  return moisPeriode(p.getUTCFullYear(), p.getUTCMonth());
}
function dateFr(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function Tableau({ titre, colonnes, lignes, cle, classeLigne }) {
  return (
    <div className="bg-baikal-surface border border-baikal-border rounded-lg overflow-hidden">
      {titre && <div className="px-4 py-2 text-xs opacity-60 uppercase tracking-wider text-baikal-text">{titre}</div>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-baikal-text">
          <thead>
            <tr className="text-left text-xs opacity-70 border-b border-baikal-border">
              {colonnes.map((c) => (
                <th key={c.titre} className={`px-3 py-1.5 whitespace-nowrap ${c.droite ? 'text-right' : ''}`}>{c.titre}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lignes.length === 0 && <LigneVide colonnes={colonnes.length} message="Rien sur cette période." />}
            {lignes.map((l, i) => (
              <tr key={cle ? cle(l, i) : i} className={`border-t border-baikal-border/50 ${classeLigne ? classeLigne(l) : ''}`}>
                {colonnes.map((c) => (
                  <td key={c.titre} className={`px-3 py-1.5 ${c.droite ? 'text-right tabular-nums' : ''} ${c.gras ? 'text-white' : ''}`}>{c.valeur(l)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Le texte du modele : titres « ## » en intertitres, puces, paragraphes.
function TexteAudit({ texte }) {
  const lignes = String(texte || '').split('\n');
  return (
    <div className="space-y-1 text-sm text-baikal-text leading-relaxed">
      {lignes.map((l, i) => {
        const t = l.trim();
        if (!t) return null;
        if (/^#{1,3}\s/.test(t)) return <div key={i} className="text-white font-semibold mt-3">{t.replace(/^#{1,3}\s/, '')}</div>;
        if (/^[-•*]\s/.test(t)) return <div key={i} className="pl-4 relative before:content-['•'] before:absolute before:left-0">{t.replace(/^[-•*]\s/, '')}</div>;
        return <p key={i}>{t}</p>;
      })}
    </div>
  );
}

function Resultat({ audit, texte, setTexte, lectureSeule }) {
  const l = audit.lecture;
  const vc = l?.ventes?.par_creation;
  return (
    <div className="space-y-4">
      {audit.sources_manquantes?.length > 0 && (
        <div className="p-3 bg-amber-900/20 border border-amber-500/50 rounded-md flex items-start gap-3 text-amber-300 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <ul className="space-y-0.5">{audit.sources_manquantes.map((m) => <li key={m}>{m}</li>)}</ul>
        </div>
      )}
      {l?.trafic && (
        <>
          <TableauTrafic google={l.trafic.google} bing={l.trafic.bing} titre="Trafic par semaine pleine — Google et Bing" />
          <div className="grid md:grid-cols-2 gap-4">
            <Tableau
              titre="Ventes, deux comptes"
              colonnes={[
                { titre: 'Compte', valeur: (x) => x[0] },
                { titre: 'Ventes', valeur: (x) => x[1], droite: true, gras: true },
                { titre: 'Dont organiques', valeur: (x) => x[2], droite: true },
              ]}
              lignes={[
                ['Par date de paiement (Stripe)', `${nb(l.ventes.par_paiement.nettes)} nettes sur ${nb(l.ventes.par_paiement.ventes)}`, '—'],
                vc?.disponible ? ['Par date de création (site, doublons exclus)', nb(vc.payes), nb(vc.payes_organique)] : ['Par date de création', 'indisponible', '—'],
              ]}
              cle={(x) => x[0]}
            />
            <Tableau
              titre="Clics Google par appareil"
              colonnes={[
                { titre: 'Appareil', valeur: (x) => APPAREILS[x.appareil] || x.appareil },
                { titre: 'Clics', valeur: (x) => nb(x.clics), droite: true, gras: true },
                { titre: 'Part', valeur: (x) => pct(x.part_clics), droite: true },
                { titre: 'Part préc.', valeur: (x) => (x.part_clics_precedent === null ? '—' : pct(x.part_clics_precedent)), droite: true },
              ]}
              lignes={l.appareils || []}
              cle={(x) => x.appareil}
            />
          </div>
          {vc?.disponible && vc.par_page.length > 0 && (
            <Tableau
              titre={`Portes d'entrée organiques : ${nb(vc.dossiers)} dossiers, ${nb(vc.emails)} emails, ${nb(vc.payes)} ventes`}
              colonnes={[
                { titre: "Page d'entrée", valeur: (x) => x.page },
                { titre: 'Dossiers', valeur: (x) => nb(x.dossiers), droite: true },
                { titre: 'Emails', valeur: (x) => nb(x.emails), droite: true },
                { titre: 'Ventes', valeur: (x) => nb(x.payes), droite: true, gras: true },
                { titre: 'Conv.', valeur: (x) => (x.dossiers > 0 ? pct(x.payes / x.dossiers) : '—'), droite: true },
              ]}
              lignes={vc.par_page}
              cle={(x) => x.page}
            />
          )}
          <Tableau
            titre="Clusters de requêtes, hors bruit (période, puis précédente)"
            colonnes={[
              { titre: 'Cluster', valeur: (x) => CLUSTERS[x.cluster] || x.cluster },
              { titre: 'Requêtes', valeur: (x) => nb(x.requetes), droite: true },
              { titre: 'Clics', valeur: (x) => nb(x.clics), droite: true, gras: true },
              { titre: 'Impressions', valeur: (x) => nb(x.impressions), droite: true },
              { titre: 'Position', valeur: (x) => pos(x.position), droite: true },
              { titre: 'Clics préc.', valeur: (x) => (x.prec ? nb(x.prec.clics) : '—'), droite: true },
              { titre: 'Pos. préc.', valeur: (x) => (x.prec ? pos(x.prec.position) : '—'), droite: true },
            ]}
            lignes={l.clusters.periode.map((c) => ({ ...c, prec: l.clusters.precedent.find((p) => p.cluster === c.cluster) || null }))}
            cle={(x) => x.cluster}
          />
          <div className="grid md:grid-cols-2 gap-4">
            <Tableau
              titre="Requêtes suivies, requête × page"
              colonnes={[
                { titre: 'Requête', valeur: (x) => x.requete },
                { titre: 'Page', valeur: (x) => <span className="font-mono text-xs opacity-70">{x.page || '—'}</span> },
                { titre: 'Pos.', valeur: (x) => pos(x.position), droite: true, gras: true },
                { titre: 'Préc.', valeur: (x) => pos(x.position_precedente), droite: true },
                { titre: 'Var.', valeur: (x) => <Variation actuel={x.position} precedent={x.position_precedente} />, droite: true },
              ]}
              lignes={l.suivi.requetes}
              cle={(x) => x.requete}
            />
            <Tableau
              titre="Pages clés, requête × page"
              colonnes={[
                { titre: 'Page', valeur: (x) => <span className="font-mono text-xs">{x.page.replace(/^https?:\/\/[^/]+/, '') || '/'}</span> },
                { titre: 'Requêtes', valeur: (x) => nb(x.requetes), droite: true },
                { titre: 'Clics', valeur: (x) => nb(x.clics), droite: true },
                { titre: 'Pos.', valeur: (x) => pos(x.position), droite: true, gras: true },
                { titre: 'Préc.', valeur: (x) => pos(x.position_precedente), droite: true },
                { titre: 'Var.', valeur: (x) => <Variation actuel={x.position} precedent={x.position_precedente} />, droite: true },
              ]}
              lignes={l.suivi.pages}
              cle={(x) => x.page}
            />
          </div>
          <Tableau
            titre="Autorité de domaine (Moz), du plus fort au plus faible"
            colonnes={[
              { titre: 'Domaine', valeur: (x) => `${x.domaine}${x.notre ? ' (nous)' : ''}` },
              { titre: 'DA', valeur: (x) => (x.da === null ? '—' : nb(x.da)), droite: true, gras: true },
              { titre: 'DA préc.', valeur: (x) => (x.da_precedent === null || x.da_precedent === undefined ? '—' : nb(x.da_precedent)), droite: true },
              { titre: 'PA', valeur: (x) => (x.pa === null || x.pa === undefined ? '—' : nb(x.pa)), droite: true },
              { titre: 'Spam', valeur: (x) => (x.spam === null ? '—' : <span className={x.spam >= 10 ? 'text-amber-400' : ''}>{nb(x.spam)}</span>), droite: true },
              { titre: 'Domaines réf.', valeur: (x) => (x.ref_domains === null ? '—' : nb(x.ref_domains)), droite: true, gras: true },
              { titre: 'Réf. préc.', valeur: (x) => (x.ref_domains_precedent === null || x.ref_domains_precedent === undefined ? '—' : nb(x.ref_domains_precedent)), droite: true },
              { titre: 'Liens ext.', valeur: (x) => (x.external_links === null || x.external_links === undefined ? '—' : nb(x.external_links)), droite: true },
              { titre: 'Nofollow', valeur: (x) => (x.nofollow_ref_domains === null || x.nofollow_ref_domains === undefined ? '—' : nb(x.nofollow_ref_domains)), droite: true },
              { titre: 'Supprimés', valeur: (x) => (x.deleted_ref_domains === null || x.deleted_ref_domains === undefined ? '—' : nb(x.deleted_ref_domains)), droite: true },
              { titre: 'Relevé', valeur: (x) => dateFr(x.mesure_le), droite: true },
            ]}
            lignes={[...(l.autorite || [])].sort((a, b) => (b.da ?? -1) - (a.da ?? -1))}
            cle={(x) => x.domaine}
            classeLigne={(x) => (x.notre ? 'bg-baikal-cyan/10 text-white' : '')}
          />
        </>
      )}
      <div className="space-y-2">
        <label className="text-sm text-baikal-text">
          <span className="font-semibold text-white">Lecture</span>
          <span className="opacity-60"> — bilan des chantiers, lectures à ne pas rater, ce qui est réglé, la seule chose à faire ensuite. Rédigé par le modèle, à corriger.</span>
        </label>
        {lectureSeule
          ? <div className="bg-baikal-surface border border-baikal-border rounded-lg p-4"><TexteAudit texte={texte} /></div>
          : <textarea value={texte} onChange={(e) => setTexte(e.target.value)} className={`${CHAMP} w-full min-h-[260px] leading-relaxed`} />}
      </div>
    </div>
  );
}

export default function AuditSeo({ appId }) {
  const [periode, setPeriode] = useState(moisPrecedent);
  const [audit, setAudit] = useState(null);
  const [texte, setTexte] = useState('');
  const [occupe, setOccupe] = useState(null); // 'lancer' | 'enregistrer'
  const [erreur, setErreur] = useState(null);
  const [archives, setArchives] = useState(null);
  const [version, setVersion] = useState(0);
  const [enregistre, setEnregistre] = useState(null);
  const [aSupprimer, setASupprimer] = useState(null);
  const [suppression, setSuppression] = useState(false);

  useEffect(() => {
    setAudit(null);
    setTexte('');
    setEnregistre(null);
    setErreur(null);
  }, [appId, periode.debut, periode.fin]);

  useEffect(() => {
    let actif = true;
    seoService.getAudits(appId).then(({ data, error }) => {
      if (!actif) return;
      if (error) setErreur(error.message);
      else setArchives(data?.lignes ?? []);
    });
    return () => { actif = false; };
  }, [appId, version]);

  const lancer = async () => {
    setOccupe('lancer');
    setErreur(null);
    setEnregistre(null);
    const { data, error } = await seoService.lancerAudit(appId, periode);
    setOccupe(null);
    if (error) { setErreur(error.message); return; }
    setAudit({ ...data, lectureSeule: false });
    setTexte(data.texte_propose || '');
  };

  const enregistrer = async () => {
    if (!audit) return;
    setOccupe('enregistrer');
    setErreur(null);
    const contenu = { lecture: audit.lecture, highlights: audit.highlights, seo: audit.seo, sources_manquantes: audit.sources_manquantes };
    const { data, error } = await seoService.enregistrerAudit(appId, periode, contenu, texte);
    setOccupe(null);
    if (error) { setErreur(error.message); return; }
    setEnregistre(data);
    setVersion((v) => v + 1);
  };

  const confirmerSuppression = async () => {
    if (!aSupprimer) return;
    setSuppression(true);
    const { error } = await seoService.supprimerAudit(appId, aSupprimer.id);
    setSuppression(false);
    setASupprimer(null);
    if (error) { setErreur(error.message); return; }
    setVersion((v) => v + 1);
  };

  const ouvrir = async (id) => {
    setErreur(null);
    const { data, error } = await seoService.lireAudit(appId, id);
    if (error) { setErreur(error.message); return; }
    setPeriode({ debut: data.debut, fin: data.fin });
    // La periode change et vide l'etat : on pose l'audit archive juste apres.
    setTimeout(() => {
      setAudit({ ...(data.contenu || {}), libelle_periode: data.libelle, lectureSeule: true, archive: true });
      setTexte(data.texte || '');
    }, 0);
  };

  return (
    <Section
      titre="Audit SEO"
      sousTitre="La grille du flash audit, calculée depuis l'archive puis lue par le modèle — le rapport au partenaire reprend le dernier audit enregistré de sa période"
      action={(
        <div className="flex items-center gap-3 flex-wrap justify-end">
          <SelecteurPeriode valeur={periode} onChange={setPeriode} />
          <button onClick={lancer} disabled={Boolean(occupe)} className={`${BOUTON} border-baikal-cyan text-baikal-cyan hover:bg-baikal-cyan/10`}>
            <Sparkles className={`w-4 h-4 ${occupe === 'lancer' ? 'animate-pulse' : ''}`} />
            {occupe === 'lancer' ? 'Audit en cours…' : "Lancer l'audit"}
          </button>
        </div>
      )}
    >
      {erreur && <Erreur message={erreur} />}
      {occupe === 'lancer' && !audit && <Chargement />}
      {!audit && occupe !== 'lancer' && (
        <Vide message={`Période : ${libellePeriode(periode)}. « Lancer l'audit » calcule les six blocs de la grille et propose la lecture. Compte une trentaine de secondes.`} />
      )}
      {audit && (
        <div className="space-y-4">
          <p className="text-sm text-baikal-text">
            <span className="text-white font-semibold">{majuscule(audit.libelle_periode || libellePeriode(periode))}</span>
            {audit.archive && <span className="opacity-60"> — audit archivé, en lecture seule</span>}
          </p>
          <Resultat audit={audit} texte={texte} setTexte={setTexte} lectureSeule={audit.lectureSeule} />
          {!audit.lectureSeule && (
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={enregistrer} disabled={Boolean(occupe)} className={`${BOUTON} border-baikal-cyan bg-baikal-cyan/10 text-baikal-cyan hover:bg-baikal-cyan/20 font-semibold`}>
                <Save className="w-4 h-4" />
                {occupe === 'enregistrer' ? 'Enregistrement…' : "Enregistrer l'audit"}
              </button>
              {enregistre && <span className="text-sm text-emerald-400">Audit enregistré le {dateFr(enregistre.cree_le)} — le rapport de cette période le reprendra.</span>}
            </div>
          )}
        </div>
      )}

      <div className="bg-baikal-surface border border-baikal-border rounded-lg overflow-hidden">
        <div className="px-4 py-2 text-xs opacity-60 uppercase tracking-wider text-baikal-text">Audits archivés</div>
        <table className="w-full text-sm text-baikal-text">
          <tbody>
            {archives === null && <LigneVide colonnes={3} message="Chargement…" />}
            {archives && archives.length === 0 && <LigneVide colonnes={3} message="Aucun audit enregistré pour ce site." />}
            {(archives || []).map((a) => (
              <tr key={a.id} className="border-t border-baikal-border/50">
                <td className="px-4 py-2">{majuscule(a.libelle)}</td>
                <td className="px-2 py-2 text-xs opacity-70">{dateFr(a.cree_le)}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <button onClick={() => ouvrir(a.id)} className="inline-flex items-center gap-1 text-baikal-cyan hover:underline">
                    <Eye className="w-3.5 h-3.5" /> Voir
                  </button>
                  <button onClick={() => setASupprimer(a)} title="Supprimer cet audit" className="ml-3 p-1 text-baikal-text hover:text-red-400 transition-colors align-middle">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ConfirmModal
        isOpen={Boolean(aSupprimer)}
        onClose={() => setASupprimer(null)}
        onConfirm={confirmerSuppression}
        loading={suppression}
        title="Supprimer cet audit"
        message="L'audit et son texte relu disparaîtront de l'archive. Un rapport déjà généré à partir de cet audit n'est pas modifié."
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        icon={Trash2}
        itemPreview={aSupprimer ? { label: `Audit ${majuscule(aSupprimer.libelle)}`, sublabel: `enregistré le ${dateFr(aSupprimer.cree_le)}` } : null}
      />
    </Section>
  );
}
