/**
 * RapportPdf.jsx - Baikal Console
 * ============================================================================
 * Le document PDF A4 du rapport au partenaire, rendu par @react-pdf/renderer
 * dans le navigateur. Charge par import() dynamique depuis /rapports : le
 * moteur PDF ne doit pas alourdir le bundle principal.
 *
 * Contenu, dans l'ordre : Registre des Ventes et compte de partage (Annexe 2
 * du contrat signe le 18/08/2026), ventes de la periode, SEO, lecture SEO
 * (grille du flash audit), highlights, evolutions du logiciel, commentaire.
 *
 * Polices : Helvetica standard (encodage WinAnsi). Deux caracteres produits
 * par le formatage francais n'y existent pas : l'espace fine insecable des
 * milliers (U+202F) et le signe moins (U+2212). `t()` les remplace, sinon ils
 * sortent en carres.
 * ============================================================================
 */
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

// Construits par code de caractere : un U+202F litteral dans la source serait
// invisible a la relecture et refuse par le lint.
const ESPACES_INSECABLES = new RegExp(`[${String.fromCharCode(0x202f)}${String.fromCharCode(0xa0)}]`, 'g');
const SIGNE_MOINS = new RegExp(String.fromCharCode(0x2212), 'g');
const t = (s) => String(s ?? '').replace(ESPACES_INSECABLES, ' ').replace(SIGNE_MOINS, '-');
const eur = (n) => t(`${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0))} €`);
const nb = (n) => t(new Intl.NumberFormat('fr-FR').format(Number(n || 0)));
const pos = (n) => (n === null || n === undefined ? '—' : t(Number(n).toFixed(1).replace('.', ',')));
const pctRatio = (n) => t(`${(Number(n || 0) * 100).toFixed(0)} %`);
const dateFr = (iso) => {
  if (!iso) return '';
  const [a, m, j] = String(iso).slice(0, 10).split('-');
  return `${j}/${m}/${a}`;
};
const majuscule = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const VERDICTS = { gagne: 'Gagné', en_progres: 'En progrès', rate: 'Raté', sans_objet: 'Sans objet' };
const APPAREILS = { mobile: 'Mobile', desktop: 'Ordinateur', tablet: 'Tablette' };
const CLUSTERS = {
  en_ligne: 'En ligne', prix: 'Prix', modele: 'Modèle', foncia: 'Foncia / Nexity / Citya',
  delai: 'Délai', tantiemes: 'Tantièmes', remboursement: 'Remboursement', autre: 'Autre',
};

const s = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 56, paddingHorizontal: 51, fontFamily: 'Helvetica', fontSize: 9, color: '#111827' },
  entete: { borderBottomWidth: 1.5, borderBottomColor: '#111827', paddingBottom: 8, marginBottom: 16 },
  titre: { fontSize: 18, fontFamily: 'Helvetica-Bold' },
  sousTitre: { fontSize: 10, color: '#4b5563', marginTop: 3 },
  h2: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginTop: 16, marginBottom: 6, color: '#111827' },
  h3: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', marginTop: 10, marginBottom: 4, color: '#374151' },
  note: { fontSize: 7.5, color: '#6b7280', marginTop: 4, lineHeight: 1.4 },
  para: { fontSize: 9.5, lineHeight: 1.5, marginBottom: 6 },
  puce: { flexDirection: 'row', marginBottom: 3 },
  puceTiret: { width: 10, fontSize: 9.5 },
  puceTexte: { flex: 1, fontSize: 9.5, lineHeight: 1.45 },
  table: { borderWidth: 0.5, borderColor: '#d1d5db' },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#e5e7eb', minHeight: 15, alignItems: 'center' },
  th: { flexDirection: 'row', backgroundColor: '#f3f4f6', borderBottomWidth: 0.5, borderBottomColor: '#9ca3af', minHeight: 16, alignItems: 'center' },
  trCourant: { backgroundColor: '#ecfeff' },
  trEstompe: { color: '#9ca3af' },
  trGras: { fontFamily: 'Helvetica-Bold', backgroundColor: '#f3f4f6' },
  cell: { paddingVertical: 2.5, paddingHorizontal: 4, fontSize: 8 },
  cellTh: { paddingVertical: 3, paddingHorizontal: 4, fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#374151' },
  droite: { textAlign: 'right' },
  gras: { fontFamily: 'Helvetica-Bold' },
  pied: { position: 'absolute', bottom: 28, left: 51, right: 51, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7, color: '#6b7280', borderTopWidth: 0.5, borderTopColor: '#d1d5db', paddingTop: 5 },
});

