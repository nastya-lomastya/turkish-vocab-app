export type LanguageCode = "tr" | "fr";

export type LanguageConfig = {
  code: LanguageCode;
  name: string; // English name shown in direction toggles, e.g. "Turkish"
  appTitle: string; // header / login title
  adjM: string; // Russian masculine adjective, e.g. "турецкий" (for "текст")
  adjN: string; // Russian neuter adjective, e.g. "турецкое" (for "слово")
  genitive: string; // Russian genitive plural, e.g. "турецких" (for "слов")
  wordExample: string; // example word shown as input placeholder
  extractRegex: RegExp; // charset used to pull words out of pasted text/photos
};

const tr: LanguageConfig = {
  code: "tr",
  name: "Turkish",
  appTitle: "Türkçe Kelimeler",
  adjM: "турецкий",
  adjN: "турецкое",
  genitive: "турецких",
  wordExample: "yorgun",
  extractRegex: /[a-zA-ZçÇğĞıİöÖşŞüÜ]+/g,
};

const fr: LanguageConfig = {
  code: "fr",
  name: "French",
  appTitle: "Mots Français",
  adjM: "французский",
  adjN: "французское",
  genitive: "французских",
  wordExample: "fatigué",
  extractRegex: /[a-zA-ZàÀâÂäÄçÇéÉèÈêÊëËîÎïÏôÔœŒùÙûÛüÜÿŸæÆ]+/g,
};

const LANGUAGES: Record<LanguageCode, LanguageConfig> = { tr, fr };

const code = (process.env.NEXT_PUBLIC_APP_LANGUAGE as LanguageCode) || "tr";

export const LANGUAGE: LanguageConfig = LANGUAGES[code] || tr;

// ---- native / gloss language (the language everything gets translated INTO) ----

export type NativeCode = "ru" | "en";

export type NativeConfig = {
  code: NativeCode;
  name: string; // shown in UI, e.g. "Russian" / "English"
  adjM: string; // Russian masculine adjective for use inside Claude instructions
  adjN: string; // Russian neuter adjective for use inside Claude instructions
  // Script used to safety-net which typed field is which at save time (see
  // handleAddWord). Only reliable when this language's script doesn't
  // overlap with the foreign language's Latin alphabet — Russian's Cyrillic
  // qualifies, English doesn't (falls back to trusting the direction toggle).
  scriptRegex?: RegExp;
  transcriptionInstruction: string; // how Claude should write pronunciation
  glossExample: string; // example gloss word shown as input placeholder
};

const ru: NativeConfig = {
  code: "ru",
  name: "Russian",
  adjM: "русский",
  adjN: "русское",
  scriptRegex: /[а-яёА-ЯЁ]/,
  transcriptionInstruction:
    "кириллицей — как оно реально произносится, обычными русскими буквами, без специальных фонетических символов",
  glossExample: "уставший",
};

const en: NativeConfig = {
  code: "en",
  name: "English",
  adjM: "английский",
  adjN: "английское",
  transcriptionInstruction:
    'латиницей, английской фонетической транслитерацией (readable respelling, например "boo-koo"), без специальных символов IPA',
  glossExample: "tired",
};

const NATIVES: Record<NativeCode, NativeConfig> = { ru, en };

const nativeCode = (process.env.NEXT_PUBLIC_NATIVE_LANGUAGE as NativeCode) || "ru";

export const NATIVE: NativeConfig = NATIVES[nativeCode] || ru;
