/** Metadata identity resolution only. No file reads, hashing, renaming or network calls. */
const EXT = /\.(?:zip|7z|nes|fds|sfc|smc|gb|gbc|gba|nds|n64|z64|v64|md|gen|smd|bin|sms|gg|pce|chd|cue|m3u|iso|cso|pbp|ngp|ngc|ws|wsc|vb|a26|a78|col|rom|lnx|sv|dsk|mx1|mx2|sg|z80|d64)$/i;
const RELEASE = /^(?:(?:USA|Japan|Europe|World|Korea|Asia|Australia|China|Taiwan|Hong Kong|En|Ja|Ko|Fr|De|Es|It|Pt|Zh|Nl|Ru|Sv|No|Da|Fi|Pl)(?:\s*,\s*|$))+$|^(?:Rev(?:ision)?\s+[\w.]+|Disc\s+\d+(?:\s+of\s+\d+)?|Track\s+\d+|Unl|Beta(?:\s+[\w.]+)?|Proto(?:type)?|Demo|Sample|Korea-patch\b.*|일본판|북미판|유럽판|한국판|정발판|세계판|영문판)$/i;
const HANGUL = /[가-힣]/;
const PLATFORM = { fc: "nes", fds: "nes", sfc: "snes", ps: "ps1", wsc: "ws", ngpc: "ngp", ngc: "ngp", sg1000: "sg", coleco: "col", supervision: "wsv", thirtytwox: "32x", seventyeighthundred: "a7800", fbneo: "arcade", cps1: "arcade", cps2: "arcade", cps3: "arcade", neogeo: "arcade", fba2012: "arcade", advmame: "arcade", gnw: "gw", poke: "mini", cpc: "amstrad" };
const EXT_PLATFORM = { gba: "gba", gbc: "gbc", gb: "gb", nes: "nes", fds: "nes", sfc: "snes", smc: "snes", nds: "nds", n64: "n64", z64: "n64", v64: "n64", md: "md", gen: "md", smd: "md", sms: "sms", gg: "gg", pce: "pce", ngp: "ngp", ngc: "ngp", ws: "ws", wsc: "ws", vb: "vb", a26: "a2600", a78: "a7800", col: "col", lnx: "lynx", sv: "wsv", sg: "sg" };
export const normalized = (s) => String(s ?? "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
export const ROM_SCOPES = new Set(["content", "dat-rom", "headerless-content"]);
const stem = (s) => String(s ?? "").split(/[\\/]/).pop().replace(EXT, "");
const exactKey = (s) => stem(s).normalize("NFC").toLowerCase().trim();

function lastGroup(s) {
  if (!s.endsWith(")")) return null;
  let depth = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    if (s[i] === ")") depth++;
    else if (s[i] === "(" && --depth === 0) return { at: i, text: s.slice(i + 1, -1).trim() };
  }
  return null;
}

/** The name's lookup titles and unchanged suffix. Names are data, not language-support claims. */
export function splitName(name) {
  const raw = stem(name).trim();
  let bare = raw.replace(/(?:\s*\[[^\]]*\])+\s*$/, "").trim();
  let group = lastGroup(bare);
  while (group && RELEASE.test(group.text)) {
    bare = bare.slice(0, group.at).trim();
    group = lastGroup(bare);
  }
  let ko = "";
  let en = "";
  if (group && HANGUL.test(bare.slice(0, group.at)) && /[A-Za-z]/.test(group.text) && !HANGUL.test(group.text)) {
    ko = bare.slice(0, group.at).trim();
    en = group.text;
  } else if (HANGUL.test(bare)) ko = bare;
  else en = bare;
  return { ko, en, suffix: raw.slice(bare.length) };
}

const roman = { i: "1", ii: "2", iii: "3", iv: "4", v: "5", vi: "6", vii: "7", viii: "8", ix: "9", x: "10" };
const numbers = (s) => (s.toLowerCase().match(/\d+|\b(?:viii|vii|iii|vi|iv|ii|ix|i|v|x)\b/g) ?? []).map((s) => roman[s] ?? s).join(",");
const editions = (s) => (s.toLowerCase().match(/\b(?:dx|deluxe|advance|remake|remastered|collection|trilogy|gold|special|edition)\b/g) ?? []).sort().join(",");
const segmentCount = (s) => s.split(/\s+-\s+|:\s*/).length;
const grams = (s) => new Set(Array.from({ length: Math.max(0, s.length - 1) }, (_, i) => s.slice(i, i + 2)));
function dice(a, b) {
  let same = 0;
  for (const g of a) if (b.has(g)) same++;
  return a.size + b.size ? 2 * same / (a.size + b.size) : 0;
}

/** Restricted Damerau-Levenshtein: an adjacent transposition is one typo. */
function distance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  let older = null;
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + Number(a[i - 1] !== b[j - 1]));
      if (older && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) current[j] = Math.min(current[j], older[j - 2] + 1);
    }
    older = previous;
    previous = current;
  }
  return previous[b.length];
}

