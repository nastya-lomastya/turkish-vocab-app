"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
} from "lucide-react";

type VerbForm = { form: string; label: string; ru: string };
type Word = {
  id: string;
  tr: string;
  ru: string;
  added: number;
  correct: number;
  wrong: number;
  forms: VerbForm[];
};

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function stripFence(s: string) {
  return s.replace(/```json|```/g, "").trim();
}

function isVerb(trWord: string) {
  return /(mek|mak)$/i.test((trWord || "").trim());
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
  return (json.words || []).map((w: any) => ({
    ...w,
    added: Number(w.added),
    forms: w.forms || [],
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

async function apiUpdateWord(id: string, patch: Partial<Pick<Word, "forms" | "correct" | "wrong">>) {
  const res = await fetch(`/api/words/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (res.status === 401) redirectToLogin();
}

async function apiDeleteWord(id: string) {
  const res = await fetch(`/api/words/${id}`, { method: "DELETE" });
  if (res.status === 401) redirectToLogin();
}

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

async function generateVerbForms(trWord: string): Promise<VerbForm[]> {
  const prompt = `Турецкий глагол в инфинитиве: "${trWord}". Дай ровно 5 распространённых спрягаемых форм этого глагола, которые часто встречаются в живой речи: настоящее длительное время (-yor) я, прошедшее категорическое время я, будущее время я, настоящее-широкое время (aorist) я, повелительное наклонение ты (просто основа глагола). Для каждой формы также дай правильный перевод именно ЭТОЙ формы на русский язык, в том же лице и времени, БЕЗ местоимения (например, для формы "eleştiriyorum" перевод должен быть "критикую", а не "критиковать" и не "я критикую"; для будущего времени — "буду критиковать"). Ответь СТРОГО в виде JSON-массива из ровно 5 объектов вида [{"form":"eleştiriyorum","label":"наст. время, я","ru":"критикую"}], без markdown-разметки и без пояснений.`;
  const raw = await callClaude(prompt);
  const arr = JSON.parse(stripFence(raw));
  return Array.isArray(arr) ? arr : [];
}

export default function VocabTrainer() {
  const [words, setWords] = useState<Word[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("add");

  // Add tab state
  const [addDirection, setAddDirection] = useState<"tr-ru" | "ru-tr">("tr-ru");
  const [newTr, setNewTr] = useState("");
  const [newRu, setNewRu] = useState("");
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
  const [quizForm, setQuizForm] = useState<VerbForm | null>(null);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<{ correct: boolean; correctAnswer: string } | null>(null);
  const [sessionStats, setSessionStats] = useState({ correct: 0, wrong: 0 });
  const [mastered, setMastered] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

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
  }, []);

  const attachVerbForms = useCallback(async (wordId: string, trWord: string) => {
    try {
      const forms = await generateVerbForms(trWord);
      setWords((prev) => prev.map((w) => (w.id === wordId ? { ...w, forms } : w)));
      await apiUpdateWord(wordId, { forms });
    } catch (e) {
      // word just stays without forms
    }
  }, []);

  // ---- add tab ----
  async function handleLookup() {
    if (!newTr.trim()) return;
    setLookupLoading(true);
    try {
      const prompt =
        addDirection === "tr-ru"
          ? `Переведи турецкое слово или короткую фразу "${newTr.trim()}" на русский язык одним словом или короткой формулировкой. Если это глагол, дай инфинитив. Ответь только переводом, без пояснений, кавычек и знаков препинания в конце.`
          : `Переведи русское слово или короткую фразу "${newTr.trim()}" на турецкий язык одним словом или короткой формулировкой. Если это глагол, дай форму инфинитива (на -mak/-mek). Ответь только переводом, без пояснений, кавычек и знаков препинания в конце.`;
      const result = await callClaude(prompt);
      setNewRu(result);
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
    const trWord = addDirection === "tr-ru" ? newTr.trim() : newRu.trim();
    const ruWord = addDirection === "tr-ru" ? newRu.trim() : newTr.trim();
    const exists = words.some((w) => w.tr.toLowerCase() === trWord.toLowerCase());
    if (exists) {
      setAddMsg("This word is already in your list.");
      return;
    }
    const word: Word = {
      id: uid(),
      tr: trWord,
      ru: ruWord,
      added: Date.now(),
      correct: 0,
      wrong: 0,
      forms: [],
    };
    setWords((prev) => [word, ...prev]);
    await apiAddWord(word);
    setNewTr("");
    setNewRu("");
    if (isVerb(trWord)) {
      setAddMsg("Added! Fetching verb forms...");
      attachVerbForms(word.id, trWord).then(() => {
        setAddMsg("Verb forms added!");
        setTimeout(() => setAddMsg(""), 1800);
      });
    } else {
      setAddMsg("Added!");
      setTimeout(() => setAddMsg(""), 1500);
    }
  }

  // ---- text tab ----
  function handleExtract() {
    const found: string[] = pastedText.match(/[a-zA-ZçÇğĞıİöÖşŞüÜ]+/g) || [];
    const seen = new Set<string>();
    const unique: string[] = [];
    found.forEach((w) => {
      const lower = w.toLowerCase();
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
    const already = new Set(words.map((w) => w.tr.toLowerCase()));
    const toAdd = selectedWords.filter((w) => !already.has(w));
    if (toAdd.length === 0) {
      setTextMsg("These words are already in your list.");
      return;
    }
    setBatchLoading(true);
    try {
      const prompt = `Переведи список турецких слов на русский язык. Слова: ${JSON.stringify(
        toAdd
      )}. Ответь СТРОГО в виде JSON-объекта вида {"слово":"перевод"} без markdown-разметки, без пояснений, только сам JSON.`;
      const raw = await callClaude(prompt);
      const map = JSON.parse(stripFence(raw));
      const newWords: Word[] = toAdd.map((w) => ({
        id: uid(),
        tr: w,
        ru: map[w] || "",
        added: Date.now(),
        correct: 0,
        wrong: 0,
        forms: [],
      }));
      setWords((prev) => [...newWords, ...prev]);
      await Promise.all(newWords.map((w) => apiAddWord(w)));
      setExtracted([]);
      setPastedText("");
      const verbCount = newWords.filter((w) => isVerb(w.tr)).length;
      setTextMsg(
        verbCount > 0
          ? `Added ${newWords.length} words (verbs: ${verbCount}, fetching forms...)`
          : `Added ${newWords.length} words`
      );
      newWords.filter((w) => isVerb(w.tr)).forEach((w) => attachVerbForms(w.id, w.tr));
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
        'Найди на этой фотографии турецкий текст и выпиши отдельные турецкие слова из него (в начальной форме где возможно, в нижнем регистре, без повторов, без чисел). Ответь СТРОГО в виде JSON-массива строк, без markdown-разметки и пояснений, например: ["kelime","kitap"]',
        mediaType,
        base64
      );
      const arr = JSON.parse(stripFence(text));
      setExtracted((prev) => {
        const seen = new Set(prev.map((p) => p.word));
        const merged = [...prev];
        arr.forEach((w: string) => {
          const lower = String(w).toLowerCase();
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
  // A word answered correctly steps out of the pool until every other word
  // in the deck has also been answered correctly (then the round resets).
  function pickNext(list: Word[], dir?: "tr-ru" | "ru-tr", masteredOverride?: Set<string>) {
    const useDirection = dir || direction;
    if (list.length === 0) {
      setCurrent(null);
      setQuizForm(null);
      return;
    }
    const activeMastered = masteredOverride !== undefined ? masteredOverride : mastered;
    let pool = list.filter((w) => !activeMastered.has(w.id));
    if (pool.length === 0) {
      if (masteredOverride === undefined) setMastered(new Set());
      pool = list;
    }
    const narrowed = pool.length > 1 && current ? pool.filter((w) => w.id !== current.id) : pool;
    const finalPool = narrowed.length > 0 ? narrowed : pool;
    const pick = finalPool[Math.floor(Math.random() * finalPool.length)];
    setCurrent(pick);
    if (useDirection === "tr-ru" && pick.forms && pick.forms.length > 0 && Math.random() < 0.6) {
      setQuizForm(pick.forms[Math.floor(Math.random() * pick.forms.length)]);
    } else {
      setQuizForm(null);
    }
    setAnswer("");
    setFeedback(null);
    setTimeout(() => inputRef.current && inputRef.current.focus(), 50);
  }

  useEffect(() => {
    if (tab === "quiz" && loaded && !current && words.length > 0) {
      pickNext(words);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, loaded, words.length]);

  async function checkAnswer() {
    if (!current) return;
    const promptAnswer = direction === "tr-ru" ? quizForm?.ru || current.ru : current.tr;
    const variants = promptAnswer
      .split(/[,;/]/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const userAns = answer.trim().toLowerCase();
    const correct = variants.includes(userAns);
    setFeedback({ correct, correctAnswer: promptAnswer });
    setSessionStats((s) => ({ correct: s.correct + (correct ? 1 : 0), wrong: s.wrong + (correct ? 0 : 1) }));
    if (correct) {
      setMastered((prev) => new Set(prev).add(current.id));
    }
    const newCorrect = current.correct + (correct ? 1 : 0);
    const newWrong = current.wrong + (correct ? 0 : 1);
    setWords((prev) => prev.map((w) => (w.id === current.id ? { ...w, correct: newCorrect, wrong: newWrong } : w)));
    await apiUpdateWord(current.id, { correct: newCorrect, wrong: newWrong });
  }

  function handleQuizKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      if (feedback) {
        pickNext(words);
      } else {
        checkAnswer();
      }
    }
  }

  async function deleteWord(id: string) {
    setWords((prev) => prev.filter((w) => w.id !== id));
    await apiDeleteWord(id);
  }

  const sortedList = [...words].sort((a, b) => b.added - a.added);

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
          align-items: baseline;
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
        .vt-flash-formlabel {
          display: inline-block;
          margin-top: 4px;
          padding: 3px 10px;
          border-radius: 999px;
          background: rgba(46,156,107,0.16);
          color: var(--turquoise);
          font-size: 11.5px;
          font-weight: 600;
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
        .vt-verb-badge {
          display: inline-block;
          margin-left: 8px;
          padding: 1px 8px;
          border-radius: 999px;
          background: rgba(46,156,107,0.12);
          color: var(--tile-blue-deep);
          font-family: 'JetBrains Mono', monospace;
          font-size: 10.5px;
          font-weight: 600;
        }
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
        .vt-image-preview {
          height: 56px;
          width: 56px;
          object-fit: cover;
          border-radius: 8px;
          border: 1.5px solid var(--sand-line);
        }
      `}</style>

      <div className="vt-header">
        <span className="vt-title">Türkçe Kelimeler</span>
        <span className="vt-count">{words.length} words</span>
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
        <button className={`vt-tab ${tab === "list" ? "active" : ""}`} onClick={() => setTab("list")}>
          <ListIcon size={15} /> Words
        </button>
      </div>

      {tab === "add" && (
        <div className="vt-card">
          <div className="vt-direction-toggle" style={{ marginBottom: 16 }}>
            <span className="on">{addDirection === "tr-ru" ? "Turkish" : "Russian"}</span>
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
            <span>{addDirection === "tr-ru" ? "Russian" : "Turkish"}</span>
          </div>

          <div className="vt-row">
            <div>
              <span className="vt-field-label">{addDirection === "tr-ru" ? "Turkish word" : "Russian word"}</span>
              <input
                className="vt-input"
                value={newTr}
                onChange={(e) => setNewTr(e.target.value)}
                placeholder={addDirection === "tr-ru" ? "e.g. yorgun" : "e.g. tired"}
              />
            </div>
            <button className="vt-btn vt-btn-ghost vt-btn-block" onClick={handleLookup} disabled={lookupLoading || !newTr.trim()}>
              {lookupLoading ? <Loader2 size={15} className="vt-spin" /> : <Search size={15} />}
              Find translation
            </button>
          </div>
          <div className="vt-row">
            <div>
              <span className="vt-field-label">{addDirection === "tr-ru" ? "Russian translation" : "Turkish translation"}</span>
              <input
                className="vt-input"
                value={newRu}
                onChange={(e) => setNewRu(e.target.value)}
                placeholder={addDirection === "tr-ru" ? "e.g. tired" : "e.g. yorgun"}
              />
            </div>
          </div>
          <button className="vt-btn vt-btn-primary vt-btn-block" onClick={handleAddWord}>
            <Plus size={15} /> Save word
          </button>
          {addMsg && <div className="vt-msg">{addMsg}</div>}
        </div>
      )}

      {tab === "text" && (
        <div className="vt-card">
          <span className="vt-field-label">Paste Turkish text</span>
          <textarea
            className="vt-textarea"
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            placeholder="Paste a paragraph or a couple of sentences in Turkish..."
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
          <div className="vt-direction-toggle">
            <span className="on">{direction === "tr-ru" ? "Turkish" : "Russian"}</span>
            <button
              className="vt-btn vt-btn-ghost"
              style={{ padding: "7px" }}
              onClick={() => {
                const next = direction === "tr-ru" ? "ru-tr" : "tr-ru";
                setDirection(next);
                setMastered(new Set());
                pickNext(words, next, new Set());
              }}
            >
              <ArrowLeftRight size={15} />
            </button>
            <span>{direction === "tr-ru" ? "Russian" : "Turkish"}</span>
          </div>

          {words.length === 0 && (
            <div className="vt-empty">No words yet. Add some in the Add or Text tab.</div>
          )}

          {words.length > 0 && current && (
            <div className="vt-card vt-flashcard">
              <div className="vt-flash-hint">{direction === "tr-ru" ? "translate to Russian" : "translate to Turkish"}</div>
              <div className="vt-flash-word">{quizForm ? quizForm.form : direction === "tr-ru" ? current.tr : current.ru}</div>
              {quizForm && <div className="vt-flash-formlabel">{quizForm.label}</div>}

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
                  <button className="vt-btn vt-btn-primary" onClick={() => pickNext(words)}>
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
            </div>
          )}

          {words.length > 0 && (
            <div className="vt-stats-bar">
              <span>Correct: <b>{sessionStats.correct}</b></span>
              <span>Wrong: <b>{sessionStats.wrong}</b></span>
            </div>
          )}
        </div>
      )}

      {tab === "list" && (
        <div className="vt-card" style={{ padding: "4px" }}>
          {sortedList.length === 0 && <div className="vt-empty">Your list is empty.</div>}
          {sortedList.map((w) => (
            <div className="vt-list-item" key={w.id}>
              <div style={{ minWidth: 0 }}>
                <div className="vt-list-word">{w.tr}</div>
                <div className="vt-list-tr">
                  {w.ru}
                  {w.forms && w.forms.length > 0 && (
                    <span className="vt-verb-badge" title={w.forms.map((f) => f.form).join(", ")}>
                      verb · {w.forms.length} forms
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                <span className="vt-list-score">✓{w.correct} ✗{w.wrong}</span>
                <button className="vt-del-btn" onClick={() => deleteWord(w.id)}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
