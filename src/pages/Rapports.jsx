/**
 * Rapports.jsx - Baikal Console
 * ============================================================================
 * Rapport mensuel au partenaire SEO du site (spec 2026-09-06).
 *
 *   1. Choisir le mois, « Préparer » : l'EF fige les faits (décompte du
 *      partenariat, ventes, SEO, highlights par règles) et propose les
 *      « Évolutions du logiciel » depuis les commits du mois.
 *   2. Relire et corriger les deux textes libres ; « Rédiger » met en forme
 *      l'ébauche du commentaire, le champ reste éditable.
 *   3. « Générer le PDF » : le document est fabriqué ici (@react-pdf/renderer,
 *      chargé à la demande), puis archivé par l'EF avec les faits et les textes.
 *
 * Ce qui est archivé, c'est le contenu des champs au moment du clic : jamais
 * la proposition du modèle telle quelle.
 * ============================================================================
 */
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FileText, Download, Sparkles, Wand2 } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import ConsoleLayout from '../components/console/ConsoleLayout';
import { Chargement, Erreur, LigneVide, Section, Vide } from '../components/console/etats';
import { rapportService } from '../services/rapport.service';

const CHAMP = 'px-2 py-1.5 rounded border border-baikal-border bg-baikal-bg text-baikal-text focus:border-baikal-cyan outline-none text-sm';
const ZONE = `${CHAMP} w-full min-h-[120px] leading-relaxed`;
const BOUTON = 'flex items-center gap-1.5 px-3 py-1.5 rounded border text-sm transition-colors disabled:opacity-50';

function fmtEur(n) {
  return `${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0))} €`;
}
function fmtNombre(n) {
  return new Intl.NumberFormat('fr-FR').format(Number(n || 0));
}
function moisPrecedent() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
}
function dateFr(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

async function blobEnBase64(blob) {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onload = () => resolve(String(lecteur.result).split(',')[1]);
    lecteur.onerror = reject;
    lecteur.readAsDataURL(blob);
  });
}

