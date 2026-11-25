export const PREDEFINED_NAME_PATTERNS = [
    {
        pattern: String.raw`\\n\<([^<>]+)\>`,
        example: '\\N<Char Name>\nThe text being spoken.',
    },
    {
        pattern: String.raw`^([^\[「]+)\n「`,
        example: 'Char Name\n「The text being spoken.',
    },
    {
        pattern: String.raw`\\nw\[([^\[\]]+)\]`,
        example: '\\nw[Char Name]\nThe text being spoken.',
    },
    {
        pattern: '^([^：]+)：\n',
        example: 'Char Name：\nThe text being spoken.',
    },
    {
        pattern: '^「([^」]+)」\n',
        example: '「Char Name」\nThe text being spoken.',
    },
    {
        pattern: '^【([^【】]+)】\n',
        example: '【Char Name】\nThe text being spoken.',
    },
    {
        pattern: String.raw`\\c\[\d+\]([^\[]+)\\c\[\d+\]\n`,
        example: '\\c[23]Char Name\\c[0]\nThe text being spoken.',
    },
    {
        pattern: String.raw`^([^\n。、.,…？?！!\\\[\]「」]+)\n`,
        example:
            'Char Name\nThe text being spoken. This will probably also capture some non-name text, so clean-up manually afterwards.',
    },
];
