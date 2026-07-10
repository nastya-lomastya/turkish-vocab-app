export type LanguageCode = "tr" | "fr";

export type LanguageConfig = {
  code: LanguageCode;
  name: string; // English name shown in direction toggles, e.g. "Turkish"
  appTitle: string; // header / login title
  adjM: string; // Russian masculine adjective, e.g. "турецкий" (for "текст")
  adjN: string; // Russian neuter adjective, e.g. "турецкое" (for "слово")
  genitive: string; // Russian genitive plural, e.g. "турецких" (for "слов")
  wordExample: string; // example word shown as input placeholder
  wordExampleRu: string; // Russian gloss of wordExample
  verbSuffixRegex: RegExp; // heuristic: does this word look like a verb infinitive?
  extractRegex: RegExp; // charset used to pull words out of pasted text/photos
  verbFormsPrompt: (infinitive: string) => string;
};

const tr: LanguageConfig = {
  code: "tr",
  name: "Turkish",
  appTitle: "Türkçe Kelimeler",
  adjM: "турецкий",
  adjN: "турецкое",
  genitive: "турецких",
  wordExample: "yorgun",
  wordExampleRu: "уставший",
  verbSuffixRegex: /(mek|mak)$/i,
  extractRegex: /[a-zA-ZçÇğĞıİöÖşŞüÜ]+/g,
  verbFormsPrompt: (word) => `Турецкий глагол в инфинитиве: "${word}".
Дай полное спряжение этого глагола по всем 6 лицам (ben/sen/o/biz/siz/onlar) в следующих 4 конструкциях — это самые сложные для запоминания:
1. Geniş zaman (аорист / широкое настоящее)
2. Miş'li geçmiş zaman (прошедшее неопределённое, -miş)
3. Gelecek zaman (будущее время)
4. Şart kipi (условное наклонение)

Итого ровно 24 формы (4 конструкции × 6 лиц). Для каждой формы дай:
- "form" — турецкая спрягаемая форма;
- "label" — краткое русское описание вида "аорист, я" / "аорист, ты" / "аорист, он/она" / "аорист, мы" / "аорист, вы" / "аорист, они" (аналогично для остальных конструкций, используя их русские названия: "прош. -miş", "буд. время", "условное накл.");
- "ru" — правильный перевод именно этой формы на русский язык, в том же лице, БЕЗ местоимения-подлежащего (например, для аориста: "критикую" / "критикуешь" / "критикует" / "критикуем" / "критикуете" / "критикуют"; для условного наклонения используй конструкцию с "если", согласованную по лицу глагола: "если критикую" / "если критикуешь" и т.д.).

Ответь СТРОГО в виде JSON-массива из ровно 24 объектов вида [{"form":"eleştiririm","label":"аорист, я","ru":"критикую"}], без markdown-разметки, без пояснений — только сам JSON-массив.`,
};

const fr: LanguageConfig = {
  code: "fr",
  name: "French",
  appTitle: "Mots Français",
  adjM: "французский",
  adjN: "французское",
  genitive: "французских",
  wordExample: "fatigué",
  wordExampleRu: "уставший",
  // Heuristic only: French infinitives end in -er/-ir/-oir/-re, but plenty of
  // nouns share those endings (e.g. "hiver"), so this is looser than the
  // Turkish -mek/-mak check. Good enough for a personal MVP.
  verbSuffixRegex: /(er|ir|oir|re)$/i,
  extractRegex: /[a-zA-ZàÀâÂäÄçÇéÉèÈêÊëËîÎïÏôÔœŒùÙûÛüÜÿŸæÆ]+/g,
  verbFormsPrompt: (word) => `Французский глагол в инфинитиве: "${word}".
Дай полное спряжение этого глагола по всем 6 лицам (je/tu/il-elle/nous/vous/ils-elles) в следующих 3 временах:
1. Présent (настоящее время)
2. Passé composé (прошедшее время)
3. Futur simple (будущее время)

Итого ровно 18 форм (3 времени × 6 лиц). Для каждой формы дай:
- "form" — французская спрягаемая форма (для passé composé — с правильным вспомогательным глаголом avoir/être и согласованием причастия, например "j'ai mangé", "elle est partie");
- "label" — краткое русское описание вида "наст. время, я" / "наст. время, ты" / "наст. время, он/она" / "наст. время, мы" / "наст. время, вы" / "наст. время, они" (аналогично для прошедшего и будущего);
- "ru" — правильный перевод именно этой формы на русский язык, в том же лице, БЕЗ местоимения-подлежащего (например для настоящего: "ем" / "ешь" / "ест" / "едим" / "едите" / "едят"; для прошедшего и будущего — соответствующая форма глагола).

Ответь СТРОГО в виде JSON-массива из ровно 18 объектов вида [{"form":"je mange","label":"наст. время, я","ru":"ем"}], без markdown-разметки, без пояснений — только сам JSON-массив.`,
};

const LANGUAGES: Record<LanguageCode, LanguageConfig> = { tr, fr };

const code = (process.env.NEXT_PUBLIC_APP_LANGUAGE as LanguageCode) || "tr";

export const LANGUAGE: LanguageConfig = LANGUAGES[code] || tr;
