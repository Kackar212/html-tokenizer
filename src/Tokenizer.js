import * as chars from './chars';
import { NAMED_ENTITIES } from './entities';
import {
  TokenType
} from './TokenType';

export class Tokenizer {
  tokens = [];
  token = {
    type: '',
    start: null,
    end: {
      start: null,
      type: '',
    }
  };
  whitespaces = 0;

  constructor(cursor) {
    this.cursor = cursor;
  }

  getTokens() {
    return this.tokens;
  }

  tokenize(input = '') {
    this.cursor.init(input);

    while (this.cursor.peek() !== chars.$EOF) {
      try {
        if (this.attemptCharCode(chars.$LT)) {
          if (this.attemptCharCode(chars.$BANG)) {
            if (this.attemptCharCode(chars.$LBRACKET)) {
              this.consumeCData();
            } else if (this.attemptCharCode(chars.$MINUS)) {
              this.consumeComment();
            } else {
              this.consumeDocType();
            }
          } else if (this.attemptCharCode(chars.$SLASH)) {
            this.consumeEndTag();
          } else if (chars.isAsciiLetter(this.cursor.peek())) {
            this.consumeTag();
          }
        } else if (this.attemptCharCode(chars.$AMPERSAND)) {
          // if (this.attemptCharCode(chars.$HASH)) {
            this.consumeEntity();
          // } else {
            // this.consumeEntityName();
          // }
        } else {
          this.consumeText();
        }
      } catch (e) {
        return e;
      }
    }

    this.beginToken(TokenType.EOF, this.cursor);
    this.endToken([]);

    return this.tokens;
  }

  isDigitEntityEnd() {
    const code = this.cursor.peek();
    return code === chars.$SEMICOLON || code === chars.$EOF || !chars.isAsciiHexDigit(code);
  }
  
  isNamedEntityEnd() {
    const code = this.cursor.peek();
    return code === chars.$SEMICOLON || code === chars.$EOF || !chars.isAsciiLetter(code);
  }

  isCommentEnd() {
    const cursor = this.cursor.clone();

    if (this._attemptCharCode(chars.$MINUS, cursor)) {
      if (this._attemptCharCode(chars.$MINUS, cursor)) {
        if (this._attemptCharCode(chars.$GT, cursor)) {
          return true;
        }
      }
    }

    return false;
  }

