const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const types = require("@babel/types");
const generator = require("@babel/generator").default;

/**
 * 增强版AST转换器，专门处理混淆代码中的常量表达式
 */
class ConstantEvaluator {
    constructor() {
        this.evaluatedCount = 0;
        this.maxIterations = 100; // 防止无限循环
    }

    evaluate(code) {
        let ast = parser.parse(code, {
            sourceType: 'script',
            plugins: []
        });

        let previousCode;
        let iteration = 0;

        // 多次迭代直到没有更多可优化的表达式
        do {
            previousCode = generator(ast).code;
            this.evaluatedCount = 0;
            
            // 使用正确的访问器格式
            const visitor = {
                NumericLiteral: (path) => {
                    this.convertNumericLiteral(path);
                },
                StringLiteral: (path) => {
                    this.convertStringLiteral(path);
                },
                BinaryExpression: { 
                    exit: (path) => {
                        this.evaluateBinaryExpression(path);
                    }
                },
                UnaryExpression: { 
                    exit: (path) => {
                        this.evaluateUnaryExpression(path);
                    }
                },
                ConditionalExpression: { 
                    exit: (path) => {
                        this.evaluateConditionalExpression(path);
                    }
                },
                LogicalExpression: { 
                    exit: (path) => {
                        this.evaluateLogicalExpression(path);
                    }
                },
                MemberExpression: { 
                    exit: (path) => {
                        this.evaluateMemberExpression(path);
                    }
                },
                CallExpression: { 
                    exit: (path) => {
                        this.evaluateCallExpression(path);
                    }
                },
                SequenceExpression: { 
                    exit: (path) => {
                        this.evaluateSequenceExpression(path);
                    }
                }
            };

            traverse(ast, visitor);

            iteration++;
        } while (this.evaluatedCount > 0 && iteration < this.maxIterations);

        return generator(ast).code;
    }

    convertNumericLiteral(path) {
        const { node } = path;
        
        if (node.extra) {
            const raw = node.extra.raw;
            let decimalValue;
            
            if (raw.startsWith('0x') || raw.startsWith('0X')) {
                decimalValue = parseInt(raw, 16);
            } else if (raw.startsWith('0b') || raw.startsWith('0B')) {
                decimalValue = parseInt(raw.slice(2), 2);
            } else if (raw.startsWith('0o') || raw.startsWith('0O')) {
                decimalValue = parseInt(raw.slice(2), 8);
            } else if (/^0[0-7]*$/.test(raw) && !raw.includes('8') && !raw.includes('9')) {
                // 旧式八进制
                decimalValue = parseInt(raw, 8);
            }
            
            if (decimalValue !== undefined && !isNaN(decimalValue)) {
                path.replaceWith(types.numericLiteral(decimalValue));
                this.evaluatedCount++;
            }
        }
    }

    convertStringLiteral(path) {
        const { node } = path;
        
        if (node.extra && /\\[ux]/gi.test(node.extra.raw)) {
            // 移除转义序列的extra信息，让生成器输出实际字符
            node.extra = undefined;
            this.evaluatedCount++;
        }
    }

    evaluateBinaryExpression(path) {
        const { node } = path;
        
        // 尝试使用Babel的内置求值功能
        try {
            const { confident, value } = path.evaluate();
            if (confident && typeof value === 'number' && Number.isFinite(value)) {
                path.replaceWith(types.numericLiteral(value));
                this.evaluatedCount++;
                return;
            }
        } catch (e) {
            // 忽略求值错误
        }

        // 手动处理一些特殊情况
        if (types.isNumericLiteral(node.left) && types.isNumericLiteral(node.right)) {
            try {
                let result;
                const left = node.left.value;
                const right = node.right.value;
                
                switch (node.operator) {
                    case '+': result = left + right; break;
                    case '-': result = left - right; break;
                    case '*': result = left * right; break;
                    case '/': result = left / right; break;
                    case '%': result = left % right; break;
                    case '**': result = Math.pow(left, right); break;
                    case '&': result = left & right; break;
                    case '|': result = left | right; break;
                    case '^': result = left ^ right; break;
                    case '<<': result = left << right; break;
                    case '>>': result = left >> right; break;
                    case '>>>': result = left >>> right; break;
                    case '<': result = left < right; break;
                    case '>': result = left > right; break;
                    case '<=': result = left <= right; break;
                    case '>=': result = left >= right; break;
                    case '==': result = left == right; break;
                    case '===': result = left === right; break;
                    case '!=': result = left != right; break;
                    case '!==': result = left !== right; break;
                    default: return;
                }
                
                // 根据结果类型创建相应的字面量
                if (typeof result === 'boolean') {
                    path.replaceWith(types.booleanLiteral(result));
                } else {
                    path.replaceWith(types.numericLiteral(result));
                }
                this.evaluatedCount++;
            } catch (e) {
                // 忽略错误
            }
        }
    }

