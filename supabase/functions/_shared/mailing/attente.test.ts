// Course webhook / marquage (constat du 26/11/2026). Donnees fictives.
import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  aGarder,
  envoyerEtMarquer,
  type EvenementAttente,
  type EvenementRecu,
  type FileAttente,
  type LigneMarquage,
  rejouerAttente,
  trierAttente,
} from "./attente.ts";
import { ajouterAuBilan, bilanVide, evenementsManquants } from "./rattrapage.ts";

const CAMPAGNE = "00000000-0000-4000-8000-000000000c01";

/** Un journal de site en memoire, avec mail_marquer / mail_evenement reduits
 *  a ce qui compte ici (connu ou non, delivre_le pose une fois). */
function journal() {
  const parResend = new Map<string, { email: string; delivre_le: string | null; ouvert_le: string | null }>();
  return {
    parResend,
    marquer(lignes: LigneMarquage[]) {
      for (const l of lignes) {
        if (l.resend_id) parResend.set(l.resend_id, { email: l.email, delivre_le: null, ouvert_le: null });
      }
      return Promise.resolve({ ok: true });
    },
    evenement(e: EvenementRecu) {
      const ligne = parResend.get(e.resend_id);
      if (!ligne) return Promise.resolve({ ok: true, connu: false });
      if (e.type === "delivered") ligne.delivre_le ??= e.le;
      if (e.type === "opened") ligne.ouvert_le ??= e.le;
      return Promise.resolve({ ok: true, connu: true });
    },
  };
}

function fileMemoire(): FileAttente & { lignes: (EvenementAttente & { statut: string })[] } {
  const lignes: (EvenementAttente & { statut: string })[] = [];
  return {
    lignes,
    garder(e) {
      lignes.push({ ...e, id: `e${lignes.length}`, recu_le: new Date().toISOString(), tentatives: 0, statut: "attente" });
      return Promise.resolve();
    },
    enAttente(appId) {
      return Promise.resolve(lignes.filter((l) => l.app_id === appId && l.statut === "attente"));
    },
    clore(id, statut, tentatives) {
      const l = lignes.find((x) => x.id === id)!;
      l.statut = statut;
      l.tentatives = tentatives;
      return Promise.resolve();
    },
    tenter(id, tentatives) {
      lignes.find((x) => x.id === id)!.tentatives = tentatives;
      return Promise.resolve();
    },
  };
}

/** Le webhook, reduit a sa decision : appliquer, sinon garder si tague. */
async function webhook(j: ReturnType<typeof journal>, f: FileAttente, e: EvenementRecu, campagneTag: string | null) {
  const r = await j.evenement(e);
  if (aGarder(r, campagneTag)) await f.garder(e);
  return 200;
}

Deno.test("course : chaque envoi est marque avant le suivant, pendant la pause", async () => {
  const ordre: string[] = [];
  const r = await envoyerEtMarquer(["a@x.test", "b@x.test", "c@x.test"], {
    envoyer: (d) => {
      ordre.push(`envoi ${d}`);
      return Promise.resolve({ ligne: { email: d, touche: 1, resend_id: `re_${d}` } });
    },
    marquer: (l) => {
      ordre.push(`marque ${l.map((x) => x.email).join(",")}`);
      return Promise.resolve();
    },
    pause: () => Promise.resolve(),
    budgetDepasse: () => false,
  });
  assertEquals(r.lignes.length, 3);
  assertEquals(ordre, [
    "envoi a@x.test", "marque a@x.test",
    "envoi b@x.test", "marque b@x.test",
    "envoi c@x.test", "marque c@x.test",
  ]);
});

Deno.test("course : un delivered arrive pendant le lot est rattache, aucun n'est perdu", async () => {
  const j = journal();
  const f = fileMemoire();
  const N = 20;
  const dest = Array.from({ length: N }, (_, i) => `d${i}@x.test`);
  const ev = (i: number, type = "delivered"): EvenementRecu => ({
    app_id: "site-a", campagne_id: CAMPAGNE, resend_id: `re_${i}`, type, le: `2026-11-26T09:00:${String(i).padStart(2, "0")}Z`,
    detail: {},
  });
  let i = 0;
  await envoyerEtMarquer(dest, {
    envoyer: async (d) => {
      const n = i++;
      // Le pire cas : Resend livre AVANT que Baikal n'ait marque l'envoi.
      await webhook(j, f, ev(n), CAMPAGNE);
      return { ligne: { email: d, touche: 1, resend_id: `re_${n}` } };
    },
    marquer: (l) => j.marquer(l),
    pause: () => Promise.resolve(),
    budgetDepasse: () => false,
  });
  // Tous inconnus a leur arrivee : tous en file, rien d'applique encore.
  assertEquals(f.lignes.length, N);
  assertEquals([...j.parResend.values()].filter((l) => l.delivre_le).length, 0);

  const bilan = await rejouerAttente(f, "site-a", (e) => j.evenement(e));
  assertEquals(bilan, { rejoues: N, en_attente: 0, expires: 0 });
  assertEquals([...j.parResend.values()].filter((l) => l.delivre_le).length, N);

  // Un delivered arrive APRES le marquage s'applique tout de suite, sans file.
  await webhook(j, f, ev(N - 1, "opened"), CAMPAGNE);
  assertEquals(f.lignes.length, N);
  assert(j.parResend.get(`re_${N - 1}`)!.ouvert_le);
});