function Table({ colonnes, lignes, cle, classeLigne }) {
  return (
    <View style={s.table}>
      <View style={s.th}>
        {colonnes.map((c) => (
          <Text key={c.titre} style={[s.cellTh, { flex: c.flex ?? 1 }, c.droite ? s.droite : null]}>{t(c.titre)}</Text>
        ))}
      </View>
      {lignes.map((l, i) => (
        <View key={cle ? cle(l, i) : i} style={[s.tr, classeLigne ? classeLigne(l) : null]} wrap={false}>
          {colonnes.map((c) => (
            <Text key={c.titre} style={[s.cell, { flex: c.flex ?? 1 }, c.droite ? s.droite : null, c.gras ? s.gras : null]}>
              {t(c.valeur(l))}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

// Compte de partage d'un mois, ligne a ligne, au modele de l'Annexe 2.
function ComptePartage({ ligne, contrat }) {
  const rubriques = [
    ['Ventes du mois (nettes de remboursements)', nb(ligne.ventes_nettes)],
    ['Seuil Mensuel', nb(contrat.franchise)],
    ['Ventes Partageables', nb(ligne.ventes_partageables)],
    ['Ratio Ventes Partageables / Ventes du mois', pctRatio(ligne.ratio)],
    ["Chiffre d'Affaires Partageable HT", eur(ligne.ca_partageable_ht)],
    ['Coûts Directs du mois (détail en pièce jointe)', eur(ligne.couts_directs)],
    ['Coûts Directs imputables (au prorata)', eur(ligne.couts_imputables)],
    ['Report de solde négatif des périodes antérieures', Number(ligne.report_entrant) < 0 ? eur(ligne.report_entrant) : '—'],
    ['Résultat Partageable', eur(ligne.resultat_apres_report), true],
    [`Quote-part ${contrat.partenaire} (${Math.round(contrat.part * 100)} %)`, eur(ligne.quote_part)],
    [`Quote-part CONFER (${Math.round((1 - contrat.part) * 100)} %)`, eur(ligne.quote_part_confer)],
    ['Remboursement des Coûts Directs avancés (art. 7.6)', '—'],
    ['Solde net à régler', eur(ligne.quote_part), true],
  ];
  return (
    <Table
      colonnes={[
        { titre: 'Rubrique', valeur: (r) => r[0], flex: 3 },
        { titre: 'Montant / valeur', valeur: (r) => r[1], droite: true },
      ]}
      lignes={rubriques}
      cle={(r) => r[0]}
      classeLigne={(r) => (r[2] ? s.trGras : null)}
    />
  );
}

function BlocSeo({ seo, moisEntier }) {
  const ligne = (libelle, source, f) => ({
    libelle,
    periode: source.periode ? f(source.periode) : '—',
    precedent: source.precedent ? f(source.precedent) : '—',
  });
  // Ni total d'impressions brut ni position moyenne globale : ces deux
  // chiffres mentent sur ce site (requetes entre guillemets). Google montre
  // les impressions hors bruit ; Bing n'a pas cette notion.
  const lignes = (source, google) => [
    ligne('Clics', source, (x) => nb(x.clics)),
    google
      ? ligne('Impressions hors bruit', source, (x) => (x.impressions_hors_bruit === null ? '—' : nb(x.impressions_hors_bruit)))
      : ligne('Impressions', source, (x) => nb(x.impressions)),
  ];
  const colonnes = [
    { titre: 'Indicateur', valeur: (l) => l.libelle, flex: 2 },
    { titre: 'Période', valeur: (l) => l.periode, droite: true, gras: true },
    { titre: moisEntier ? 'Mois précédent' : 'Période précédente', valeur: (l) => l.precedent, droite: true },
  ];
  const colonnesTop = (titre, cle) => [
    { titre, valeur: cle, flex: 4 },
    { titre: 'Clics', valeur: (l) => nb(l.clics), droite: true },
    { titre: 'Impressions', valeur: (l) => nb(l.impressions), droite: true },
    { titre: 'Position', valeur: (l) => pos(l.position), droite: true },
  ];
  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={[s.cellTh, { paddingHorizontal: 0 }]}>Google</Text>
          <Table colonnes={colonnes} lignes={lignes(seo.google, true)} cle={(l) => l.libelle} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.cellTh, { paddingHorizontal: 0 }]}>Bing</Text>
          <Table colonnes={colonnes} lignes={lignes(seo.bing, false)} cle={(l) => l.libelle} />
        </View>
      </View>
      {seo.top_requetes.length > 0 && (
        <View style={{ marginTop: 10 }}>
          <Text style={[s.cellTh, { paddingHorizontal: 0 }]}>Top 10 requêtes Google</Text>
          <Table colonnes={colonnesTop('Requête', (l) => l.cle)} lignes={seo.top_requetes} cle={(l) => l.cle} />
        </View>
      )}
      {seo.top_pages.length > 0 && (
        <View style={{ marginTop: 10 }}>
          <Text style={[s.cellTh, { paddingHorizontal: 0 }]}>Top 10 pages Google</Text>
          <Table
            colonnes={colonnesTop('Page', (l) => l.cle.replace(/^https?:\/\/[^/]+/, '') || '/')}
            lignes={seo.top_pages}
            cle={(l) => l.cle}
          />
        </View>
      )}
    </View>
  );
}

function BlocLectureSeo({ lecture, chantiers }) {
  const semaine = (l) => `du ${dateFr(l.semaine)}${l.reference ? ' (réf.)' : ''}`;
  const colonnesTrafic = [
    { titre: 'Semaine', valeur: semaine, flex: 1.6 },
    { titre: 'Jours ouvrés', valeur: (l) => nb(l.jours_ouvres), droite: true },
    { titre: 'Clics', valeur: (l) => nb(l.clics), droite: true },
    { titre: 'Clics / jour', valeur: (l) => t(Number(l.clics_par_jour).toFixed(1).replace('.', ',')), droite: true, gras: true },
    { titre: 'Impressions', valeur: (l) => nb(l.impressions), droite: true },
  ];
  const vc = lecture.ventes.par_creation;
  // Fragment, pas de View englobant : un conteneur plus haut qu'une page ne se
  // coupe pas et ses enfants s'empilent au meme endroit (vu le 06/09).
  return (
    <>
      <Text style={s.h3}>Trafic en jours ouvrés (lundi-vendredi), semaines pleines</Text>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={[s.cellTh, { paddingHorizontal: 0 }]}>Google</Text>
          <Table colonnes={colonnesTrafic} lignes={lecture.trafic.google} cle={(l) => l.semaine} classeLigne={(l) => (l.reference ? s.trEstompe : null)} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.cellTh, { paddingHorizontal: 0 }]}>Bing</Text>
          <Table colonnes={colonnesTrafic} lignes={lecture.trafic.bing} cle={(l) => l.semaine} classeLigne={(l) => (l.reference ? s.trEstompe : null)} />
        </View>
      </View>
      <Text style={s.note}>« réf. » : meilleure semaine des douze dernières, pour situer la dernière semaine pleine.</Text>

      <Text style={s.h3}>Ventes, deux comptes</Text>
      <Table
        colonnes={[
          { titre: 'Compte', valeur: (l) => l[0], flex: 3 },
          { titre: 'Ventes', valeur: (l) => l[1], droite: true, gras: true },
          { titre: 'Dont organiques', valeur: (l) => l[2], droite: true },
        ]}
        lignes={[
          ['Par date de paiement (Stripe, base du compte de partage)', `${nb(lecture.ventes.par_paiement.nettes)} nettes sur ${nb(lecture.ventes.par_paiement.ventes)}`, '—'],
          vc.disponible
            ? ['Par date de création du dossier (le chiffre du site, doublons exclus)', nb(vc.payes), nb(vc.payes_organique)]
            : ['Par date de création du dossier', 'indisponible', '—'],
        ]}
        cle={(l) => l[0]}
      />
      {vc.disponible && vc.par_page.length > 0 && (
        <View style={{ marginTop: 8 }}>
          <Text style={[s.cellTh, { paddingHorizontal: 0 }]}>{t(`Portes d'entrée organiques sur la période : ${nb(vc.dossiers)} dossiers, ${nb(vc.emails)} emails, ${nb(vc.payes)} ventes`)}</Text>
          <Table
            colonnes={[
              { titre: "Page d'entrée", valeur: (l) => l.page, flex: 4 },
              { titre: 'Dossiers', valeur: (l) => nb(l.dossiers), droite: true },
              { titre: 'Emails', valeur: (l) => nb(l.emails), droite: true },
              { titre: 'Ventes', valeur: (l) => nb(l.payes), droite: true, gras: true },
              { titre: 'Conv.', valeur: (l) => (l.dossiers > 0 ? pctRatio(l.payes / l.dossiers) : '—'), droite: true },
            ]}
            lignes={vc.par_page}
            cle={(l) => l.page}
          />
        </View>
      )}

      {lecture.appareils && lecture.appareils.length > 0 && (
        <View>
          <Text style={s.h3}>Clics Google par appareil</Text>
          <Table
            colonnes={[
              { titre: 'Appareil', valeur: (l) => APPAREILS[l.appareil] || l.appareil, flex: 2 },
              { titre: 'Clics', valeur: (l) => nb(l.clics), droite: true, gras: true },
              { titre: 'Part', valeur: (l) => pctRatio(l.part_clics), droite: true },
              { titre: 'Impressions', valeur: (l) => nb(l.impressions), droite: true },
              { titre: 'Clics préc.', valeur: (l) => (l.clics_precedent === null ? '—' : nb(l.clics_precedent)), droite: true },
              { titre: 'Part préc.', valeur: (l) => (l.part_clics_precedent === null ? '—' : pctRatio(l.part_clics_precedent)), droite: true },
            ]}
            lignes={lecture.appareils}
            cle={(l) => l.appareil}
          />
        </View>
      )}

      {lecture.autorite && lecture.autorite.length > 0 && (
        <View>
          <Text style={s.h3}>Autorité de domaine (Moz), nous et les concurrents</Text>
          <Table
            colonnes={[
              { titre: 'Domaine', valeur: (l) => `${l.domaine}${l.notre ? ' (nous)' : ''}`, flex: 3 },
              { titre: 'DA', valeur: (l) => (l.da === null ? '—' : nb(l.da)), droite: true, gras: true },
              { titre: 'DA préc.', valeur: (l) => (l.da_precedent === null ? '—' : nb(l.da_precedent)), droite: true },
              { titre: 'Domaines référents', valeur: (l) => (l.ref_domains === null ? '—' : nb(l.ref_domains)), droite: true, gras: true },
              { titre: 'Réf. préc.', valeur: (l) => (l.ref_domains_precedent === null ? '—' : nb(l.ref_domains_precedent)), droite: true },
              { titre: 'Spam', valeur: (l) => (l.spam === null ? '—' : nb(l.spam)), droite: true },
              { titre: 'Relevé', valeur: (l) => dateFr(l.mesure_le), flex: 1.2, droite: true },
            ]}
            lignes={lecture.autorite}
            cle={(l) => l.domaine}
            classeLigne={(l) => (l.notre ? s.trCourant : null)}
          />
          <Text style={s.note}>Relevé mensuel Moz (Domain Authority, domaines référents, score de spam). Outil de suivi interne.</Text>
        </View>
      )}

      {lecture.clusters.periode.length > 0 && (
        <View>
          <Text style={s.h3}>Clusters de requêtes (hors bruit), période et période précédente</Text>
          <Table
            colonnes={[
              { titre: 'Cluster', valeur: (l) => CLUSTERS[l.cluster] || l.cluster, flex: 2 },
              { titre: 'Requêtes', valeur: (l) => nb(l.requetes), droite: true },
              { titre: 'Clics', valeur: (l) => nb(l.clics), droite: true, gras: true },
              { titre: 'Impressions', valeur: (l) => nb(l.impressions), droite: true },
              { titre: 'Position', valeur: (l) => pos(l.position), droite: true },
              { titre: 'Clics préc.', valeur: (l) => (l.prec ? nb(l.prec.clics) : '—'), droite: true },
              { titre: 'Impr. préc.', valeur: (l) => (l.prec ? nb(l.prec.impressions) : '—'), droite: true },
              { titre: 'Pos. préc.', valeur: (l) => (l.prec ? pos(l.prec.position) : '—'), droite: true },
            ]}
            lignes={lecture.clusters.periode.map((c) => ({ ...c, prec: lecture.clusters.precedent.find((p) => p.cluster === c.cluster) || null }))}
            cle={(l) => l.cluster}
          />
        </View>
      )}

      {lecture.suivi.disponible && lecture.suivi.requetes.length > 0 && (
        <View>
          <Text style={s.h3}>Requêtes suivies, en requête × page</Text>
          <Table
            colonnes={[
              { titre: 'Requête', valeur: (l) => l.requete, flex: 2.4 },
              { titre: 'Page classée', valeur: (l) => l.page || '—', flex: 2.4 },
              { titre: 'Clics', valeur: (l) => nb(l.clics), droite: true },
              { titre: 'Impressions', valeur: (l) => nb(l.impressions), droite: true },
              { titre: 'Position', valeur: (l) => pos(l.position), droite: true, gras: true },
              { titre: 'Préc.', valeur: (l) => pos(l.position_precedente), droite: true },
            ]}
            lignes={lecture.suivi.requetes}
            cle={(l) => l.requete}
          />
          <Text style={s.note}>Outil de suivi interne, pas une clause du contrat. Position pondérée par les impressions, sur la page qui porte le plus d'impressions.</Text>
        </View>
      )}

      {lecture.suivi.disponible && lecture.suivi.pages.length > 0 && (
        <View>
          <Text style={s.h3}>Pages clés, en requête × page</Text>
          <Table
            colonnes={[
              { titre: 'Page', valeur: (l) => l.page.replace(/^https?:\/\/[^/]+/, '') || '/', flex: 2.2 },
              { titre: 'Requêtes', valeur: (l) => nb(l.requetes), droite: true },
              { titre: 'Clics', valeur: (l) => nb(l.clics), droite: true },
              { titre: 'Impressions', valeur: (l) => nb(l.impressions), droite: true },
              { titre: 'Position', valeur: (l) => pos(l.position), droite: true, gras: true },
              { titre: 'Préc.', valeur: (l) => pos(l.position_precedente), droite: true },
              { titre: 'Premières requêtes', valeur: (l) => l.top_requetes.slice(0, 4).join(' · '), flex: 3 },
            ]}
            lignes={lecture.suivi.pages}
            cle={(l) => l.page}
          />
        </View>
      )}

      {chantiers.length > 0 && (
        <View>
          <Text style={s.h3}>Chantiers SEO</Text>
          <Table
            colonnes={[
              { titre: 'Date', valeur: (l) => dateFr(l.date), flex: 1 },
              { titre: 'Chantier', valeur: (l) => `${l.libelle}${l.source === 'commit' ? ' (commit)' : ''}`, flex: 3.5 },
              { titre: 'Cible', valeur: (l) => l.cible || '—', flex: 2 },
              { titre: 'Mesure', valeur: (l) => (l.mesure_prevue_le ? dateFr(l.mesure_prevue_le) : '—'), flex: 1 },
              { titre: 'Verdict', valeur: (l) => VERDICTS[l.verdict] || 'En attente', flex: 1.2, gras: true },
            ]}
            lignes={[...chantiers].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12)}
            cle={(l, i) => `${l.date}-${i}`}
          />
        </View>
      )}
    </>
  );
}

function Paragraphes({ texte }) {
  const blocs = String(texte || '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const rendus = [];
  blocs.forEach((b, i) => {
    const lignes = b.split('\n').map((l) => l.trim()).filter(Boolean);
    // Un bloc peut ouvrir par un titre « ## … » : rendu en intertitre.
    while (lignes.length && /^#{1,3}\s/.test(lignes[0])) {
      rendus.push(<Text key={`${i}-h-${rendus.length}`} style={s.h3}>{t(lignes.shift().replace(/^#{1,3}\s/, ''))}</Text>);
    }
    if (lignes.length === 0) return;
    if (lignes.every((l) => /^[-•*]\s/.test(l))) {
      rendus.push(
        <View key={`${i}-l`} style={{ marginBottom: 4 }}>
          {lignes.map((l, j) => (
            <View key={j} style={s.puce}>
              <Text style={s.puceTiret}>•</Text>
              <Text style={s.puceTexte}>{t(l.replace(/^[-•*]\s/, ''))}</Text>
            </View>
          ))}
        </View>,
      );
    } else {
      rendus.push(<Text key={`${i}-p`} style={s.para}>{t(lignes.join(' '))}</Text>);
    }
  });
  return rendus;
}

export default function RapportPdf({ contenu, evolutions, lectureSeo, commentaire, version, genereLe }) {
  const c = contenu;
  const contrat = c.partenariat.contrat;
  const libelle = c.mois_entier ? majuscule(c.libelle_periode) : c.libelle_periode;
  const partenaire = contrat?.partenaire ?? 'partenaire';
  const moisCouverts = new Set(c.mois_couverts);
  const comptes = (c.partenariat.lignes || []).filter((l) => moisCouverts.has(l.mois) && l.dans_decompte !== false);
  const cumul = c.partenariat.cumul_12_mois;
  const lecture = c.lecture_seo;

  return (
    <Document title={`Rapport ${libelle} — ${c.site.nom}`} author="Baikal" language="fr">
      <Page size="A4" style={s.page}>
        <View style={s.entete}>
          <Text style={s.titre}>{t(`${c.site.nom} — Rapport ${libelle}`)}</Text>
          <Text style={s.sousTitre}>
            {t(`À l'attention de ${partenaire}${c.site.domaine ? ` · ${c.site.domaine}` : ''} · période du ${dateFr(c.periode.debut)} au ${dateFr(c.periode.fin)} · généré le ${dateFr(genereLe)} · version ${version}`)}
          </Text>
        </View>

        {contrat && (
          <>
            <Text style={s.h2}>Registre des Ventes</Text>
            <Table
              colonnes={[
                { titre: 'Mois', valeur: (l) => l.mois, flex: 1.2 },
                { titre: 'Ventes', valeur: (l) => nb(l.ventes), droite: true },
                { titre: 'Remb. / litiges', valeur: (l) => (Number(l.remboursees) > 0 ? nb(l.remboursees) : '—'), droite: true },
                { titre: 'Ventes nettes', valeur: (l) => nb(l.ventes_nettes), droite: true, gras: true },
                { titre: 'CA HT encaissé', valeur: (l) => eur(l.ca_ht), droite: true },
                { titre: 'Coûts Directs', valeur: (l) => eur(l.couts_directs), droite: true },
                { titre: 'Partageables', valeur: (l) => (l.dans_decompte === false ? '—' : nb(l.ventes_partageables)), droite: true },
                { titre: 'Quote-part', valeur: (l) => (l.dans_decompte === false ? '—' : eur(l.quote_part)), droite: true, gras: true },
              ]}
              lignes={[...c.partenariat.lignes].reverse()}
              cle={(l) => l.mois}
              classeLigne={(l) => (moisCouverts.has(l.mois) ? s.trCourant : l.dans_decompte === false ? s.trEstompe : null)}
            />
            <Text style={s.note}>
              {t(`Registre tenu par CONFER (art. 1). Une Vente est payée, non remboursée, non annulée, non contestée. Coûts Directs au sens de l'art. 8.1, pris pour tout le mois. Les mois antérieurs au ${dateFr(contrat.debut)} sont donnés pour la tendance.${cumul ? ` Sur 12 mois glissants depuis ${cumul.depuis} : CA HT encaissé ${eur(cumul.ca_ht)}, Résultat Partageable ${eur(cumul.resultat_partageable)} (clause de rendez-vous, art. 20 : 60 000 € HT ou 30 000 €).` : ''}`)}
            </Text>

            {comptes.map((l) => (
              <View key={l.mois}>
                <Text style={s.h2}>{t(`Compte de partage — ${majuscule(l.mois)}`)}</Text>
                <ComptePartage ligne={l} contrat={contrat} />
              </View>
            ))}
            {comptes.length === 0 && (
              <Text style={s.note}>Aucun mois de la période n'est dans le décompte du contrat : pas de compte de partage.</Text>
            )}
            <Text style={s.note}>
              {t(`Article 7.2 : Ventes Partageables = Ventes du mois − ${contrat.franchise} ; CA Partageable = HT effectivement encaissé sur ces ventes ; Coûts Directs imputables = Coûts Directs du mois × ratio ; Résultat Partageable = CA Partageable − Coûts Directs imputables, après report du solde négatif antérieur ; quote-part de chaque Partie ${Math.round(contrat.part * 100)} %. Pièces jointes : export Stripe, justificatifs des Coûts Directs, rapport mensuel d'${partenaire}.`)}
            </Text>
          </>
        )}

        <Text style={s.h2} break>{t(`Ventes de la période (${nb(c.ventes.nettes)} nettes sur ${nb(c.ventes.nombre)})`)}</Text>
        {c.ventes.lignes.length === 0 ? (
          <Text style={s.para}>Aucune vente encaissée sur la période.</Text>
        ) : (
          <Table
            colonnes={[
              { titre: 'Date', valeur: (l) => dateFr(l.date), flex: 1 },
              { titre: 'Offre', valeur: (l) => l.offre, flex: 3 },
              { titre: 'TTC', valeur: (l) => eur(l.montant_ttc), droite: true },
              { titre: 'HT', valeur: (l) => eur(l.montant_ht), droite: true },
              { titre: 'Remboursée', valeur: (l) => (l.total ? '' : l.montant_rembourse > 0 ? `${eur(l.montant_rembourse)}${l.rembourse_le ? ` le ${dateFr(l.rembourse_le)}` : ''}` : '—'), flex: 1.6, droite: true },
            ]}
            lignes={[...c.ventes.lignes, { total: true, date: '', offre: 'Total des ventes nettes', montant_ttc: c.ventes.total_ttc, montant_ht: c.ventes.total_ht, montant_rembourse: 0 }]}
            cle={(l, i) => `${l.date}-${i}`}
            classeLigne={(l) => (l.total ? s.trGras : l.montant_rembourse > 0 ? s.trEstompe : null)}
          />
        )}
        <Text style={s.note}>Ventes B2C encaissées à plus de 0 €, hors dossiers de test, par date de paiement. Une vente remboursée est listée mais ne compte pas. Aucune donnée nominative.</Text>

        <Text style={s.h2} break>SEO de la période</Text>
        <BlocSeo seo={c.seo} moisEntier={c.mois_entier} />
        <Text style={s.note}>
          {t(c.mois_entier
            ? 'Clics depuis la série quotidienne de la propriété. Impressions Google hors bruit : total des pages du mois moins les requêtes entre guillemets. Requêtes et pages : Search Console, hors bruit. Pas de position moyenne globale ni de total brut : ces deux chiffres ne décrivent pas ce site.'
            : `Clics depuis la série quotidienne de la propriété, exacts au jour. Impressions Google hors bruit, requêtes et pages : Search Console, cumul des mois couverts (${c.mois_couverts.join(', ')}). Pas de position moyenne globale ni de total brut : ces deux chiffres ne décrivent pas ce site.`)}
        </Text>

        {lecture && (
          <>
            <Text style={s.h2} break>Lecture SEO</Text>
            <BlocLectureSeo lecture={lecture} chantiers={lecture.chantiers || []} />
            {lectureSeo && lectureSeo.trim() && (
              <>
                <Text style={s.h3}>Lecture</Text>
                <Paragraphes texte={lectureSeo} />
              </>
            )}
          </>
        )}

        {c.highlights.length > 0 && (
          <>
            <Text style={s.h2}>Highlights</Text>
            {c.highlights.map((h, i) => (
              <View key={i} style={s.puce}>
                <Text style={s.puceTiret}>•</Text>
                <Text style={s.puceTexte}>{t(h)}</Text>
              </View>
            ))}
          </>
        )}

        {evolutions && evolutions.trim() && (
          <>
            <Text style={s.h2}>Évolutions du logiciel</Text>
            <Paragraphes texte={evolutions} />
          </>
        )}

        {commentaire && commentaire.trim() && (
          <>
            <Text style={s.h2}>Commentaire</Text>
            <Paragraphes texte={commentaire} />
          </>
        )}

        <View style={s.pied} fixed>
          <Text>{t(`Généré par Baikal le ${dateFr(genereLe)} — chiffres issus de l'archive quotidienne (Stripe, vue contractuelle du site, Search Console, Bing Webmaster).`)}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