const add = (map, key, id) => {
  if (!key) return;
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(id);
};
const pair = (a, b) => JSON.stringify([a, b]);
const namesOf = (r) => [r.ko, r.en, r.ja, r.ko && r.en ? `${r.ko} (${r.en})` : null,
  ...(r.originalTitle?.source && r.originalTitle?.language ? [r.originalTitle.text] : []),
  ...(r.romanizations ?? []).filter((v) => v.source).map((v) => v.text),
  ...r.aliases.map((a) => typeof a === "string" ? a : a.name)].filter(Boolean);

/** Build once per data version. All candidate searches stay inside a known system. */
export function createResolver(records) {
  const entities = new Map();
  const systems = new Set();
  const exact = new Map();
  const titles = new Map();
  const hashes = new Map();
  const providers = new Map();
  const sets = new Map();
  const allSets = new Map();
  const postings = new Map();
  const aliases = [];
  for (const input of records) {
    if (!input.id || !input.system || entities.has(input.id)) throw new Error("Each identity needs a unique id and system");
    const record = { kind: "unknown", aliases: [], fingerprints: [], links: [], sources: [], ...input,
      ko: input.titles?.ko ?? input.ko, en: input.titles?.en ?? input.en, ja: input.titles?.ja ?? input.ja };
    entities.set(record.id, record);
    systems.add(record.system);
    const names = new Set(namesOf(record));
    if (record.system === "arcade") {
      const short = record.setName ?? record.id.match(/^(?:fbneo:|tentacle:set:)([a-z0-9._+-]+)$/i)?.[1];
      if (short) {
        add(sets, pair(record.arcadeNamespace ?? "fbneo",exactKey(short)),record.id);
        add(allSets,exactKey(short),record.id);
      }
    }
    for (const name of names) {
      add(exact, pair(record.system, exactKey(name)), record.id);
      if (record.system === "arcade") continue;
      const parsed = splitName(name);
      for (const title of [parsed.ko, parsed.en].filter(Boolean)) {
        const key = normalized(title);
        if (!key || key.length > 256) continue;
        add(titles, pair(record.system, key), record.id);
        const index = aliases.length;
        aliases.push({ id: record.id, title, key, grams: grams(key) });
        for (const gram of grams(key)) add(postings, pair(record.system, gram), index);
      }
    }
    for (const fp of record.fingerprints) {
      const lengths = { sha256: 64, sha1: 40 };
      if (ROM_SCOPES.has(fp.scope) && lengths[fp.algorithm] && new RegExp(`^[0-9a-f]{${lengths[fp.algorithm]}}$`, "i").test(fp.value)) {
        add(hashes, JSON.stringify([record.system, fp.algorithm, fp.value.toLowerCase()]), record.id);
      }
    }
    for (const link of record.links) {
      // A hack's inherited base-game metadata is not an identity link to that hack.
      if (link.relation === "base" || !["source-linked", "verified"].includes(link.status)) continue;
      add(providers, JSON.stringify([record.system, link.provider, String(link.id)]), record.id);
    }
  }

  function candidates(ids, score = 1) {
    return [...ids].sort().map((id) => {
      const r = entities.get(id);
      return { id, system: r.system, ko: r.ko ?? null, en: r.en ?? null,
        titles: { ko: r.ko ?? null, en: r.en ?? null, ja: r.ja ?? null }, originalTitle: r.originalTitle ?? null,
        kind: r.kind, baseGameId: r.baseGameId ?? null, score, links: r.links };
    });
  }

  return {
    size: entities.size,
    resolve(input) {
      const name = String(input.name ?? "");
      if (name.length > 512) return { status: "unmatched", reason: "name-too-long", candidates: [] };
      const canonicalSystem = (s) => PLATFORM[String(s).toLowerCase()] ?? String(s).toLowerCase();
      const explicit = input.system ? canonicalSystem(input.system) : null;
      const folder = String(input.rel ?? "").split(/[\\/]/).slice(0, -1).reverse().map(canonicalSystem).find((s) => systems.has(s));
      const ext = EXT_PLATFORM[name.split(".").pop().toLowerCase()];
      const system = explicit ?? folder ?? ext;
      if (!system || !systems.has(system)) return { status: "unmatched", reason: "system-required", candidates: [] };
      if ((explicit && folder && explicit !== folder) || (ext && system !== ext && !(system === "gb" && folder === "gb" && ext === "gbc"))) {
        return { status: "review", reason: "system-conflict", system, candidates: [] };
      }
      const parsed = splitName(name);
      const decorate = (result) => ({ system, parsed, ...result });
      const finish = (ids, by) => {
        const list = candidates(ids);
        if (list.length !== 1) return decorate({ status: "review", reason: "ambiguous", by, candidates: list });
        const r = entities.get(list[0].id);
        const variant = /\b(?:hack|mod|homebrew|pirate|unl)\b|개조|핵롬/i.test(name);
        const localNames = namesOf(r).map((n) => splitName(n).ko).filter(Boolean).map(normalized);
        const localConflict = parsed.ko && r.ko && !localNames.includes(normalized(parsed.ko));
        if (by !== "hash" && (localConflict || (variant && !["romhack", "homebrew", "bootleg"].includes(r.kind)))) {
          return decorate({ status: "review", reason: localConflict ? "localized-title-conflict" : "variant-needs-evidence", by, candidates: list });
        }
        const observedOnly = r.sources.length && r.sources.every((s) => s === "rpi-filename");
        if (by !== "hash" && observedOnly) return decorate({ status: "review", reason: "filename-observation-only", by, candidates: list });
        return decorate({ status: "matched", by, id: list[0].id, candidates: list });
      };
      const strong = new Set();
      for (const algorithm of ["sha256", "sha1"]) {
        if (typeof input[algorithm] !== "string") continue;
        for (const id of hashes.get(JSON.stringify([system, algorithm, input[algorithm].toLowerCase()])) ?? []) strong.add(id);
      }
      if (strong.size) return finish(strong, "hash");
      const linked = new Set();
      for (const [provider, id] of Object.entries(input.providerIds ?? {})) {
        for (const hit of providers.get(JSON.stringify([system, provider, String(id)])) ?? []) linked.add(hit);
      }
      if (linked.size) return finish(linked, "provider-id");
      // FBNeo identity is its short set name. Never fuzzy-match an unknown arcade set.
      if (system === "arcade") {
        const hits = exact.get(pair(system, exactKey(name)));
        const namespace = input.arcadeNamespace ?? "fbneo";
        const own = sets.get(pair(namespace,exactKey(name))) ?? new Set();
        if (own.size) return finish(own, "set-name");
        const other = allSets.get(exactKey(name)) ?? new Set();
        if (other.size) return decorate({ status: "review", reason: "arcade-namespace-required", candidates: candidates(other) });
        return hits?.size ? decorate({ status: "review", reason: "arcade-display-name", candidates: candidates(hits) })
          : decorate({ status: "unmatched", reason: "unknown-arcade-set", candidates: [] });
      }
      const raw = exact.get(pair(system, exactKey(name)));
      if (raw?.size) return finish(raw, "exact-name");
      const terms = [...new Set([parsed.ko, parsed.en].filter(Boolean))];
      const hits = new Set();
      for (const term of terms) for (const id of titles.get(pair(system, normalized(term))) ?? []) hits.add(id);
      if (hits.size) return finish(hits, "title-alias");

      const pool = new Set();
      for (const term of terms) for (const gram of grams(normalized(term))) {
        for (const index of postings.get(pair(system, gram)) ?? []) pool.add(index);
      }
      const overlap = [...pool].map((index) => ({ index, overlap: Math.max(...terms.map((term) => dice(grams(normalized(term)), aliases[index].grams))) }))
        .sort((a, b) => b.overlap - a.overlap || a.index - b.index);
      const truncated = overlap.length > 400;
      const scores = new Map();
      let scored = 0;
      for (const { index } of overlap.slice(0, 400)) {
        const alias = aliases[index];
        for (const term of terms) {
          const query = normalized(term);
          if (query.length < 5 || HANGUL.test(term) !== HANGUL.test(alias.title) || numbers(term) !== numbers(alias.title)
            || editions(term) !== editions(alias.title) || segmentCount(term) !== segmentCount(alias.title)) continue;
          const edits = distance(query, alias.key);
          const score = 0.8 * (1 - edits / Math.max(query.length, alias.key.length)) + 0.2 * dice(grams(query), alias.grams);
          scored++;
          if (score >= 0.65 && score > (scores.get(alias.id)?.score ?? 0)) scores.set(alias.id, { score, edits, length: query.length });
        }
      }
      const ranked = [...scores].sort((a, b) => b[1].score - a[1].score || a[0].localeCompare(b[0]));
      if (!ranked.length) return decorate({ status: "unmatched", reason: "no-candidate", scored, candidates: [] });
      const list = ranked.slice(0, 5).map(([id, info]) => ({ ...candidates([id])[0], score: Number(info.score.toFixed(4)) }));
      const top = ranked[0][1];
      const gap = top.score - (ranked[1]?.[1].score ?? 0);
      if (!truncated && top.score >= 0.94 && top.edits <= 1 && top.length >= 16 && gap >= 0.1) {
        const result = finish(new Set([ranked[0][0]]), "fuzzy-title");
        return { ...result, scored, score: list[0].score, margin: Number(gap.toFixed(4)), candidates: list };
      }
      return decorate({ status: "review", reason: truncated ? "candidate-limit" : "fuzzy-candidates", by: "fuzzy-title", scored, candidates: list });
    },
  };
}
