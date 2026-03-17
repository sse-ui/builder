export type Token =
  | { type: "StringLiteral"; value: string; closed: boolean }
  | { type: "NoSubstitutionTemplate"; value: string; closed: boolean }
  | { type: "TemplateHead"; value: string }
  | { type: "TemplateMiddle"; value: string }
  | { type: "TemplateTail"; value: string; closed: boolean }
  | { type: "RegularExpressionLiteral"; value: string; closed: boolean }
  | { type: "MultiLineComment"; value: string; closed: boolean }
  | { type: "SingleLineComment"; value: string }
  | { type: "HashbangComment"; value: string }
  | { type: "IdentifierName"; value: string }
  | { type: "PrivateIdentifier"; value: string }
  | { type: "NumericLiteral"; value: string }
  | { type: "Punctuator"; value: string }
  | { type: "WhiteSpace"; value: string }
  | { type: "LineTerminatorSequence"; value: string }
  | { type: "Invalid"; value: string };

export type JSXToken =
  | { type: "JSXString"; value: string; closed: boolean }
  | { type: "JSXText"; value: string }
  | { type: "JSXIdentifier"; value: string }
  | { type: "JSXPunctuator"; value: string }
  | { type: "JSXInvalid"; value: string };

const RegularExpressionLiteral =
  /\/(?![*\/])(?:\[(?:[^\]\\\n\r\u2028\u2029]+|\\.)*\]?|[^\/[\\\n\r\u2028\u2029]+|\\.)*(\/[$_\u200C\u200D\p{ID_Continue}]*|\\)?/uy;