function Apercu({ contenu }) {
  const c = contenu;
  const seo = (source) => (source ? `${fmtNombre(source.clics)} clics · ${fmtNombre(source.impressions)} impressions · position ${Number(source.position).toFixed(1).replace('.', ',')}` : '—');
  return (
    <div className="space-y-4">
      {c.sources_manquantes.length > 0 && (
        <div className="p-3 bg-amber-900/20 border border-amber-500/50 rounded-md flex items-start gap-3 text-amber-300 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <ul className="space-y-0.5">
            {c.sources_manquantes.map((m) => <li key={m}>{m}</li>)}
          </ul>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-baikal-surface border border-baikal-border rounded-lg p-4 space-y-1 text-sm text-baikal-text">
          <div className="text-xs opacity-60 uppercase tracking-wider">Ventes du mois</div>
          <div className="text-2xl text-white tabular-nums">{fmtNombre(c.ventes.nombre)}</div>
          <div className="opacity-70">{fmtEur(c.ventes.total_ttc)} TTC · {fmtEur(c.ventes.total_ht)} HT</div>
        </div>
        <div className="bg-baikal-surface border border-baikal-border rounded-lg p-4 space-y-1 text-sm text-baikal-text">
          <div className="text-xs opacity-60 uppercase tracking-wider">SEO du mois</div>
          <div><span className="opacity-60">Google</span> · {seo(c.seo.google.mois)}</div>
          <div><span className="opacity-60">Bing</span> · {seo(c.seo.bing.mois)}</div>
        </div>
      </div>

      <div className="bg-baikal-surface border border-baikal-border rounded-lg p-4">
        <div className="text-xs opacity-60 uppercase tracking-wider text-baikal-text mb-2">Highlights (calculés)</div>
        {c.highlights.length === 0 && <p className="text-sm text-baikal-text opacity-60">Aucun fait calculable sur ce mois.</p>}
        <ul className="space-y-1 text-sm text-baikal-text list-disc pl-5">
          {c.highlights.map((h) => <li key={h}>{h}</li>)}
        </ul>
      </div>

      {c.partenariat.contrat && (
        <div className="bg-baikal-surface border border-baikal-border rounded-lg overflow-hidden">
          <table className="w-full text-sm text-baikal-text">
            <thead>
              <tr className="text-left text-xs opacity-70 border-b border-baikal-border">
                <th className="px-4 py-2">Mois</th>
                <th className="text-right px-2 py-2">Ventes</th>
                <th className="text-right px-2 py-2">CA HT</th>
                <th className="text-right px-2 py-2">Partageables</th>
                <th className="text-right px-4 py-2">Quote-part</th>
              </tr>
            </thead>
            <tbody>
              {c.partenariat.lignes.map((l) => (
                <tr key={l.mois} className={`border-t border-baikal-border/50 ${l.mois === c.mois ? 'bg-baikal-cyan/10 text-white' : ''}`}>
                  <td className="px-4 py-1.5 font-mono text-xs">{l.mois}</td>
                  <td className="text-right px-2 py-1.5 tabular-nums">{fmtNombre(l.ventes)}</td>
                  <td className="text-right px-2 py-1.5 tabular-nums">{fmtEur(l.ca_ht)}</td>
                  <td className="text-right px-2 py-1.5 tabular-nums">{l.dans_decompte === false ? '—' : fmtNombre(l.ventes_partageables)}</td>
                  <td className="text-right px-4 py-1.5 tabular-nums">{l.dans_decompte === false ? '—' : fmtEur(l.quote_part)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {c.ventes.lignes.length > 0 && (
        <div className="bg-baikal-surface border border-baikal-border rounded-lg overflow-hidden">
          <div className="max-h-[260px] overflow-y-auto">
            <table className="w-full text-sm text-baikal-text">
              <thead className="sticky top-0 bg-baikal-surface">
                <tr className="text-left text-xs opacity-70">
                  <th className="px-4 py-2">Date</th>
                  <th className="px-2 py-2">Offre</th>
                  <th className="text-right px-4 py-2">TTC</th>
                </tr>
              </thead>
              <tbody>
                {c.ventes.lignes.map((v, i) => (
                  <tr key={`${v.date}-${i}`} className="border-t border-baikal-border/50">
                    <td className="px-4 py-1.5 font-mono text-xs">{v.date}</td>
                    <td className="px-2 py-1.5">{v.offre}</td>
                    <td className="text-right px-4 py-1.5 tabular-nums">{fmtEur(v.montant_ttc)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Generateur({ appId, onGenere }) {
  const [mois, setMois] = useState(moisPrecedent());
  const [preparation, setPreparation] = useState(null);
  const [evolutions, setEvolutions] = useState('');
  const [ebauche, setEbauche] = useState('');
  const [commentaire, setCommentaire] = useState('');
  const [occupe, setOccupe] = useState(null); // 'preparer' | 'rediger' | 'generer'
  const [erreur, setErreur] = useState(null);
  const [dernier, setDernier] = useState(null);

  // Changer de site ou de mois invalide la preparation : les faits figes
  // appartiennent a un couple (site, mois).
  useEffect(() => {
    setPreparation(null);
    setEvolutions('');
    setCommentaire('');
    setDernier(null);
    setErreur(null);
  }, [appId, mois]);

  const preparer = async () => {
    setOccupe('preparer');
    setErreur(null);
    const { data, error } = await rapportService.preparer(appId, mois);
    setOccupe(null);
    if (error) { setErreur(error.message); return; }
    setPreparation(data);
    setEvolutions(data.evolutions_proposees || '');
  };

  const rediger = async () => {
    if (!ebauche.trim() || !preparation) return;
    setOccupe('rediger');
    setErreur(null);
    const { data, error } = await rapportService.rediger(appId, mois, ebauche, preparation.contenu.highlights);
    setOccupe(null);
    if (error) { setErreur(error.message); return; }
    setCommentaire(data.commentaire || '');
  };

  const generer = async () => {
    if (!preparation) return;
    setOccupe('generer');
    setErreur(null);
    try {
      // Le moteur PDF pese lourd : charge seulement au clic.
      const [{ pdf }, { default: RapportPdf }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('../components/rapports/RapportPdf'),
      ]);
      const { data: existants } = await rapportService.liste(appId);
      const version = (existants?.lignes ?? []).filter((r) => r.mois === mois).length + 1;
      const genereLe = new Date().toISOString();
      const blob = await pdf(
        <RapportPdf
          contenu={preparation.contenu}
          evolutions={evolutions}
          commentaire={commentaire}
          version={version}
          genereLe={genereLe}
        />,
      ).toBlob();
      const pdfBase64 = await blobEnBase64(blob);
      const { data, error } = await rapportService.enregistrer(appId, mois, {
        contenu: preparation.contenu, ebauche, evolutions, commentaire, pdfBase64,
      });
      if (error) throw error;
      setDernier({ ...data, url: URL.createObjectURL(blob), nom: `rapport-${appId}-${mois}-v${data.version}.pdf` });
      onGenere();
    } catch (e) {
      setErreur(e.message);
    } finally {
      setOccupe(null);
    }
  };

  const contenu = preparation?.contenu;
  const partenaire = contenu?.partenariat?.contrat?.partenaire;

  return (
    <Section
      titre="Rapport mensuel"
      sousTitre={partenaire ? `À l'attention de ${partenaire} — décompte, ventes, SEO, highlights, évolutions et commentaire` : 'Décompte du partenariat, ventes, SEO, highlights, évolutions et commentaire du mois'}
      action={(
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={mois}
            max={new Date().toISOString().slice(0, 7)}
            onChange={(e) => setMois(e.target.value)}
            className={`${CHAMP} font-mono`}
          />
          <button
            onClick={preparer}
            disabled={Boolean(occupe) || !mois}
            className={`${BOUTON} border-baikal-cyan text-baikal-cyan hover:bg-baikal-cyan/10`}
          >
            <Sparkles className={`w-4 h-4 ${occupe === 'preparer' ? 'animate-pulse' : ''}`} />
            {occupe === 'preparer' ? 'Préparation…' : 'Préparer'}
          </button>
        </div>
      )}
    >
      {erreur && <Erreur message={erreur} />}
      {occupe === 'preparer' && !preparation && <Chargement />}
      {!preparation && occupe !== 'preparer' && (
        <Vide message="Choisis un mois puis « Préparer » : les faits sont figés depuis l'archive et les évolutions du logiciel proposées depuis les commits du mois." />
      )}

      {preparation && (
        <div className="space-y-6">
          <Apercu contenu={contenu} />

          <div className="space-y-2">
            <label className="text-sm text-baikal-text">
              <span className="font-semibold text-white">Évolutions du logiciel</span>
              <span className="opacity-60"> — proposition depuis {preparation.commits.length} commit{preparation.commits.length > 1 ? 's' : ''}, à relire</span>
            </label>
            <textarea value={evolutions} onChange={(e) => setEvolutions(e.target.value)} className={ZONE} placeholder="- Une puce par évolution…" />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm text-baikal-text">
                <span className="font-semibold text-white">Ébauche du commentaire</span>
                <span className="opacity-60"> — tes notes, telles quelles</span>
              </label>
              <textarea value={ebauche} onChange={(e) => setEbauche(e.target.value)} className={ZONE} placeholder="Ce que tu veux dire au partenaire ce mois-ci…" />
              <button
                onClick={rediger}
                disabled={Boolean(occupe) || !ebauche.trim()}
                className={`${BOUTON} border-baikal-border text-baikal-text hover:text-baikal-cyan hover:border-baikal-cyan`}
              >
                <Wand2 className={`w-4 h-4 ${occupe === 'rediger' ? 'animate-pulse' : ''}`} />
                {occupe === 'rediger' ? 'Rédaction…' : 'Rédiger'}
              </button>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-baikal-text">
                <span className="font-semibold text-white">Commentaire du mois</span>
                <span className="opacity-60"> — le texte qui part, à corriger librement</span>
              </label>
              <textarea value={commentaire} onChange={(e) => setCommentaire(e.target.value)} className={ZONE} placeholder="Rempli par « Rédiger », ou écris directement ici." />
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={generer}
              disabled={Boolean(occupe)}
              className={`${BOUTON} border-baikal-cyan bg-baikal-cyan/10 text-baikal-cyan hover:bg-baikal-cyan/20 font-semibold`}
            >
              <FileText className={`w-4 h-4 ${occupe === 'generer' ? 'animate-pulse' : ''}`} />
              {occupe === 'generer' ? 'Génération…' : 'Générer le PDF'}
            </button>
            {dernier && (
              <a
                href={dernier.url}
                download={dernier.nom}
                className={`${BOUTON} border-emerald-500/60 text-emerald-400 hover:bg-emerald-500/10`}
              >
                <Download className="w-4 h-4" />
                Télécharger la version {dernier.version}
              </a>
            )}
          </div>
          <p className="text-[11px] text-baikal-text opacity-50 leading-relaxed">
            <strong className="opacity-100">Lecture</strong> · Les highlights sont calculés par règles fixes,
            la trame est la même chaque mois. Les deux textes libres sont des propositions : c'est le contenu
            des champs au moment de « Générer » qui est archivé avec le PDF. Régénérer un mois crée une nouvelle
            version, l'ancienne reste téléchargeable.
          </p>
        </div>
      )}
    </Section>
  );
}

function Archives({ appId, version }) {
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    let actif = true;
    setDonnees(null);
    rapportService.liste(appId).then(({ data, error }) => {
      if (!actif) return;
      if (error) setErreur(error.message);
      else setDonnees(data);
    });
    return () => { actif = false; };
  }, [appId, version]);

  const lignes = useMemo(() => donnees?.lignes ?? [], [donnees]);

  return (
    <Section titre="Rapports archivés" sousTitre="Chaque génération est conservée — liens valables une heure">
      {erreur && <Erreur message={erreur} />}
      {!donnees && !erreur && <Chargement />}
      {donnees && (
        <div className="bg-baikal-surface border border-baikal-border rounded-lg overflow-hidden">
          <table className="w-full text-sm text-baikal-text">
            <thead>
              <tr className="text-left text-xs opacity-70 border-b border-baikal-border">
                <th className="px-4 py-2">Mois</th>
                <th className="px-2 py-2">Version</th>
                <th className="px-2 py-2">Généré le</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {lignes.length === 0 && <LigneVide colonnes={4} message="Aucun rapport généré pour ce site." />}
              {lignes.map((r) => (
                <tr key={r.id} className="border-t border-baikal-border/50">
                  <td className="px-4 py-2 font-mono text-xs">{r.mois}</td>
                  <td className="px-2 py-2 tabular-nums">v{r.version}</td>
                  <td className="px-2 py-2 text-xs">{dateFr(r.genere_le)}</td>
                  <td className="px-4 py-2 text-right">
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-baikal-cyan hover:underline">
                        <Download className="w-3.5 h-3.5" /> PDF
                      </a>
                    ) : <span className="opacity-40">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function RapportsContent() {
  const { currentApp } = useApp();
  const [version, setVersion] = useState(0);
  return (
    <div className="p-6 space-y-10">
      <Generateur appId={currentApp} onGenere={() => setVersion((v) => v + 1)} />
      <Archives appId={currentApp} version={version} />
    </div>
  );
}

export default function Rapports() {
  return (
    <ConsoleLayout actif="rapports">
      <RapportsContent />
    </ConsoleLayout>
  );
}