Deno.test("course : un transactionnel (sans tag campagne) n'entre jamais en file", () => {
  assertEquals(aGarder({ connu: false }, null), false);
  assertEquals(aGarder({ connu: false }, "pas-un-uuid"), false);
  assertEquals(aGarder({ connu: true }, CAMPAGNE), false);
  assertEquals(aGarder({ connu: false }, CAMPAGNE), true);
});

Deno.test("course : un evenement encore inconnu attend, puis expire apres 15 min (jamais supprime)", async () => {
  const j = journal();
  const f = fileMemoire();
  await f.garder({ app_id: "site-a", campagne_id: CAMPAGNE, resend_id: "re_fantome", type: "delivered", le: "2026-11-26T09:00:00Z", detail: {} });
  const r1 = await rejouerAttente(f, "site-a", (e) => j.evenement(e));
  assertEquals(r1, { rejoues: 0, en_attente: 1, expires: 0 });
  const tard = new Date(Date.now() + 16 * 60_000);
  const r2 = await rejouerAttente(f, "site-a", (e) => j.evenement(e), tard);
  assertEquals(r2, { rejoues: 0, en_attente: 0, expires: 1 });
  assertEquals(f.lignes[0].statut, "expire");
  assertEquals(f.lignes.length, 1);
});

Deno.test("file : tri entre a rejouer et a expirer", () => {
  const t = new Date("2026-11-26T10:00:00Z");
  const r = trierAttente([
    { id: "a", recu_le: "2026-11-26T09:50:00Z" },
    { id: "b", recu_le: "2026-11-26T09:40:00Z" },
  ], t);
  assertEquals(r, { aRejouer: ["a"], aExpirer: ["b"] });
});

Deno.test("course : une erreur fatale arrete le lot, la ligne est quand meme marquee", async () => {
  const marquees: string[] = [];
  const r = await envoyerEtMarquer(["a@x.test", "b@x.test"], {
    envoyer: (d) => Promise.resolve({ ligne: { email: d, touche: 1, erreur: "Resend 401" }, fatale: "Resend 401" }),
    marquer: (l) => {
      marquees.push(...l.map((x) => x.email));
      return Promise.resolve();
    },
    pause: () => Promise.resolve(),
    budgetDepasse: () => false,
  });
  assertEquals(r.fatale, "Resend 401");
  assertEquals(marquees, ["a@x.test"]);
});

// ------ Rattrapage ------

const ligne = (p: Partial<Parameters<typeof evenementsManquants>[0]> = {}) => ({
  resend_id: "re_1", statut: "envoye", delivre_le: null, ouvert_le: null, clique_le: null,
  rebond_le: null, plainte_le: null, ...p,
});

Deno.test("rattrapage : delivre deduit du dernier evenement, ouvertures jamais inventees", () => {
  const envoi = "2026-11-25T09:00:00Z";
  assertEquals(evenementsManquants(ligne(), { last_event: "delivered", created_at: envoi }).appliquer, [
    { resend_id: "re_1", type: "delivered", le: envoi },
  ]);
  const o = evenementsManquants(ligne(), { last_event: "clicked", created_at: envoi });
  assertEquals(o.appliquer.map((p) => p.type), ["delivered"]);
  assertEquals(o.sans_heure, ["opened", "clicked"]);
  // Deja delivre et ouvert : rien.
  assertEquals(
    evenementsManquants(ligne({ delivre_le: envoi, ouvert_le: envoi }), { last_event: "opened", created_at: envoi }),
    { appliquer: [], sans_heure: [] },
  );
  // Rebond : pas de delivre.
  assertEquals(evenementsManquants(ligne(), { last_event: "bounced", created_at: envoi }).appliquer.map((p) => p.type), ["bounced"]);
  // Envoye seulement (ou en attente) : rien.
  assertEquals(evenementsManquants(ligne(), { last_event: "sent", created_at: envoi }).appliquer, []);
});

Deno.test("rattrapage : bilan", () => {
  const b = bilanVide();
  const envoi = "2026-11-25T09:00:00Z";
  for (const ev of ["delivered", "opened", "bounced", "sent"]) {
    const r = { last_event: ev, created_at: envoi };
    ajouterAuBilan(b, r, evenementsManquants(ligne(), r));
  }
  ajouterAuBilan(b, null, null);
  assertEquals(b.lus, 4);
  assertEquals(b.illisibles, 1);
  assertEquals(b.a_appliquer, { delivered: 2, bounced: 1, complained: 0 });
  assertEquals(b.ouvertures_sans_heure, 1);
});
