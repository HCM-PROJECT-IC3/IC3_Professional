/* ════════════════════════════════════════════════════════════
   js/excel-engine/formula-engine.js — MOS Exam Simulator (Excel)

   Formula engine THẬT: tokenize → parse (recursive descent) → evaluate,
   không phải regex đoán mò. Hỗ trợ tối thiểu theo yêu cầu:
   SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, IF, AND, OR, ROUND, COUNTIF,
   SUMIF, VLOOKUP, XLOOKUP — cộng toán tử số học/so sánh/nối chuỗi và
   tham chiếu ô tương đối ($ tuỳ ý ở cột/hàng) + vùng (A1:B3) + tham
   chiếu sang sheet khác (Sheet2!A1).

   KHÔNG tự lưu trạng thái bảng tính — nhận vào 1 "resolver" (do
   spreadsheet-model.js cung cấp) để đọc giá trị ô/vùng, nên formula
   engine test được độc lập (xem js/excel-engine/__tests__/formula-engine.test.js)
   mà không cần dựng cả Excel simulator.

   resolver = {
     getCellValue(sheetName, colIndex, rowIndex) -> number|string|boolean|null
     getRangeValues(sheetName, c1, r1, c2, r2) -> giá trị 2D [[...]] theo hàng
     currentSheet -> tên sheet đang active (dùng khi formula không ghi rõ sheet)
   }
   ════════════════════════════════════════════════════════════ */
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = mod;
  }
  if (root) {
    root.ExcelEngine = root.ExcelEngine || {};
    root.ExcelEngine.FormulaEngine = mod;
  }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : null), function () {
  'use strict';

  // ────────────────────────────────────────────────────────────
  // Lỗi kiểu Excel — lan truyền qua các phép toán thay vì làm sập cả
  // formula (giống hành vi Excel thật: 1 ô lỗi không crash cả bảng tính).
  // ────────────────────────────────────────────────────────────
  function FormulaError(code) {
    this.code = code;
    this.isFormulaError = true;
  }

  function isErr(v) { return v && v.isFormulaError; }

  // ────────────────────────────────────────────────────────────
  // Column letter <-> index (A=1, Z=26, AA=27, ...)
  // ────────────────────────────────────────────────────────────
  function colToIndex(letters) {
    var n = 0;
    for (var i = 0; i < letters.length; i++) {
      n = n * 26 + (letters.toUpperCase().charCodeAt(i) - 64);
    }
    return n;
  }
  function indexToCol(n) {
    var s = '';
    while (n > 0) {
      var rem = (n - 1) % 26;
      s = String.fromCharCode(65 + rem) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  // ────────────────────────────────────────────────────────────
  // TOKENIZER
  // ────────────────────────────────────────────────────────────
  var TOKEN_RE = /\s*(?:("(?:[^"]|"")*")|('[^']*'!|[A-Za-z_][A-Za-z0-9_]*!)?(\$?[A-Za-z]{1,3}\$?[0-9]+)|([A-Za-z_][A-Za-z0-9_.]*)\s*(?=\()|(TRUE|FALSE)\b|([0-9]+\.?[0-9]*|\.[0-9]+)|(<>|<=|>=|[+\-*/^&=<>(),:]))/y;

  function tokenize(formula) {
    var src = formula.trim();
    if (src.charAt(0) === '=') src = src.slice(1);
    var tokens = [];
    var pos = 0;
    TOKEN_RE.lastIndex = 0;
    while (pos < src.length) {
      TOKEN_RE.lastIndex = pos;
      var m = TOKEN_RE.exec(src);
      if (!m || m.index !== pos) {
        // bỏ qua khoảng trắng còn sót, nếu vẫn kẹt thì lỗi cú pháp
        if (/\s/.test(src.charAt(pos))) { pos++; continue; }
        throw new Error('Formula syntax error near: ' + src.slice(pos, pos + 12));
      }
      pos = TOKEN_RE.lastIndex;
      if (m[1] !== undefined) {
        tokens.push({ type: 'string', value: m[1].slice(1, -1).replace(/""/g, '"') });
      } else if (m[3] !== undefined) {
        var sheetPrefix = m[2] ? m[2].replace(/!$/, '').replace(/^'|'$/g, '') : null;
        tokens.push({ type: 'ref', sheet: sheetPrefix, text: m[3] });
      } else if (m[4] !== undefined) {
        tokens.push({ type: 'func', name: m[4].toUpperCase() });
      } else if (m[5] !== undefined) {
        tokens.push({ type: 'bool', value: m[5] === 'TRUE' });
      } else if (m[6] !== undefined) {
        tokens.push({ type: 'number', value: parseFloat(m[6]) });
      } else if (m[7] !== undefined) {
        tokens.push({ type: 'op', value: m[7] });
      }
    }
    tokens.push({ type: 'eof' });
    return tokens;
  }

  function parseRefToken(tok) {
    var match = /^(\$?)([A-Za-z]{1,3})(\$?)([0-9]+)$/.exec(tok.text);
    return {
      type: 'ref',
      sheet: tok.sheet,
      colAbs: match[1] === '$',
      col: colToIndex(match[2]),
      rowAbs: match[3] === '$',
      row: parseInt(match[4], 10)
    };
  }

  // ────────────────────────────────────────────────────────────
  // PARSER (recursive descent) — precedence thấp → cao:
  // comparison → concat(&) → additive(+ -) → multiplicative(* /) →
  // unary(-) → power(^) → primary
  // ────────────────────────────────────────────────────────────
  function Parser(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }
  Parser.prototype.peek = function () { return this.tokens[this.pos]; };
  Parser.prototype.next = function () { return this.tokens[this.pos++]; };
  Parser.prototype.expectOp = function (op) {
    var t = this.next();
    if (t.type !== 'op' || t.value !== op) throw new Error('Expected "' + op + '" but got ' + JSON.stringify(t));
    return t;
  };

  Parser.prototype.parseExpression = function () { return this.parseComparison(); };

  Parser.prototype.parseComparison = function () {
    var left = this.parseConcat();
    var CMP = ['=', '<>', '<', '>', '<=', '>='];
    while (this.peek().type === 'op' && CMP.indexOf(this.peek().value) !== -1) {
      var op = this.next().value;
      var right = this.parseConcat();
      left = { type: 'binop', op: op, left: left, right: right };
    }
    return left;
  };

  Parser.prototype.parseConcat = function () {
    var left = this.parseAdditive();
    while (this.peek().type === 'op' && this.peek().value === '&') {
      this.next();
      var right = this.parseAdditive();
      left = { type: 'binop', op: '&', left: left, right: right };
    }
    return left;
  };

  Parser.prototype.parseAdditive = function () {
    var left = this.parseMultiplicative();
    while (this.peek().type === 'op' && (this.peek().value === '+' || this.peek().value === '-')) {
      var op = this.next().value;
      var right = this.parseMultiplicative();
      left = { type: 'binop', op: op, left: left, right: right };
    }
    return left;
  };

  Parser.prototype.parseMultiplicative = function () {
    var left = this.parseUnary();
    while (this.peek().type === 'op' && (this.peek().value === '*' || this.peek().value === '/')) {
      var op = this.next().value;
      var right = this.parseUnary();
      left = { type: 'binop', op: op, left: left, right: right };
    }
    return left;
  };

  Parser.prototype.parseUnary = function () {
    if (this.peek().type === 'op' && this.peek().value === '-') {
      this.next();
      return { type: 'unary', op: '-', arg: this.parseUnary() };
    }
    if (this.peek().type === 'op' && this.peek().value === '+') {
      this.next();
      return this.parseUnary();
    }
    return this.parsePower();
  };

  Parser.prototype.parsePower = function () {
    var base = this.parsePrimary();
    if (this.peek().type === 'op' && this.peek().value === '^') {
      this.next();
      var exp = this.parseUnary();
      return { type: 'binop', op: '^', left: base, right: exp };
    }
    return base;
  };

  Parser.prototype.parsePrimary = function () {
    var t = this.peek();
    if (t.type === 'number') { this.next(); return { type: 'num', value: t.value }; }
    if (t.type === 'string') { this.next(); return { type: 'str', value: t.value }; }
    if (t.type === 'bool') { this.next(); return { type: 'bool', value: t.value }; }
    if (t.type === 'ref') {
      this.next();
      var startRef = parseRefToken(t);
      if (this.peek().type === 'op' && this.peek().value === ':') {
        this.next();
        var endTok = this.next();
        if (endTok.type !== 'ref') throw new Error('Expected cell reference after ":"');
        var endRef = parseRefToken(endTok);
        return { type: 'range', start: startRef, end: endRef };
      }
      return startRef;
    }
    if (t.type === 'func') {
      this.next();
      this.expectOp('(');
      var args = [];
      if (!(this.peek().type === 'op' && this.peek().value === ')')) {
        args.push(this.parseExpression());
        while (this.peek().type === 'op' && this.peek().value === ',') {
          this.next();
          args.push(this.parseExpression());
        }
      }
      this.expectOp(')');
      return { type: 'call', name: t.name, args: args };
    }
    if (t.type === 'op' && t.value === '(') {
      this.next();
      var expr = this.parseExpression();
      this.expectOp(')');
      return expr;
    }
    throw new Error('Unexpected token: ' + JSON.stringify(t));
  };

  function parseFormula(formula) {
    var tokens = tokenize(formula);
    var parser = new Parser(tokens);
    var ast = parser.parseExpression();
    if (parser.peek().type !== 'eof') {
      throw new Error('Unexpected trailing tokens starting at: ' + JSON.stringify(parser.peek()));
    }
    return ast;
  }

  // ────────────────────────────────────────────────────────────
  // EVALUATOR
  // ────────────────────────────────────────────────────────────
  function toNumber(v) {
    if (isErr(v)) throw v;
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'number') return v;
    var n = parseFloat(v);
    if (isNaN(n)) throw new FormulaError('#VALUE!');
    return n;
  }
  function toStr(v) {
    if (isErr(v)) throw v;
    if (v === null || v === undefined) return '';
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return String(v);
  }
  function toBool(v) {
    if (isErr(v)) throw v;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'string') return v.toUpperCase() === 'TRUE';
    return !!v;
  }

  /** Duyệt 1 range thành mảng phẳng các giá trị (bỏ ô rỗng ra giữ null). */
  function flattenRange(matrix) {
    var out = [];
    matrix.forEach(function (row) { row.forEach(function (v) { out.push(v); }); });
    return out;
  }

  function resolveRef(node, ctx) {
    var sheet = node.sheet || ctx.currentSheet;
    return ctx.getCellValue(sheet, node.col, node.row);
  }
  function resolveRange(node, ctx) {
    var sheet = node.start.sheet || node.end.sheet || ctx.currentSheet;
    var c1 = Math.min(node.start.col, node.end.col), c2 = Math.max(node.start.col, node.end.col);
    var r1 = Math.min(node.start.row, node.end.row), r2 = Math.max(node.start.row, node.end.row);
    return ctx.getRangeValues(sheet, c1, r1, c2, r2);
  }

  /** Đánh giá 1 arg có thể là scalar hoặc range → luôn trả mảng phẳng cho các hàm SUM/AVERAGE/... */
  function evalArgAsList(node, ctx) {
    if (node.type === 'range') return flattenRange(resolveRange(node, ctx));
    var v = evalNode(node, ctx);
    return [v];
  }

  function buildCriteriaTest(criteria) {
    if (typeof criteria === 'number') {
      return function (v) { return toNumber(v) === criteria; };
    }
    var s = toStr(criteria).trim();
    var m = /^(<>|<=|>=|<|>|=)\s*(.+)$/.exec(s);
    if (m) {
      var op = m[1];
      var rhsRaw = m[2];
      var rhsNum = parseFloat(rhsRaw);
      var rhsIsNum = !isNaN(rhsNum) && /^-?[0-9.]+$/.test(rhsRaw.trim());
      return function (v) {
        if (rhsIsNum) {
          var n = toNumber(v);
          switch (op) {
            case '<>': return n !== rhsNum;
            case '<=': return n <= rhsNum;
            case '>=': return n >= rhsNum;
            case '<': return n < rhsNum;
            case '>': return n > rhsNum;
            case '=': return n === rhsNum;
          }
        }
        var sv = toStr(v);
        return op === '<>' ? sv !== rhsRaw : sv === rhsRaw;
      };
    }
    // Không có toán tử so sánh → so khớp bằng (số nếu parse được, không thì chuỗi, không phân biệt hoa/thường)
    var asNum = parseFloat(s);
    if (!isNaN(asNum) && /^-?[0-9.]+$/.test(s)) {
      return function (v) { return toNumber(v) === asNum; };
    }
    return function (v) { return toStr(v).toLowerCase() === s.toLowerCase(); };
  }

  /**
   * Gom TẤT CẢ giá trị số từ 1 danh sách args (mỗi arg có thể là scalar
   * hoặc range) thành 1 mảng phẳng — dùng chung cho SUM/AVERAGE/MIN/MAX/
   * COUNT thay vì mỗi hàm tự lặp lại "forEach args -> forEach values ->
   * lọc number" (5 bản gần như giống hệt nhau trước đây, sửa 1 chỗ dễ
   * quên sửa 4 chỗ còn lại). Chỉ nhận giá trị có typeof === 'number'
   * (giống hành vi Excel thật: text trong 1 RANGE bị bỏ qua bởi
   * SUM/COUNT/..., không tự ép kiểu "5" thành số).
   */
  function collectNumbers(args, ctx) {
    var nums = [];
    args.forEach(function (a) {
      evalArgAsList(a, ctx).forEach(function (v) { if (typeof v === 'number') nums.push(v); });
    });
    return nums;
  }

  var FUNCTIONS = {
    SUM: function (args, ctx) {
      return collectNumbers(args, ctx).reduce(function (s, n) { return s + n; }, 0);
    },
    AVERAGE: function (args, ctx) {
      var nums = collectNumbers(args, ctx);
      if (!nums.length) throw new FormulaError('#DIV/0!');
      return nums.reduce(function (s, n) { return s + n; }, 0) / nums.length;
    },
    MIN: function (args, ctx) {
      var nums = collectNumbers(args, ctx);
      return nums.length ? Math.min.apply(Math, nums) : 0;
    },
    MAX: function (args, ctx) {
      var nums = collectNumbers(args, ctx);
      return nums.length ? Math.max.apply(Math, nums) : 0;
    },
    COUNT: function (args, ctx) {
      return collectNumbers(args, ctx).length;
    },
    COUNTA: function (args, ctx) {
      var n = 0;
      args.forEach(function (a) { evalArgAsList(a, ctx).forEach(function (v) { if (v !== null && v !== undefined && v !== '') n++; }); });
      return n;
    },
    IF: function (args, ctx) {
      if (args.length < 2) throw new FormulaError('#VALUE!');
      var cond = toBool(evalNode(args[0], ctx));
      if (cond) return evalNode(args[1], ctx);
      return args.length > 2 ? evalNode(args[2], ctx) : false;
    },
    AND: function (args, ctx) {
      return args.every(function (a) { return toBool(evalNode(a, ctx)); });
    },
    OR: function (args, ctx) {
      return args.some(function (a) { return toBool(evalNode(a, ctx)); });
    },
    ROUND: function (args, ctx) {
      var num = toNumber(evalNode(args[0], ctx));
      var digits = args[1] ? toNumber(evalNode(args[1], ctx)) : 0;
      var factor = Math.pow(10, digits);
      return Math.round(num * factor) / factor;
    },
    COUNTIF: function (args, ctx) {
      if (args.length < 2) throw new FormulaError('#VALUE!');
      var values = evalArgAsList(args[0], ctx);
      var test = buildCriteriaTest(evalNode(args[1], ctx));
      return values.reduce(function (n, v) { return n + (test(v) ? 1 : 0); }, 0);
    },
    SUMIF: function (args, ctx) {
      if (args.length < 2) throw new FormulaError('#VALUE!');
      var criteriaValues = evalArgAsList(args[0], ctx);
      var test = buildCriteriaTest(evalNode(args[1], ctx));
      var sumValues = args[2] ? evalArgAsList(args[2], ctx) : criteriaValues;
      var total = 0;
      for (var i = 0; i < criteriaValues.length; i++) {
        if (test(criteriaValues[i])) {
          var sv = sumValues[i];
          total += typeof sv === 'number' ? sv : (parseFloat(sv) || 0);
        }
      }
      return total;
    },
    VLOOKUP: function (args, ctx) {
      if (args.length < 3) throw new FormulaError('#VALUE!');
      var lookupValue = evalNode(args[0], ctx);
      if (args[1].type !== 'range') throw new FormulaError('#REF!');
      var table = resolveRange(args[1], ctx);
      var colIndex = toNumber(evalNode(args[2], ctx));
      var exact = args.length > 3 ? !toBool(evalNode(args[3], ctx)) : true;
      if (exact) {
        for (var i = 0; i < table.length; i++) {
          var cell = table[i][0];
          var isMatch = cell === lookupValue || (typeof cell === 'string' && typeof lookupValue === 'string' && cell.toLowerCase() === lookupValue.toLowerCase());
          if (isMatch) {
            var col = table[i][colIndex - 1];
            return col === undefined ? new FormulaError('#REF!') : col;
          }
        }
      }
      if (!exact) {
        // approximate match: giả định bảng đã sort tăng dần theo cột đầu
        var best = null;
        for (var j = 0; j < table.length; j++) {
          if (toNumber(table[j][0]) <= toNumber(lookupValue)) best = table[j];
        }
        if (best) return best[colIndex - 1];
      }
      throw new FormulaError('#N/A');
    },
    XLOOKUP: function (args, ctx) {
      if (args.length < 3) throw new FormulaError('#VALUE!');
      var lookupValue = evalNode(args[0], ctx);
      var lookupArr = evalArgAsList(args[1], ctx);
      var returnArr = evalArgAsList(args[2], ctx);
      for (var i = 0; i < lookupArr.length; i++) {
        var cell = lookupArr[i];
        if (cell === lookupValue || (typeof cell === 'string' && typeof lookupValue === 'string' && cell.toLowerCase() === toStr(lookupValue).toLowerCase())) {
          return returnArr[i];
        }
      }
      if (args.length > 3) return evalNode(args[3], ctx);
      throw new FormulaError('#N/A');
    }
  };

  function evalNode(node, ctx) {
    switch (node.type) {
      case 'num': return node.value;
      case 'str': return node.value;
      case 'bool': return node.value;
      case 'ref': return resolveRef(node, ctx);
      case 'range': {
        // Range dùng trực tiếp (không qua hàm tổng hợp) → trả giá trị ô đầu
        // tiên, giống hành vi Excel khi 1 range được dùng ở vị trí scalar.
        var vals = flattenRange(resolveRange(node, ctx));
        return vals.length ? vals[0] : null;
      }
      case 'unary': {
        var v = evalNode(node.arg, ctx);
        if (isErr(v)) throw v;
        if (node.op === '-') return -toNumber(v);
        return v;
      }
      case 'binop': return evalBinop(node, ctx);
      case 'call': {
        var fn = FUNCTIONS[node.name];
        if (!fn) throw new FormulaError('#NAME?');
        try {
          return fn(node.args, ctx);
        } catch (e) {
          if (isErr(e)) throw e;
          throw new FormulaError('#VALUE!');
        }
      }
      default: throw new Error('Unknown node type: ' + node.type);
    }
  }

  function evalBinop(node, ctx) {
    if (node.op === '&') {
      return toStr(evalNode(node.left, ctx)) + toStr(evalNode(node.right, ctx));
    }
    var CMP = ['=', '<>', '<', '>', '<=', '>='];
    if (CMP.indexOf(node.op) !== -1) {
      var lv = evalNode(node.left, ctx);
      var rv = evalNode(node.right, ctx);
      if (isErr(lv)) throw lv;
      if (isErr(rv)) throw rv;
      var bothNum = typeof lv === 'number' && typeof rv === 'number';
      var a = bothNum ? lv : toStr(lv).toLowerCase();
      var b = bothNum ? rv : toStr(rv).toLowerCase();
      switch (node.op) {
        case '=': return a === b;
        case '<>': return a !== b;
        case '<': return a < b;
        case '>': return a > b;
        case '<=': return a <= b;
        case '>=': return a >= b;
      }
    }
    var l = toNumber(evalNode(node.left, ctx));
    var r = toNumber(evalNode(node.right, ctx));
    switch (node.op) {
      case '+': return l + r;
      case '-': return l - r;
      case '*': return l * r;
      case '/': if (r === 0) throw new FormulaError('#DIV/0!'); return l / r;
      case '^': return Math.pow(l, r);
    }
    throw new Error('Unknown operator: ' + node.op);
  }

  /**
   * Điểm vào chính: đánh giá 1 công thức (chuỗi bắt đầu bằng "=" hoặc
   * không) trả về { value, error } — error là mã lỗi kiểu Excel (vd
   * "#DIV/0!") khi có, value=null khi lỗi.
   */
  function evaluate(formula, ctx) {
    try {
      var ast = parseFormula(formula);
      var result = evalNode(ast, ctx);
      if (isErr(result)) return { value: null, error: result.code };
      return { value: result, error: null };
    } catch (e) {
      if (isErr(e)) return { value: null, error: e.code };
      return { value: null, error: '#ERROR!' };
    }
  }

  /** Trích danh sách các ô mà 1 công thức phụ thuộc vào — dùng để xây thứ tự tính lại (recalc). */
  function extractDependencies(formula, currentSheet) {
    var deps = [];
    try {
      var ast = parseFormula(formula);
      (function walk(node) {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'ref') {
          deps.push({ sheet: node.sheet || currentSheet, col: node.col, row: node.row });
        } else if (node.type === 'range') {
          var c1 = Math.min(node.start.col, node.end.col), c2 = Math.max(node.start.col, node.end.col);
          var r1 = Math.min(node.start.row, node.end.row), r2 = Math.max(node.start.row, node.end.row);
          var sheet = node.start.sheet || node.end.sheet || currentSheet;
          for (var c = c1; c <= c2; c++) for (var r = r1; r <= r2; r++) deps.push({ sheet: sheet, col: c, row: r });
        } else if (node.type === 'binop') { walk(node.left); walk(node.right); }
        else if (node.type === 'unary') { walk(node.arg); }
        else if (node.type === 'call') { node.args.forEach(walk); }
      })(ast);
    } catch (e) { /* công thức lỗi cú pháp -> coi như không phụ thuộc gì, sẽ báo lỗi lúc evaluate */ }
    return deps;
  }

  return {
    tokenize: tokenize,
    parseFormula: parseFormula,
    evaluate: evaluate,
    extractDependencies: extractDependencies,
    colToIndex: colToIndex,
    indexToCol: indexToCol,
    FormulaError: FormulaError,
    isErr: isErr,
    FUNCTIONS: Object.keys(FUNCTIONS)
  };
});