  isCommentStart() {
    const cursor = this.cursor.clone();
    if (this._attemptCharCode(chars.$LT, cursor)) {
      if (this._attemptCharCode(chars.$BANG, cursor)) {
        if (this._attemptCharCode(chars.$MINUS, cursor)) {
          if (this._attemptCharCode(chars.$MINUS, cursor)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  isTagStart() {
    const cursor = this.cursor.clone();

    if (this._attemptCharCode(chars.$LT, cursor)) {
      return chars.isAsciiLetter(cursor.peek());
    }

    return false;
  }

  isTagEnd() {
    const cursor = this.cursor.clone();

    if (this._attemptCharCode(chars.$LT, cursor)) {
      return this._attemptCharCode(chars.$SLASH, cursor) && chars.isAsciiLetter(this.cursor.peek());
    }

    return false;
  }

  isCDataStart() {
    const cursor = this.cursor.clone();

    return this.attemptStr('<![CDATA[');
  }

  isCDataEnd() {
    const cursor = this.cursor.clone();

    if (this._attemptCharCode(chars.$RBRACKET, cursor)) {
      if (this._attemptCharCode(chars.$RBRACKET, cursor)) {
        if (this._attemptCharCode(chars.$GT, cursor)) {
          return true;
        }
      }
    }

    return false;
  }

  isTagNameEnd() {
    const code = this.cursor.peek();
    return chars.isWhitespace(code) || code === chars.$GT || code === chars.$LT ||
      code === chars.$SLASH || code === chars.$SQ || code === chars.$DQ || code === chars.$EQ ||
      code === chars.$EOF;
  }

  advanceUntil(fn) {
    while (!fn.apply(this)) {
      if (chars.isWhitespace(this.cursor.peek())) {
        this.whitespaces++;
      }

      this.cursor.advance();
    }
  }

  hasTokenStarted() {
    return this.token.type && this.token.start;
  }

  beginToken(type, cursor) {
    this.token.type = type;
    this.token.start = cursor;

    return this;
  }

  endToken(parts, end = this.cursor.clone()) {
    if (!this.hasTokenStarted()) {
      throw new Error('Programming error - attempted to end a token when there was no start to the token');
    }

    const {
      token: {
        start,
        type,
      }
    } = this;

    this.tokens.push({
      type,
      start,
      end,
      range: [start.getOffset(), end.getOffset()],
      parts,
    })
  }

  _attemptCharCode(char, cursor) {
    return this.attemptCharCode(char, false, cursor);
  }

  attemptCharCode(char, require = false, cursor = this.cursor) {
    if (cursor.peek() !== char) {
      if (require) {
        throw new Error(`Unexpected character ${String.fromCharCode(this.cursor.peek())} at line: ${this.cursor.state.line}, column: ${this.cursor.state.column}`)
      }

      return false;
    }

    cursor.advance();

    return true;
  }

  _attemptStr(str, cursor) {
    return this.attemptStr(str, false, cursor)
  }

  attemptStr(str, require = false, cursor = this.cursor) {
    if (this.cursor.charsLeft() < str.length) {
      if (require) {
        throw new Error(`${str} is missing at line: ${this.cursor.state.line}, column: ${this.cursor.state.column}`)
      }

      return false;
    };

    const initialLocation = this.cursor.clone();

    for (let i = 0; i < str.length; i++) {
      initialLocation.advance();
    }

    if (initialLocation.getChars(this.cursor) !== str) {
      if (require) {
        throw new Error(`${str} is missing at line: ${this.cursor.state.line}, column: ${this.cursor.state.column}`)
      }

      return false;
    }

    if (require) {
      this.cursor = initialLocation.clone();
    }

    return true;
  }

  consumeEntity() {
    const start = this.cursor.clone();
    start.state.offset -= 1;

    if (this.attemptCharCode(chars.$HASH)) {
      const isHex = this.attemptCharCode(chars.$x) || this.attemptCharCode(chars.$X);

      const entityStart = this.cursor.clone();

      this.advanceUntil(() => this.isDigitEntityEnd());

      const entityNumber = this.cursor.getChars(entityStart);
      const charCode = parseInt(entityNumber, isHex ? 16 : 10);
      const char = String.fromCharCode(charCode);

      if (this.cursor.peek() !== chars.$SEMICOLON) {
        this.cursor = start;
        this.consumeText();
        
        return;
      }

      this.beginToken(TokenType.ENTITY_NUMBER, start);
      this.endToken([char, charCode]);
    } else {
      const entityStart = this.cursor.clone();
      
      this.advanceUntil(() => this.isNamedEntityEnd());
      
      const entityName = this.cursor.getChars(entityStart);
      const entity = NAMED_ENTITIES[entityName];

      if (this.cursor.peek() !== chars.$SEMICOLON || !entity) {
        this.cursor = start;
        this.consumeText();
        
        return;
      }

      this.beginToken(TokenType.ENTITY_NAME, start);
      this.endToken([entity, entityName]);
    }

    this.cursor.advance();
  }

  consumeText(advanceUntilCallback) {
    const start = this.cursor.clone();
    this.beginToken(TokenType.TEXT, start);

    if (advanceUntilCallback) {
      this.advanceUntil(advanceUntilCallback);
    } else {
      this.advanceUntil(() => {
        return this.cursor.peek() === chars.$EOF || this.isTagStart() || this.isTagEnd() || this.isCDataStart() || this.isCommentStart();
      })
    }

    this.endToken([this.cursor.getChars(start, this.cursor)])
  }

  consumeDocType() {
    this.attemptStr('DOCTYPE ', true);

    const start = this.cursor.clone();

    this.beginToken(TokenType.DOC_TYPE, start);

    this.advanceUntil(() => this.cursor.peek() === chars.$GT);

    this.endToken([this.cursor.getChars(start)]);
    this.cursor.advance();
  }

  consumeComment() {
    const start = this.cursor.clone();
    start.state.offset -= 3;

    this.beginToken(TokenType.COMMENT_START, this.cursor.clone())
    this.attemptCharCode(chars.$MINUS, true);
    this.endToken(['<!--']);

    this.consumeText(() => this.attemptStr('-->') || this.cursor.peek() === chars.$EOF);

    this.beginToken(TokenType.COMMENT_END, this.cursor.clone());
    this.attemptStr('-->', true);
    this.endToken([]);
  }

  consumeCData() {
    const start = this.cursor.clone();
    start.state.offset -= 3;

    this.beginToken(TokenType.CDATA_START, start);
    this.attemptStr('CDATA[', true)
    this.endToken([]);

    this.consumeText(this.isCDataEnd);

    this.beginToken(TokenType.CDATA_END, this.cursor.clone())
    this.attemptStr(']]>', true)
    this.endToken([]);
  }

  consumeTag() {
    let start = this.cursor.clone();
    start.state.offset -= 1;

    let isIncomplete = false;

    if (!chars.isAsciiLetter(this.cursor.peek()) || this._attemptCharCode(chars.$SPACE, start)) {
      return this.consumeText();
    }

    this.beginToken(TokenType.TAG_OPEN_START, start);
    
    start = start.clone();
    start.advance();

    this.advanceUntil(() => this.isTagNameEnd());

    const tagName = this.cursor.getChars(start);

    this.endToken([tagName]);

    this.advanceUntil(() => !chars.isWhitespace(this.cursor.peek()));

    while (
      this.cursor.peek() !== chars.$GT &&
      !this.attemptStr('/>') &&
      this.cursor.peek() !== chars.$EOF
    ) {
      this.consumeAttribute();
    }

    this.advanceUntil(() => !chars.isWhitespace(this.cursor.peek()));
    const tagOpenEndStart = this.cursor.clone();

    let type;
    let parts = [];
    try {
      this.attemptStr('/>', true);

      type = TokenType.TAG_OPEN_END_VOID;
      parts = ['/>'];
    } catch (_) {
      try {
        this.attemptCharCode(chars.$GT, true)

        type = TokenType.TAG_OPEN_END
        parts = ['>'];
      } catch (_) {
        const lastOpenTag = this.tokens.find((token) => token.start === start);
        lastOpenTag.type = TokenType.INCOMPLETE_TAG_OPEN;

        isIncomplete = true;
      }
    }

    if (!isIncomplete) {
      this
        .beginToken(type, tagOpenEndStart)
        .endToken(parts);
    }
  }

  consumeAttribute() {
    this.consumeAttributeName();
    this.advanceUntil(() => !chars.isWhitespace(this.cursor.peek()));

    if (this.cursor.peek() === chars.$EQ) {
      this.cursor.advance();
      this.advanceUntil(() => !chars.isWhitespace(this.cursor.peek()));
      this.consumeAttributeValue();
    }

    this.advanceUntil(() => !chars.isWhitespace(this.cursor.peek()));
  }

  consumeAttributeName() {
    const start = this.cursor.clone();

    this.beginToken(TokenType.ATTR_NAME, start);

    this.advanceUntil(() => this.cursor.peek() === chars.$EQ || this.cursor.peek() === chars.$SPACE || this.cursor.peek() === chars.$SLASH ||this.cursor.peek() === chars.$GT || this.cursor.peek() === chars.$EOF);

    if (this.cursor.diff(start) <= 0) {
      this.cursor.advance();
      return;
    }

    const end = this.cursor.clone();
    end.state.offset -= 2;

    this.endToken([this.cursor.getChars(start)]);
  }

  consumeAttributeValue() {
    const start = this.cursor.clone();

    this.beginToken(TokenType.ATTR_VALUE, start);

    this.advanceUntil(() => !chars.isWhitespace(this.cursor.peek()));

    if (this.attemptCharCode(chars.$DQ) || this.attemptCharCode(chars.$SQ)) {
      this.cursor.advance();
      start.advance();
      this.advanceUntil(() => this.cursor.peek() === chars.$DQ || this.cursor.peek() === chars.$SQ || this.cursor.peek() === chars.$EOF);
    } else {
      this.advanceUntil(() => this.cursor.peek() === chars.$SPACE || this.cursor.peek() === chars.$EOF || this.cursor.peek() === chars.$GT || this.cursor.peek() === chars.$SLASH)
    }

    const value = this.cursor.getChars(start);

    if (this.cursor.peek() === chars.$DQ || this.cursor.peek() === chars.$SQ) {
      this.cursor.advance();
    }

    this.endToken([value]);
  }

  consumeEndTag() {
    let start = this.cursor.clone();
    start.state.offset -= 2;

    this.beginToken(TokenType.TAG_CLOSE, start)

    const tagNameStart = this.cursor.clone();

    this.advanceUntil(() => this.isTagNameEnd());
    const tagName = this.cursor.getChars(tagNameStart);

    this.advanceUntil(() => !chars.isWhitespace(this.cursor.peek()));
    this.attemptCharCode(chars.$GT, true);
    this.endToken([tagName]);
  }

  getCursor() {
    return this.cursor;
  }
}