import { BasePluginTranslator } from '../BasePluginTranslator.js';

/*
 * BattleFormation.js translator.
 *
 * Supported versions:
 * - BattleFormation.js ver1.04 (MV)
 *
 * Translation notes:
 * - Static UI text is sourced from plugin parameters.
 * - Additional formation-effect text is sourced from class note tags:
 *   <陣形効果テキスト追加:前:...>, <陣形効果テキスト追加:後:...>,
 *   <AddFormationEffectText:F:...>, <AddFormationEffectText:L:...>
 * - Runtime hooks use global boot-safe points (`Window_Base` draw methods and
 *   `Game_Message.add`) because BattleFormation scene/window constructors are
 *   plugin-local to an IIFE and not exposed as globals.
 */

const PLUGIN_NAME = 'BattleFormation';
const CACHE_TYPE = 'plugin_battle_formation';
const WINDOW_BASE_HOOK_MARKER = '__CHEAT_BATTLE_FORMATION_WINDOW_BASE_HOOKED__';
const MESSAGE_HOOK_MARKER = '__CHEAT_BATTLE_FORMATION_MESSAGE_HOOKED__';
const FORMATION_STATUS_HOOK_MARKER = '__CHEAT_BATTLE_FORMATION_STATUS_HOOKED__';

const PARAM_TEXT_KEYS = [
	'BasicFormationText',
	'BasicFormationHelp',
	'MenuBattleFormationTitle',
	'AddSkillText',
	'MasterText',
	'LevelUpText',
	'MasterFormText',
	'ActiveHelpText',
	'DeactiveHelpText',
];

const PARAM_SPLIT_KEYS = [
	'ParamText1',
	'ParamText2',
	'ParamText3',
	'ParamText4',
	'ParamText5',
	'ParamText6',
	'ParamText7',
	'DefeatText',
];

const CLASS_EFFECT_TAG_REGEX =
	/<(?:陣形効果テキスト追加|AddFormationEffectText)\s*:(.*?)>/i;

function splitByCommaPreserveSpacing(value) {
	return String(value || '').split(',');
}

function extractFormationEffectTextFromLine(line) {
	const match = CLASS_EFFECT_TAG_REGEX.exec(String(line || ''));
	if (!match) {
		return '';
	}

	const body = String(match[1] || '');
	const separatorMatch = /[:：]/.exec(body);
	if (!separatorMatch || typeof separatorMatch.index !== 'number') {
		return '';
	}

	let text = body.slice(separatorMatch.index + 1);
	text = text.replace(/^Lv\d+[:：]/i, '');
	return text;
}

function stripLeadingMessageControlCodes(text) {
	const source = String(text || '');
	const controlPrefixMatch = /^(?:\\\.|\\!|\\>|\\<|\\\^)+/.exec(source);
	if (!controlPrefixMatch) {
		return { prefix: '', body: source };
	}

	const prefix = controlPrefixMatch[0];
	return {
		prefix,
		body: source.slice(prefix.length),
	};
}

function getOriginalItemNote(item) {
	if (!item || typeof item !== 'object') {
		return '';
	}

	const originalMap =
		item._translateOriginal && typeof item._translateOriginal === 'object'
			? item._translateOriginal
			: null;

	if (originalMap && typeof originalMap.note === 'string' && originalMap.note.trim() !== '') {
		return originalMap.note;
	}

	return typeof item.note === 'string' && item.note.trim() !== '' ? item.note : '';
}

export class BattleFormationTranslator extends BasePluginTranslator {
	constructor() {
		super();
		this._scanPrepared = false;
		this._scanEntries = [];
		this._scanPromise = null;
		this._knownSourceTexts = new Set();
		this._knownSubstitutionTokens = [];
		this._nameTemplateEntries = [];
	}

	getPluginName() {
		return PLUGIN_NAME;
	}

	getPluginLabel() {
		return 'Battle Formation';
	}

	getCacheType() {
		return CACHE_TYPE;
	}

