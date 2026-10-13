/**
 * Desinscription.jsx - page publique
 * ============================================================================
 * Cible du lien « Se désinscrire » des campagnes Baikal. Affiche le site et
 * l'adresse, puis desinscrit sur confirmation (un prefetch de lien ne
 * desinscrit personne). L'ecriture se fait chez le site, par l'Edge Function
 * mailing-desinscription ; la securite est le jeton signe de l'URL.
 * ============================================================================
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { desinscrire } from '../services/mailing.service';

export default function Desinscription() {
  const [params] = useSearchParams();
  const charge = { t: params.get('t') || '', c: params.get('c') || null, test: params.get('test') === '1' };
  const [info, setInfo] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    desinscrire(charge, false).then(({ data, error }) => {
      if (error) setErreur(error.message); else setInfo(data);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function confirmer() {
    setEnCours(true);
    const { data, error } = await desinscrire(charge, true);
    setEnCours(false);
    if (error) setErreur(error.message); else setInfo(data);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center px-4 pt-[12vh]">
      <main className="w-full max-w-md bg-white border border-gray-200 rounded-xl p-8 text-gray-900">
        {erreur && (
          <>
            <h1 className="text-xl font-semibold mb-3">Lien invalide</h1>
            <p className="text-gray-600">{erreur}</p>
          </>
        )}
        {!erreur && !info && <p className="text-gray-500">Chargement…</p>}
        {!erreur && info && !info.fait && (
          <>
            <h1 className="text-xl font-semibold mb-3">Se désinscrire</h1>
            <p className="text-gray-600 leading-relaxed">
              Ne plus recevoir les emails de <strong>{info.site}</strong> à l'adresse <strong>{info.email}</strong> ?
            </p>
            <button
              onClick={confirmer}
              disabled={enCours}
              className="mt-5 px-4 py-2.5 rounded-lg bg-gray-900 text-white text-sm disabled:opacity-50"
            >
              Confirmer la désinscription
            </button>
          </>
        )}
        {!erreur && info?.fait && (
          <>
            <h1 className="text-xl font-semibold mb-3">C'est fait</h1>
            <p className="text-gray-600 leading-relaxed">
              L'adresse <strong>{info.email}</strong> ne recevra plus les emails de <strong>{info.site}</strong>.
              {info.test ? ' (Lien de test : aucune désinscription enregistrée.)' : ''}
            </p>
          </>
        )}
      </main>
    </div>
  );
}
