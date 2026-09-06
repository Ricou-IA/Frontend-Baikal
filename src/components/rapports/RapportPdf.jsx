/**
 * RapportPdf.jsx - Baikal Console
 * ============================================================================
 * Le document PDF A4 du rapport au partenaire, rendu par @react-pdf/renderer
 * dans le navigateur. Charge par import() dynamique depuis /rapports : le
 * moteur PDF ne doit pas alourdir le bundle principal.
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
const pos = (n) => t(Number(n || 0).toFixed(1).replace('.', ','));
const dateFr = (iso) => {
  if (!iso) return '';
  const [a, m, j] = String(iso).slice(0, 10).split('-');
  return `${j}/${m}/${a}`;
};
const majuscule = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

const s = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 56, paddingHorizontal: 51, fontFamily: 'Helvetica', fontSize: 9, color: '#111827' },
  entete: { borderBottomWidth: 1.5, borderBottomColor: '#111827', paddingBottom: 8, marginBottom: 16 },
  titre: { fontSize: 18, fontFamily: 'Helvetica-Bold' },
  sousTitre: { fontSize: 10, color: '#4b5563', marginTop: 3 },
  h2: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginTop: 16, marginBottom: 6, color: '#111827' },
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
  cell: { paddingVertical: 2.5, paddingHorizontal: 4, fontSize: 8 },
  cellTh: { paddingVertical: 3, paddingHorizontal: 4, fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#374151' },
  droite: { textAlign: 'right' },
  gras: { fontFamily: 'Helvetica-Bold' },
  pied: { position: 'absolute', bottom: 28, left: 51, right: 51, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7, color: '#6b7280', borderTopWidth: 0.5, borderTopColor: '#d1d5db', paddingTop: 5 },
});

function Table({ colonnes, lignes, cle, classeLigne }) {
  return (
    <View style={s.table}>
      <View style={s.th} fixed>
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

function BlocSeo({ seo, moisEntier }) {
  const ligne = (libelle, source, f) => ({
    libelle,
    periode: source.periode ? f(source.periode) : '—',
    precedent: source.precedent ? f(source.precedent) : '—',
  });
  // Ni total d'impressions brut ni position moyenne globale : ecartes par le
  // contrat agence (annexe 2, B.2), ils mentent sur ce site. Google montre les
  // impressions hors bruit ; Bing n'a pas cette notion, il montre les siennes.
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

function Paragraphes({ texte }) {
  const blocs = String(texte || '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return blocs.map((b, i) => {
    const lignes = b.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lignes.every((l) => /^[-•*]\s/.test(l))) {
      return (
        <View key={i} style={{ marginBottom: 4 }}>
          {lignes.map((l, j) => (
            <View key={j} style={s.puce}>
              <Text style={s.puceTiret}>•</Text>
              <Text style={s.puceTexte}>{t(l.replace(/^[-•*]\s/, ''))}</Text>
            </View>
          ))}
        </View>
      );
    }
    return <Text key={i} style={s.para}>{t(lignes.join(' '))}</Text>;
  });
}

export default function RapportPdf({ contenu, evolutions, commentaire, version, genereLe }) {
  const c = contenu;
  const contrat = c.partenariat.contrat;
  const libelle = c.mois_entier ? majuscule(c.libelle_periode) : c.libelle_periode;
  const partenaire = contrat?.partenaire ?? 'partenaire';
  const moisCouverts = new Set(c.mois_couverts);

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
          <View>
            <Text style={s.h2}>Décompte du partenariat</Text>
            <Table
              colonnes={[
                { titre: 'Mois', valeur: (l) => l.mois, flex: 1.2 },
                { titre: 'Ventes', valeur: (l) => nb(l.ventes), droite: true },
                { titre: 'CA HT', valeur: (l) => eur(l.ca_ht), droite: true },
                { titre: 'Coûts du mois', valeur: (l) => eur(l.couts_mois), droite: true },
                { titre: 'Partageables', valeur: (l) => (l.dans_decompte === false ? '—' : nb(l.ventes_partageables)), droite: true },
                { titre: 'CA partageable', valeur: (l) => (l.dans_decompte === false ? '—' : eur(l.ca_partageable_ht)), droite: true },
                { titre: 'Coûts imputés', valeur: (l) => (l.dans_decompte === false ? '—' : eur(l.couts_imputables)), droite: true },
                { titre: 'Résultat', valeur: (l) => (l.dans_decompte === false ? '—' : eur(l.resultat_partageable)), droite: true },
                { titre: 'Quote-part', valeur: (l) => (l.dans_decompte === false ? '—' : eur(l.quote_part)), droite: true, gras: true },
              ]}
              lignes={c.partenariat.lignes}
              cle={(l) => l.mois}
              classeLigne={(l) => (moisCouverts.has(l.mois) ? s.trCourant : l.dans_decompte === false ? s.trEstompe : null)}
            />
            <Text style={s.note}>
              {t(`Décompte mensuel par nature du contrat, les mois de la période sont surlignés. Franchise de ${contrat.franchise} ventes par mois civil, appréciée mois par mois sans report. Part de ${Math.round(contrat.part * 100)} % du résultat partageable. Assiette « ${contrat.assiette} », prix unitaire « ${contrat.prix_unitaire} »${contrat.prix_catalogue_ht ? ` (${eur(contrat.prix_catalogue_ht)} HT)` : ''}, coûts directs : ${contrat.couts_directs.join(', ')}, imputés au prorata des ventes partageables. Les mois antérieurs au ${dateFr(contrat.debut)} sont donnés pour la tendance.`)}
            </Text>
          </View>
        )}

        <Text style={s.h2}>{t(`Ventes de la période (${nb(c.ventes.nombre)})`)}</Text>
        {c.ventes.lignes.length === 0 ? (
          <Text style={s.para}>Aucune vente encaissée sur la période.</Text>
        ) : (
          <Table
            colonnes={[
              { titre: 'Date', valeur: (l) => dateFr(l.date), flex: 1 },
              { titre: 'Offre', valeur: (l) => l.offre, flex: 4 },
              { titre: 'TTC', valeur: (l) => eur(l.montant_ttc), droite: true },
              { titre: 'HT', valeur: (l) => eur(l.montant_ht), droite: true },
            ]}
            lignes={[...c.ventes.lignes, { total: true, date: '', offre: 'Total', montant_ttc: c.ventes.total_ttc, montant_ht: c.ventes.total_ht }]}
            cle={(l, i) => `${l.date}-${i}`}
            classeLigne={(l) => (l.total ? { fontFamily: 'Helvetica-Bold', backgroundColor: '#f3f4f6' } : null)}
          />
        )}
        <Text style={s.note}>Ventes B2C encaissées à plus de 0 €, hors dossiers de test. Aucune donnée nominative.</Text>

        <Text style={s.h2} break>SEO de la période</Text>
        <BlocSeo seo={c.seo} moisEntier={c.mois_entier} />
        <Text style={s.note}>
          {t(c.mois_entier
            ? 'Clics depuis la série quotidienne de la propriété. Impressions Google hors bruit : total des pages du mois moins les requêtes entre guillemets. Requêtes et pages : Search Console, hors bruit. Pas de position moyenne globale ni de total brut : ces deux chiffres ne décrivent pas ce site.'
            : `Clics depuis la série quotidienne de la propriété, exacts au jour. Impressions Google hors bruit, requêtes et pages : Search Console, cumul des mois couverts (${c.mois_couverts.join(', ')}). Pas de position moyenne globale ni de total brut : ces deux chiffres ne décrivent pas ce site.`)}
        </Text>

        {c.highlights.length > 0 && (
          <View>
            <Text style={s.h2}>Highlights</Text>
            {c.highlights.map((h, i) => (
              <View key={i} style={s.puce}>
                <Text style={s.puceTiret}>•</Text>
                <Text style={s.puceTexte}>{t(h)}</Text>
              </View>
            ))}
          </View>
        )}

        {evolutions && evolutions.trim() && (
          <View>
            <Text style={s.h2}>Évolutions du logiciel</Text>
            <Paragraphes texte={evolutions} />
          </View>
        )}

        {commentaire && commentaire.trim() && (
          <View>
            <Text style={s.h2}>Commentaire</Text>
            <Paragraphes texte={commentaire} />
          </View>
        )}

        <View style={s.pied} fixed>
          <Text>{t(`Généré par Baikal le ${dateFr(genereLe)} — chiffres issus de l'archive quotidienne (Stripe, vue contractuelle du site, Search Console, Bing Webmaster).`)}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
