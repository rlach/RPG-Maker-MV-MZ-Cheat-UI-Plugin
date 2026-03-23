/**
 * JsonParserState
 * DRY consolidation for JSON parsing state tracking
 * Eliminates repeated {inString, escape, depth, openStringStartIndex} patterns
 */

export class JsonParserState {
  /**
   * Create a new parser state instance
   * @param {Object} initial - Optional initial values
   */
  constructor(initial = {}) {
    this.inString = initial.inString ?? false;
    this.escape = initial.escape ?? false;
    this.depth = initial.depth ?? 0;
    this.openStringStartIndex = initial.openStringStartIndex ?? -1;
  }

  /**
   * Enter a string (set inString flag and record start index)
   * @param {number} index - Character index where string starts
   */
  enterString(index) {
    this.inString = true;
    this.openStringStartIndex = index;
  }

  /**
   * Exit a string (clear inString flag)
   */
  exitString() {
    this.inString = false;
  }

  /**
   * Prepare for escape sequence
   */
  prepareEscape() {
    this.escape = true;
  }

  /**
   * Consume escape sequence
   */
  consumeEscape() {
    this.escape = false;
  }

  /**
   * Increase nesting depth
   */
  increaseDepth() {
    this.depth += 1;
  }

  /**
   * Decrease nesting depth (with bounds check)
   */
  decreaseDepth() {
    if (this.depth > 0) {
      this.depth -= 1;
    }
  }

  /**
   * Check if currently at top level (depth === 0)
   * @returns {boolean}
   */
  isAtTopLevel() {
    return this.depth === 0;
  }

  /**
   * Check if inside unclosed string
   * @returns {boolean}
   */
  isInsideString() {
    return this.inString;
  }

  /**
   * Create independent copy (snapshot)
   * @returns {JsonParserState}
   */
  clone() {
    return new JsonParserState({
      inString: this.inString,
      escape: this.escape,
      depth: this.depth,
      openStringStartIndex: this.openStringStartIndex,
    });
  }

  /**
   * Export state as plain object
   * @returns {Object}
   */
  toObject() {
    return {
      inString: this.inString,
      escape: this.escape,
      depth: this.depth,
      openStringStartIndex: this.openStringStartIndex,
    };
  }

  /**
   * Import state from plain object
   * @param {Object} obj
   */
  fromObject(obj) {
    if (!obj || typeof obj !== "object") return;
    this.inString = obj.inString ?? false;
    this.escape = obj.escape ?? false;
    this.depth = obj.depth ?? 0;
    this.openStringStartIndex = obj.openStringStartIndex ?? -1;
  }
}