	async precomputeCounts() {
		if (!this.ensureDetection()) {
			return;
		}

		if (this._scanPrepared) {
			return;
		}

		if (this._scanPromise) {
			return this._scanPromise;
		}

		this._scanPromise = Promise.resolve(this.buildScanEntries())
			.then((entries) => {
				this._scanEntries = Array.isArray(entries) ? entries : [];
				this._scanPrepared = true;
				this._refreshKnownRuntimeTextCaches();
			})
			.catch((error) => {
				console.warn('[BattleFormationTranslator] Scan failed', error);
			})
			.finally(() => {
				this._scanPromise = null;
			});

		return this._scanPromise;
	}

	buildScanEntries() {
		const entries = [];

		for (const source of this._resolveParameterSources()) {
			this._collectParameterEntries(source.scope, source.parameters, entries);
		}

		this._collectClassNoteEntries(entries);

		entries.push({
			text: 'Next',
			source: {
				scope: 'pluginLiteral',
				field: 'nextLabel',
			},
		});

		return entries;
	}

	collectUntranslated({ runtime }) {
		if (!runtime) {
			return [];
		}

		const items = this._buildUniquePendingItems(runtime);
		return items.filter((item) => !runtime.hasUsableCacheValue(item.cacheKey));
	}

	getCachedCountsSync({ runtime }) {
		if (!runtime) {
			return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
		}

		const items = this._buildUniquePendingItems(runtime);
		const totalStrings = items.length;
		const leftStrings = items.filter(
			(item) => !runtime.hasUsableCacheValue(item.cacheKey)
		).length;

		return {
			total: totalStrings,
			left: leftStrings,
			totalStrings,
			leftStrings,
		};
	}

	enablePluginTranslation() {
		if (
			!window.Window_Base?.prototype ||
			typeof window.Window_Base.prototype.drawText !== 'function' ||
			typeof window.Window_Base.prototype.drawTextEx !== 'function' ||
			!window.DataManager ||
			typeof window.DataManager.formationStatus !== 'function' ||
			!window.Game_Message?.prototype ||
			typeof window.Game_Message.prototype.add !== 'function'
		) {
			return false;
		}

		this._ensureScanEntriesPreparedForRuntime();

		this._installWindowDrawHooks();
		this._installMessageHook();
		this._installFormationStatusHook();

		return true;
	}

	_resolveParameterSources() {
		const sources = [];
		const pluginEntry = this.findPluginEntry(this.getPluginName());
		if (pluginEntry?.parameters && typeof pluginEntry.parameters === 'object') {
			sources.push({
				scope: 'pluginEntryParameter',
				parameters: pluginEntry.parameters,
			});
		}

		if (typeof window.PluginManager?.parameters === 'function') {
			const runtimeParameters = window.PluginManager.parameters(this.getPluginName());
			if (runtimeParameters && typeof runtimeParameters === 'object') {
				sources.push({
					scope: 'runtimePluginManagerParameter',
					parameters: runtimeParameters,
				});
			}
		}

		return sources;
	}

	_collectParameterEntries(scope, parameters, output) {
		if (!parameters || typeof parameters !== 'object' || !Array.isArray(output)) {
			return;
		}

		for (const key of PARAM_TEXT_KEYS) {
			const value = parameters[key];
			if (typeof value !== 'string' || !this.isUsableText(value)) {
				continue;
			}

			output.push({
				text: value,
				source: {
					scope,
					field: key,
				},
			});
		}

		for (const key of PARAM_SPLIT_KEYS) {
			const value = parameters[key];
			if (typeof value !== 'string' || !this.isUsableText(value)) {
				continue;
			}

			const parts = splitByCommaPreserveSpacing(value);
			for (let index = 0; index < parts.length; index++) {
				const part = parts[index];
				if (!this.isUsableText(part)) {
					continue;
				}

				output.push({
					text: part,
					source: {
						scope,
						field: key,
						index,
					},
				});
			}
		}
	}

