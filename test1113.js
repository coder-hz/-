// 测试一些简单的表达式来验证转换效果
const testExpressions = [
    "0x1 * -0x2607 + 0x4 * 0x6c3 + -0x1 * -0xafb",
    "-0x9fa + 0x3 * 0xc75 + -0x1b62", 
    "0x251 + 0x1539 + 0x1 * -0x1772",
    "0x2 * 0x422 + -0x1 * -0x416 + -0xc56"
];

console.log("\n表达式计算结果验证:");
testExpressions.forEach(expr => {
    const testCode = `var result = ${expr};`;
    const evaluated = evaluator.evaluate(testCode);
    console.log(`${expr} => ${evaluated}`);
});