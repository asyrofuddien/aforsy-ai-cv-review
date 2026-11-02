require('ts-node').register({transpileOnly:true});
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const JSZip=require('jszip');
const parser=require('../src/services/parser.service').default;

test('PDF extraction reads selectable text from every page without a page cap',async()=>{
  const file=path.resolve(__dirname,'../node_modules/pdf-parse/test/data/01-valid.pdf');
  const text=await parser.parseFile(file,'application/pdf');
  assert.ok(text.includes('Because traces are in SSA form and have no join points'));
  assert.ok(text.includes('not be interpreted as necessarily representing the official views'));
});

test('DOCX extraction includes body/table text plus header and footer text',async()=>{
  const fixture=path.resolve(__dirname,'../node_modules/mammoth/test/test-data/tables.docx');
  const archive=await JSZip.loadAsync(await fs.readFile(fixture));
  archive.file('word/header1.xml','<?xml version="1.0"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>Header contact text</w:t></w:r></w:p></w:hdr>');
  archive.file('word/footer1.xml','<?xml version="1.0"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>Footer profile link</w:t></w:r></w:p></w:ftr>');
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'landly-docx-'));
  const file=path.join(dir,'cv.docx');
  try {
    await fs.writeFile(file,await archive.generateAsync({type:'nodebuffer'}));
    const text=await parser.parseFile(file,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    for(const expected of ['Above','Top left','Top right','Bottom left','Bottom right','Below','Header contact text','Footer profile link']) assert.ok(text.includes(expected),`missing ${expected}`);
  } finally {
    await fs.rm(dir,{recursive:true,force:true});
  }
});

test('plain text extraction returns the entire source without truncation',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'landly-txt-'));
  const file=path.join(dir,'cv.txt');
  const source='START\n'+('every experience detail must remain.\n'.repeat(12000))+'FINAL DETAIL';
  try {
    await fs.writeFile(file,source,'utf8');
    assert.equal(await parser.parseFile(file,'text/plain'),source);
  } finally {
    await fs.rm(dir,{recursive:true,force:true});
  }
});
