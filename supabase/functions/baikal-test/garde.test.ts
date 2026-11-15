// Les garde-fous de baikal-test : une fonction publique qui ouvre une
// connexion vers un hôte choisi par un inconnu. Tout ce qui décide d'un refus
// est ici, pur et testé.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  empreinte,
  hoteInterdit,
  ipInterdite,
  jetonValide,
  limiteur,
  lireConnexion,
  messageConnexion,
  nouveauJeton,
} from "./garde.ts";

const lue = (texte: string) => {
  const r = lireConnexion(texte);
  assert(r.ok, r.ok ? "" : r.erreur);
  return r.connexion;
};
const refus = (texte: unknown) => {
  const r = lireConnexion(texte);
  assert(!r.ok, "la connexion aurait dû être refusée");
  return r.erreur;
};

Deno.test("une connexion Postgres est lue, le port et la base prennent leur défaut", () => {
  assertEquals(lue("postgresql://baikal_reader:s3cret@db.exemple.com:6543/app"), {
    hote: "db.exemple.com", port: 6543, utilisateur: "baikal_reader", motDePasse: "s3cret", base: "app",
  });
  assertEquals(lue("  postgres://baikal_reader:p%40ss@db.exemple.com  "), {
    hote: "db.exemple.com", port: 5432, utilisateur: "baikal_reader", motDePasse: "p@ss", base: "postgres",
  });
  // L'utilisateur du pooler Supabase porte la référence du projet.
  assertEquals(lue("postgresql://baikal_reader.abcd:x@aws-1-eu-west-3.pooler.supabase.com:6543/postgres").utilisateur, "baikal_reader.abcd");
});

Deno.test("Postgres uniquement : une autre base l'apprend tout de suite", () => {
  assert(refus("mysql://u:p@db.exemple.com/app").includes("Postgres"));
  assert(refus("mongodb+srv://u:p@cluster.exemple.com").includes("Postgres"));
  assert(refus("db.exemple.com").includes("postgresql://"));
  assert(refus(42).includes("postgresql://"));
  assert(refus("postgresql://" + "a".repeat(3000)).includes("trop longue"));
});

Deno.test("utilisateur et mot de passe exigés, SSL jamais désactivé", () => {
  assert(refus("postgresql://db.exemple.com/app").includes("utilisateur"));
  assert(refus("postgresql://baikal_reader@db.exemple.com/app").includes("mot de passe"));
  assert(refus("postgresql://u:p@db.exemple.com/app?sslmode=disable").includes("SSL"));
  assertEquals(lue("postgresql://u:p@db.exemple.com/app?sslmode=require").hote, "db.exemple.com");
});

Deno.test("localhost, adresses privées et adresses de la plateforme sont refusés", () => {
  for (const hote of [
    "localhost", "LOCALHOST", "app.localhost", "127.0.0.1", "10.0.0.5", "172.16.4.1", "172.31.255.255",
    "192.168.1.10", "169.254.169.254", "0.0.0.0", "100.64.0.1", "[::1]", "::1", "fd00::1", "fe80::1",
    "::ffff:10.0.0.1", "supabase_db", "kong", "db", "host.docker.internal", "metadata.google.internal",
    "service.internal", "2130706433",
  ]) {
    assert(hoteInterdit(hote) !== null, `${hote} aurait dû être refusé`);
  }
  for (const hote of ["db.exemple.com", "aws-1-eu-west-3.pooler.supabase.com", "172.32.0.1", "8.8.8.8", "2a01:e0a::1"]) {
    assertEquals(hoteInterdit(hote), null, `${hote} aurait dû passer`);
  }
});

Deno.test("le port sort de la plage des services système", () => {
  assert(refus("postgresql://u:p@db.exemple.com:22/app").includes("port"));
  assertEquals(lue("postgresql://u:p@db.exemple.com:5432/app").port, 5432);
});

Deno.test("une adresse résolue est jugée comme un hôte : le nom public qui pointe en privé ne passe pas", () => {
  assertEquals(ipInterdite("10.1.2.3"), true);
  assertEquals(ipInterdite("fd12::1"), true);
  assertEquals(ipInterdite("51.15.20.30"), false);
});

