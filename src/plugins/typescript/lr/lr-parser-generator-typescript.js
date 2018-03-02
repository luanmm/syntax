/**
 * The MIT License (MIT)
 * Copyright (c) 2015-present Dmitry Soshnikov <dmitry.soshnikov@gmail.com>
 * 
 * Parser generator for TypeScript, authored by Luan Mattner Müller.
 */

const LRParserGeneratorDefault = require(ROOT + 'lr/lr-parser-generator-default').default;
const TypeScriptParserGeneratorTrait = require('../typescript-parser-generator-trait');

import fs from 'fs';
import path from 'path';

/**
 * Generic template for all LR parsers in the TypeScript language.
 */
const TYPESCRIPT_LR_PARSER_TEMPLATE = fs.readFileSync(
  `${__dirname}/../templates/lr.template.ts`,
  'utf-8',
);

/**
 * LR parser generator for TypeScript language.
 */
export default class LRParserGeneratorTypeScript extends LRParserGeneratorDefault {

  constructor({
    grammar,
    outputFile,
    options = {},
  }) {
    super({grammar, outputFile, options})
      .setTemplate(TYPESCRIPT_LR_PARSER_TEMPLATE);

    this._lexHandlers = [];
    this._productionHandlers = [];

    this._parserClassName = path.basename(
      outputFile,
      path.extname(outputFile),
    );

    // Trait provides methods for lex and production handlers.
    Object.assign(this, TypeScriptParserGeneratorTrait);
  }

  /**
   * Generates parser code.
   */
  generateParserData() {
    super.generateParserData();
    this.generateLexHandlers();
    this.generateProductionHandlers();
    this.generateParserClassName(this._parserClassName);
  }
};
