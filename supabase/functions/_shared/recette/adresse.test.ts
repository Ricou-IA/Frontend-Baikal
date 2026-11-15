// L'adresse de connexion, telle que l'hébergeur la donne, devient celle du
// rôle baikal_reader : le prospect n'assemble rien et ne recopie aucun mot de
// passe. Tout ce qui décide de ce qui part vers Baikal est ici, pur et testé.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { preparerAdresse } from "./adresse.ts";

const MDP = "abcdefghjkmnpqrstuvwxyz2";
const prete = (saisie: string, motDePasse: string | null = MDP) => {
  const r = preparerAdresse(saisie, motDePasse);
  assert(r.ok, r.ok ? "" : r.erreur);
  return r;
};

Deno.test("Supabase, « Session pooler » collé tel quel : le rôle prend la référence du projet, le mot de passe est celui du script", () => {
  const r = prete("postgresql://postgres.zfvyabcd:[YOUR-PASSWORD]@aws-1-eu-west-3.pooler.supabase.com:5432/postgres");
  assertEquals(r.connexion, `postgresql://baikal_reader.zfvyabcd:${MDP}@aws-1-eu-west-3.pooler.supabase.com:5432/postgres`);
  assertEquals(r.remplace, { utilisateur: true, motDePasse: true });
  assertEquals(r.conseil, null);
});

Deno.test("un mot de passe administrateur collé par mégarde ne part jamais", () => {
  const r = prete("postgresql://postgres.zfvyabcd:MonSecretAdmin!@aws-1-eu-west-3.pooler.supabase.com:6543/postgres");
  assertEquals(r.connexion.includes("MonSecretAdmin"), false);
  assertEquals(r.connexion, `postgresql://baikal_reader.zfvyabcd:${MDP}@aws-1-eu-west-3.pooler.supabase.com:6543/postgres`);
  // Même avec un @ dans le mot de passe : l'hôte se lit après le DERNIER @.
  const avecArobase = prete("postgres://admin:p@ss@db.exemple.com:5432/app");
  assertEquals(avecArobase.connexion, `postgres://baikal_reader:${MDP}@db.exemple.com:5432/app`);
});

Deno.test("l'aperçu montre où Baikal se connecte, jamais le mot de passe", () => {
  const r = prete("postgresql://postgres.zfvyabcd:[YOUR-PASSWORD]@aws-1-eu-west-3.pooler.supabase.com:5432/postgres");
  assertEquals(r.apercu, "postgresql://baikal_reader.zfvyabcd:••••••@aws-1-eu-west-3.pooler.supabase.com:5432/postgres");
  assertEquals(r.apercu.includes(MDP), false);
});

Deno.test("hors Supabase : le rôle s'appelle baikal_reader, les options de l'adresse sont gardées", () => {
  const neon = prete("postgresql://neondb_owner:npg_secret@ep-cool-1234.eu-central-1.aws.neon.tech/neondb?sslmode=require");
  assertEquals(neon.connexion, `postgresql://baikal_reader:${MDP}@ep-cool-1234.eu-central-1.aws.neon.tech/neondb?sslmode=require`);
  // Un utilisateur à point n'est une référence de projet que sur le pooler Supabase.
  const autre = prete("postgresql://app.prod:secret@db.exemple.com:5432/app");
  assertEquals(autre.connexion, `postgresql://baikal_reader:${MDP}@db.exemple.com:5432/app`);
  const sansIdentifiants = prete("postgresql://db.exemple.com:5432/app");
  assertEquals(sansIdentifiants.connexion, `postgresql://baikal_reader:${MDP}@db.exemple.com:5432/app`);
});

Deno.test("l'adresse directe de Supabase passe, avec le conseil de prendre le pooler", () => {
  const r = prete("postgresql://postgres:[YOUR-PASSWORD]@db.zfvyabcd.supabase.co:5432/postgres");
  assertEquals(r.connexion, `postgresql://baikal_reader:${MDP}@db.zfvyabcd.supabase.co:5432/postgres`);
  assert(r.conseil?.includes("Session pooler"));
});

Deno.test("une adresse baikal_reader complète est envoyée telle quelle ; sans mot de passe, celui du script la complète", () => {
  const complete = "postgresql://baikal_reader.zfvyabcd:dejaChoisi42@aws-1-eu-west-3.pooler.supabase.com:5432/postgres";
  const r = prete(complete);
  assertEquals(r.connexion, complete);
  assertEquals(r.remplace, { utilisateur: false, motDePasse: false });
  assertEquals(r.apercu.includes("dejaChoisi42"), false);
  // Et elle passe même si la page n'a pas de mot de passe en mémoire.
  assertEquals(prete(complete, null).connexion, complete);

  const aCompleter = prete("postgresql://baikal_reader.zfvyabcd:[YOUR-PASSWORD]@aws-1-eu-west-3.pooler.supabase.com:5432/postgres");
  assertEquals(aCompleter.connexion, `postgresql://baikal_reader.zfvyabcd:${MDP}@aws-1-eu-west-3.pooler.supabase.com:5432/postgres`);
  assertEquals(aCompleter.remplace, { utilisateur: false, motDePasse: true });
  for (const repere of ["", "<password>", "YOUR_PASSWORD", "motdepasse", "%5BYOUR-PASSWORD%5D"]) {
    const sep = repere === "" ? "" : ":";
    assertEquals(prete(`postgresql://baikal_reader${sep}${repere}@db.exemple.com/app`).connexion, `postgresql://baikal_reader:${MDP}@db.exemple.com/app`, repere);
  }
});

Deno.test("l'adresse se retrouve dans ce qui l'entoure : guillemets, espaces, commande psql", () => {
  const attendu = `postgresql://baikal_reader:${MDP}@db.exemple.com:5432/app`;
  assertEquals(prete('  "postgresql://u:p@db.exemple.com:5432/app"  ').connexion, attendu);
  assertEquals(prete("psql 'postgresql://u:p@db.exemple.com:5432/app'").connexion, attendu);
  assertEquals(prete("DATABASE_URL=postgresql://u:p@db.exemple.com:5432/app").connexion, attendu);
});

Deno.test("une autre base part telle quelle : c'est Baikal qui dit qu'il ne lit que Postgres", () => {
  const r = prete("mysql://u:p@db.exemple.com/app");
  assertEquals(r.connexion, "mysql://u:p@db.exemple.com/app");
  assertEquals(r.apercu.includes(":p@"), false);
});

Deno.test("ce qui n'est pas une adresse est refusé sur place, en clair", () => {
  for (const saisie of ["", "   ", "db.exemple.com", "bonjour"]) {
    const r = preparerAdresse(saisie, MDP);
    assertEquals(r.ok, false, saisie);
    if (!r.ok) assert(r.erreur.includes("postgresql://"));
  }
  // Sans mot de passe en mémoire, on ne peut pas compléter : on le dit.
  const r = preparerAdresse("postgresql://postgres:[YOUR-PASSWORD]@db.exemple.com/app", null);
  assertEquals(r.ok, false);
  if (!r.ok) assert(r.erreur.includes("étape 1"));
});
