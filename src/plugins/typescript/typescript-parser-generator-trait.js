/**
 * The MIT License (MIT)
 * Copyright (c) 2015-present Dmitry Soshnikov <dmitry.soshnikov@gmail.com>
 * 
 * Parser generator for TypeScript, authored by Luan Mattner Müller.
 */

import fs from 'fs';

/**
 * TypeScript tokenizer template.
 */
const TYPESCRIPT_TOKENIZER_TEMPLATE = fs.readFileSync(
  `${__dirname}/templates/tokenizer.template.ts`,
  'utf-8'
);

/**
 * The trait is used by parser generators (LL/LR) for Example language.
 *
 * Here we can override any needed method from the `LRParserGeneratorDefault`,
 * or even from the very base `BaseParserGenerator` to generate code in a
 * needed target language format.
 *
 * E.g., overriding `generateParseTable()` we can transform the parsing table,
 * which is received from the `generateParseTableData()`, from the JS format
 * to the format of the target language.
 */
const TypeScriptParserGeneratorTrait = {

  /**
   * Generates parser class name.
   */
  generateParserClassName(className) {
    this.writeData('PARSER_CLASS_NAME', className);
  },

  /**
   * Generates parsing table in Example language Map format.
   *
   * An array of records, where index is a state number, and a value is a
   * map from an encoded symbol (number) to a parsing action.
   *
   * The parsing action can be "Shift/s", "Reduce/r", a state
   * transition number, or "Accept/acc".
   *
   * Example:
   *
   * [
   *   // 0
   *   {
   *     0: "1",
   *     3: "s8",
   *     4: "s2",
   *   },
   *   // 1
   *   {
   *     1: "s3",
   *     2: "s4",
   *     6: "acc",
   *   },
   *   ...
   * ]
   */
  generateParseTable() {
    this.writeData(
      'TABLE',
      this._toTypeScriptLanguageMap(this.generateParseTableData()),
    );
  },

  /**
   * Generates tokens table in Example language Map format.
   */
  generateTokensTable() {
    this.writeData(
      'TOKENS',
      this._toTypeScriptDictionary(this._tokens, 'string', 'number')
    );
  },

  /**
   * Production handlers are implemented as methods on the `yyparse` class.
   */
  buildSemanticAction(production) {
    let action = this.getSemanticActionCode(production);

    if (!action) {
      return null;
    }

    // Here can do any transformation on the semantic action.
    action += ';';

    const args = this
      .getSemanticActionParams(production)
      .join(',');

    // Save the action, they are injected later.
    // "_handler1", "_handler2", etc.
    this._productionHandlers.push({args, action});
    return `_handler${this._productionHandlers.length}`;
  },

  /**
   * Default format in the [ ] array notation.
   *
   * The `generateRawProductionsData` from the base class returns
   * an encoded grammar productions table.
   *
   * Format of an array:
   *
   * [ <Non-Terminal Index>, <RHS.Length>, <handler> ]
   *
   * Non-terminal indices are from 0 to Last Non-terminal index.
   * LR-algorithm uses length of RHS to pop symbols from the stack; this
   * length is stored as the second element of a record. The last element is
   * an optional name of the semantic action handler. The first record is always
   * a special marker [-1, -1] entry representing an augmented production.
   *
   * Example:
   *
   * [
   *     [-1, 1],
   *     [0, 3, "_handler1"],
   *     [0, 2, "_handler2"],
   *     ...
   * ]
   */
  generateProductionsData() {
    return this.generateRawProductionsData()
      .map(data => JSON.stringify(data));
  },

  /**
   * Generates built-in tokenizer instance.
   */
  generateBuiltInTokenizer() {
    this.writeData('TOKENIZER', TYPESCRIPT_TOKENIZER_TEMPLATE);
  },

  /**
   * Generates rules for tokenizer.
   *
   * Array of arrays:
   *
   * [
   *   [/^\s+/, "_lexRule1"],
   *   [/^\d+/, "_lexRule1"],
   *   ...
   * ]
   *
   */
  generateLexRules() {
    let lexRules = this._grammar.getLexGrammar().getRules().map(lexRule => {

      // Here you may transform the handler code as needed. E.g. if your
      // language doesn't support module-level global variables, such as
      // `yytext`, and `yyleng` which we use as real globals here, you may
      // choose to transform them to some scoped access: you may store
      // `yytext` as a class property (e.g. on yyparse class), and replace
      // `yytext` to `yyparse.yytext` in the code.
      const action = lexRule.getRawHandler() + ';';

      this._lexHandlers.push({args: '', action});

      const flags = [];

      if (lexRule.isCaseInsensitive()) {
        flags.push('i');
      }

      // Example: ["^\s+", "_lexRule1"],
      return `[/${lexRule.getRawMatcher()}/${flags.join('')}, ` +
        `"_lexRule${this._lexHandlers.length}"]`;
    });

    this.writeData('LEX_RULES', `[ ${lexRules.join(',\n')} ]`);
  },

  /**
   * Generates lexical rules grouped by start conditions. A map from state
   * name to the list of lex rule indices from the `LEX_RULES`.
   *
   * Example:
   *
   * {
   *   "INITIAL": [0,5,6,7],
   *   "comment": [1,2,3,4,6],
   *   ...
   * };
   */
  generateLexRulesByStartConditions() {
    const lexGrammar = this._grammar.getLexGrammar();
    const lexRulesByConditions = lexGrammar.getRulesByStartConditions();
    const result = {};

    for (const condition in lexRulesByConditions) {
      result[condition] = lexRulesByConditions[condition].map(lexRule =>
        lexGrammar.getRuleIndex(lexRule)
      );
    }

    this.writeData(
      'LEX_RULES_BY_START_CONDITIONS',
      `${this._toTypeScriptLanguageMap(result)}`,
    );
  },

  /**
   * Type-converts a key of a C# dictionary, e.g. string or number, etc.
   */
  _dictKey(key, keyType) {
    switch (keyType) {
      case 'string': return `"${key}"`;
      case 'number': return Number(key);
      default:
        throw new Error('_dictKey: Incorrect type ' + keyType);
    }
  },

  /**
   * Type-converts a value of a TypeScript dictionary, e.g. string or number, etc.
   */
  _dictValue(value, valueType) {
    if (Array.isArray(value)) {
      // Support only int arrays here for simplicity.
      return `new int[] { ${value.join(', ')} }`;
    }

    switch (valueType) {
      case 'string': return `"${value}"`;
      case 'number': return Number(value);
      default:
        throw new Error('_dictValue: Incorrect value ' + valueType);
    }
  },

  /**
   * Converts JS object to TypeScript's dictionary representation.
   *
   * {"x": "10", "y": "20"} -> {"x": 10, "y": 20}
   *
   * The `keyTransform`, and `valueTransform` are used to put
   * the data in needed types, e.g. strings, numbers, arrays, etc.
   */
  _toTypeScriptDictionary(object, keyType, valueType) {
    let result = [];
    for (let k in object) {
      let value = object[k];
      let key = k.replace(/"/g, '\\"');
      result.push(
        `${this._dictKey(key, keyType)}: ` +
        `${this._dictValue(value, valueType)}`
      );
    }
    return `{ ${result.join(', ')} }`;
  },

  /**
   * An imaginary converter from JS format of an object, to the Example
   * language map object. E.g. here you may convert from JS's {foo: 10, bar: 20}
   * into PHP's array('foo' => 10, 'bar' => 20), etc.
   */
  _toTypeScriptLanguageMap(object) {
    // See other plugin examples to see actual transformation.
    // Here just use the simplest JSON.stringify.
    return JSON.stringify(object);
  },

  /**
   * Example language specific lex rules handler declarations.
   */
  generateLexHandlers() {
    const handlers = this._generateHandlers(
      this._lexHandlers,
      '_lexRule',
      '' /* return type, you can use e.g. 'string' */
    );
    this.writeData('LEX_RULE_HANDLERS', handlers.join('\n\n'));
  },

  /**
   * Example language specific handler declarations.
   */
  generateProductionHandlers() {
    const handlers = this._generateHandlers(
      this._productionHandlers,
      '_handler',
      '',  /* return type */
    );
    this.writeData('PRODUCTION_HANDLERS', handlers.join('\n\n'));
  },

  /**
   * Productions array in the Example language format.
   *
   * An array of arrays, see `generateProductionsData` for details.
   */
  generateProductions() {
    this.writeData(
      'PRODUCTIONS',
      `[ ${this.generateProductionsData().join(',\n')} ]`
    );
  },

  /**
   * Injects the code passed in the module include directive.
   */
  generateModuleInclude() {
    let moduleInclude = this._grammar.getModuleInclude();

    if (!moduleInclude) {
      // Example: add some default module include if needed.
      moduleInclude = `
        let foo = 'Example module include';
      `;
    }

    this.writeData('MODULE_INCLUDE', moduleInclude);
  },

  /**
   * Generates function declarations for handlers.
   *
   * Example:
   *
   * _handler1(_1, _2) {
   *   __ = _1 + _2;
   * }
   *
   * Or:
   *
   * _lexRule1() {
   *   return "NUMBER";
   * }
   */
  _generateHandlers(handlers, name, returnType = '') {
    return handlers.map(({args, action}, index) => {
      return `${returnType} ${name}${index + 1}` +
        `(${args}) {\n${action}\n}`
    });
  },
};

module.exports = TypeScriptParserGeneratorTrait;