    evaluateUnaryExpression(path) {
        const { node } = path;
        
        try {
            const { confident, value } = path.evaluate();
            if (confident && typeof value === 'number' && Number.isFinite(value)) {
                path.replaceWith(types.numericLiteral(value));
                this.evaluatedCount++;
                return;
            }
        } catch (e) {
            // 忽略求值错误
        }

        if (types.isNumericLiteral(node.argument)) {
            try {
                let result;
                switch (node.operator) {
                    case '+': result = +node.argument.value; break;
                    case '-': result = -node.argument.value; break;
                    case '~': result = ~node.argument.value; break;
                    case '!': result = !node.argument.value; break;
                    default: return;
                }
                
                path.replaceWith(types.numericLiteral(result));
                this.evaluatedCount++;
            } catch (e) {
                // 忽略错误
            }
        }
    }

    evaluateConditionalExpression(path) {
        const { node } = path;
        
        try {
            const { confident, value } = path.get('test').evaluate();
            if (confident) {
                const replacement = value ? node.consequent : node.alternate;
                path.replaceWith(replacement);
                this.evaluatedCount++;
            }
        } catch (e) {
            // 忽略求值错误
        }
    }

    evaluateLogicalExpression(path) {
        const { node } = path;
        
        try {
            const { confident, value } = path.evaluate();
            if (confident) {
                if (typeof value === 'boolean') {
                    path.replaceWith(types.booleanLiteral(value));
                } else {
                    path.replaceWith(types.numericLiteral(value));
                }
                this.evaluatedCount++;
            }
        } catch (e) {
            // 忽略求值错误
        }
    }

    evaluateMemberExpression(path) {
        // 转换计算属性中的数值
        if (path.node.computed) {
            const propertyPath = path.get('property');
            if (propertyPath.isNumericLiteral()) {
                this.convertNumericLiteral(propertyPath);
            }
        }
    }

    evaluateCallExpression(path) {
        // 转换参数中的数值字面量
        path.get('arguments').forEach(argPath => {
            if (argPath.isNumericLiteral()) {
                this.convertNumericLiteral(argPath);
            }
        });
    }

    evaluateSequenceExpression(path) {
        const { node } = path;
        
        // 如果序列表达式最后一个表达式是字面量，尝试求值
        if (node.expressions.length > 0) {
            const lastExpr = node.expressions[node.expressions.length - 1];
            if (types.isNumericLiteral(lastExpr) || types.isStringLiteral(lastExpr)) {
                try {
                    const { confident, value } = path.evaluate();
                    if (confident) {
                        if (typeof value === 'number') {
                            path.replaceWith(types.numericLiteral(value));
                        } else if (typeof value === 'string') {
                            path.replaceWith(types.stringLiteral(value));
                        } else {
                            path.replaceWith(types.valueToNode(value));
                        }
                        this.evaluatedCount++;
                    }
                } catch (e) {
                    // 忽略求值错误
                }
            }
        }
    }
}


const evaluator = new ConstantEvaluator();

