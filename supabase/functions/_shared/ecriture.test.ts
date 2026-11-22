// Donnees fictives : ce depot est public.
import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { corpsEcriture, declinaison, validerEcriture } from "./ecriture.ts";

Deno.test("ecriture : equilibree, elle passe", () => {
  const v = validerEcriture([
    { compte: "512001", debit: 80.5 },
    { compte: "627001", debit: 19.5 },
    { compte: "411001", credit: 100 },
  ]);
  assertEquals(v, { ok: true, total: 100 });
});

Deno.test("ecriture : desequilibree, une seule ligne, deux montants ou montant negatif : refus", () => {
  assert(!validerEcriture([{ compte: "512001", debit: 10 }, { compte: "411001", credit: 9.99 }]).ok);
  assert(!validerEcriture([{ compte: "512001", debit: 10 }]).ok);
  assert(!validerEcriture([{ compte: "512001", debit: 10, credit: 10 }, { compte: "411001", credit: 10 }]).ok);
  assert(!validerEcriture([{ compte: "512001", debit: -10 }, { compte: "411001", credit: -10 }]).ok);
  assert(!validerEcriture([{ compte: "512001", debit: 0.105 }, { compte: "411001", credit: 0.105 }]).ok);
  assert(!validerEcriture([{ compte: "abc", debit: 1 }, { compte: "411001", credit: 1 }]).ok);
});

Deno.test("ecriture : les centimes ne derivent pas a l'addition", () => {
  const v = validerEcriture([
    { compte: "512001", debit: 0.1 },
    { compte: "512001", debit: 0.2 },
    { compte: "411001", credit: 0.3 },
  ]);
  assert(v.ok);
});

Deno.test("compte : la declinaison demandee, sans repli sur une autre", () => {
  const comptes = [
    { id: 1, number: "627001", vat_rate: "any" },
    { id: 2, number: "627001", vat_rate: "exempt" },
    { id: 3, number: "6270011", vat_rate: "any" },
  ];
  assertEquals(declinaison(comptes, "627001"), 1);
  assertEquals(declinaison(comptes, "627001", "exempt"), 2);
  assertEquals(declinaison(comptes, "627001", "FR_200"), null);
  assertEquals(declinaison(comptes, "999"), null);
});

Deno.test("corps : montants en chaines a deux decimales, libelle repris sur les lignes", () => {
  const corps = corpsEcriture({
    date: "2026-11-22",
    libelle: "Régularisation fictive",
    journalId: 7,
    lignes: [
      { compte: "512001", debit: 80.5, ledgerAccountId: 11 },
      { compte: "411001", credit: 80.5, ledgerAccountId: 12, libelle: "Contrepartie" },
    ],
    // deno-lint-ignore no-explicit-any
  }) as any;
  assertEquals(corps.journal_id, 7);
  assertEquals(corps.ledger_entry_lines[0], { debit: "80.50", credit: "0.00", ledger_account_id: 11, label: "Régularisation fictive" });
  assertEquals(corps.ledger_entry_lines[1].label, "Contrepartie");
  assertThrows(() => corpsEcriture({ date: "22/11/2026", libelle: "x", journalId: 1, lignes: [] }));
});

Deno.test("compte : un compte desactive n'est pris que sur demande explicite", () => {
  const comptes = [{ id: 9, number: "623800", vat_rate: "any", enabled: false }];
  assertEquals(declinaison(comptes, "623800"), null);
  assertEquals(declinaison(comptes, "623800", undefined, true), 9);
});
