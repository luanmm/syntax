/**
 * Generic tokenizer used by the parser in the Syntax tool.
 *
 * https://www.npmjs.com/package/syntax-cli
 *
 * See `--custom-tokinzer` to skip this generation, and use a custom one.
 */

/**
 * Token class: encapsulates token type, and the matched value.
 */
class Token {

    constructor(
        public type: number,
        public value: string,
        public startOffset = 0,
        public endOffset = 0,
        public startLine = 0,
        public endLine = 0,
        public startColumn = 0,
        public endColumn = 0
    ) { }
}

/**
 * Tokens map.
 *
 * Maps a string name of a token type to its encoded number (the first
 * token number starts after all numbers for non-terminal).
 *
 * Example (assuming non-terminals reserved numbers 0-4, so token
 * numbers start from 5):
 *
 * const tokensMap = {
 *   "+": 5,
 *   "*": 6,
 *   "NUMBER": 7,
 *   [EOF]: 8,
 *   ...
 * };
 *
 * This map is written by the parser generator, which replaces the TOKENS
 * placeholder.
 */
const tokensMap: { [key: string]: number } = {{{TOKENS}}};

/**
 * Special "end of file" token.
 */
const EOF_TOKEN = new Token(Number(tokensMap[EOF]), '');

/**
 * The `yytext` global variable stores the actual matched text for a token.
 * Here we made it an actual module-level global variable which can be accessed
 * from any place in the tokenizer, and yyparse, however, you may choose to
 * store it e.g. as a class property on `yyparse.yytext`.
 */
let yytext = '';

/**
 * The length of the `yytext`.
 */
let yyleng = 0;

// --------------------------------------------------------------

/**
 * Lex rules.
 *
 * The lexical rules are used for actual tokenization of a string. The format
 * we choose here is an "array of arrays", where each element array contains
 * a regexp, and its corresponding handler.
 *
 * Example:
 *
 * const lexRules = [
 *   ["^\s+", "_lexRule1"],
 *   ["^\d+", "_lexRule2"],
 *   ...
 * ];
 *
 * The parser generator replaces LEX_RULES placeholder with actual data
 * received from Syntax tool.
 */
const lexRules: [RegExp, string][] = {{{LEX_RULES}}};

// --------------------------------------------------------------

/**
 * Lexical rules grouped by start condition.
 *
 * If your tokenizer needs to support starting states, it should implement
 * this map of the start conditions to the list of rule indices in the
 * `lexRules` array.
 *
 * Example:
 *
 * const lexRulesByConditions = {
 *   "INITIAL": [0,5,6,7],
 *   "comment": [1,2,3,4,6],
 *   ...
 * };
 *
 * The parser generator replaces LEX_RULES_BY_START_CONDITIONS placeholder
 * with actual data received from Syntax tool.
 *
 */
const lexRulesByConditions: { [key: string]: number[] } = {{{LEX_RULES_BY_START_CONDITIONS}}};

// --------------------------------------------------------------

/**
 * Regexp-based tokenizer. Applies lexical rules in order, until gets
 * a match; otherwise, throws the "Unexpected token" exception.
 *
 * Tokenizer should implement at least the following API:
 *
 * - getNextToken(): Token
 * - hasMoreTokens(): boolean
 * - isEOF(): boolean
 *
 * For state-based tokenizer, also:
 *
 * - getCurrentState(): number
 * - pushState(string stateName): void
 * - popState(): void
 * - begin(string stateName): void - alias for pushState
 */
class Tokenizer {

    /**
     * Tokenizing string.
     */
    private _string: string;

    /**
     * Stack of lexer states.
     */
    private _states: string[] = null;

    /**
     *  Cursor tracking current position.
     */
    private _cursor = 0;

    /**
     * Line-based location tracking.
     */
    private _currentLine: number;
    private _currentColumn: number;
    private _currentLineBeginOffset: number;

    /**
     * Location data of a matched token.
     */
    private _tokenStartOffset: number;
    private _tokenEndOffset: number;
    private _tokenStartLine: number;
    private _tokenEndLine: number;
    private _tokenStartColumn: number;
    private _tokenEndColumn: number;

    /**
     * In case if a token handler returns multiple tokens from one rule,
     * we still return tokens one by one in the `getNextToken`, putting
     * other "fake" tokens into the queue. If there is still something in
     * this queue, it's just returned.
     */
    private _tokensQueue: string[] = null;

    initString(tokenizingString: string): void {
        /**
         * A tokenizing string.
         */
        this._string = tokenizingString;
    
        /**
         * Stack of the tokenizer states. Initialized to the `INITIAL` state.
         */
        this._states = ['INITIAL'];
    
        /**
         *  Cursor tracking current position.
         */
        this._cursor = 0;
    
        /**
         * In case if a token handler returns multiple tokens from one rule,
         * we still return tokens one by one in the `getNextToken`, putting
         * other "fake" tokens into the queue. If there is still something in
         * this queue, it's just returned.
         */
        this._tokensQueue = [];
    
        /**
         * Current line number.
         */
        this._currentLine = 1;
    
        /**
         * Current column number.
         */
        this._currentColumn = 0;
    
        /**
         * Current offset of the beginning of the current line.
         *
         * Since new lines can be handled by the lex rules themselves,
         * we scan an extracted token for `\n`s, and calculate start/end
         * locations of tokens based on the `currentLine`/`currentLineBeginOffset`.
         */
        this._currentLineBeginOffset = 0;
    
        /**
         * Matched token location data.
         */
        this._tokenStartOffset = 0;
        this._tokenEndOffset = 0;
        this._tokenStartLine = 1;
        this._tokenEndLine = 1;
        this._tokenStartColumn = 0;
        this._tokenEndColumn = 0;
    }

