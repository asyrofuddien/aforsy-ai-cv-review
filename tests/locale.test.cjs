require('ts-node').register({transpileOnly:true});
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {localeFromHeader,requestLocale}=require('../src/utils/locale');
const {localizeApiMessage,localeMiddleware}=require('../src/middlewares/locale.middleware');
const {buildAuthEmailContent}=require('../src/services/email.service');
const chain=require('../src/services/llm/chains').default;
const ai=require('../src/services/llm/openai.service').default;
test('supported locales follow quality order with Indonesian fallback',()=>{
 assert.equal(localeFromHeader('en-US,en;q=0.9,id;q=0.8'),'en');
 assert.equal(localeFromHeader('en;q=0.2,id-ID;q=0.9'),'id');
 assert.equal(localeFromHeader('id;q=0,en;q=1'),'en');
 assert.equal(localeFromHeader('fr-FR'),'id');
 assert.equal(localeFromHeader(),'id');
});
test('explicit language and saved preference survive OAuth navigation',()=>{
 assert.equal(requestLocale({query:{lang:'en'},headers:{cookie:'landly.locale=id','accept-language':'id'}}),'en');
 assert.equal(requestLocale({query:{},headers:{cookie:'other=a; landly.locale=en','accept-language':'id'}}),'en');
 assert.equal(requestLocale({query:{lang:'unsupported'},headers:{cookie:'landly.locale=bad','accept-language':'en'}}),'en');
});
test('API errors localize but arbitrary CV/user response data stays intact',()=>{
 let response;const headers={};
 const res={statusCode:400,setHeader:(k,v)=>headers[k]=v,vary:()=>{},json:body=>{response=body;return res}};
 localeMiddleware({query:{},headers:{'accept-language':'id'}},res,()=>{});
 const data={name:'English',summary:'This is the original CV content.',role:'admin',templateId:'classic'};
 res.json({success:false,error:{message:'Authentication required'},data});
 assert.notEqual(response.error.message,'Authentication required');assert.deepEqual(response.data,data);assert.equal(headers['Content-Language'],'id');
 assert.equal(localizeApiMessage('Authentication required','en',401),'Authentication required');
});
test('auth email content follows locale and escapes names without changing token URLs',()=>{
 const url='https://example.test/verify-email?token=test-value&lang=id';
 const id=buildAuthEmailContent({email:'test@example.test',displayName:'User <script>',purpose:'verify-email',url,locale:'id'});
 assert.match(id.subject,/Verifikasi/);assert.match(id.html,/<html lang="id">/);assert.ok(id.html.includes('User &lt;script&gt;'));assert.ok(id.text.includes(url));assert.ok(id.text.includes('satu jam'));
 const en=buildAuthEmailContent({email:'test@example.test',displayName:'User',purpose:'reset-password',url,locale:'en'});
 assert.equal(en.subject,'Reset your Landly password');assert.match(en.html,/<html lang="en">/);
});
test('CV review and summary request the chosen language while preserving JSON keys and quotes',async()=>{
 const original=ai.completion;const calls=[];
 try{ai.completion=async(prompt,options)=>{calls.push(options.systemPrompt);return JSON.stringify({schemaVersion:2,criteria:['structure','clarity','experience','impact','completeness','language'].map(id=>({id,name:id,score:3,evidenceStatus:'quoted',evidence:'Original CV quote.',section:'Profile',rationale:'Clear text.',suggestion:'Clarify scope.',priority:'medium',exampleRevision:''})),strengths:[],requirementMatches:prompt.includes('MODE=job_specific')?[{requirement:'Relevant experience',status:'not_visible',evidence:'',explanation:'Not stated.'}]:[],feedback:'Review',overall_summary:'Summary',missing_information:[]});};
 await chain.evaluateCV({sourceText:'Original CV quote.'},{mode:'general',locale:'id'});
 await chain.generateFinalSummary({feedback:'Review'},'general','id');
 assert.match(calls[0],/Bahasa Indonesia/);assert.match(calls[0],/exact source quotes/);assert.match(calls[1],/Bahasa Indonesia/);
 await chain.evaluateCV({sourceText:'Original CV quote.'},{mode:'job_specific',locale:'en',description:'Relevant experience'});assert.match(calls[2],/in English/);
 }finally{ai.completion=original;}
});
