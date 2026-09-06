// Commits du mois d'un depot GitHub : la source factuelle des « evolutions du
// logiciel » du rapport. Le dossier memoire local n'est pas accessible depuis
// Vercel ; l'historique git, lui, est la trace de ce qui a ete livre.

export interface Commit {
  date: string; // YYYY-MM-DD
  sujet: string;
}

export async function commitsDuMois(
  repo: string,
  token: string,
  debut: string, // YYYY-MM-DD
  fin: string, // YYYY-MM-DD inclus
): Promise<Commit[]> {
  const out: Commit[] = [];
  for (let page = 1; page <= 3; page++) {
    const url = new URL(`https://api.github.com/repos/${repo}/commits`);
    url.searchParams.set("since", `${debut}T00:00:00Z`);
    url.searchParams.set("until", `${fin}T23:59:59Z`);
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "baikal-admin-rapport",
      },
    });
    if (!res.ok) {
      throw new Error(`GitHub ${res.status} sur ${repo}: ${(await res.text()).slice(0, 200)}`);
    }
    const lignes = await res.json() as any[];
    for (const c of lignes) {
      const message: string = c.commit?.message ?? "";
      const sujet = message.split("\n")[0].trim();
      // Les merges ne decrivent rien ; les commits vides non plus.
      if (!sujet || /^merge\b/i.test(sujet)) continue;
      const date = String(c.commit?.author?.date ?? c.commit?.committer?.date ?? "").slice(0, 10);
      out.push({ date, sujet });
    }
    if (lignes.length < 100) break;
  }
  return out;
}
