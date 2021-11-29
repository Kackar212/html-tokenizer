import * as chars from './chars';

export class Cursor {
  input = '';
  state = {
    peek: 0,
    offset: 0,
    line: 1,
    column: 1,
  };
  end = -1;

  constructor(cursorInstance = undefined) {
    if (cursorInstance instanceof Cursor) {
      this.state = { ...cursorInstance.state };
      this.init(cursorInstance.input);
    }
  }

  init(input) {
    this.input = input;
    this.end = input.length;
  }

  getOffset() {
    return this.state.offset;
  }

  peek() {
    const { state: { offset }, end } = this;

    return this.state.peek = offset >= end ? chars.$EOF : this.input.charCodeAt(this.state.offset);
  }

  advance() {
    if (this.getOffset() >= this.end) {
      throw new Error('Unexpected EOF');
    }

    const currentCharCode = this.peek();
    if (chars.isNewLine(currentCharCode)) {
      this.state.line++;
      this.state.column = 0;
    }

    this.state.offset++;
    this.state.column++;

    this.peek();
  }

  getChars(start, end = this) {
    return this.input.substring(start.getOffset(), end.getOffset());
  }

  charsLeft() {
    return this.end - this.getOffset();
  }

  diff(otherCursor) {
    return this.getOffset() - otherCursor.getOffset();
  }

  clone() {
    return new Cursor(this);
  }
}