// 某东部分代码测试
const obfuscatedCode = `
for (var _$pZ = [], _$pX = 0x1 * -0x2607 + 0x4 * 0x6c3 + -0x1 * -0xafb; _$pX < _$pp; _$pX += -0x9fa + 0x3 * 0xc75 + -0x1b62)
    for (var _$ph = (_$pO[_$pX >>> -0xbfd + 0x712 + 0x4ed] >>> 0x251 + 0x1539 + 0x1 * -0x1772 - _$pM.FbLJb(_$pX, 0x2 * 0x422 + -0x1 * -0x416 + -0xc56) * (0x1f0 + 0x16e9 + -0x18d1) & 0x9e2 + 0x5 * -0x266 + -0x109 * -0x3) << -0x1b * -0x59 + -0x1c60 + 0x130d | (_$pO[_$pX + (-0x1c88 + -0x521 * -0x1 + 0x1768) >>> -0x188c * -0x1 + -0x7e0 + -0x855 * 0x2] >>> _$pM.FsXNr(-0xcdd + -0x16 * 0x13f + -0x285f * -0x1, (_$pX + (-0x11e2 + -0x3bc + 0xf * 0x171)) % (-0xa97 + 0x9f7 * -0x1 + 0xa49 * 0x2) * (-0x20be + 0x132b * -0x1 + 0x1 * 0x33f1)) & -0x1161 * -0x2 + 0x151f * 0x1 + -0x36e2) << 0xb * 0x11 + 0x1f5f + -0x2012 * 0x1 | _$pO[_$pX + (-0x5 * 0x73 + 0x5d7 * -0x5 + 0x4 * 0x7dd) >>> -0xfd9 + 0xc77 * -0x2 + 0x35 * 0xc5] >>> 0x229b + 0xdf4 + -0x1 * 0x3077 - _$pM.pOOBt((_$pX + (-0x1 * 0x53a + -0xa5e + 0xf9a * 0x1)) % (-0x1b * -0x45 + 0x417 + -0xb5a), 0x1935 + 0x139e + -0x2ccb) & 0x8ef * 0x4 + 0x1041 + 0xd6 * -0x3d, _$pB = -0x2d6 + -0x1e60 + -0x1 * -0x2136; _$pB < -0x659 + -0x2 * 0xff5 + 0x2647 && _$pX + (-0x13e + -0x2cc + -0x205 * -0x2 + 0.75) * _$pB < _$pp; _$pB++)
    _$pZ.push(_$pA.charAt(_$ph >>> _$pM.WmtJK(-0x1c3f * 0x1 + 0x176e + 0x4d7, -0x1 * 0x4b8 + -0x118 * 0x6 + 0xb4b - _$pB) & 0x987 * -0x1 + -0xb11 * 0x1 + 0x37 * 0x61));
`;

// 如果需要计算常量,需要用const声明常量
// xueqiu网部分代码测试
// const obfuscatedCode = `
// const L8 = 285;
//                                         for (qU = qA[qJ],
//                                         qr = 0xa * 0x2f9 + 0xa2d + 0x15 * -0x1f4 + L8; qM[Hb(xs.g)](qr, qn); qr++)
//                                             qa = qM[Hb(xs.C)](qM[Hb(xs.z)](qa, 0xe1a + 0x8 * 0x328 + -0x2876 + L8), qM[Hb(xs.p)](-0x15b6 + -0x2 * -0x377 + 0x1 * 0xec9, qU)),
//                                             qM[Hb(xs.E)](qP, qM[Hb(xs.k)](qW, -0x6e9 * -0x1 + 0x12 * -0x126 + 0xca7 + L8)) ? (qP = -0x1b5f * -0x1 + 0x8ca + -0x2429,
//                                             qy[Hb(xs.q0)](qM[Hb(xs.q1)](qK, qa)),
//                                             qa = 0x12c3 + -0x216d + 0xeaa) : qP++,
//                                             qU >>= 0x19a6 + -0x6ff + -0x13c3 + L8;
// `
console.log("原始混淆代码:");
console.log(obfuscatedCode);

console.log("\n转换后代码:");
const result = evaluator.evaluate(obfuscatedCode);
console.log(result);