Deno.test("dix tests par adresse et par heure, pas un de plus", () => {
  const trop = limiteur(10, 3_600_000);
  const t0 = 1_000_000;
  for (let i = 0; i < 10; i++) assertEquals(trop("1.2.3.4", t0 + i), false);
  assertEquals(trop("1.2.3.4", t0 + 11), true);
  // Une autre adresse n'est pas touchée, et l'heure passée rouvre le compteur.
  assertEquals(trop("5.6.7.8", t0 + 12), false);
  assertEquals(trop("1.2.3.4", t0 + 3_600_001 + 11), false);
});

Deno.test("le jeton : 32 caractères hexadécimaux, jamais deux fois le même", () => {
  const a = nouveauJeton();
  assertEquals(jetonValide(a), true);
  assertEquals(a.length, 32);
  assert(a !== nouveauJeton());
  assertEquals(jetonValide("abc"), false);
  assertEquals(jetonValide(a.toUpperCase()), false);
  assertEquals(jetonValide(null), false);
});

Deno.test("l'empreinte de l'hôte : stable, dépendante du sel, sans l'hôte en clair", async () => {
  const c = lue("postgresql://u:p@db.exemple.com:6543/app");
  const e = await empreinte(c, "sel-1");
  assertEquals(e, await empreinte(c, "sel-1"));
  assert(e !== await empreinte(c, "sel-2"));
  assert(e !== await empreinte({ ...c, base: "autre" }, "sel-1"));
  assertEquals(/^[0-9a-f]{64}$/.test(e), true);
  assertEquals(e.includes("exemple"), false);
});

Deno.test("une erreur de connexion se dit sans jamais citer l'hôte, l'utilisateur ni le mot de passe", () => {
  const erreur = (p: Record<string, string>) => Object.assign(new Error(p.message ?? "x"), p);
  assert(messageConnexion(erreur({ code: "28P01", message: 'password authentication failed for user "baikal_reader"' })).includes("mot de passe"));
  assert(messageConnexion(erreur({ code: "3D000", message: 'database "app" does not exist' })).includes("base"));
  assert(messageConnexion(erreur({ code: "ECONNREFUSED", message: "connect ECONNREFUSED 51.15.20.30:5432" })).includes("refuse la connexion"));
  assert(messageConnexion(erreur({ code: "CONNECT_TIMEOUT", message: "write CONNECT_TIMEOUT db.exemple.com:5432" })).includes("10 s"));
  assert(messageConnexion(erreur({ code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND db.exemple.com" })).includes("introuvable"));
  const inconnue = messageConnexion(erreur({ message: "boom db.exemple.com baikal_reader s3cret" }));
  for (const fuite of ["exemple", "baikal_reader", "s3cret", "51.15"]) {
    assertEquals(inconnue.includes(fuite), false);
  }
});

Deno.test("les écritures détournées d'une adresse locale ou privée sont refusées", () => {
  for (const ip of [
    "0:0:0:0:0:0:0:1", "0::1", "::0001", "0:0:0:0:0:0:0:0", // ::1 et :: écrits en entier
    "0:0:0:0:0:ffff:7f00:1", "::ffff:7f00:1", "::ffff:10.0.0.1", // IPv4 enrobée
    "::127.0.0.1", "::a00:1", // IPv4 « compatible »
    "64:ff9b::a00:1", "64:ff9b::127.0.0.1", // NAT64
    "2002:a00:1::1", // 6to4 vers 10.0.0.1
    "fec0::1", "fe80::1%eth0", "ff02::1",
  ]) {
    assertEquals(ipInterdite(ip), true, `${ip} aurait dû être refusée`);
  }
  for (const ip of ["2a01:e0a:1:2::10", "2606:4700:4700::1111", "::ffff:51.15.20.30", "2002:330f:141e::1"]) {
    assertEquals(ipInterdite(ip), false, `${ip} aurait dû passer`);
  }
  // Un octet à zéro initial se lit en octal chez certains résolveurs : 0177 = 127.
  for (const hote of ["0177.0.0.1", "010.0.0.1", "127.0.0.01", "1.2.3", "1.2.3.4.5", "0x7f.0.0.1"]) {
    assert(hoteInterdit(hote) !== null, `${hote} aurait dû être refusé`);
  }
});
