import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { splitForStreaming } from "./gemini-agent.ts"

Deno.test("splitForStreaming coupe sur les espaces et reconstitue le texte exact", () => {
  const text = "Le CCAP prévoit des pénalités de 100 € par jour calendaire de retard [CCAP, Page 19]."
  const parts = splitForStreaming(text, 24)
  assertEquals(parts.join(''), text)
  assertEquals(parts.every(p => p.length <= 24 + 20), true)
  assertEquals(parts.length > 2, true)
})

Deno.test("splitForStreaming : texte vide → aucun morceau ; mot long → un seul morceau", () => {
  assertEquals(splitForStreaming(""), [])
  assertEquals(splitForStreaming("abcdefghijklmnopqrstuvwxyz0123456789", 8), ["abcdefghijklmnopqrstuvwxyz0123456789"])
})
