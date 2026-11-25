"use client";

import { useState, useEffect, useRef } from "react";
import {
  Plus,
  Search,
  Type,
  Brain,
  List as ListIcon,
  Trash2,
  Check,
  X,
  Shuffle,
  Sparkles,
  ArrowLeftRight,
  Loader2,
  Image as ImageIcon,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Unlink,
  Link2,
  Pencil,
  MessageSquareQuote,
} from "lucide-react";
import { LANGUAGE, NATIVE } from "@/lib/language";

type Word = {
  id: string;
  tr: string;
  ru: string;
  added: number;
  correct: number;
  wrong: number;
  parents: string[]; // ids of the words this entry is an example of; empty => main-list word
};

// Rough Turkish stem for spotting a word inside phrases: drops the -mak/-mek
// infinitive ending and also tries the softened final consonant
// (kitap → kitabı, gitmek → gidiyor).
function stemsOf(word: string): string[] {
  const base = word.toLocaleLowerCase("tr").trim().replace(/(mak|mek)$/, "");
  if (base.length < 3) return [];
  const stems = [base];
  const soft: Record<string, string> = { k: "ğ", p: "b", t: "d", ç: "c" };
  const last = base[base.length - 1];
  if (base.length >= 4 && soft[last]) stems.push(base.slice(0, -1) + soft[last]);
  return stems;
}

function phraseHasWord(phrase: string, word: string): boolean {
  if (/\s/.test(word.trim())) return false;
  const stems = stemsOf(word);
  if (stems.length === 0) return false;
  const tokens = phrase.toLocaleLowerCase("tr").split(/[^\p{L}]+/u).filter(Boolean);
  return tokens.some((t) => stems.some((st) => t.startsWith(st)));
}

// Everything is stored in lowercase. Uses the language's own locale so
// Turkish I/İ become ı/i correctly.
function lowerForeign(s: string) {
  return s.toLocaleLowerCase(LANGUAGE.code);
}
function lowerNative(s: string) {
  return s.toLocaleLowerCase(NATIVE.code);
}
function normalizeCase(w: Word): Word {
  return { ...w, tr: lowerForeign(w.tr.trim()), ru: lowerNative(w.ru.trim()) };
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function stripFence(s: string) {
  return s.replace(/```json|```/g, "").trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

// Accepts small typos and grammatical-ending mismatches (важно/важный,
// желания/пожелания) without letting through genuinely different words.
function isCloseEnough(a: string, b: string): boolean {
  if (a === b) return true;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen < 5) return false;
  const allowed = maxLen <= 8 ? 1 : maxLen <= 14 ? 2 : 3;
  return levenshtein(a, b) <= allowed;
}

// ---- server calls ----
function redirectToLogin() {
  window.location.href = "/login";
}

async function apiListWords(): Promise<Word[]> {
  const res = await fetch("/api/words");
  if (res.status === 401) {
    redirectToLogin();
    return [];
  }
  const json = await res.json();
  const parents: Record<string, string[]> = {};
  (json.links || []).forEach((l: { example_id: string; word_id: string }) => {
    (parents[l.example_id] ||= []).push(l.word_id);
  });
  return (json.words || []).map((w: any) => ({
    ...w,
    added: Number(w.added),
    parents: parents[w.id] || [],
  }));
}

async function apiAddWord(word: Word) {
  const res = await fetch("/api/words", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(word),
  });
  if (res.status === 401) redirectToLogin();
}

