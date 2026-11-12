import { afterEach, expect, it, vi } from 'vitest';
import { ArcTogakiMessageTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/ArcTogakiMessageTranslator.js';

afterEach(() => vi.unstubAllGlobals());

it('collects external dialog blocks with runtime whitespace and ignores technical directives', () => {
    const translator = new ArcTogakiMessageTranslator();
    const source = '\uFEFFIgnored header\r\n★ピクチャ表示：scene\r\n【通常】\r\nあ！ルーク！ここにいたんですね\r\n\r\n【通常】\r\nあぁ、すまん。\r\n何か用か？\r\n★BGS：停止\r\n★コモンイベント：12\r\n【ト書き】\r\n　Narration // comment\r\n';
    const texts = translator.parseMessages(source);
    expect(texts).toEqual(['あ！ルーク！ここにいたんですね', 'あぁ、すまん。\n何か用か？', '　Narration ']);
    translator._scanEntries = [...texts, texts[0]].map((text) => ({ text }));
    const runtime = {
        getCacheKey: (text, type) => `${type}:${text}`,
        hasUsableCacheValue: (key) => key === `message:${texts[0]}`,
    };
    expect(translator.collectUntranslated({ runtime }).map((item) => item.value)).toEqual(texts.slice(1));
    expect(translator.getCachedCountsSync({ runtime }).total).toBe(3);
});

it('uses configured normal and stage markers', () => {
    expect(new ArcTogakiMessageTranslator().parseMessages('[Normal]\nFirst\n[Stage]\nSecond', {
        'Tag Normal': '[Normal]', 'Tag Stage': '[Stage]',
    })).toEqual(['First', 'Second']);
});
