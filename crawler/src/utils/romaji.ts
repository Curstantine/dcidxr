import Kuroshiro from "kuroshiro-enhance";
import KuromojiAnalyzer from "kuroshiro-analyzer-kuromoji";

const MACRON_TO_DIGRAPH: Record<string, string> = {
	ā: "aa",
	ī: "ii",
	ū: "uu",
	ē: "ei",
	ō: "ou",
};

let kuroshiro: Kuroshiro | undefined;

const CACHE = new Map<string, Promise<string>>();

export async function initRomaji(): Promise<void> {
	if (kuroshiro) return;

	const instance = new Kuroshiro();
	await instance.init(new KuromojiAnalyzer());
	kuroshiro = instance;
}

/**
 * Converts Japanese text to a compact (unspaced) ASCII romaji. Hepburn macrons
 * are mapped to the digraphs people actually type (ō -> ou), so "touhou"
 * matches 東方. Latin-only text is returned unchanged, since its tokens are
 * already in the search vector via the original name.
 */
export async function toRomaji(text: string): Promise<string> {
	if (!Kuroshiro.Util.hasJapanese(text)) return text;
	if (!kuroshiro) throw new Error("initRomaji() must be called before toRomaji()");

	const converted = await kuroshiro.convert(text, {
		to: "romaji",
		mode: "normal",
		romajiSystem: "hepburn",
	});

	return converted.replace(/ー/g, "").replace(/[āīūēō]/g, (ch) => MACRON_TO_DIGRAPH[ch]);
}

/**
 * Memoizes romaji conversions across all circles in a sync run. Track names
 * repeat heavily between releases/circles, so this avoids re-converting them.
 */
export function getRomaji(text: string): Promise<string> {
	let promise = CACHE.get(text);
	if (!promise) CACHE.set(text, (promise = toRomaji(text)));

	return promise;
}

export function clearRomajiCache(): void {
	CACHE.clear();
}