async function apiUpdateWord(
  id: string,
  patch: Partial<Pick<Word, "correct" | "wrong" | "tr" | "ru">>
) {
  const res = await fetch(`/api/words/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (res.status === 401) redirectToLogin();
}

async function apiLink(exampleId: string, wordId: string, attach: boolean) {
  const res = await fetch("/api/links", {
    method: attach ? "POST" : "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ example_id: exampleId, word_id: wordId }),
  });
  if (res.status === 401) redirectToLogin();
}

async function apiDeleteWord(id: string) {
  const res = await fetch(`/api/words/${id}`, { method: "DELETE" });
  if (res.status === 401) redirectToLogin();
}

async function apiGetStreak(): Promise<{ day: string; seconds: number }[]> {
  const res = await fetch("/api/streak");
  if (res.status === 401) {
    redirectToLogin();
    return [];
  }
  const json = await res.json();
  return json.days || [];
}

async function apiAddStreakSeconds(day: string, deltaSeconds: number) {
  const res = await fetch("/api/streak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ day, deltaSeconds }),
  });
  if (res.status === 401) redirectToLogin();
}

function localDayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const STREAK_GOAL_SECONDS = 600;

// Quiz picking: a word won't come back within this many questions, and a
// hard word is at most this many times likelier than a new one.
const QUIZ_COOLDOWN = 20;
const QUIZ_MAX_WEIGHT = 3;

async function callClaude(prompt: string, maxTokens?: number): Promise<string> {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, maxTokens }),
  });
  if (res.status === 401) {
    redirectToLogin();
    throw new Error("session expired");
  }
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "claude call failed");
  return json.text as string;
}

async function callClaudeVision(prompt: string, mediaType: string, data: string): Promise<string> {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, image: { mediaType, data }, maxTokens: 500 }),
  });
  if (res.status === 401) {
    redirectToLogin();
    throw new Error("session expired");
  }
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "claude call failed");
  return json.text as string;
}

export default function VocabTrainer() {
  const [words, setWords] = useState<Word[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("add");
  const [wordSearch, setWordSearch] = useState("");

  // Add tab state
  const [addDirection, setAddDirection] = useState<"tr-ru" | "ru-tr">("tr-ru");
  const [newTr, setNewTr] = useState("");
  const [newRu, setNewRu] = useState("");
  const [newExamples, setNewExamples] = useState("");
  const [addSaving, setAddSaving] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [addMsg, setAddMsg] = useState("");

  // Text tab state
  const [pastedText, setPastedText] = useState("");
  const [extracted, setExtracted] = useState<{ word: string; selected: boolean }[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [textMsg, setTextMsg] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Quiz tab state
  const [direction, setDirection] = useState<"tr-ru" | "ru-tr">("tr-ru");
  const [current, setCurrent] = useState<Word | null>(null);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<{ correct: boolean; correctAnswer: string } | null>(null);
  const [sessionStats, setSessionStats] = useState({ correct: 0, wrong: 0 });
  const [showExamples, setShowExamples] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const recentQuizIds = useRef<string[]>([]);

  // Word detail (examples) state
  const [openWordId, setOpenWordId] = useState<string | null>(null);
  const [exTr, setExTr] = useState("");
  const [exRu, setExRu] = useState("");
  const [exLoading, setExLoading] = useState(false);
  const [exMsg, setExMsg] = useState("");

  // Editing a saved word or example in place
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTr, setEditTr] = useState("");
  const [editRu, setEditRu] = useState("");
  const [editMsg, setEditMsg] = useState("");

  // "Attach to word" picker in the Words list
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [linkSearch, setLinkSearch] = useState("");

  // Main list = top-level words; examples live inside their parent word.
  const topLevel = words.filter((w) => w.parents.length === 0);
  const quizWords = topLevel;
  const exampleCount = words.length - topLevel.length;

  // Streak state
  const [streakDays, setStreakDays] = useState<Record<string, number>>({});

  // ---- load from server on mount ----
  useEffect(() => {
    (async () => {
      try {
        const list = await apiListWords();
        setWords(list);
      } catch (e) {
        // best-effort
      }
      setLoaded(true);
    })();
    (async () => {
      try {
        const days = await apiGetStreak();
        const map: Record<string, number> = {};
        days.forEach((d) => (map[d.day] = d.seconds));
        setStreakDays(map);
      } catch (e) {
        // best-effort
      }
    })();
  }, []);


  // ---- add tab ----
  async function handleLookup() {
    if (!newTr.trim()) return;
    setLookupLoading(true);
    try {
      const prompt =
        addDirection === "tr-ru"
          ? `Слово или короткая фраза на ${LANGUAGE.adjN} языке: "${newTr.trim()}". Дай перевод на ${NATIVE.adjM} язык одним словом или короткой формулировкой (если это глагол — инфинитив). Ответь СТРОГО в виде JSON-объекта {"translation":"..."}, без markdown-разметки и пояснений.`
          : `Переведи ${NATIVE.adjN} слово или короткую фразу "${newTr.trim()}" на ${LANGUAGE.adjM} язык одним словом или короткой формулировкой (если это глагол — начальная форма/инфинитив). Ответь СТРОГО в виде JSON-объекта {"translation":"..."}, без markdown-разметки и пояснений.`;
      const raw = await callClaude(prompt);
      const parsed = JSON.parse(stripFence(raw));
      setNewRu(parsed.translation || "");
    } catch (e) {
      setAddMsg("Couldn't find a translation, enter it manually.");
    }
    setLookupLoading(false);
  }

  async function handleAddWord() {
    if (!newTr.trim() || !newRu.trim()) {
      setAddMsg("Fill in both fields.");
      return;
    }
    const a = newTr.trim();
    const b = newRu.trim();
    let trWord: string;
    let ruWord: string;
    if (NATIVE.scriptRegex) {
      // Detect by script first (e.g. Cyrillic = Russian) so the word lands
      // in the right field even if the direction toggle wasn't set the way
      // it was typed. Only possible when the native language's script
      // doesn't overlap with the foreign language's Latin alphabet.
      const aIsNative = NATIVE.scriptRegex.test(a);
      const bIsNative = NATIVE.scriptRegex.test(b);
      if (aIsNative && !bIsNative) {
        trWord = b;
        ruWord = a;
      } else if (bIsNative && !aIsNative) {
        trWord = a;
        ruWord = b;
      } else {
        trWord = addDirection === "tr-ru" ? a : b;
        ruWord = addDirection === "tr-ru" ? b : a;
      }
    } else {
      trWord = addDirection === "tr-ru" ? a : b;
      ruWord = addDirection === "tr-ru" ? b : a;
    }
    const exampleLines = parseExampleLines(newExamples);
    const existing = words.find((w) => lowerForeign(w.tr) === lowerForeign(trWord));
    if (existing) {
      if (exampleLines.length === 0 || existing.parents.length > 0) {
        setAddMsg(
          existing.parents.length > 0
            ? "This is already in your list as an example."
            : "This word is already in your list."
        );
        return;
      }
      // Word exists: just add the new examples to it.
      setAddSaving(true);
      const n = await addExamplesTo(existing.id, exampleLines);
      setAddSaving(false);
      if (n < 0) {
        setAddMsg("Couldn't translate the examples automatically, add translations after a dash.");
        return;
      }
      setNewTr("");
      setNewRu("");
      setNewExamples("");
      setAddMsg(`Word was already in your list — added ${n} example${n === 1 ? "" : "s"} to it.`);
      return;
    }
    const word: Word = normalizeCase({
      id: uid(),
      tr: trWord,
      ru: ruWord,
      added: Date.now(),
      correct: 0,
      wrong: 0,
      parents: [],
    });
    setAddSaving(true);
    setWords((prev) => [word, ...prev]);
    await apiAddWord(word);
    let n = 0;
    if (exampleLines.length > 0) n = await addExamplesTo(word.id, exampleLines);
    setAddSaving(false);
    setNewTr("");
    setNewRu("");
    if (n < 0) {
      // keep the examples text so nothing typed is lost
      setAddMsg("Word added, but couldn't translate the examples — add translations after a dash and save again.");
      return;
    }
    setNewExamples("");
    setAddMsg(n > 0 ? `Added with ${n} example${n === 1 ? "" : "s"}!` : "Added!");
    setTimeout(() => setAddMsg(""), 2000);
  }

  // "phrase" or "phrase — translation" (also " - " / " – "), one per line.
  function parseExampleLines(text: string): { tr: string; ru: string }[] {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const m = line.match(/^(.*?)\s+[—–-]\s+(.*)$/);
        return m ? { tr: m[1].trim(), ru: m[2].trim() } : { tr: line, ru: "" };
      })
      .filter((e) => e.tr);
  }

  // Creates/attaches examples under a word. Phrases already in the list are
  // attached instead of duplicated; missing translations come from Claude in
  // one call. Returns how many were added, or -1 if translation failed.
  async function addExamplesTo(wordId: string, items: { tr: string; ru: string }[]): Promise<number> {
    const toLink: string[] = [];
    const toCreate: { tr: string; ru: string }[] = [];
    for (const it of items) {
      const ex = words.find((w) => lowerForeign(w.tr) === lowerForeign(it.tr));
      if (ex) {
        if (ex.id !== wordId && !ex.parents.includes(wordId) && !words.some((w) => w.parents.includes(ex.id))) {
          toLink.push(ex.id);
        }
      } else if (!toCreate.some((c) => lowerForeign(c.tr) === lowerForeign(it.tr))) {
        toCreate.push(it);
      }
    }
    const missing = toCreate.filter((c) => !c.ru).map((c) => c.tr);
    if (missing.length > 0) {
      try {
        const raw = await callClaude(
          `Переведи фразы на ${LANGUAGE.adjN} языке на ${NATIVE.adjM} язык (естественно, кратко). Фразы: ${JSON.stringify(
            missing
          )}. Ответь СТРОГО в виде JSON-объекта вида {"фраза":"перевод"} без markdown-разметки и пояснений.`,
          1000
        );
        const map = JSON.parse(stripFence(raw));
        const byLower: Record<string, string> = {};
        Object.keys(map).forEach((k) => (byLower[lowerForeign(k.trim())] = map[k]));
        toCreate.forEach((c) => {
          if (!c.ru) c.ru = map[c.tr] || byLower[lowerForeign(c.tr)] || "";
        });
      } catch (e) {
        return -1;
      }
      if (toCreate.some((c) => !c.ru)) return -1;
    }
    const now = Date.now();
    const created: Word[] = toCreate.map((c, i) =>
      normalizeCase({ id: uid(), tr: c.tr, ru: c.ru, added: now + i, correct: 0, wrong: 0, parents: [wordId] })
    );
    setWords((prev) => [
      ...created,
      ...prev.map((w) => (toLink.includes(w.id) ? { ...w, parents: [...w.parents, wordId] } : w)),
    ]);
    await Promise.all([...created.map((w) => apiAddWord(w)), ...toLink.map((id) => apiLink(id, wordId, true))]);
    return created.length + toLink.length;
  }

  // ---- editing ----
  function startEdit(w: Word) {
    setEditingId(w.id);
    setEditTr(w.tr);
    setEditRu(w.ru);
    setEditMsg("");
  }

  async function saveEdit() {
    if (!editingId) return;
    const tr = lowerForeign(editTr.trim());
    const ru = lowerNative(editRu.trim());
    if (!tr || !ru) {
      setEditMsg("Fill in both fields.");
      return;
    }
    if (words.some((w) => w.id !== editingId && lowerForeign(w.tr) === tr)) {
      setEditMsg("Another entry already has this spelling.");
      return;
    }
    const id = editingId;
    setWords((prev) => prev.map((w) => (w.id === id ? { ...w, tr, ru } : w)));
    setEditingId(null);
    await apiUpdateWord(id, { tr, ru });
  }

  function renderEditForm() {
    return (
      <div className="vt-edit-form">
        <span className="vt-field-label">{LANGUAGE.name}</span>
        <input className="vt-input" value={editTr} onChange={(e) => setEditTr(e.target.value)} />
        <span className="vt-field-label" style={{ marginTop: 10 }}>
          {NATIVE.name} (separate meanings with commas)
        </span>
        <input
          className="vt-input"
          value={editRu}
          autoFocus
          onChange={(e) => setEditRu(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && saveEdit()}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button className="vt-btn vt-btn-primary" style={{ flex: 1 }} onClick={saveEdit}>
            <Check size={15} /> Save
          </button>
          <button className="vt-btn vt-btn-ghost" style={{ flex: 1 }} onClick={() => setEditingId(null)}>
            Cancel
          </button>
        </div>
        {editMsg && <div className="vt-msg" style={{ color: "var(--coral)" }}>{editMsg}</div>}
      </div>
    );
  }

  // ---- text tab ----
  function handleExtract() {
    const found: string[] = pastedText.match(LANGUAGE.extractRegex) || [];
    const seen = new Set<string>();
    const unique: string[] = [];
    found.forEach((w) => {
      const lower = lowerForeign(w);
      if (!seen.has(lower) && lower.length > 1) {
        seen.add(lower);
        unique.push(lower);
      }
    });
    setExtracted(unique.map((w) => ({ word: w, selected: false })));
    setTextMsg("");
  }

  function toggleExtracted(idx: number) {
    setExtracted((prev) => prev.map((item, i) => (i === idx ? { ...item, selected: !item.selected } : item)));
  }

  async function handleAddSelected() {
    const selectedWords = extracted.filter((e) => e.selected).map((e) => e.word);
    if (selectedWords.length === 0) {
      setTextMsg("Select at least one word.");
      return;
    }
    const already = new Set(words.map((w) => lowerForeign(w.tr)));
    const toAdd = selectedWords.filter((w) => !already.has(w));
    if (toAdd.length === 0) {
      setTextMsg("These words are already in your list.");
      return;
    }
    setBatchLoading(true);
    try {
      const prompt = `Переведи список ${LANGUAGE.genitive} слов на ${NATIVE.adjM} язык. Слова: ${JSON.stringify(
        toAdd
      )}. Ответь СТРОГО в виде JSON-объекта вида {"слово":"перевод"} без markdown-разметки, без пояснений, только сам JSON.`;
      const raw = await callClaude(prompt);
      const map = JSON.parse(stripFence(raw));
      const newWords: Word[] = toAdd.map((w) => normalizeCase({
        id: uid(),
        tr: w,
        ru: (typeof map[w] === "string" ? map[w] : map[w]?.ru) || "",
        added: Date.now(),
        correct: 0,
        wrong: 0,
        parents: [],
      }));
      setWords((prev) => [...newWords, ...prev]);
      await Promise.all(newWords.map((w) => apiAddWord(w)));
      setExtracted([]);
      setPastedText("");
      setTextMsg(`Added ${newWords.length} words`);
    } catch (e) {
      setTextMsg("Couldn't translate automatically, try again.");
    }
    setBatchLoading(false);
  }

  // ---- image extraction ----
  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  function clearImage() {
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleExtractFromImage() {
    if (!imagePreview) return;
    setImageLoading(true);
    try {
      const match = imagePreview.match(/^data:(.*);base64,(.*)$/s);
      if (!match) throw new Error("bad image data");
      const mediaType = match[1];
      const base64 = match[2];
      const text = await callClaudeVision(
        `Найди на этой фотографии ${LANGUAGE.adjM} текст и выпиши отдельные ${LANGUAGE.genitive} слова из него (в начальной форме где возможно, в нижнем регистре, без повторов, без чисел). Ответь СТРОГО в виде JSON-массива строк, без markdown-разметки и пояснений, например: ["mot","livre"]`,
        mediaType,
        base64
      );
      const arr = JSON.parse(stripFence(text));
      setExtracted((prev) => {
        const seen = new Set(prev.map((p) => p.word));
        const merged = [...prev];
        arr.forEach((w: string) => {
          const lower = lowerForeign(String(w));
          if (!seen.has(lower)) {
            seen.add(lower);
            merged.push({ word: lower, selected: false });
          }
        });
        return merged;
      });
      setTextMsg(`Words found in photo: ${arr.length}`);
    } catch (e) {
      setTextMsg("Couldn't recognize words in the photo, try another one.");
    }
    setImageLoading(false);
  }

  // ---- quiz tab ----
  // Weighted pick based on all-time correct/wrong: words you consistently get
  // right become rare (never impossible), words you miss or haven't tried yet
  // come up more often. Persists across sessions since it reads the DB counts.
  // The weight is capped so a few hard words can't take over the quiz.
  function pickWeighted(pool: Word[]): Word {
    const weights = pool.map((w) => Math.min(QUIZ_MAX_WEIGHT, (w.wrong + 1) / (w.correct + 1)));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  function pickNext(list: Word[] = quizWords) {
    if (list.length === 0) {
      setCurrent(null);
      return;
    }
    // Cooldown: skip words shown in the last QUIZ_COOLDOWN questions (fewer
    // if the list is small, so there's always something left to pick).
    const cooldown = Math.min(QUIZ_COOLDOWN, list.length - 1);
    const recent = cooldown > 0 ? recentQuizIds.current.slice(-cooldown) : [];
    const pool = recent.length > 0 ? list.filter((w) => !recent.includes(w.id)) : list;
    const pick = pickWeighted(pool.length > 0 ? pool : list);
    recentQuizIds.current = [...recentQuizIds.current.filter((id) => id !== pick.id), pick.id].slice(-QUIZ_COOLDOWN);
    setCurrent(pick);
    setAnswer("");
    setFeedback(null);
    setShowExamples(false);
    setTimeout(() => inputRef.current && inputRef.current.focus(), 50);
  }

  useEffect(() => {
    if (tab === "quiz" && loaded && quizWords.length > 0 && (!current || !quizWords.some((w) => w.id === current.id))) {
      pickNext(quizWords);
    }
    if (tab === "quiz" && quizWords.length === 0) {
      setCurrent(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, loaded, quizWords.length]);

  // Streak: while actively on the quiz tab (and the page is visible), count
  // active seconds toward today's goal and persist them every 5s.
  useEffect(() => {
    if (tab !== "quiz" || quizWords.length === 0) return;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      const key = localDayKey();
      setStreakDays((prev) => ({ ...prev, [key]: (prev[key] || 0) + 5 }));
      apiAddStreakSeconds(key, 5);
    };
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, [tab, quizWords.length]);

  async function checkAnswer() {
    if (!current) return;
    const promptAnswer = direction === "tr-ru" ? current.ru : current.tr;
    const variants = promptAnswer
      .split(/[,;/]/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const userAns = answer.trim().toLowerCase();
    const correct = variants.some((v) => isCloseEnough(userAns, v));
    setFeedback({ correct, correctAnswer: promptAnswer });
    setSessionStats((s) => ({ correct: s.correct + (correct ? 1 : 0), wrong: s.wrong + (correct ? 0 : 1) }));
    const newCorrect = current.correct + (correct ? 1 : 0);
    const newWrong = current.wrong + (correct ? 0 : 1);
    setWords((prev) => prev.map((w) => (w.id === current.id ? { ...w, correct: newCorrect, wrong: newWrong } : w)));
    await apiUpdateWord(current.id, { correct: newCorrect, wrong: newWrong });
  }

  function handleQuizKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      if (feedback) {
        pickNext();
      } else {
        checkAnswer();
      }
    }
  }

  async function deleteWord(id: string) {
    // Examples that belong only to this word are deleted with it; shared ones
    // just lose the link.
    const own = examplesOf(id).filter((e) => e.parents.length === 1).length;
    if (own > 0 && !window.confirm(`Delete this word and its ${own} example${own === 1 ? "" : "s"}?`)) return;
    setWords((prev) =>
      prev
        .filter((w) => w.id !== id && !(w.parents.length === 1 && w.parents[0] === id))
        .map((w) => (w.parents.includes(id) ? { ...w, parents: w.parents.filter((p) => p !== id) } : w))
    );
    if (openWordId === id) setOpenWordId(null);
    await apiDeleteWord(id);
  }

  // ---- examples ----
  function examplesOf(id: string): Word[] {
    return words.filter((w) => w.parents.includes(id)).sort((a, b) => a.added - b.added);
  }

  function openWord(id: string) {
    setOpenWordId(id);
    setLinkingId(null);
    setEditingId(null);
    setExTr("");
    setExRu("");
    setExMsg("");
    window.scrollTo({ top: 0 });
  }

  async function linkExample(exampleId: string, wordId: string) {
    setWords((prev) =>
      prev.map((w) =>
        w.id === exampleId && !w.parents.includes(wordId) ? { ...w, parents: [...w.parents, wordId] } : w
      )
    );
    await apiLink(exampleId, wordId, true);
  }

  // With no links left the example goes back to the main word list.
  async function unlinkExample(exampleId: string, wordId: string) {
    setWords((prev) =>
      prev.map((w) => (w.id === exampleId ? { ...w, parents: w.parents.filter((p) => p !== wordId) } : w))
    );
    await apiLink(exampleId, wordId, false);
  }

  function wordName(id: string) {
    return words.find((w) => w.id === id)?.tr || "";
  }

  async function handleAddExample() {
    if (!openWordId || !exTr.trim()) return;
    const tr = exTr.trim();
    const existing = words.find((w) => lowerForeign(w.tr) === lowerForeign(tr));
    if (existing) {
      if (existing.id === openWordId || existing.parents.includes(openWordId)) {
        setExMsg("This phrase is already here.");
      } else if (examplesOf(existing.id).length > 0) {
        setExMsg("This is a word with its own examples, so it can't be an example.");
      } else {
        await linkExample(existing.id, openWordId);
        setExTr("");
        setExRu("");
        setExMsg("It was already in your list — attached here.");
      }
      return;
    }
    setExLoading(true);
    let ru = exRu.trim();
    try {
      if (!ru) {
        const raw = await callClaude(
          `Фраза на ${LANGUAGE.adjN} языке: "${tr}". Дай её перевод на ${NATIVE.adjM} язык (естественно, кратко). Ответь СТРОГО в виде JSON-объекта {"translation":"..."}, без markdown-разметки и пояснений.`
        );
        ru = JSON.parse(stripFence(raw)).translation || "";
      }
    } catch (e) {
      // fall through to the empty-translation check
    }
    if (!ru) {
      setExMsg("Couldn't translate automatically, enter the translation manually.");
      setExLoading(false);
      return;
    }
    const ex: Word = normalizeCase({
      id: uid(),
      tr,
      ru,
      added: Date.now(),
      correct: 0,
      wrong: 0,
      parents: [openWordId],
    });
    setWords((prev) => [ex, ...prev]);
    await apiAddWord(ex);
    setExTr("");
    setExRu("");
    setExMsg("");
    setExLoading(false);
  }

  const sortedList = [...topLevel].sort((a, b) => a.tr.localeCompare(b.tr, "tr"));
  const searchQuery = wordSearch.trim().toLocaleLowerCase("tr");
  const matches = (w: Word) =>
    w.tr.toLocaleLowerCase("tr").includes(searchQuery) || w.ru.toLowerCase().includes(searchQuery);
  const filteredList = searchQuery
    ? sortedList.filter((w) => matches(w) || words.some((e) => e.parents.includes(w.id) && matches(e)))
    : sortedList;

  const openWordObj = openWordId ? words.find((w) => w.id === openWordId) || null : null;
  const openExamples = openWordObj ? examplesOf(openWordObj.id) : [];
  // Phrases that seem to contain this word and aren't attached to it yet
  // (including ones already attached to other words).
  const suggestions = openWordObj
    ? words.filter(
        (w) =>
          w.id !== openWordObj.id &&
          !w.parents.includes(openWordObj.id) &&
          /\s/.test(w.tr.trim()) &&
          !words.some((e) => e.parents.includes(w.id)) &&
          phraseHasWord(w.tr, openWordObj.tr)
      )
    : [];
  // Candidates for the "attach to word" picker: words that look like they
  // appear in the phrase come first, then whatever matches the search.
  const linkingObj = linkingId ? words.find((w) => w.id === linkingId) || null : null;
  const linkQuery = linkSearch.trim().toLocaleLowerCase("tr");
  const linkCandidates = linkingObj
    ? (() => {
        const pool = sortedList.filter((w) => w.id !== linkingObj.id && !linkingObj.parents.includes(w.id));
        const guessed = pool.filter((w) => phraseHasWord(linkingObj.tr, w.tr));
        if (!linkQuery) return guessed;
        const searched = pool.filter(
          (w) => w.tr.toLocaleLowerCase("tr").includes(linkQuery) || w.ru.toLowerCase().includes(linkQuery)
        );
        return [...guessed.filter((w) => searched.includes(w)), ...searched.filter((w) => !guessed.includes(w))].slice(0, 30);
      })()
    : [];

  function toggleLinking(id: string) {
    setLinkingId((cur) => (cur === id ? null : id));
    setLinkSearch("");
  }

  function renderLinkPanel(entry: Word) {
    return (
      <div className="vt-link-panel">
        <span className="vt-field-label">
          {entry.parents.length === 0 ? `Attach “${entry.tr}” as an example of:` : `Also attach “${entry.tr}” to:`}
        </span>
        <input
          className="vt-input"
          autoFocus
          value={linkSearch}
          onChange={(e) => setLinkSearch(e.target.value)}
          placeholder="Search for the word..."
        />
        <div style={{ marginTop: 6 }}>
          {linkCandidates.length === 0 && (
            <div className="vt-list-tr" style={{ padding: "8px 4px" }}>
              {linkQuery ? "No words found." : "Type to find the word."}
            </div>
          )}
          {linkCandidates.map((c) => (
            <button
              key={c.id}
              className="vt-link-option"
              onClick={() => {
                linkExample(entry.id, c.id);
                setLinkingId(null);
              }}
            >
              <span className="vt-list-word">{c.tr}</span> <span className="vt-list-tr">— {c.ru}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const currentExamples = current ? examplesOf(current.id) : [];

  // Streak: current run of consecutive completed days (today is exempt from
  // breaking the streak until the day is over — it just doesn't count yet).
  const todayKey = localDayKey();
  let streakCount = 0;
  for (let i = 0; i < 400; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const seconds = streakDays[localDayKey(d)] || 0;
    if (seconds >= STREAK_GOAL_SECONDS) {
      streakCount++;
    } else if (i !== 0) {
      break;
    }
  }
  const todaySeconds = streakDays[todayKey] || 0;

  // This calendar week (Sun-Sat), for the Duolingo-style week strip.
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const key = localDayKey(d);
    return { key, seconds: streakDays[key] || 0, isToday: key === todayKey, isFuture: key > todayKey };
  });
  const weekdayLabels = ["S", "M", "T", "W", "T", "F", "S"];

  return (
    <div className="vt-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap');

        .vt-root {
          --paper: #FFFFFF;
          --paper-deep: #F2F5F2;
          --ink: #26332B;
          --ink-soft: #869089;
          --tile-blue: #2E9C6B;
          --tile-blue-deep: #23805A;
          --tab-active: #E7F1EB;
          --turquoise: #2E9C6B;
          --coral: #CC4F5C;
          --sand-line: #E2E7E2;
          font-family: 'Inter', sans-serif;
          background: var(--paper);
          color: var(--ink);
          border-radius: 16px;
          padding: 28px;
          max-width: 640px;
          width: 100%;
          min-width: 0;
          margin: 0 auto;
        }
        .vt-root * { box-sizing: border-box; }
        .vt-root button:focus { outline: none; }
        .vt-root button { -webkit-tap-highlight-color: transparent; }

        .vt-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 20px;
        }
        .vt-title {
          font-family: 'Fraunces', serif;
          font-weight: 600;
          font-size: 26px;
          letter-spacing: -0.01em;
          line-height: 1.1;
          min-width: 0;
          overflow-wrap: break-word;
        }
        .vt-count {
          font-family: 'JetBrains Mono', monospace;
          font-size: 13px;
          color: var(--ink-soft);
          white-space: nowrap;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          line-height: 1.5;
        }

        .vt-tabs {
          display: flex;
          gap: 2px;
          margin-bottom: 22px;
          border-bottom: 2px solid var(--sand-line);
          padding-bottom: 0;
          overflow-x: auto;
          overflow-y: hidden;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
          touch-action: pan-x;
        }
        .vt-tabs::-webkit-scrollbar { display: none; }
        .vt-tab {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 9px 11px;
          font-family: 'Inter', sans-serif;
          font-weight: 600;
          font-size: 13px;
          color: var(--ink-soft);
          background: transparent;
          border: none;
          border-radius: 8px 8px 0 0;
          cursor: pointer;
          transition: color 0.15s ease, background 0.15s ease;
          position: relative;
          top: 2px;
          flex-shrink: 0;
          white-space: nowrap;
        }
        .vt-tab:hover { color: var(--ink); }
        .vt-tab.active {
          color: var(--tile-blue-deep);
          background: var(--tab-active);
          border-bottom: 2px solid var(--tile-blue);
        }

        .vt-card {
          background: var(--paper-deep);
          border-radius: 12px;
          padding: 18px;
        }

        .vt-field-label {
          font-size: 12.5px;
          font-weight: 600;
          color: var(--ink-soft);
          margin-bottom: 6px;
          display: block;
        }
        .vt-input, .vt-textarea {
          width: 100%;
          font-family: 'Inter', sans-serif;
          font-size: 16px;
          padding: 11px 13px;
          border-radius: 8px;
          border: 1.5px solid var(--sand-line);
          background: #FFFFFF;
          color: var(--ink);
          outline: none;
        }
        .vt-input:focus, .vt-textarea:focus { border-color: var(--tile-blue); }
        .vt-textarea { resize: vertical; min-height: 96px; }

        /* stacked, full-width rows — no horizontal overflow on mobile */
        .vt-row { display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px; }
        .vt-row > div { width: 100%; }

        .vt-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          font-family: 'Inter', sans-serif;
          font-weight: 600;
          font-size: 13.5px;
          padding: 11px 16px;
          border-radius: 8px;
          border: none;
          cursor: pointer;
          transition: opacity 0.15s ease, transform 0.1s ease;
        }
        .vt-btn:active { transform: scale(0.98); }
        .vt-btn:disabled { opacity: 0.5; cursor: default; }
        .vt-btn-block { width: 100%; }
        .vt-btn-primary { background: var(--tile-blue); color: #FFFFFF; font-size: 14px; padding: 12px 16px; }
        .vt-btn-primary:hover:not(:disabled) { background: var(--tile-blue-deep); }
        .vt-btn-ghost { background: transparent; color: var(--tile-blue-deep); border: 1.5px solid var(--tile-blue); }
        .vt-btn-ghost:hover:not(:disabled) { background: rgba(46,156,107,0.08); }

        .vt-msg { font-size: 13px; color: var(--turquoise); margin-top: 10px; font-weight: 600; }

        .vt-chip {
          display: inline-flex;
          align-items: center;
          padding: 6px 12px;
          border-radius: 999px;
          font-size: 13.5px;
          font-weight: 500;
          cursor: pointer;
          border: 1.5px solid var(--sand-line);
          background: #FFFFFF;
          transition: all 0.12s ease;
        }
        .vt-chip.selected {
          background: var(--tile-blue);
          color: #FFFFFF;
          border-color: var(--tile-blue);
        }

        .vt-chips-wrap { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0; }

        .vt-flashcard {
          text-align: center;
          padding: 36px 24px;
        }
        .vt-flash-word {
          font-family: 'Fraunces', serif;
          font-weight: 600;
          font-size: 34px;
          letter-spacing: -0.01em;
          margin: 6px 0;
        }
        .vt-flash-hint {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11.5px;
          color: var(--ink-soft);
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .vt-quiz-input-row { display: flex; gap: 8px; margin-top: 18px; }
        .vt-quiz-input-row .vt-input { text-align: center; font-size: 17px; }
        .vt-quiz-input-row .vt-btn { flex-shrink: 0; padding: 11px 15px; }

        .vt-feedback {
          margin-top: 16px;
          padding: 12px;
          border-radius: 8px;
          font-size: 14.5px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .vt-feedback.correct { background: rgba(46,156,107,0.14); color: var(--turquoise); }
        .vt-feedback.wrong { background: rgba(204,79,92,0.12); color: var(--coral); }

        .vt-stats-bar {
          display: flex;
          gap: 16px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 12.5px;
          color: var(--ink-soft);
          margin-top: 16px;
          justify-content: center;
        }
        .vt-stats-bar b { color: var(--ink); }

        .vt-search-row {
          position: relative;
          margin-bottom: 14px;
        }
        .vt-search-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--ink-soft);
          pointer-events: none;
        }
        .vt-search-input { padding-left: 36px; }

        .vt-streak-bar {
          background: var(--paper-deep);
          border-radius: 12px;
          padding: 12px 14px;
          margin-bottom: 14px;
        }
        .vt-streak-summary {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          font-size: 13px;
          color: var(--ink-soft);
          margin-bottom: 8px;
        }
        .vt-streak-summary b { color: var(--ink); font-size: 15px; }
        .vt-streak-flame { font-size: 18px; line-height: 1; }
        .vt-streak-today {
          margin-left: auto;
          font-family: 'JetBrains Mono', monospace;
          font-size: 11.5px;
        }
        .vt-streak-week {
          display: flex;
          justify-content: space-between;
          gap: 4px;
        }
        .vt-streak-weekday {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
        }
        .vt-streak-weekday-label {
          font-size: 11px;
          font-weight: 600;
          color: var(--ink-soft);
        }
        .vt-streak-weekday-label.today { color: var(--tile-blue-deep); }
        .vt-streak-circle {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: var(--sand-line);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #FFFFFF;
        }
        .vt-streak-circle.done { background: var(--tile-blue); }
        .vt-streak-circle.today { box-shadow: 0 0 0 2px var(--tile-blue-deep); }
        .vt-streak-circle.future { background: transparent; border: 1.5px dashed var(--sand-line); }

        .vt-direction-toggle {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
          align-items: center;
          gap: 8px;
          margin-bottom: 18px;
          font-size: 12.5px;
          font-weight: 600;
          line-height: 1.25;
          color: var(--ink-soft);
        }
        .vt-direction-toggle span:first-child { text-align: right; }
        .vt-direction-toggle span:last-child { text-align: left; }
        .vt-direction-toggle span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .vt-direction-toggle span.on { color: var(--tile-blue-deep); }

        .vt-list-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
          border-bottom: 1px solid var(--sand-line);
        }
        .vt-list-item:last-child { border-bottom: none; }
        .vt-list-word { font-weight: 600; font-size: 14.5px; }
        .vt-list-tr { font-size: 13px; color: var(--ink-soft); }
        .vt-list-score {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11.5px;
          color: var(--ink-soft);
        }
        .vt-del-btn {
          background: none;
          border: none;
          color: var(--coral);
          cursor: pointer;
          padding: 4px;
          opacity: 0.6;
        }
        .vt-del-btn:hover { opacity: 1; }

        .vt-empty {
          text-align: center;
          padding: 40px 20px;
          color: var(--ink-soft);
          font-size: 14px;
        }

        .vt-spin { animation: vt-spin-anim 0.8s linear infinite; }
        @keyframes vt-spin-anim { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        .vt-divider-line {
          height: 1px;
          background: var(--sand-line);
          margin: 18px 0 14px;
        }
        .vt-list-item.clickable { cursor: pointer; }
        .vt-list-item.clickable:hover { background: rgba(46,156,107,0.05); }
        .vt-ex-badge {
          display: inline-flex;
          align-items: center;
          margin-left: 6px;
          padding: 1px 7px;
          border-radius: 999px;
          background: var(--tab-active);
          color: var(--tile-blue-deep);
          font-size: 11px;
          font-weight: 600;
          vertical-align: middle;
        }
        .vt-back-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: none;
          border: none;
          color: var(--tile-blue-deep);
          font-family: 'Inter', sans-serif;
          font-weight: 600;
          font-size: 13.5px;
          cursor: pointer;
          padding: 4px 0;
          margin-bottom: 12px;
        }
        .vt-detail-word {
          font-family: 'Fraunces', serif;
          font-weight: 600;
          font-size: 28px;
          line-height: 1.15;
          overflow-wrap: break-word;
        }
        .vt-section-title {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11.5px;
          color: var(--ink-soft);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin: 20px 0 8px;
        }
        .vt-icon-btn {
          background: none;
          border: none;
          color: var(--ink-soft);
          cursor: pointer;
          padding: 4px;
        }
        .vt-icon-btn:hover { color: var(--ink); }
        .vt-examples-panel {
          margin-top: 14px;
          text-align: left;
          background: #FFFFFF;
          border-radius: 8px;
          border: 1.5px solid var(--sand-line);
        }
        .vt-examples-panel .vt-list-item { padding: 10px 12px; }
        .vt-also-in { font-size: 12px; color: var(--ink-soft); margin-top: 3px; }
        .vt-also-link {
          background: none;
          border: none;
          padding: 0;
          font: inherit;
          color: var(--tile-blue-deep);
          text-decoration: underline;
          cursor: pointer;
        }
        .vt-edit-form { display: flex; flex-direction: column; }
        .vt-link-panel {
          padding: 10px 12px 12px;
          background: #FFFFFF;
          border-bottom: 1px solid var(--sand-line);
        }
        .vt-link-option {
          display: block;
          width: 100%;
          text-align: left;
          background: none;
          border: none;
          border-bottom: 1px solid var(--sand-line);
          padding: 9px 4px;
          cursor: pointer;
          font-family: 'Inter', sans-serif;
          color: var(--ink);
        }
        .vt-link-option:last-child { border-bottom: none; }
        .vt-link-option:hover { background: rgba(46,156,107,0.06); }
        .vt-image-preview {
          height: 56px;
          width: 56px;
          object-fit: cover;
          border-radius: 8px;
          border: 1.5px solid var(--sand-line);
        }
      `}</style>

      <div className="vt-header">
        <span className="vt-title">{LANGUAGE.appTitle}</span>
        <span className="vt-count">
          <span>{topLevel.length} words</span>
          {exampleCount > 0 && <span>{exampleCount} examples</span>}
        </span>
      </div>

      <div className="vt-tabs">
        <button className={`vt-tab ${tab === "add" ? "active" : ""}`} onClick={() => setTab("add")}>
          <Plus size={15} /> Add
        </button>
        <button className={`vt-tab ${tab === "text" ? "active" : ""}`} onClick={() => setTab("text")}>
          <Type size={15} /> Text
        </button>
        <button className={`vt-tab ${tab === "quiz" ? "active" : ""}`} onClick={() => setTab("quiz")}>
          <Brain size={15} /> Quiz
        </button>
        <button className={`vt-tab ${tab === "list" ? "active" : ""}`} onClick={() => {
            setTab("list");
            setOpenWordId(null);
          }}>
          <ListIcon size={15} /> Words
        </button>
      </div>

      {tab === "add" && (
        <div className="vt-card">
          <div className="vt-direction-toggle" style={{ marginBottom: 16 }}>
            <span className="on">{addDirection === "tr-ru" ? LANGUAGE.name : NATIVE.name}</span>
            <button
              className="vt-btn vt-btn-ghost"
              style={{ padding: "7px" }}
              onClick={() => {
                setAddDirection((d) => (d === "tr-ru" ? "ru-tr" : "tr-ru"));
                setNewTr("");
                setNewRu("");
                setAddMsg("");
              }}
            >
              <ArrowLeftRight size={15} />
            </button>
            <span>{addDirection === "tr-ru" ? NATIVE.name : LANGUAGE.name}</span>
          </div>

          <div className="vt-row">
            <div>
              <span className="vt-field-label">{addDirection === "tr-ru" ? `${LANGUAGE.name} word` : `${NATIVE.name} word`}</span>
              <input
                className="vt-input"
                value={newTr}
                onChange={(e) => setNewTr(e.target.value)}
                placeholder={addDirection === "tr-ru" ? `e.g. ${LANGUAGE.wordExample}` : `e.g. ${NATIVE.glossExample}`}
              />
            </div>
            <button className="vt-btn vt-btn-ghost vt-btn-block" onClick={handleLookup} disabled={lookupLoading || !newTr.trim()}>
              {lookupLoading ? <Loader2 size={15} className="vt-spin" /> : <Search size={15} />}
              Find translation
            </button>
          </div>
          <div className="vt-row">
            <div>
              <span className="vt-field-label">{addDirection === "tr-ru" ? `${NATIVE.name} translation` : `${LANGUAGE.name} translation`}</span>
              <input
                className="vt-input"
                value={newRu}
                onChange={(e) => setNewRu(e.target.value)}
                placeholder={addDirection === "tr-ru" ? `e.g. ${NATIVE.glossExample}` : `e.g. ${LANGUAGE.wordExample}`}
              />
            </div>
          </div>
          <div className="vt-row">
            <div>
              <span className="vt-field-label">Examples (optional, one per line)</span>
              <textarea
                className="vt-textarea"
                style={{ minHeight: 72 }}
                value={newExamples}
                onChange={(e) => setNewExamples(e.target.value)}
              />
              <div className="vt-also-in">Translation after a dash, or leave it out to translate automatically.</div>
            </div>
          </div>
          <button className="vt-btn vt-btn-primary vt-btn-block" onClick={handleAddWord} disabled={addSaving}>
            {addSaving ? <Loader2 size={15} className="vt-spin" /> : <Plus size={15} />} Save word
          </button>
          {addMsg && <div className="vt-msg">{addMsg}</div>}
        </div>
      )}

      {tab === "text" && (
        <div className="vt-card">
          <span className="vt-field-label">Paste {LANGUAGE.name} text</span>
          <textarea
            className="vt-textarea"
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            placeholder={`Paste a paragraph or a couple of sentences in ${LANGUAGE.name}...`}
          />
          <div style={{ marginTop: 10 }}>
            <button className="vt-btn vt-btn-ghost vt-btn-block" onClick={handleExtract} disabled={!pastedText.trim()}>
              <Sparkles size={15} /> Extract words
            </button>
          </div>

          <div className="vt-divider-line" />

          <span className="vt-field-label">Or upload a photo (sign, menu, book page...)</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            style={{ display: "none" }}
          />
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button className="vt-btn vt-btn-ghost vt-btn-block" onClick={() => fileInputRef.current && fileInputRef.current.click()}>
              <ImageIcon size={15} /> Choose photo
            </button>
            {imagePreview && (
              <>
                <img src={imagePreview} alt="preview" className="vt-image-preview" />
                <button className="vt-del-btn" onClick={clearImage} title="Remove photo">
                  <XCircle size={18} />
                </button>
              </>
            )}
          </div>
          {imagePreview && (
            <div style={{ marginTop: 10 }}>
              <button className="vt-btn vt-btn-primary vt-btn-block" onClick={handleExtractFromImage} disabled={imageLoading}>
                {imageLoading ? <Loader2 size={15} className="vt-spin" /> : <Sparkles size={15} />}
                Extract words from photo
              </button>
            </div>
          )}

          {extracted.length > 0 && (
            <>
              <div className="vt-chips-wrap">
                {extracted.map((item, idx) => (
                  <span
                    key={idx}
                    className={`vt-chip ${item.selected ? "selected" : ""}`}
                    onClick={() => toggleExtracted(idx)}
                  >
                    {item.word}
                  </span>
                ))}
              </div>
              <button className="vt-btn vt-btn-primary vt-btn-block" onClick={handleAddSelected} disabled={batchLoading}>
                {batchLoading ? <Loader2 size={15} className="vt-spin" /> : <Plus size={15} />}
                Add selected & translate
              </button>
            </>
          )}
          {textMsg && <div className="vt-msg">{textMsg}</div>}
        </div>
      )}

      {tab === "quiz" && (
        <div>
          <div className="vt-streak-bar">
            <div className="vt-streak-summary">
              <span className="vt-streak-flame">{streakCount > 0 ? "🔥" : "🕯️"}</span>
              <span>
                <b>{streakCount}</b> day{streakCount === 1 ? "" : "s"} streak
              </span>
              <span className="vt-streak-today">
                {todaySeconds >= STREAK_GOAL_SECONDS
                  ? "Today's goal done!"
                  : `${Math.floor(todaySeconds / 60)}:${String(todaySeconds % 60).padStart(2, "0")} / 10:00 today`}
              </span>
            </div>
            <div className="vt-streak-week">
              {weekDays.map((d, i) => {
                const done = d.seconds >= STREAK_GOAL_SECONDS;
                return (
                  <div className="vt-streak-weekday" key={d.key}>
                    <span className={`vt-streak-weekday-label ${d.isToday ? "today" : ""}`}>{weekdayLabels[i]}</span>
                    <span
                      className={`vt-streak-circle ${done ? "done" : ""} ${d.isToday && !done ? "today" : ""} ${d.isFuture ? "future" : ""}`}
                      title={d.key}
                    >
                      {done && <Check size={13} strokeWidth={3} />}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="vt-direction-toggle">
            <span className="on">{direction === "tr-ru" ? LANGUAGE.name : NATIVE.name}</span>
            <button
              className="vt-btn vt-btn-ghost"
              style={{ padding: "7px" }}
              onClick={() => {
                const next = direction === "tr-ru" ? "ru-tr" : "tr-ru";
                setDirection(next);
                pickNext();
              }}
            >
              <ArrowLeftRight size={15} />
            </button>
            <span>{direction === "tr-ru" ? NATIVE.name : LANGUAGE.name}</span>
          </div>

          {quizWords.length === 0 && (
            <div className="vt-empty">No words yet. Add some in the Add or Text tab.</div>
          )}

          {quizWords.length > 0 && current && (
            <div className="vt-card vt-flashcard">
              <div className="vt-flash-hint">{direction === "tr-ru" ? `translate to ${NATIVE.name}` : `translate to ${LANGUAGE.name}`}</div>
              <div className="vt-flash-word">{direction === "tr-ru" ? current.tr : current.ru}</div>

              <div className="vt-quiz-input-row">
                <input
                  ref={inputRef}
                  className="vt-input"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={handleQuizKey}
                  placeholder="your answer"
                  disabled={!!feedback}
                />
                {!feedback ? (
                  <button className="vt-btn vt-btn-primary" onClick={checkAnswer}>
                    <Check size={15} />
                  </button>
                ) : (
                  <button className="vt-btn vt-btn-primary" onClick={() => pickNext()}>
                    <Shuffle size={15} />
                  </button>
                )}
              </div>

              {feedback && (
                <div className={`vt-feedback ${feedback.correct ? "correct" : "wrong"}`}>
                  {feedback.correct ? <Check size={16} /> : <X size={16} />}
                  {feedback.correct ? "Correct!" : `Correct answer: ${feedback.correctAnswer}`}
                </div>
              )}

              {feedback && (
                <div style={{ marginTop: 10 }}>
                  <button
                    className="vt-btn vt-btn-ghost vt-btn-block"
                    onClick={() => setShowExamples((v) => !v)}
                    disabled={currentExamples.length === 0}
                  >
                    <MessageSquareQuote size={15} />
                    {currentExamples.length === 0
                      ? "No examples yet"
                      : `${showExamples ? "Hide" : "Examples"} (${currentExamples.length})`}
                  </button>
                  {showExamples && currentExamples.length > 0 && (
                    <div className="vt-examples-panel">
                      {currentExamples.map((ex) => (
                        <div className="vt-list-item" key={ex.id}>
                          <div style={{ minWidth: 0 }}>
                            <div className="vt-list-word">{ex.tr}</div>
                            <div className="vt-list-tr">{ex.ru}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {quizWords.length > 0 && (
            <div className="vt-stats-bar">
              <span>Correct: <b>{sessionStats.correct}</b></span>
              <span>Wrong: <b>{sessionStats.wrong}</b></span>
            </div>
          )}
        </div>
      )}

      {tab === "list" && !openWordObj && (
        <div>
          <div className="vt-search-row">
            <Search size={15} className="vt-search-icon" />
            <input
              className="vt-input vt-search-input"
              value={wordSearch}
              onChange={(e) => setWordSearch(e.target.value)}
              placeholder="Search words and examples..."
            />
          </div>
          <div className="vt-card" style={{ padding: "4px" }}>
            {filteredList.length === 0 && (
              <div className="vt-empty">{searchQuery ? "No words match your search." : "Your list is empty."}</div>
            )}
            {filteredList.map((w) => {
              const exCount = words.filter((e) => e.parents.includes(w.id)).length;
              return (
                <div key={w.id}>
                <div className="vt-list-item clickable" onClick={() => openWord(w.id)}>
                  <div style={{ minWidth: 0 }}>
                    <div className="vt-list-word">
                      {w.tr}
                      {exCount > 0 && <span className="vt-ex-badge">{exCount}</span>}
                    </div>
                    <div className="vt-list-tr">{w.ru}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                    <span className="vt-list-score">✓{w.correct} ✗{w.wrong}</span>
                    {exCount === 0 && (
                      <button
                        className="vt-icon-btn"
                        title="Attach to a word as an example"
                        style={linkingId === w.id ? { color: "var(--tile-blue-deep)" } : undefined}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLinking(w.id);
                        }}
                      >
                        <Link2 size={16} />
                      </button>
                    )}
                    <button
                      className="vt-del-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteWord(w.id);
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                    <ChevronRight size={16} color="var(--ink-soft)" />
                  </div>
                </div>
                {linkingId === w.id && renderLinkPanel(w)}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "list" && openWordObj && (
        <div>
          <button
            className="vt-back-btn"
            onClick={() => {
              setOpenWordId(null);
              setLinkingId(null);
            }}
          >
            <ChevronLeft size={16} /> All words
          </button>

          <div className="vt-card">
            {editingId === openWordObj.id ? (
              renderEditForm()
            ) : (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div className="vt-detail-word">{openWordObj.tr}</div>
                  <div style={{ marginTop: 6, fontSize: 15 }}>{openWordObj.ru}</div>
                  <div className="vt-list-score" style={{ marginTop: 8 }}>
                    ✓{openWordObj.correct} ✗{openWordObj.wrong}
                  </div>
                </div>
                <button className="vt-icon-btn" title="Edit" onClick={() => startEdit(openWordObj)} style={{ alignSelf: "flex-start" }}>
                  <Pencil size={17} />
                </button>
              </div>
            )}
          </div>

          <div className="vt-section-title">Examples ({openExamples.length})</div>
          <div className="vt-card" style={{ padding: "4px" }}>
            {openExamples.length === 0 && <div className="vt-empty">No examples yet.</div>}
            {openExamples.map((ex) => {
              const others = ex.parents.filter((p) => p !== openWordObj.id);
              return (
                <div key={ex.id}>
                  <div className="vt-list-item">
                    <div style={{ minWidth: 0 }}>
                      <div className="vt-list-word">{ex.tr}</div>
                      <div className="vt-list-tr">{ex.ru}</div>
                      {others.length > 0 && (
                        <div className="vt-also-in">
                          also in:{" "}
                          {others.map((p, i) => (
                            <span key={p}>
                              {i > 0 && ", "}
                              <button className="vt-also-link" onClick={() => openWord(p)}>
                                {wordName(p)}
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                      <button className="vt-icon-btn" title="Edit" onClick={() => startEdit(ex)}>
                        <Pencil size={15} />
                      </button>
                      <button
                        className="vt-icon-btn"
                        title="Also attach to another word"
                        style={linkingId === ex.id ? { color: "var(--tile-blue-deep)" } : undefined}
                        onClick={() => toggleLinking(ex.id)}
                      >
                        <Link2 size={15} />
                      </button>
                      <button
                        className="vt-icon-btn"
                        title={others.length > 0 ? "Remove from this word" : "Move back to the word list"}
                        onClick={() => unlinkExample(ex.id, openWordObj.id)}
                      >
                        <Unlink size={15} />
                      </button>
                      <button className="vt-del-btn" title="Delete example everywhere" onClick={() => deleteWord(ex.id)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  {linkingId === ex.id && renderLinkPanel(ex)}
                  {editingId === ex.id && <div className="vt-link-panel">{renderEditForm()}</div>}
                </div>
              );
            })}
          </div>

          <div className="vt-section-title">Add example</div>
          <div className="vt-card">
            <div className="vt-row">
              <div>
                <span className="vt-field-label">{LANGUAGE.name} phrase</span>
                <input
                  className="vt-input"
                  value={exTr}
                  onChange={(e) => setExTr(e.target.value)}
                  placeholder={`e.g. ${openWordObj.tr} ...`}
                />
              </div>
              <div>
                <span className="vt-field-label">{NATIVE.name} translation (leave empty to translate automatically)</span>
                <input className="vt-input" value={exRu} onChange={(e) => setExRu(e.target.value)} />
              </div>
            </div>
            <button className="vt-btn vt-btn-primary vt-btn-block" onClick={handleAddExample} disabled={exLoading || !exTr.trim()}>
              {exLoading ? <Loader2 size={15} className="vt-spin" /> : <Plus size={15} />}
              Save example
            </button>
            {exMsg && <div className="vt-msg">{exMsg}</div>}
          </div>

          {suggestions.length > 0 && (
            <>
              <div className="vt-section-title">Phrases in your list with this word ({suggestions.length})</div>
              <div className="vt-card" style={{ padding: "4px" }}>
                {suggestions.map((w) => (
                  <div className="vt-list-item" key={w.id}>
                    <div style={{ minWidth: 0 }}>
                      <div className="vt-list-word">{w.tr}</div>
                      <div className="vt-list-tr">{w.ru}</div>
                      {w.parents.length > 0 && (
                        <div className="vt-also-in">in: {w.parents.map(wordName).join(", ")}</div>
                      )}
                    </div>
                    <button
                      className="vt-btn vt-btn-ghost"
                      style={{ padding: "7px 10px", flexShrink: 0 }}
                      onClick={() => linkExample(w.id, openWordObj.id)}
                    >
                      <Plus size={14} /> {w.parents.length > 0 ? "Add here too" : "Move here"}
                    </button>
                  </div>
                ))}
              </div>
              {suggestions.length > 1 && (
                <button
                  className="vt-btn vt-btn-ghost vt-btn-block"
                  style={{ marginTop: 10 }}
                  onClick={() => suggestions.forEach((w) => linkExample(w.id, openWordObj.id))}
                >
                  Add all {suggestions.length} here
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
