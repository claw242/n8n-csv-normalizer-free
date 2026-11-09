'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeStatement, parseAmount, parseDate } = require('../src/normalize.cjs');
const root = path.join(__dirname, '..');
for (const profile of ['qonto']) {
  test(`fixture ${profile} matches hand-reviewed expected values`, () => {
    const csv = fs.readFileSync(path.join(root,'fixtures',`${profile}.csv`),'utf8');
    const expected = JSON.parse(fs.readFileSync(path.join(root,'expected',`${profile}.json`),'utf8'));
    const result = normalizeStatement({profile,csv});
    assert.deepEqual(result, expected);
  });
}
const en = csv => normalizeStatement({profile:'qonto',csv:'Date,Label,Amount,Currency\n'+csv});
test('CSV handles BOM, CRLF, escaped quotes and multiline labels', () => {
 const result=normalizeStatement({profile:'qonto',csv:'\uFEFFDate,Label,Amount,Currency\r\n2026-10-01,"A ""quoted""\r\nlabel",1.23,EUR\r\n'});
 assert.equal(result.transactions[0].label,'A "quoted"\r\nlabel');
});
test('same operations are preserved and linked to first data row',()=>{
 const result=en('2026-10-01,A,1,EUR\n2026-10-01,A,1,EUR');
 assert.equal(result.summary.count,2); assert.equal(result.transactions[1].duplicateOf,2); assert.equal(result.summary.totalsCentsByCurrency.EUR,200);
});
test('currency totals stay separate',()=>{
 assert.deepEqual(en('2026-10-01,A,1,EUR\n2026-10-01,A,1,USD').summary.totalsCentsByCurrency,{EUR:100,USD:100});
});
test('amount formats use integer minor units',()=>{
 for(const [s,l,n] of [['1 234,56','fr',123456],['1\u202F234,56','fr',123456],['1,234.56','en',123456],['-0.01','en',-1],['+1,2','fr',120],['-0','en',0]]) assert.equal(parseAmount(s,l),n);
});
test('ambiguous or malformed money is rejected',()=>{
 for(const [s,l] of [['1,234','fr'],['1.234','en'],['12 34,56','fr'],['1,23.00','en'],['1e3','en'],['NaN','en'],['','fr'],['90071992547410.00','en']]) assert.throws(()=>parseAmount(s,l));
});
test('calendar validation rejects rollover and supports leap years',()=>{
 assert.equal(parseDate('29/02/2024','fr'),'2024-02-29');
 for(const d of ['2026-02-29','2026-04-31','2026-13-01','2026-00-01','2026-01-00','1899-12-31','2200-01-01']) assert.throws(()=>parseDate(d,'iso'));
 assert.throws(()=>parseDate('01/02/26','fr'));
});
test('missing, duplicate and empty headers fail',()=>{
 for(const csv of ['Date,Label,Amount\n','Date,Label,Amount,Currency,Currency\n','Date,Label,Amount,Currency,\n']) assert.throws(()=>normalizeStatement({profile:'qonto',csv}));
});
test('bad quotes and mismatched row widths fail',()=>{
 for(const row of ['2026-10-01,"A,1,EUR','2026-10-01,A"B,1,EUR','2026-10-01,"A"x,1,EUR','2026-10-01,A,1']) assert.throws(()=>en(row));
});
test('unknown profile, invalid currency, blank label and empty CSV fail',()=>{
 assert.throws(()=>normalizeStatement({profile:'__proto__',csv:''}));
 assert.throws(()=>normalizeStatement({profile:'qonto',csv:''}));
 assert.throws(()=>en('2026-10-01,A,1,JPY'));
 assert.throws(()=>en('2026-10-01,,1,EUR'));
});
test('debit-credit rejects two nonzero sides and negative magnitude',()=>{
 for(const values of ['1,00;2,00','-1,00;',';']) assert.throws(()=>normalizeStatement({profile:'credit_agricole',csv:'Date;Libellé;Débit;Crédit;Devise\n01/10/2026;Demo;'+values+';EUR'}));
});
test('header-only statement is valid and empty',()=>assert.equal(en('').summary.count,0));
test('workflow embedded source matches maintained source and examples',()=>{
 const workflow=JSON.parse(fs.readFileSync(path.join(root,'normaliser-csv-gratuit.json'),'utf8'));
 assert.equal(workflow.active,false);
 const node=workflow.nodes.find(n=>n.name==='Normalize statement');
 const source=fs.readFileSync(path.join(root,'src/normalize.cjs'),'utf8').replace(/\nmodule\.exports = .*?;\s*$/s,'');
 assert.equal(node.parameters.jsCode,source+'\nreturn $input.all().map(item => ({ json: normalizeStatement(item.json) }));\n');
 assert.equal(workflow.nodes.filter(n=>n.type==='n8n-nodes-base.stickyNote')[0].parameters.content.includes("créé avec l'aide de l'IA"),true);
});

test('embedded Code node returns the complete expected results for all fixtures',()=>{
 const workflow=JSON.parse(fs.readFileSync(path.join(root,'normaliser-csv-gratuit.json'),'utf8'));
 const code=workflow.nodes.find(n=>n.name==='Normalize statement').parameters.jsCode;
 const execute=new Function('$input',code);
 for(const profile of ['qonto']) {
  const csv=fs.readFileSync(path.join(root,'fixtures',`${profile}.csv`),'utf8');
  const expected=JSON.parse(fs.readFileSync(path.join(root,'expected',`${profile}.json`),'utf8'));
  assert.deepEqual(execute({all:()=>[{json:{profile,csv}}]}),[{json:expected}]);
 }
});
