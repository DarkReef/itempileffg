import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
test('standalone manifest and locale parity',()=>{
 const m=read('../module.json');assert.equal(m.id,'itempileffg');
 for(const p of [...m.esmodules,...m.styles,...m.languages.map(l=>l.path),'LICENSE','README.md'])assert.ok(existsSync(new URL('../'+p,import.meta.url)),p);
 const en=read('../lang/en.json'),ru=read('../lang/ru.json');assert.deepEqual(Object.keys(en),Object.keys(ru));
 for(const key of Object.keys(en))assert.deepEqual(ru[key].match(/\{[^{}]+\}/g)??[],en[key].match(/\{[^{}]+\}/g)??[],key);
 assert.equal(m.manifest,'https://github.com/DarkReef/itempileffg/releases/latest/download/module.json');
});