const Punctuator =
  /--|\+\+|=>|\.{3}|\??\.(?!\d)|(?:&&|\|\||\?\?|[+\-%&|^]|\*{1,2}|<{1,2}|>{1,3}|!=?|={1,2}|\/(?![\/*]))=?|[?~,:;[\](){}]/y;
const Identifier =
  /(\x23?)(?=[$_\p{ID_Start}\\])(?:[$_\u200C\u200D\p{ID_Continue}]+|\\u[\da-fA-F]{4}|\\u\{[\da-fA-F]+\})+/uy;
const StringLiteral = /(['"])(?:[^'"\\\n\r]+|(?!\1)['"]|\\(?:\r\n|[^]))*(\1)?/y;
const NumericLiteral =
  /(?:0[xX][\da-fA-F](?:_?[\da-fA-F])*|0[oO][0-7](?:_?[0-7])*|0[bB][01](?:_?[01])*)n?|0n|[1-9](?:_?\d)*n|(?:(?:0(?!\d)|0\d*[89]\d*|[1-9](?:_?\d)*)(?:\.(?:\d(?:_?\d)*)?)?|\.\d(?:_?\d)*)(?:[eE][+-]?\d(?:_?\d)*)?|0[0-7]+/y;
const Template = /[`}](?:[^`\\$]+|\\[^]|\$(?!\{))*(`|\$\{)?/y;
const WhiteSpace = /[\t\v\f\ufeff\p{Zs}]+/uy;
const LineTerminatorSequence = /\r?\n|[\r\u2028\u2029]/y;
const MultiLineComment = /\/\*(?:[^*]+|\*(?!\/))*(\*\/)?/y;
const SingleLineComment = /\/\/.*/y;
const HashbangComment = /^#!.*/;
const JSXPunctuator = /[<>.:={}]|\/(?![\/*])/y;
const JSXIdentifier = /[$_\p{ID_Start}][$_\u200C\u200D\p{ID_Continue}-]*/uy;
const JSXString = /(['"])(?:[^'"]+|(?!\1)['"])*(\1)?/y;
const JSXText = /[^<>{}]+/y;
const TokensPrecedingExpression =
  /^(?:[\/+-]|\.{3}|\?(?:InterpolationIn(?:JSX|Template)|NoLineTerminatorHere|NonExpressionParenEnd|UnaryIncDec))?$|[{}([,;<>=*%&|^!~?:]$/;
const TokensNotPrecedingObjectLiteral =
  /^(?:=>|[;\]){}]|else|\?(?:NoLineTerminatorHere|NonExpressionParenEnd))?$/;
const KeywordsWithExpressionAfter =
  /^(?:await|case|default|delete|do|else|instanceof|new|return|throw|typeof|void|yield)$/;
const KeywordsWithNoLineTerminatorAfter = /^(?:return|throw|yield)$/;
const Newline = RegExp(LineTerminatorSequence.source);

type Mode = { tag: string; nesting?: number };

export default function jsTokens(
  input: string,
  options: { jsx: true },
): Iterable<Token | JSXToken>;
export default function jsTokens(
  input: string,
  options?: { jsx?: boolean },
): Iterable<Token>;
export default function* jsTokens(
  input: string,
  { jsx = false }: { jsx?: boolean } = {},
): Iterable<Token | JSXToken> {
  let braces: boolean[],
    firstCodePoint: string,
    isExpression: boolean,
    lastIndex: number,
    lastSignificantToken: string,
    length: number,
    match: RegExpExecArray | null,
    mode: Mode,
    nextLastIndex: number,
    nextLastSignificantToken: string,
    parenNesting: number,
    postfixIncDec: boolean,
    punctuator: string,
    stack: Mode[];

  ({ length } = input);
  lastIndex = 0;
  lastSignificantToken = "";
  stack = [{ tag: "JS" }];
  braces = [];
  parenNesting = 0;
  postfixIncDec = false;

  if ((match = HashbangComment.exec(input))) {
    yield {
      type: "HashbangComment",
      value: match[0],
    } as Token;
    lastIndex = match[0].length;
  }

  while (lastIndex < length) {
    mode = stack[stack.length - 1];

    switch (mode.tag) {
      case "JS":
      case "JSNonExpressionParen":
      case "InterpolationInTemplate":
      case "InterpolationInJSX":
        if (
          input[lastIndex] === "/" &&
          (TokensPrecedingExpression.test(lastSignificantToken) ||
            KeywordsWithExpressionAfter.test(lastSignificantToken))
        ) {
          RegularExpressionLiteral.lastIndex = lastIndex;
          if ((match = RegularExpressionLiteral.exec(input))) {
            lastIndex = RegularExpressionLiteral.lastIndex;
            lastSignificantToken = match[0];
            postfixIncDec = true;
            yield {
              type: "RegularExpressionLiteral",
              value: match[0],
              closed: match[1] !== void 0 && match[1] !== "\\",
            } as Token;
            continue;
          }
        }
        Punctuator.lastIndex = lastIndex;
        if ((match = Punctuator.exec(input))) {
          punctuator = match[0];
          nextLastIndex = Punctuator.lastIndex;
          nextLastSignificantToken = punctuator;
          switch (punctuator) {
            case "(":
              if (lastSignificantToken === "?NonExpressionParenKeyword") {
                stack.push({
                  tag: "JSNonExpressionParen",
                  nesting: parenNesting,
                });
              }
              parenNesting++;
              postfixIncDec = false;
              break;
            case ")":
              parenNesting--;
              postfixIncDec = true;
              if (
                mode.tag === "JSNonExpressionParen" &&
                parenNesting === mode.nesting
              ) {
                stack.pop();
                nextLastSignificantToken = "?NonExpressionParenEnd";
                postfixIncDec = false;
              }
              break;
            case "{":
              Punctuator.lastIndex = 0;
              isExpression =
                !TokensNotPrecedingObjectLiteral.test(lastSignificantToken) &&
                (TokensPrecedingExpression.test(lastSignificantToken) ||
                  KeywordsWithExpressionAfter.test(lastSignificantToken));
              braces.push(isExpression);
              postfixIncDec = false;
              break;
            case "}":
              switch (mode.tag) {
                case "InterpolationInTemplate":
                  if (braces.length === mode.nesting) {
                    Template.lastIndex = lastIndex;
                    match = Template.exec(input) as RegExpExecArray;
                    lastIndex = Template.lastIndex;
                    lastSignificantToken = match[0];
                    if (match[1] === "${") {
                      lastSignificantToken = "?InterpolationInTemplate";
                      postfixIncDec = false;
                      yield {
                        type: "TemplateMiddle",
                        value: match[0],
                      } as Token;
                    } else {
                      stack.pop();
                      postfixIncDec = true;
                      yield {
                        type: "TemplateTail",
                        value: match[0],
                        closed: match[1] === "`",
                      } as Token;
                    }
                    continue;
                  }
                  break;
                case "InterpolationInJSX":
                  if (braces.length === mode.nesting) {
                    stack.pop();
                    lastIndex += 1;
                    lastSignificantToken = "}";
                    yield {
                      type: "JSXPunctuator",
                      value: "}",
                    } as JSXToken;
                    continue;
                  }
              }
              postfixIncDec = braces.pop() ?? false;
              nextLastSignificantToken = postfixIncDec
                ? "?ExpressionBraceEnd"
                : "}";
              break;
            case "]":
              postfixIncDec = true;
              break;
            case "++":
            case "--":
              nextLastSignificantToken = postfixIncDec
                ? "?PostfixIncDec"
                : "?UnaryIncDec";
              break;
            case "<":
              if (
                jsx &&
                (TokensPrecedingExpression.test(lastSignificantToken) ||
                  KeywordsWithExpressionAfter.test(lastSignificantToken))
              ) {
                stack.push({ tag: "JSXTag" });
                lastIndex += 1;
                lastSignificantToken = "<";
                yield {
                  type: "JSXPunctuator",
                  value: punctuator,
                } as JSXToken;
                continue;
              }
              postfixIncDec = false;
              break;
            default:
              postfixIncDec = false;
          }
          lastIndex = nextLastIndex;
          lastSignificantToken = nextLastSignificantToken;
          yield {
            type: "Punctuator",
            value: punctuator,
          } as Token;
          continue;
        }
        Identifier.lastIndex = lastIndex;
        if ((match = Identifier.exec(input))) {
          lastIndex = Identifier.lastIndex;
          nextLastSignificantToken = match[0];
          switch (match[0]) {
            case "for":
            case "if":
            case "while":
            case "with":
              if (
                lastSignificantToken !== "." &&
                lastSignificantToken !== "?."
              ) {
                nextLastSignificantToken = "?NonExpressionParenKeyword";
              }
          }
          lastSignificantToken = nextLastSignificantToken;
          postfixIncDec = !KeywordsWithExpressionAfter.test(match[0]);
          yield {
            type: match[1] === "#" ? "PrivateIdentifier" : "IdentifierName",
            value: match[0],
          } as Token;
          continue;
        }
        StringLiteral.lastIndex = lastIndex;
        if ((match = StringLiteral.exec(input))) {
          lastIndex = StringLiteral.lastIndex;
          lastSignificantToken = match[0];
          postfixIncDec = true;
          yield {
            type: "StringLiteral",
            value: match[0],
            closed: match[2] !== void 0,
          } as Token;
          continue;
        }
        NumericLiteral.lastIndex = lastIndex;
        if ((match = NumericLiteral.exec(input))) {
          lastIndex = NumericLiteral.lastIndex;
          lastSignificantToken = match[0];
          postfixIncDec = true;
          yield {
            type: "NumericLiteral",
            value: match[0],
          } as Token;
          continue;
        }
        Template.lastIndex = lastIndex;
        if ((match = Template.exec(input))) {
          lastIndex = Template.lastIndex;
          lastSignificantToken = match[0];
          if (match[1] === "${") {
            lastSignificantToken = "?InterpolationInTemplate";
            stack.push({
              tag: "InterpolationInTemplate",
              nesting: braces.length,
            });
            postfixIncDec = false;
            yield {
              type: "TemplateHead",
              value: match[0],
            } as Token;
          } else {
            postfixIncDec = true;
            yield {
              type: "NoSubstitutionTemplate",
              value: match[0],
              closed: match[1] === "`",
            } as Token;
          }
          continue;
        }
        break;
      case "JSXTag":
      case "JSXTagEnd":
        JSXPunctuator.lastIndex = lastIndex;
        if ((match = JSXPunctuator.exec(input))) {
          lastIndex = JSXPunctuator.lastIndex;
          nextLastSignificantToken = match[0];
          switch (match[0]) {
            case "<":
              stack.push({ tag: "JSXTag" });
              break;
            case ">":
              stack.pop();
              if (lastSignificantToken === "/" || mode.tag === "JSXTagEnd") {
                nextLastSignificantToken = "?JSX";
                postfixIncDec = true;
              } else {
                stack.push({ tag: "JSXChildren" });
              }
              break;
            case "{":
              stack.push({
                tag: "InterpolationInJSX",
                nesting: braces.length,
              });
              nextLastSignificantToken = "?InterpolationInJSX";
              postfixIncDec = false;
              break;
            case "/":
              if (lastSignificantToken === "<") {
                stack.pop();
                if (stack[stack.length - 1]?.tag === "JSXChildren") {
                  stack.pop();
                }
                stack.push({ tag: "JSXTagEnd" });
              }
          }
          lastSignificantToken = nextLastSignificantToken;
          yield {
            type: "JSXPunctuator",
            value: match[0],
          } as JSXToken;
          continue;
        }
        JSXIdentifier.lastIndex = lastIndex;
        if ((match = JSXIdentifier.exec(input))) {
          lastIndex = JSXIdentifier.lastIndex;
          lastSignificantToken = match[0];
          yield {
            type: "JSXIdentifier",
            value: match[0],
          } as JSXToken;
          continue;
        }
        JSXString.lastIndex = lastIndex;
        if ((match = JSXString.exec(input))) {
          lastIndex = JSXString.lastIndex;
          lastSignificantToken = match[0];
          yield {
            type: "JSXString",
            value: match[0],
            closed: match[2] !== void 0,
          } as JSXToken;
          continue;
        }
        break;
      case "JSXChildren":
        JSXText.lastIndex = lastIndex;
        if ((match = JSXText.exec(input))) {
          lastIndex = JSXText.lastIndex;
          lastSignificantToken = match[0];
          yield {
            type: "JSXText",
            value: match[0],
          } as JSXToken;
          continue;
        }
        switch (input[lastIndex]) {
          case "<":
            stack.push({ tag: "JSXTag" });
            lastIndex++;
            lastSignificantToken = "<";
            yield {
              type: "JSXPunctuator",
              value: "<",
            } as JSXToken;
            continue;
          case "{":
            stack.push({
              tag: "InterpolationInJSX",
              nesting: braces.length,
            });
            lastIndex++;
            lastSignificantToken = "?InterpolationInJSX";
            postfixIncDec = false;
            yield {
              type: "JSXPunctuator",
              value: "{",
            } as JSXToken;
            continue;
        }
    }

    WhiteSpace.lastIndex = lastIndex;
    if ((match = WhiteSpace.exec(input))) {
      lastIndex = WhiteSpace.lastIndex;
      yield {
        type: "WhiteSpace",
        value: match[0],
      } as Token;
      continue;
    }

    LineTerminatorSequence.lastIndex = lastIndex;
    if ((match = LineTerminatorSequence.exec(input))) {
      lastIndex = LineTerminatorSequence.lastIndex;
      postfixIncDec = false;
      if (KeywordsWithNoLineTerminatorAfter.test(lastSignificantToken)) {
        lastSignificantToken = "?NoLineTerminatorHere";
      }
      yield {
        type: "LineTerminatorSequence",
        value: match[0],
      } as Token;
      continue;
    }

    MultiLineComment.lastIndex = lastIndex;
    if ((match = MultiLineComment.exec(input))) {
      lastIndex = MultiLineComment.lastIndex;
      if (Newline.test(match[0])) {
        postfixIncDec = false;
        if (KeywordsWithNoLineTerminatorAfter.test(lastSignificantToken)) {
          lastSignificantToken = "?NoLineTerminatorHere";
        }
      }
      yield {
        type: "MultiLineComment",
        value: match[0],
        closed: match[1] !== void 0,
      } as Token;
      continue;
    }

    SingleLineComment.lastIndex = lastIndex;
    if ((match = SingleLineComment.exec(input))) {
      lastIndex = SingleLineComment.lastIndex;
      postfixIncDec = false;
      yield {
        type: "SingleLineComment",
        value: match[0],
      } as Token;
      continue;
    }

    firstCodePoint = String.fromCodePoint(
      input.codePointAt(lastIndex) as number,
    );
    lastIndex += firstCodePoint.length;
    lastSignificantToken = firstCodePoint;
    postfixIncDec = false;

    if (mode.tag.startsWith("JSX")) {
      yield { type: "JSXInvalid", value: firstCodePoint } as JSXToken;
    } else {
      yield { type: "Invalid", value: firstCodePoint } as Token;
    }
  }
  return void 0;
}

export { jsTokens as "module.exports" };