    /**
     * Lex rule handlers.
     *
     * Example:
     *
     * public string _lexRule1()
     * {
     *     // skip whitespace
     *     return null;
     * }
     *
     * public string _lexRule2()
     * {
     *     return "NUMBER";
     * }
     */
    {{{LEX_RULE_HANDLERS}}}

    // --------------------------------------------
    // Tokenizing.

    getNextToken(): Token {
        // Something was queued, return it.
        if (this._tokensQueue.length > 0) {
            return this._toToken(this._tokensQueue.shift());
        }

        if (!this.hasMoreTokens()) {
            return EOF_TOKEN;
        }

        // Get the rest of the string which is not analyzed yet.
        const string = this._string.slice(this._cursor);

        // This tokenizer supports states, so get the lexical rules
        // for the current state.
        const lexRulesForState = lexRulesByConditions[this.getCurrentState()];

        for (let i = 0; i < lexRulesForState.length; i++) {

            // Get the actual lexical rule.
            const lexRuleIndex = lexRulesForState[i];
            const lexRule = lexRules[lexRuleIndex];

            const matched = this._match(string, lexRule[0]);

            // Manual handling of EOF token (the end of string). Return it
            // as `EOF` symbol.
            if (string === '' && matched === '') {
                this._cursor++;
            }

            if (matched !== null) {
                // Update global vars (they can be modified by the rule handler).
                yytext = matched;
                yyleng = matched.length;

                // Call the handler, the `lexRule[1]` contains handler name.
                // Use any reflection method in your language to get an actual method.
                // In JavaScript it's done by `this[lexRule[1]]` to get the method.

                const tokenHandler = this[lexRule[1]];
                let tokenType = tokenHandler.call(this);

                // A handler may return `null` (e.g. skip whitespace not returning
                // any token. Continue in this case.
                if (!tokenType) {
                    return this.getNextToken();
                }

                // If multiple tokens are returned, save them to return
                // on next `getNextToken` call.

                if (Array.isArray(tokenType)) {
                    const tokensToQueue = tokenType.slice(1);
                    tokenType = tokenType[0];
                    if (tokensToQueue.length > 0) {
                        this._tokensQueue.unshift(...tokensToQueue);
                    }
                }

                // Finally return an actual matched token.
                return this._toToken(tokenType, matched);
            }
        }

        if (this.isEOF()) {
            this._cursor++;
            return EOF_TOKEN;
        }

        this.throwUnexpectedToken(
            string[0],
            this._currentLine,
            this._currentColumn
        );

        return null;
    }

    hasMoreTokens(): boolean {
        return this._cursor <= this._string.length;
    }

    isEOF(): boolean {
        return this._cursor == this._string.length;
    }

    /**
     * Throws default "Unexpected token" exception, showing the actual
     * line from the source, pointing with the ^ marker to the bad token.
     * In addition, shows `line:column` location.
     */
    throwUnexpectedToken(symbol: string, line: number, column: number): void {
        const lineSource = this._string.split('\n')[line - 1];

        const pad = ' '.repeat(column);
        const lineData = '\n\n' + lineSource + '\n' + pad + '^\n';

        throw new SyntaxError(
            `${lineData}Unexpected token: "${symbol}" ` +
            `at ${line}:${column}.`
        );
    }

    // --------------------------------------------
    // States.

    getCurrentState(): string {
        return this._states[this._states.length - 1];
    }

    pushState(state: string): void {
        this._states.push(state);
    }

    popState(): string {
        if (this._states.length > 1) {
            return this._states.pop();
        }

        return this.getCurrentState();
    }

    begin(state: string): void {
        this.pushState(state);
    }

    // --------------------------------------------
    // Common methods.

    private _captureLocation(matched: string): void {
        const nlRe = /\n/g;

        // Absolute offsets.
        this._tokenStartOffset = this._cursor;

        // Line-based locations, start.
        this._tokenStartLine = this._currentLine;
        this._tokenStartColumn = this._tokenStartOffset - this._currentLineBeginOffset;

        // Extract `\n` in the matched token.
        let nlMatch;
        while ((nlMatch = nlRe.exec(matched)) !== null) {
            this._currentLine++;
            this._currentLineBeginOffset = this._tokenStartOffset + nlMatch.index + 1;
        }

        this._tokenEndOffset = this._cursor + matched.length;

        // Line-based locations, end.
        this._tokenEndLine = this._currentLine;
        this._tokenEndColumn = this._currentColumn =
            (this._tokenEndOffset - this._currentLineBeginOffset);
    }

    private _toToken(tokenType: string, yytext = ''): Token {
        return new Token(
            tokensMap[tokenType],
            yytext,
            this._tokenStartOffset,
            this._tokenEndOffset,
            this._tokenStartLine,
            this._tokenEndLine,
            this._tokenStartColumn,
            this._tokenEndColumn
        );
    }

    private _match(string: string, regexp: RegExp): string {
        const matched = string.match(regexp);
        if (matched) {
            // Handle `\n` in the matched token to track line numbers.
            this._captureLocation(matched[0]);
            this._cursor += matched[0].length;
            return matched[0];
        }

        return null;
    }
}