	_collectClassNoteEntries(output) {
		const classes = Array.isArray($dataClasses) ? $dataClasses : [];
		for (let classId = 1; classId < classes.length; classId++) {
			const dataClass = classes[classId];
			const note = typeof dataClass?.note === 'string' ? dataClass.note : '';
			if (!note) {
				continue;
			}

			const lines = note.split(/\r?\n/);
			for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
				const text = extractFormationEffectTextFromLine(lines[lineIndex]);
				if (!this.isUsableText(text)) {
					continue;
				}

				output.push({
					text,
					source: {
						scope: 'classNote',
						classId,
						lineIndex,
					},
				});
			}
		}
	}

	_buildUniquePendingItems(runtime) {
		if (!this._scanPrepared) {
			this._scanEntries = this.buildScanEntries();
			this._scanPrepared = true;
			this._refreshKnownRuntimeTextCaches();
		}

		const byCacheKey = new Map();

		for (const entry of this._scanEntries) {
			const text = typeof entry?.text === 'string' ? entry.text : '';
			if (!this.isUsableText(text)) {
				continue;
			}

			const cacheKey = runtime.getCacheKey(text, this.getCacheType());
			if (byCacheKey.has(cacheKey)) {
				continue;
			}

			byCacheKey.set(cacheKey, {
				type: this.getCacheType(),
				id: `plugin_battle_formation_${byCacheKey.size}`,
				value: text,
				cacheKey,
			});
		}

		return Array.from(byCacheKey.values());
	}

	_ensureScanEntriesPreparedForRuntime() {
		if (this._scanPrepared) {
			return;
		}

		this._scanEntries = this.buildScanEntries();
		this._scanPrepared = true;
		this._refreshKnownRuntimeTextCaches();
	}

	_refreshKnownRuntimeTextCaches() {
		const known = new Set();
		const templates = [];

		for (const entry of this._scanEntries) {
			const text = typeof entry?.text === 'string' ? entry.text : '';
			if (!this.isUsableText(text)) {
				continue;
			}

			known.add(text);

			if (!text.includes('_name')) {
				continue;
			}

			const splitIndex = text.indexOf('_name');
			templates.push({
				template: text,
				prefix: text.slice(0, splitIndex),
				suffix: text.slice(splitIndex + '_name'.length),
			});
		}

		this._knownSourceTexts = known;
		this._knownSubstitutionTokens = Array.from(known)
			.filter((text) => text.length >= 2)
			.sort((a, b) => b.length - a.length);
		this._nameTemplateEntries = templates;
	}

	_isBattleFormationUiSceneActive() {
		const scene = window.SceneManager?._scene;
		if (!scene || typeof scene !== 'object') {
			return false;
		}

		const sceneName =
			typeof scene.constructor?.name === 'string' ? scene.constructor.name : '';
		return sceneName === 'Scene_BattleFormation' || sceneName === 'Scene_Menu';
	}

	_installWindowDrawHooks() {
		const windowBaseProto = window.Window_Base.prototype;
		if (windowBaseProto[WINDOW_BASE_HOOK_MARKER]) {
			return;
		}

		const getRuntime = this.getRuntime.bind(this);
		const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
		const translateText = this._translateBattleFormationText.bind(this);
		const isBattleFormationUiSceneActive = this._isBattleFormationUiSceneActive.bind(this);

		const originalDrawText = windowBaseProto.drawText;
		windowBaseProto.drawText = function (text) {
			const runtime = getRuntime();
			if (!runtime || !isRuntimeTranslationActive(runtime) || !isBattleFormationUiSceneActive()) {
				return originalDrawText.apply(this, arguments);
			}

			const nextArguments = Array.from(arguments);
			nextArguments[0] = translateText(text, runtime);
			return originalDrawText.apply(this, nextArguments);
		};

		const originalDrawTextEx = windowBaseProto.drawTextEx;
		windowBaseProto.drawTextEx = function (text) {
			const runtime = getRuntime();
			if (!runtime || !isRuntimeTranslationActive(runtime) || !isBattleFormationUiSceneActive()) {
				return originalDrawTextEx.apply(this, arguments);
			}

			const nextArguments = Array.from(arguments);
			nextArguments[0] = translateText(text, runtime);
			return originalDrawTextEx.apply(this, nextArguments);
		};

		Object.defineProperty(windowBaseProto, WINDOW_BASE_HOOK_MARKER, {
			value: true,
			configurable: true,
			enumerable: false,
			writable: false,
		});
	}

	_installMessageHook() {
		const gameMessageProto = window.Game_Message.prototype;
		if (gameMessageProto[MESSAGE_HOOK_MARKER]) {
			return;
		}

		const getRuntime = this.getRuntime.bind(this);
		const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
		const translateText = this._translateBattleFormationText.bind(this);

		const originalAdd = gameMessageProto.add;
		gameMessageProto.add = function (text) {
			const runtime = getRuntime();
			if (!runtime || !isRuntimeTranslationActive(runtime)) {
				return originalAdd.call(this, text);
			}

			return originalAdd.call(this, translateText(text, runtime));
		};

		Object.defineProperty(gameMessageProto, MESSAGE_HOOK_MARKER, {
			value: true,
			configurable: true,
			enumerable: false,
			writable: false,
		});
	}

	_installFormationStatusHook() {
		const dataManager = window.DataManager;
		if (dataManager[FORMATION_STATUS_HOOK_MARKER]) {
			return;
		}

		const originalFormationStatus = dataManager.formationStatus;
		const isUsableText = this.isUsableText.bind(this);

		dataManager.formationStatus = function (item) {
			if (!item || typeof item !== 'object') {
				return originalFormationStatus.call(this, item);
			}

			const originalNote = getOriginalItemNote(item);
			const currentNote = typeof item.note === 'string' ? item.note : '';
			if (!isUsableText(originalNote) || originalNote === currentNote) {
				return originalFormationStatus.call(this, item);
			}

			item.note = originalNote;
			delete item._formationStatus;

			try {
				return originalFormationStatus.call(this, item);
			} finally {
				item.note = currentNote;
			}
		};

		if (Array.isArray(window.$dataItems)) {
			for (let i = 1; i < $dataItems.length; i++) {
				const item = $dataItems[i];
				if (item && typeof item === 'object') {
					delete item._formationStatus;
				}
			}
		}

		Object.defineProperty(dataManager, FORMATION_STATUS_HOOK_MARKER, {
			value: true,
			configurable: true,
			enumerable: false,
			writable: false,
		});
	}

	_translateBattleFormationText(text, runtime) {
		if (!this.isUsableText(text)) {
			return text;
		}

		const rawText = String(text);
		const parts = stripLeadingMessageControlCodes(rawText);
		let translatedBody = this._translateTextBody(parts.body, runtime);

		if (translatedBody === parts.body) {
			translatedBody = this._translateNameTemplateBody(parts.body, runtime);
		}

		if (translatedBody === parts.body) {
			return text;
		}

		return `${parts.prefix}${translatedBody}`;
	}

	_translateTextBody(text, runtime) {
		let result = text;

		if (this._knownSourceTexts.has(result)) {
			result = this.resolveRuntimeTranslation(result, runtime, this.getCacheType(), {
				requireRuntimeTranslationActive: true,
				missValue: result,
			});
		}

		for (const token of this._knownSubstitutionTokens) {
			if (!result.includes(token)) {
				continue;
			}

			const translatedToken = this.resolveRuntimeTranslation(
				token,
				runtime,
				this.getCacheType(),
				{
					requireRuntimeTranslationActive: true,
					missValue: token,
				}
			);

			if (!this.isUsableText(translatedToken) || translatedToken === token) {
				continue;
			}

			result = result.split(token).join(translatedToken);
		}

		return result;
	}

	_translateNameTemplateBody(text, runtime) {
		for (const entry of this._nameTemplateEntries) {
			if (!text.startsWith(entry.prefix) || !text.endsWith(entry.suffix)) {
				continue;
			}

			const middleStart = entry.prefix.length;
			const middleEnd = text.length - entry.suffix.length;
			if (middleEnd < middleStart) {
				continue;
			}

			const dynamicName = text.slice(middleStart, middleEnd);
			if (!this.isUsableText(dynamicName)) {
				continue;
			}

			const translatedTemplate = this.resolveRuntimeTranslation(
				entry.template,
				runtime,
				this.getCacheType(),
				{
					requireRuntimeTranslationActive: true,
					missValue: entry.template,
				}
			);

			if (!this.isUsableText(translatedTemplate) || translatedTemplate === entry.template) {
				continue;
			}

			if (!translatedTemplate.includes('_name')) {
				return translatedTemplate;
			}

			return translatedTemplate.replace('_name', dynamicName);
		}

		return text;
	}
}
